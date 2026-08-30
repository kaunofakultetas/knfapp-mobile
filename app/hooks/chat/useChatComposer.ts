// -----------------------------------------------------------
//  [*] useChatComposer — optimistic sends, retry, typing
//
//  Everything between the Composer and the server: optimistic
//  bubbles ('sending' → 'sent' via the REST response, 'failed'
//  on error), tap-to-retry, an automatic retry sweep when
//  connectivity returns, image attach, and the typing emits.
//
//  Double-send safety is synchronous: the draft lives in a ref
//  cleared BEFORE the first await, so a second tap in the same
//  frame reads an empty draft; each in-flight delivery is also
//  tracked in a Set keyed by temp id, so retry taps and the
//  network-restore sweep can never race the same message onto
//  the wire twice. Temp ids come from a monotonic counter —
//  never Date.now(), which collides within a millisecond. The
//  temp's clientId also rides every POST as its idempotency
//  key, so retrying a timed-out-but-committed send resolves
//  to the SAME server row instead of a duplicate.
//
//  The failed-send queue is a ref map (tempId → payload), and
//  the restore sweep iterates THAT — state updaters stay pure,
//  because React may run them twice. Queue and draft are
//  mirrored to AsyncStorage (outbox:<id> / draft:<id>) so
//  leaving the room loses neither; only failures that can
//  heal (network, timeout, 5xx, 429) are queued — a
//  definitive 4xx leaves the bubble permanently failed with a
//  specific toast and just the discard affordance.
//
//  Typing contract with useTypingIndicator: re-emit at most
//  every 2 s while keystrokes keep coming (the receiver
//  expires a typer after 5 s, so an active typist never
//  flickers off), stop_typing on idle (3 s), on send, on
//  clearing the draft, and on unmount.
//
//  imageUrl discipline: the RELATIVE upload.url is what gets
//  sent and stored on the message — components resolve it via
//  getUploadUrl at render time only.
//
//  Split into:
//
//    isRetryable / sendFailureKey — send-failure triage
//    UseChatComposerResult — the hook's return shape
//    useChatComposer       — the hook itself
// -----------------------------------------------------------

// Send + upload endpoints, and the error shape triage reads
import { ApiError, MAX_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES, editMessageApi, sendMessageApi, uploadFileApi, uploadImageApi, type SendMessageExtra } from '@/services/api';

// Per-conversation outbox + draft persistence
import AsyncStorage from '@react-native-async-storage/async-storage';

// Typing emits ride the shared socket
import { emitStopTyping, emitTyping } from '@/services/socket';

// Self identity for the optimistic bubble
import { useAuth } from '@/context/AuthContext';

// Failure toasts and the connectivity-restore sweep
import { showToast } from '@/context/NetworkContext';
import { useNetworkRestore } from '@/hooks/useNetworkRestore';
import { useTranslation } from 'react-i18next';

// Message shape and the optimistic-id marker
import { TEMP_ID_PREFIX, mapContent, mapReply, markEdited } from '@/hooks/chat/useChatMessages';
import type { ChatMessage } from '@/types';

// The Composer's cap — one shared constant so the emoji strip
// can never out-type the field's maxLength
import { DEFAULT_MAX_LENGTH as MAX_MESSAGE_LENGTH } from '@knf/chatkit/composer/Composer';
import type { KitMessage } from '@knf/chatkit';

// Image picking and lifecycle plumbing
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useCallback, useEffect, useRef, useState } from 'react';


// Heartbeat/expiry pair — re-emit period must stay under the
// 5 s receiver expiry in useTypingIndicator
const TYPING_REEMIT_MS = 2000;

// Keystroke silence after which stop_typing is sent
const TYPING_IDLE_MS = 3000;







// -----------------------------------------------------------
// isRetryable / sendFailureKey
// -----------------------------------------------------------
//
// Send-failure triage: transport failures and transient
// server states (5xx, 429) re-queue for tap-to-retry and the
// restore sweep; a definitive 4xx keeps the bubble failed for
// good — retrying would only repeat the rejection — and picks
// a toast that says why.
//
// Used by:
//   - useChatComposer (below) — deliver + uploadAndDeliver
// -----------------------------------------------------------

const isRetryable = (err: unknown): boolean =>
  !(err instanceof ApiError) ||
  err.code === 'network' ||
  err.code === 'timeout' ||
  err.status >= 500 ||
  err.status === 429;

// The generic sendError stays on everything the sweep will
// re-drive; the backend's only 400 on a non-empty send is the
// 5000-char cap
const sendFailureKey = (err: unknown): string => {
  if (err instanceof ApiError && err.code === 'http') {
    if (err.status === 400 || err.status === 413) return 'chat.sendTooLong';
    if (err.status === 401) return 'chat.sessionExpired';
    if (err.status === 403) return 'chat.sendForbidden';
  }
  return 'chat.sendError';
};







// -----------------------------------------------------------
// UseChatComposerResult
// -----------------------------------------------------------
//
// Used by:
//   - useChatComposer (below)
//   - app/(main)/chat-room/index.tsx — Composer wiring
// -----------------------------------------------------------

// What a failed send needs to retry: the body, the uploaded
// image path — or, when the upload itself failed, the picked
// asset so the retry uploads again. createdAt is the bubble's
// original stamp, persisted so a rehydrated bubble keeps it
// A picked asset waiting for its upload: a photo (the default),
// a video (with the frame the picker reported and the length
// in seconds) or a document
export interface PickedAsset {
  uri: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  kind?: 'image' | 'video' | 'file';
  width?: number;
  height?: number;
  duration?: number;
}

interface FailedPayload {
  text: string;
  imageUrl?: string;
  replyToId?: string;
  asset?: PickedAsset;
  // The uploaded attachment / media of a send that failed AFTER
  // its upload — a retry posts again without re-uploading
  extra?: SendMessageExtra;
  createdAt?: string;
}

// Videos longer than this are refused before the upload — the
// cap keeps a clip under the 50 MB ceiling for phone encodes
const MAX_VIDEO_SECONDS = 180;

// The document types the backend stores (uploads/routes.py
// ALLOWED_DOC_EXTENSIONS) — the picker filters to them
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/plain',
];

export interface UseChatComposerResult {
  text: string;
  onChangeText: (next: string) => void;
  // A photo / video upload in flight (uploadingImage is the same
  // flag under its older name)
  uploadingMedia: boolean;
  uploadingImage: boolean;
  // A document upload in flight
  uploadingFile: boolean;
  sendMessage: () => void;
  sendQuickLike: () => void;
  // Pick a photo or a video from the library (attachImage is
  // the older name for the same action)
  attachMedia: () => Promise<void>;
  attachImage: () => Promise<void>;
  // Pick a document
  attachFile: () => Promise<void>;
  retryMessage: (message: KitMessage) => void;
  // Edit mode: the message whose text the field holds; sendMessage
  // saves it, cancelEdit restores the draft that was there
  editing: KitMessage | null;
  startEdit: (message: KitMessage) => void;
  cancelEdit: () => void;
  // Drops a failed optimistic bubble that will not be retried
  discardMessage: (messageId: string) => void;
  replyTo: KitMessage | null;
  setReplyTo: (message: KitMessage | null) => void;
}







// -----------------------------------------------------------
// useChatComposer
// -----------------------------------------------------------
//
//   const composer = useChatComposer(conversationId, setMessages)
//     composer.text / onChangeText — the draft (typing emits
//                                    ride the change handler)
//     composer.sendMessage         — send the trimmed draft
//     composer.sendQuickLike       — 👍 when the draft is
//                                    empty, otherwise send it
//     composer.attachMedia         — photo or video: pick →
//                                    upload (poster + clip for
//                                    a video) → send;
//                                    uploadingMedia covers it
//     composer.attachFile          — a document, the same way
//     composer.startEdit(m) /
//     cancelEdit / editing         — edit mode; sendMessage
//                                    saves the rewrite
//     composer.retryMessage(m)     — re-drive a failed bubble
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export function useChatComposer(
  conversationId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  messages: ChatMessage[],
): UseChatComposerResult {
  const { t } = useTranslation();
  const { user } = useAuth();


  // The live list, for the queue: an entry whose temp is gone
  // (the socket echo replaced a failed send, or it was discarded)
  // must never be re-sent by the restore sweep. Mirrored in an
  // effect — render bodies stay write-free
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);


  const [text, setText] = useState('');
  // Uploads in flight by temp id, per button — one upload
  // finishing can never blank another's spinner
  const [uploadingIds, setUploadingIds] = useState<ReadonlyMap<string, 'media' | 'file'>>(new Map());
  const uploadingMedia = Array.from(uploadingIds.values()).includes('media');
  const uploadingFile = Array.from(uploadingIds.values()).includes('file');

  // Edit mode: the message being rewritten and the draft the
  // field held before, restored on cancel
  const [editing, setEditingState] = useState<KitMessage | null>(null);
  const editingRef = useRef<KitMessage | null>(null);
  const parkedDraftRef = useRef('');
  const [replyTo, setReplyToState] = useState<KitMessage | null>(null);
  const replyToRef = useRef<KitMessage | null>(null);


  // Draft mirror read synchronously by sendMessage — the state
  // value may be a render behind on rapid double-taps
  const textRef = useRef('');


  // Monotonic temp-id source; Date.now() alone collides when
  // two quick-like taps land in the same millisecond
  const tempSeqRef = useRef(0);


  // tempId → payload for every retryable failed send; the
  // restore sweep and tap-to-retry both re-drive from here
  const failedQueueRef = useRef(
    new Map<string, FailedPayload>(),
  );


  // Rehydrated queue entries whose bubble has not reappeared
  // yet (useChatMessages restores them with its first load) —
  // the prune and the sweep must not drop them in that window
  const rehydratedPendingRef = useRef(new Set<string>());


  // Temp ids currently on the wire — guards a retry tap racing
  // the automatic restore sweep onto a duplicate request
  const inFlightRef = useRef(new Set<string>());


  // Mirror the queue to storage after every mutation, so
  // failed sends survive leaving the room and app restarts.
  // The shape is an id → payload map — exactly what
  // useChatMessages' readOutboxTemps rehydrates into bubbles —
  // with each entry stamped by its bubble's createdAt
  const persistQueue = useCallback(() => {
    const key = `outbox:${conversationId}`;
    if (failedQueueRef.current.size === 0) {
      AsyncStorage.removeItem(key).catch(() => {});
      return;
    }
    const record: Record<string, FailedPayload> = {};
    for (const [tempId, payload] of failedQueueRef.current) {
      record[tempId] = {
        ...payload,
        createdAt: messagesRef.current.find((m) => m.id === tempId)?.createdAt ?? payload.createdAt,
      };
    }
    AsyncStorage.setItem(key, JSON.stringify(record)).catch(() => {});
  }, [conversationId]);


  // Debounced draft mirror (draft:<conversationId>) — the
  // unmount flush below writes whatever the field last held
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDraft = useCallback(
    (value: string) => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        draftTimerRef.current = null;
        const key = `draft:${conversationId}`;
        if (value) AsyncStorage.setItem(key, value).catch(() => {});
        else AsyncStorage.removeItem(key).catch(() => {});
      }, 400);
    },
    [conversationId],
  );


  // Leaving the room flushes the final draft value past the
  // debounce — a mid-typing unmount loses nothing
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      const key = `draft:${conversationId}`;
      const value = textRef.current;
      if (value) AsyncStorage.setItem(key, value).catch(() => {});
      else AsyncStorage.removeItem(key).catch(() => {});
    };
  }, [conversationId]);


  // A mounted instance can be handed a DIFFERENT room (web:
  // the ?conversationId query changes in place without a
  // remount) — the composer half of useChatMessages' room-
  // switch wipe. The old room's draft was already flushed to
  // ITS key by the effect cleanup above; here the field, the
  // reply strip and the per-room queue state are cleared
  // WITHOUT persisting — an empty persistQueue here would
  // delete the NEW room's stored outbox before the rehydrate
  // below has landed
  const shownConvRef = useRef(conversationId);
  useEffect(() => {
    if (shownConvRef.current === conversationId) return;
    shownConvRef.current = conversationId;
    textRef.current = '';
    setText('');
    failedQueueRef.current.clear();
    rehydratedPendingRef.current.clear();
    replyToRef.current = null;
    setReplyToState(null);
    editingRef.current = null;
    setEditingState(null);
    parkedDraftRef.current = '';
  }, [conversationId]);


  // Rehydrate this room's persisted draft and failed-send
  // queue; queue entries park in rehydratedPendingRef until
  // their bubbles come back with the first history load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [draft, outbox] = await Promise.all([
          AsyncStorage.getItem(`draft:${conversationId}`),
          AsyncStorage.getItem(`outbox:${conversationId}`),
        ]);
        if (cancelled) return;
        if (draft && !textRef.current) {
          textRef.current = draft;
          setText(draft);
        }
        if (outbox) {
          const parsed = JSON.parse(outbox) as Record<string, FailedPayload>;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            for (const [tempId, payload] of Object.entries(parsed)) {
              if (!tempId.startsWith(TEMP_ID_PREFIX)) continue;
              if (!payload || typeof payload !== 'object') continue;
              if (failedQueueRef.current.has(tempId)) continue;
              failedQueueRef.current.set(tempId, {
                text: typeof payload.text === 'string' ? payload.text : '',
                imageUrl: payload.imageUrl,
                replyToId: payload.replyToId,
                asset: payload.asset,
                createdAt: payload.createdAt,
              });
              rehydratedPendingRef.current.add(tempId);
            }
          }
        }
      } catch {
        // Unreadable storage never blocks the composer
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);


  // Typing emit bookkeeping (heartbeat + idle stop)
  const typingActiveRef = useRef(false);
  const typingLastEmitRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // Stop the typing broadcast and its idle timer — used by
  // send/clear/idle and the unmount cleanup below
  const stopTyping = useCallback(() => {
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      emitStopTyping(conversationId);
    }
  }, [conversationId]);


  // Leaving the screen mid-draft must not leave the user
  // "typing" on other clients until their expiry window
  useEffect(() => stopTyping, [stopTyping]);


  // Draft changes drive the typing heartbeat: first keystroke
  // emits immediately, then at most every TYPING_REEMIT_MS.
  // The clamp mirrors the field's maxLength — emoji-strip
  // inserts arrive through here, not through the TextInput cap
  const onChangeText = useCallback(
    (raw: string) => {
      const next = raw.length > MAX_MESSAGE_LENGTH ? raw.slice(0, MAX_MESSAGE_LENGTH) : raw;
      textRef.current = next;
      setText(next);
      persistDraft(next);

      if (next.length === 0) {
        stopTyping();
        return;
      }

      const now = Date.now();
      if (!typingActiveRef.current || now - typingLastEmitRef.current >= TYPING_REEMIT_MS) {
        typingActiveRef.current = true;
        typingLastEmitRef.current = now;
        emitTyping(conversationId);
      }

      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    [conversationId, persistDraft, stopTyping],
  );


  // One delivery path for fresh sends, retries and the restore
  // sweep: flip the temp to 'sending', post, then swap in the
  // server message — or mark 'failed' and queue for retry. If
  // the socket echo already replaced the temp, the map finds
  // nothing and the swap is a clean no-op.
  const deliver = useCallback(
    async (tempId: string, body: string, imageUrl?: string, replyToId?: string, extra?: SendMessageExtra) => {
      if (inFlightRef.current.has(tempId)) return;
      inFlightRef.current.add(tempId);

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sending' } : m)),
      );

      try {
        // The temp id doubles as the idempotency key — a retry
        // of a timed-out-but-committed send gets the same row
        // (the extra argument only when there is one — a plain text
        // send keeps the five-argument call)
        const resp = extra
          ? await sendMessageApi(conversationId, body, imageUrl, replyToId, tempId, extra)
          : await sendMessageApi(conversationId, body, imageUrl, replyToId, tempId);
        failedQueueRef.current.delete(tempId);
        persistQueue();

        const sent: ChatMessage = {
          id: resp.message.id,
          conversationId: resp.message.conversationId,
          senderId: resp.message.senderId,
          senderName: resp.message.senderName,
          senderAvatar: resp.message.senderAvatar || undefined,
          text: resp.message.text ?? '',
          imageUrl: resp.message.imageUrl || undefined,
          createdAt: resp.message.createdAt,
          isOwn: true,
          status: resp.message.status ?? 'sent',
          reactions: [],
          replyTo: mapReply(resp.message.replyTo),
          deleted: false,
          ...mapContent(resp.message),
        };
        setMessages((prev) => {
          // Socket echo may have delivered the server row first
          if (prev.some((m) => m.id === sent.id)) {
            return prev.filter((m) => m.id !== tempId);
          }
          // The row keeps the temp's key (and local photo / poster)
          // so the bubble does not remount mid-animation
          return prev.map((m) =>
            m.id === tempId
              ? {
                  ...sent,
                  clientId: m.clientId ?? tempId,
                  localImageUri: m.localImageUri,
                  video: sent.video && m.video ? { ...sent.video, localThumbnailUri: m.video.localThumbnailUri } : sent.video,
                }
              : m,
          );
        });
      } catch (err) {
        // Only failures that can heal re-queue for the sweep;
        // a definitive 4xx keeps the bubble failed for good —
        // just the discard affordance, and a toast saying why
        if (isRetryable(err)) {
          failedQueueRef.current.set(tempId, { text: body, imageUrl, replyToId, extra });
        } else {
          failedQueueRef.current.delete(tempId);
        }
        persistQueue();
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
        );
        showToast('error', t(sendFailureKey(err)));
      } finally {
        inFlightRef.current.delete(tempId);
      }
    },
    [conversationId, persistQueue, setMessages, t],
  );


  // Append the optimistic bubble (newest-first list → unshift);
  // returns its temp id and the consumed reply target. An image
  // send passes the picked asset's local uri so the bubble shows
  // the photo while it uploads
  const createTemp = useCallback(
    (body: string, imageUrl?: string, localImageUri?: string, content?: Partial<Pick<ChatMessage, 'kind' | 'file' | 'video' | 'mediaSize'>>) => {
      if (!user) return null;
      // The reply strip is consumed by whichever send comes next
      const reply = replyToRef.current;
      replyToRef.current = null;
      setReplyToState(null);

      tempSeqRef.current += 1;
      const tempId = `${TEMP_ID_PREFIX}${tempSeqRef.current}-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        clientId: tempId,
        conversationId,
        senderId: user.id,
        senderName: user.displayName,
        senderAvatar: user.avatarUrl,
        text: body,
        imageUrl,
        localImageUri: localImageUri ?? undefined,
        createdAt: new Date().toISOString(),
        isOwn: true,
        status: 'sending',
        reactions: [],
        replyTo: reply
          ? {
              id: reply.id,
              senderId: reply.senderId,
              senderName: reply.senderName,
              text: reply.text,
              imageUrl: reply.imageUrl,
              deleted: !!reply.deleted,
              kind: reply.kind,
              fileName: reply.file?.name,
            }
          : undefined,
        deleted: false,
        ...content,
      };
      setMessages((prev) => [optimistic, ...prev]);

      return { tempId, replyToId: reply?.id };
    },
    [conversationId, setMessages, user],
  );


  const startSend = useCallback(
    (body: string, imageUrl?: string) => {
      const temp = createTemp(body, imageUrl);
      if (temp) void deliver(temp.tempId, body, imageUrl, temp.replyToId);
    },
    [createTemp, deliver],
  );


  // Per-temp spinner bookkeeping for concurrent uploads (a
  // retry racing a fresh attach) — one finishing never blanks
  // another's spinner
  const markUploading = useCallback((tempId: string, slot: 'media' | 'file') => {
    setUploadingIds((prev) => new Map(prev).set(tempId, slot));
  }, []);
  const unmarkUploading = useCallback((tempId: string) => {
    setUploadingIds((prev) => {
      if (!prev.has(tempId)) return prev;
      const next = new Map(prev);
      next.delete(tempId);
      return next;
    });
  }, []);


  // Upload the picked asset, then deliver the message with the
  // RELATIVE url(s) the server returned (bubbles resolve them
  // with getUploadUrl at render time). A photo is one upload; a
  // video is two — its poster frame first (a JPEG through the
  // photo route, so receivers see a still before they tap), then
  // the clip through the video route; a document is one. A
  // retryably failed upload parks the asset in the queue so a
  // retry uploads again
  const uploadAndDeliver = useCallback(
    async (tempId: string, asset: PickedAsset, replyToId?: string) => {
      // Same guard as deliver: a retry tap and the restore sweep
      // must not start two uploads of one asset
      if (inFlightRef.current.has(tempId)) return;
      inFlightRef.current.add(tempId);
      const kind = asset.kind ?? 'image';
      markUploading(tempId, kind === 'file' ? 'file' : 'media');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sending' } : m)));
      try {
        if (kind === 'video') {
          // The poster: a frame half a second in, or none when the
          // device cannot decode it — the bubble then shows the
          // dark stage, still playable
          let posterUrl: string | undefined;
          let frame: { width: number; height: number } | undefined = asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined;
          try {
            const thumb = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500, quality: 0.7 });
            const poster = await uploadImageApi(thumb.uri, 'poster.jpg', 'image/jpeg');
            posterUrl = poster.url;
            if (poster.width && poster.height) frame = { width: poster.width, height: poster.height };
            else if (thumb.width && thumb.height) frame = { width: thumb.width, height: thumb.height };
          } catch {
            posterUrl = undefined;
          }
          const upload = await uploadFileApi(asset.uri, { name: asset.fileName, mimeType: asset.mimeType, fileSize: asset.fileSize, kind: 'video' });
          unmarkUploading(tempId);
          const extra: SendMessageExtra = {
            kind: 'video',
            attachment: { url: upload.url, name: upload.name, size: upload.size, mime: upload.mime },
            media: { ...(frame ?? {}), duration: asset.duration, thumbnailUrl: posterUrl },
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, video: { ...(m.video ?? { uri: upload.url }), uri: upload.url, thumbnailUri: posterUrl }, mediaSize: frame ?? m.mediaSize }
                : m,
            ),
          );
          inFlightRef.current.delete(tempId);
          await deliver(tempId, '', undefined, replyToId, extra);
          return;
        }

        if (kind === 'file') {
          const upload = await uploadFileApi(asset.uri, { name: asset.fileName, mimeType: asset.mimeType, fileSize: asset.fileSize, kind: 'file' });
          unmarkUploading(tempId);
          const extra: SendMessageExtra = {
            kind: 'file',
            attachment: { url: upload.url, name: upload.name, size: upload.size, mime: upload.mime },
          };
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, file: { name: upload.name, uri: upload.url, size: upload.size, mimeType: upload.mime } } : m)),
          );
          inFlightRef.current.delete(tempId);
          await deliver(tempId, '', undefined, replyToId, extra);
          return;
        }

        const upload = await uploadImageApi(asset.uri, asset.fileName, asset.mimeType, asset.fileSize);
        unmarkUploading(tempId);
        // The stored pixel size rides along so every reader lays
        // the bubble out at its final proportions before the bytes
        const frame = upload.width && upload.height ? { width: upload.width, height: upload.height } : undefined;
        const extra: SendMessageExtra | undefined = frame ? { media: frame } : undefined;
        // The temp now carries the server path (the echo matcher
        // and the viewer compare it) while still showing the local
        // file until the upload is cached
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, imageUrl: upload.url, mediaSize: frame ?? m.mediaSize } : m)));
        inFlightRef.current.delete(tempId);
        await deliver(tempId, '', upload.url, replyToId, extra);
      } catch (err) {
        unmarkUploading(tempId);
        inFlightRef.current.delete(tempId);
        if (isRetryable(err)) {
          failedQueueRef.current.set(tempId, { text: '', replyToId, asset });
        } else {
          failedQueueRef.current.delete(tempId);
        }
        persistQueue();
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
        showToast(
          'error',
          err instanceof ApiError && err.code === 'timeout' ? t('toast.timeout')
          : err instanceof ApiError && err.serverCode === 'file_too_large' ? t('chat.fileTooLarge')
          : t(kind === 'video' ? 'chat.videoUploadError' : kind === 'file' ? 'chat.fileUploadError' : 'chat.imageUploadError'),
        );
      }
    },
    [deliver, markUploading, persistQueue, setMessages, t, unmarkUploading],
  );


  // Send the draft. The ref is cleared before any async work,
  // so a double-tap's second read sees an empty draft. A
  // whitespace-only draft is cleared, never posted — the send
  // button visibly acts and nothing lands on the wire
  const sendMessage = useCallback(() => {
    const body = textRef.current.trim();

    // Edit mode: save the rewrite (optimistically — the room's
    // 'message_edited' echo confirms it), or leave the message
    // as it was when nothing changed. An emptied field cannot
    // save (the kit dims the check); the strip's × is the exit
    const target = editingRef.current;
    if (target) {
      if (!body) return;
      editingRef.current = null;
      setEditingState(null);
      textRef.current = parkedDraftRef.current;
      setText(parkedDraftRef.current);
      persistDraft(parkedDraftRef.current);
      parkedDraftRef.current = '';
      stopTyping();
      if (body === target.text) return;
      const previous = target.text;
      const optimisticStamp = new Date().toISOString();
      setMessages((prev) => prev.map((m) => markEdited(m, target.id, body, optimisticStamp)));
      editMessageApi(conversationId, target.id, body)
        .then((saved) => {
          setMessages((prev) => prev.map((m) => markEdited(m, target.id, saved.text, saved.editedAt)));
        })
        .catch(() => {
          setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, text: previous, editedAt: target.editedAt ?? undefined } : m)));
          showToast('error', t('chat.editError'));
        });
      return;
    }

    if (!body) {
      if (textRef.current) {
        textRef.current = '';
        setText('');
        persistDraft('');
        stopTyping();
      }
      return;
    }

    textRef.current = '';
    setText('');
    persistDraft('');
    stopTyping();
    startSend(body);
  }, [conversationId, persistDraft, setMessages, startSend, stopTyping, t]);


  // Enter edit mode: the field takes the message's text, the
  // draft that was there waits in a ref; a reply in progress is
  // dropped (a rewrite is not an answer)
  const startEdit = useCallback((message: KitMessage) => {
    if (!message.isOwn || message.deleted) return;
    if (!editingRef.current) parkedDraftRef.current = textRef.current;
    editingRef.current = message;
    setEditingState(message);
    replyToRef.current = null;
    setReplyToState(null);
    textRef.current = message.text;
    setText(message.text);
  }, []);

  const cancelEdit = useCallback(() => {
    if (!editingRef.current) return;
    editingRef.current = null;
    setEditingState(null);
    textRef.current = parkedDraftRef.current;
    setText(parkedDraftRef.current);
    parkedDraftRef.current = '';
  }, []);


  // The thumbs-up button: a quick 👍 on an EMPTY field only —
  // any visible draft (whitespace included) routes through
  // sendMessage, so 👍 never fires while text is on screen
  const sendQuickLike = useCallback(() => {
    if (textRef.current.length > 0) {
      sendMessage();
      return;
    }
    startSend('👍');
  }, [sendMessage, startSend]);


  // Re-entry guard set synchronously — uploadingImage flips
  // only after the picker returns, too late to stop a double
  // tap opening two pickers
  const pickingRef = useRef(false);


  // Pick → upload → send. uploadingMedia drives the Composer's
  // spinner and blocks a second pick while the first uploads.
  // The library offers photos AND videos; nothing is cropped
  // (the old square crop is what made every photo square). A
  // video is refused before the upload when it is too long or
  // too big — a toast, not a failed bubble
  const attachMedia = useCallback(async () => {
    if (pickingRef.current || uploadingMedia) return;
    pickingRef.current = true;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: MAX_VIDEO_SECONDS,
        // iOS: an H.264 mp4 rather than an HEVC .mov the backend and
        // Android readers cannot play
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Compatible,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const durationSeconds = typeof asset.duration === 'number' && asset.duration > 0 ? asset.duration / 1000 : undefined;
      if (isVideo && durationSeconds && durationSeconds > MAX_VIDEO_SECONDS + 1) {
        showToast('error', t('chat.videoTooLong'));
        return;
      }
      if (isVideo && typeof asset.fileSize === 'number' && asset.fileSize > MAX_VIDEO_UPLOAD_BYTES) {
        showToast('error', t('chat.fileTooLarge'));
        return;
      }

      const picked: PickedAsset = {
        uri: asset.uri,
        fileName: asset.fileName || undefined,
        mimeType: asset.mimeType || undefined,
        fileSize: asset.fileSize ?? undefined,
        kind: isVideo ? 'video' : 'image',
        width: asset.width || undefined,
        height: asset.height || undefined,
        duration: durationSeconds,
      };

      // The bubble appears at once — the local photo, or the dark
      // video stage with the length — at its final proportions;
      // the upload and the send follow behind it
      const frame = asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined;
      const temp = isVideo
        ? createTemp('', undefined, undefined, { kind: 'video', video: { uri: asset.uri, duration: durationSeconds, mimeType: picked.mimeType, name: picked.fileName }, mediaSize: frame })
        : createTemp('', undefined, asset.uri, { mediaSize: frame });
      if (!temp) return;
      await uploadAndDeliver(temp.tempId, picked, temp.replyToId);
    } catch {
      // A refused or crashed picker must not kill the attach
      // button silently
      showToast('error', t('chat.mediaPickError'));
    } finally {
      pickingRef.current = false;
    }
  }, [createTemp, t, uploadAndDeliver, uploadingMedia]);


  // The paperclip: a document from the system picker (copied
  // into the cache so the upload can read it), refused before
  // the upload when over the cap
  const attachFile = useCallback(async () => {
    if (pickingRef.current || uploadingFile) return;
    pickingRef.current = true;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (typeof asset.size === 'number' && asset.size > MAX_UPLOAD_BYTES) {
        showToast('error', t('chat.fileTooLarge'));
        return;
      }

      const picked: PickedAsset = {
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType || undefined,
        fileSize: asset.size ?? undefined,
        kind: 'file',
      };
      const temp = createTemp('', undefined, undefined, {
        kind: 'file',
        file: { name: asset.name, uri: asset.uri, size: asset.size ?? undefined, mimeType: asset.mimeType || undefined },
      });
      if (!temp) return;
      await uploadAndDeliver(temp.tempId, picked, temp.replyToId);
    } catch {
      showToast('error', t('chat.filePickError'));
    } finally {
      pickingRef.current = false;
    }
  }, [createTemp, t, uploadAndDeliver, uploadingFile]);


  // Tap-to-retry on a failed bubble. The queue entry is the
  // authoritative payload; a bubble whose entry is gone was
  // already retried (stale press) and is skipped
  const retryMessage = useCallback(
    (message: KitMessage) => {
      if (message.status !== 'failed') return;
      const payload = failedQueueRef.current.get(message.id);
      if (!payload) return;
      if (!messagesRef.current.some((m) => m.id === message.id)) {
        failedQueueRef.current.delete(message.id);
        persistQueue();
        return;
      }

      if (payload.asset && !payload.imageUrl && !payload.extra?.attachment) {
        void uploadAndDeliver(message.id, payload.asset, payload.replyToId);
        return;
      }
      void deliver(message.id, payload.text, payload.imageUrl, payload.replyToId, payload.extra);
    },
    [deliver, persistQueue, uploadAndDeliver],
  );


  // Connectivity returned — re-drive every queued failure from
  // the ref snapshot (never from inside a state updater).
  // Entries still waiting for their rehydrated bubble are
  // skipped, not dropped
  useNetworkRestore(() => {
    const present = new Set(messagesRef.current.map((m) => m.id));
    let changed = false;
    for (const [tempId, payload] of Array.from(failedQueueRef.current.entries())) {
      if (!present.has(tempId)) {
        if (rehydratedPendingRef.current.has(tempId)) continue;
        failedQueueRef.current.delete(tempId);
        changed = true;
        continue;
      }
      if (payload.asset && !payload.imageUrl && !payload.extra?.attachment) void uploadAndDeliver(tempId, payload.asset, payload.replyToId);
      else void deliver(tempId, payload.text, payload.imageUrl, payload.replyToId, payload.extra);
    }
    if (changed) persistQueue();
  });


  const setReplyTo = useCallback((message: KitMessage | null) => {
    replyToRef.current = message;
    setReplyToState(message);
  }, []);


  // Prune queue entries whose temp no longer exists — except
  // rehydrated ones still waiting for their bubble, which
  // graduate the moment the first load lands it
  useEffect(() => {
    if (failedQueueRef.current.size === 0) return;
    const present = new Set(messages.map((m) => m.id));
    for (const tempId of Array.from(rehydratedPendingRef.current)) {
      if (present.has(tempId)) rehydratedPendingRef.current.delete(tempId);
    }
    let changed = false;
    for (const tempId of Array.from(failedQueueRef.current.keys())) {
      if (!present.has(tempId) && !rehydratedPendingRef.current.has(tempId)) {
        failedQueueRef.current.delete(tempId);
        changed = true;
      }
    }
    if (changed) persistQueue();
  }, [messages, persistQueue]);


  // Drop a failed bubble the user gives up on — only temps are
  // ever discarded; server rows go through the unsend flow
  const discardMessage = useCallback(
    (messageId: string) => {
      if (!messageId.startsWith(TEMP_ID_PREFIX)) return;
      failedQueueRef.current.delete(messageId);
      rehydratedPendingRef.current.delete(messageId);
      persistQueue();
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    [persistQueue, setMessages],
  );


  return {
    text,
    onChangeText,
    uploadingMedia,
    uploadingImage: uploadingMedia,
    uploadingFile,
    sendMessage,
    sendQuickLike,
    attachMedia,
    attachImage: attachMedia,
    attachFile,
    retryMessage,
    discardMessage,
    replyTo,
    setReplyTo,
    editing,
    startEdit,
    cancelEdit,
  };
}
