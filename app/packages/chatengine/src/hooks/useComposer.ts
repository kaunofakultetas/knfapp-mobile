// -----------------------------------------------------------
//  [*] chatengine — useComposer
//
//  Everything between an input field and the server: optimistic
//  bubbles ('sending' → 'sent' via the transport's response,
//  'failed' on error), tap-to-retry, an automatic retry sweep
//  when connectivity returns, photo / video / document sends,
//  edit mode, and the typing signals.
//
//  Double-send safety is synchronous: the draft lives in a ref
//  cleared BEFORE the first await, so a second tap in the same
//  frame reads an empty draft; each in-flight delivery is also
//  tracked in a Set keyed by temp id, so retry taps and the
//  restore sweep can never race the same message onto the wire
//  twice. Temp ids come from a monotonic counter. The temp's id
//  rides every send as its clientId — the idempotency key — so
//  retrying a timed-out-but-committed send resolves to the SAME
//  server row instead of a duplicate.
//
//  The failed-send queue is a ref map (tempId → payload); the
//  restore sweep iterates THAT — state updaters stay pure,
//  because React may run them twice. Queue and draft are
//  mirrored to the host's storage (core/outbox.ts) so leaving
//  the room loses neither; only failures that can heal are
//  queued — a definitive 4xx leaves the bubble permanently
//  failed with a specific notice and just the discard.
//
//  Pickers are the host's: attach(asset) takes an already
//  picked asset (uri, kind, size, frame, duration, an optional
//  poster) — the engine uploads (a video's poster first, then
//  the clip) and sends.
//
//  Typing contract: re-emit at most every 2 s while keystrokes
//  keep coming (useTyping expires a typer after 5 s), stop on
//  idle (3 s), on send, on clearing the draft, and on unmount.
//
//  Split into:
//
//    UseComposerResult — the hook's return shape
//    useComposer       — the hook itself
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeAssetName } from '../core/assets';
import { isRetryable, sendFailureCode, toTransportError } from '../core/errors';
import { draftKey, draftReplyKey, readOutbox, writeOutbox, type OutboxEntry, type PickedAsset } from '../core/outbox';
import { markEdited, normalizeForViewer } from '../core/reducers';
import { getTaskQueue } from '../core/tasks';
import type { OutgoingMessage } from '../core/transport';
import { TEMP_ID_PREFIX, isTempId, type ChatMessage } from '../core/types';
import { useChatEngine } from '../provider';


const TYPING_REEMIT_MS = 2000;
// Self-retries after a retryable park, then the tap / restore
// sweep take over
const AUTO_RETRY_DELAYS = [5_000, 20_000];
const TYPING_IDLE_MS = 3000;
const DRAFT_DEBOUNCE_MS = 400;


// What the composer needs from a message handed to it — any UI
// message type carrying these fields fits (chatuikit's KitMessage
// does), so a screen never converts
export type RetryTarget = Pick<ChatMessage, 'id' | 'status'>;
export type EditTarget = Pick<ChatMessage, 'id' | 'text' | 'isOwn' | 'deleted' | 'editedAt'>;
export type ReplyTarget = Pick<ChatMessage, 'id' | 'senderId' | 'senderName' | 'text' | 'imageUrl' | 'deleted' | 'kind' | 'file'>;

export interface UseComposerResult {
  text: string;
  onChangeText: (next: string) => void;
  // False for a guest (no signed-in user): sends are impossible,
  // the UI disables its controls and says so
  canSend: boolean;
  // A photo / video upload in flight
  uploadingMedia: boolean;
  // A document upload in flight
  uploadingFile: boolean;
  // Send the trimmed draft — or save the edit while `editing` is set
  sendMessage: () => void;
  // The quick reaction on an EMPTY field; otherwise sends the draft
  sendQuickLike: (emoji?: string) => void;
  // Upload and send an already-picked asset (the host's pickers
  // hand it over). Resolves when the send settled either way
  attach: (asset: PickedAsset) => Promise<void>;
  // Several picked photos as ONE gallery message; anything that
  // is not a pure multi-photo pick falls back to attach() each
  attachMany: (assets: PickedAsset[]) => Promise<void>;
  retryMessage: (message: RetryTarget) => void;
  // Drops a failed optimistic bubble that will not be retried
  discardMessage: (messageId: string) => void;
  replyTo: ReplyTarget | null;
  setReplyTo: (message: ReplyTarget | null) => void;
  // Edit mode: the message whose text the field holds
  editing: EditTarget | null;
  startEdit: (message: EditTarget) => void;
  cancelEdit: () => void;
}







// -----------------------------------------------------------
// useComposer
// -----------------------------------------------------------
//
//   const composer = useComposer(conversationId, setMessages, messages)
//
// Used by:
//   - the host's chat room screen (directly or via useChatRoom)
// -----------------------------------------------------------

export function useComposer(
  conversationId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  messages: ChatMessage[],
): UseComposerResult {
  const { transport, currentUser, storage, notify, onNetworkRestore, makeVideoPoster, limits } = useChatEngine();


  // The live list, for the queue: an entry whose temp is gone
  // must never be re-sent by the restore sweep
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);


  const [text, setText] = useState('');
  const [uploadingIds, setUploadingIds] = useState<ReadonlyMap<string, 'media' | 'file'>>(new Map());
  const uploadingMedia = Array.from(uploadingIds.values()).includes('media');
  const uploadingFile = Array.from(uploadingIds.values()).includes('file');

  const [editing, setEditingState] = useState<EditTarget | null>(null);
  const editingRef = useRef<EditTarget | null>(null);
  const parkedDraftRef = useRef('');
  const [replyTo, setReplyToState] = useState<ReplyTarget | null>(null);
  const replyToRef = useRef<ReplyTarget | null>(null);

  // Draft mirror read synchronously by sendMessage
  const textRef = useRef('');
  // Monotonic temp-id source
  const tempSeqRef = useRef(0);
  const failedQueueRef = useRef(new Map<string, OutboxEntry>());
  // Rehydrated queue entries whose bubble has not reappeared yet
  const rehydratedPendingRef = useRef(new Set<string>());
  // Temp ids currently on the wire
  const inFlightRef = useRef(new Set<string>());


  const persistQueue = useCallback(() => {
    const record = new Map<string, OutboxEntry>();
    for (const [tempId, payload] of failedQueueRef.current) {
      record.set(tempId, { ...payload, createdAt: messagesRef.current.find((m) => m.id === tempId)?.createdAt ?? payload.createdAt });
    }
    void writeOutbox(storage, conversationId, record);
  }, [conversationId, storage]);


  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDraft = useCallback(
    (value: string) => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        draftTimerRef.current = null;
        const key = draftKey(conversationId);
        (value ? storage.setItem(key, value) : storage.removeItem(key)).catch(() => {});
      }, DRAFT_DEBOUNCE_MS);
    },
    [conversationId, storage],
  );

  // The reply target is persisted beside the draft, so a quote
  // survives leaving the room the way the text does
  const persistReply = useCallback(
    (target: ReplyTarget | null) => {
      const key = draftReplyKey(conversationId);
      const snapshot = target
        ? { id: target.id, senderId: target.senderId, senderName: target.senderName, text: target.text, imageUrl: target.imageUrl ?? undefined, deleted: !!target.deleted, kind: target.kind, file: target.file }
        : null;
      (snapshot ? storage.setItem(key, JSON.stringify(snapshot)) : storage.removeItem(key)).catch(() => {});
    },
    [conversationId, storage],
  );

  // Leaving the room flushes the final draft past the debounce
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      const key = draftKey(conversationId);
      const value = textRef.current;
      (value ? storage.setItem(key, value) : storage.removeItem(key)).catch(() => {});
    };
  }, [conversationId, storage]);


  // A room switch in place clears the field, the strips and the
  // per-room queue state WITHOUT persisting
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


  // Rehydrate this room's persisted draft and failed-send queue
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [draft, outbox, storedReply] = await Promise.all([
          storage.getItem(draftKey(conversationId)),
          readOutbox(storage, conversationId),
          storage.getItem(draftReplyKey(conversationId)),
        ]);
        if (cancelled) return;
        if (draft && !textRef.current) {
          textRef.current = draft;
          setText(draft);
        }
        if (storedReply && !replyToRef.current) {
          try {
            const parsed = JSON.parse(storedReply) as ReplyTarget;
            if (parsed && typeof parsed.id === 'string') {
              replyToRef.current = parsed;
              setReplyToState(parsed);
            }
          } catch {
            // A stale or unreadable quote is simply dropped
          }
        }
        for (const [tempId, payload] of outbox) {
          if (failedQueueRef.current.has(tempId)) continue;
          failedQueueRef.current.set(tempId, payload);
          rehydratedPendingRef.current.add(tempId);
        }
      } catch {
        // Unreadable storage never blocks the composer
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, storage]);


  // Typing signals (heartbeat + idle stop)
  const typingActiveRef = useRef(false);
  const typingLastEmitRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      transport.realtime.typing(conversationId, false);
    }
  }, [conversationId, transport]);

  useEffect(() => stopTyping, [stopTyping]);

  const onChangeText = useCallback(
    (raw: string) => {
      const next = raw.length > limits.maxMessageLength ? raw.slice(0, limits.maxMessageLength) : raw;
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
        transport.realtime.typing(conversationId, true);
      }
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    [conversationId, limits.maxMessageLength, persistDraft, stopTyping, transport],
  );


  // One delivery path for fresh sends, retries and the restore
  // sweep: flip the temp to 'sending', send, then swap in the
  // server message — or mark 'failed' and queue for retry
  // A parked retryable failure re-drives itself a couple of
  // times before waiting for a tap or the restore sweep — most
  // outages are seconds long. Manual retries and successes clear
  // the pending timer; the counter never resets, so a flapping
  // network cannot loop forever
  const autoRetryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const autoRetryCountRef = useRef(new Map<string, number>());
  const redriveRef = useRef<(tempId: string) => void>(() => {});
  const clearAutoRetry = useCallback((tempId: string) => {
    const timer = autoRetryTimersRef.current.get(tempId);
    if (timer) clearTimeout(timer);
    autoRetryTimersRef.current.delete(tempId);
  }, []);
  const scheduleAutoRetry = useCallback((tempId: string) => {
    const attempt = autoRetryCountRef.current.get(tempId) ?? 0;
    if (attempt >= AUTO_RETRY_DELAYS.length) return;
    autoRetryCountRef.current.set(tempId, attempt + 1);
    clearAutoRetry(tempId);
    autoRetryTimersRef.current.set(
      tempId,
      setTimeout(() => {
        autoRetryTimersRef.current.delete(tempId);
        redriveRef.current(tempId);
      }, AUTO_RETRY_DELAYS[attempt]),
    );
  }, [clearAutoRetry]);
  useEffect(
    () => () => {
      autoRetryTimersRef.current.forEach((timer) => clearTimeout(timer));
      autoRetryTimersRef.current.clear();
    },
    [],
  );


  // The running upload's fraction onto the optimistic bubble —
  // rounded so a chatty transport cannot render every byte
  const reportProgress = useCallback(
    (tempId: string, fraction: number) => {
      const clamped = Math.round(Math.max(0, Math.min(1, fraction)) * 100) / 100;
      setMessages((prev) => {
        const row = prev.find((m) => m.id === tempId);
        if (!row || row.uploadProgress === clamped) return prev;
        return prev.map((m) => (m.id === tempId ? { ...m, uploadProgress: clamped } : m));
      });
    },
    [setMessages],
  );


  const deliver = useCallback(
    async (tempId: string, body: string, imageUrl?: string, replyToId?: string, extra?: OutboxEntry['extra']) => {
      if (inFlightRef.current.has(tempId)) return;
      inFlightRef.current.add(tempId);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sending' } : m)));
      try {
        const outgoing: OutgoingMessage = { text: body, imageUrl, replyToId, clientId: tempId, ...(extra ?? {}) };
        const row = await transport.sendMessage(conversationId, outgoing);
        failedQueueRef.current.delete(tempId);
        clearAutoRetry(tempId);
        autoRetryCountRef.current.delete(tempId);
        persistQueue();
        const sent = normalizeForViewer({ ...row, isOwn: true, status: row.status ?? 'sent' }, currentUser?.id ?? row.senderId);
        setMessages((prev) => {
          // The realtime echo may have delivered the server row first
          if (prev.some((m) => m.id === sent.id)) return prev.filter((m) => m.id !== tempId);
          // The row keeps the temp's key (and local media) so the
          // bubble does not remount mid-animation
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
        if (isRetryable(err)) {
          failedQueueRef.current.set(tempId, { text: body, imageUrl, replyToId, extra });
          scheduleAutoRetry(tempId);
        } else failedQueueRef.current.delete(tempId);
        persistQueue();
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
        notify({ level: 'error', code: sendFailureCode(err) });
      } finally {
        inFlightRef.current.delete(tempId);
      }
    },
    [conversationId, currentUser, transport, notify, persistQueue, clearAutoRetry, scheduleAutoRetry, setMessages],
  );


  // Append the optimistic bubble (newest-first list → unshift);
  // returns its temp id and the consumed reply target
  const createTemp = useCallback(
    (body: string, imageUrl?: string, localImageUri?: string, content?: Partial<Pick<ChatMessage, 'kind' | 'file' | 'video' | 'mediaSize' | 'gallery' | 'audio'>>) => {
      if (!currentUser) return null;
      const reply = replyToRef.current;
      replyToRef.current = null;
      setReplyToState(null);
      if (reply) storage.removeItem(draftReplyKey(conversationId)).catch(() => {});

      tempSeqRef.current += 1;
      const tempId = `${TEMP_ID_PREFIX}${tempSeqRef.current}-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        clientId: tempId,
        conversationId,
        senderId: currentUser.id,
        senderName: currentUser.displayName,
        senderAvatar: currentUser.avatarUrl ?? undefined,
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
    [conversationId, currentUser, setMessages, storage],
  );

  const startSend = useCallback(
    (body: string) => {
      const temp = createTemp(body);
      if (temp) void deliver(temp.tempId, body, undefined, temp.replyToId);
    },
    [createTemp, deliver],
  );


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


  // Upload the picked asset, then deliver. A photo is one upload;
  // a video is two — its poster first, then the clip; a document
  // is one. A retryably failed upload parks the asset so a retry
  // uploads again
  const uploadAndDeliver = useCallback(
    async (tempId: string, asset: PickedAsset, replyToId?: string) => {
      if (inFlightRef.current.has(tempId)) return;
      inFlightRef.current.add(tempId);
      const kind = asset.kind;
      markUploading(tempId, kind === 'file' ? 'file' : 'media');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sending' } : m)));
      try {
        if (kind === 'video') {
          let posterUrl: string | undefined;
          let posterPreview: string | undefined;
          let frame = asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined;
          try {
            const poster = asset.posterUri
              ? { uri: asset.posterUri, width: asset.width, height: asset.height }
              : makeVideoPoster
                ? await makeVideoPoster(asset.uri)
                : null;
            if (poster) {
              const uploaded = await transport.upload({ uri: poster.uri, name: 'poster.jpg', mimeType: 'image/jpeg', kind: 'image' });
              posterUrl = uploaded.url;
              posterPreview = uploaded.preview ?? undefined;
              if (uploaded.width && uploaded.height) frame = { width: uploaded.width, height: uploaded.height };
              else if (poster.width && poster.height) frame = { width: poster.width, height: poster.height };
            }
          } catch {
            posterUrl = undefined;
          }
          const upload = await transport.upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, kind: 'video' }, (f) => reportProgress(tempId, f));
          unmarkUploading(tempId);
          const extra: OutboxEntry['extra'] = {
            kind: 'video',
            attachment: { url: upload.url, name: upload.name, size: upload.size, mime: upload.mime },
            media: { ...(frame ?? {}), duration: asset.duration, thumbnailUrl: posterUrl, ...(posterPreview ? { preview: posterPreview } : {}) },
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
          const upload = await transport.upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, kind: 'file' }, (f) => reportProgress(tempId, f));
          unmarkUploading(tempId);
          const extra: OutboxEntry['extra'] = { kind: 'file', attachment: { url: upload.url, name: upload.name, size: upload.size, mime: upload.mime } };
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, file: { name: upload.name, uri: upload.url, size: upload.size, mimeType: upload.mime } } : m)),
          );
          inFlightRef.current.delete(tempId);
          await deliver(tempId, '', undefined, replyToId, extra);
          return;
        }

        if (kind === 'audio') {
          const upload = await transport.upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, kind: 'audio' }, (f) => reportProgress(tempId, f));
          unmarkUploading(tempId);
          const extra: OutboxEntry['extra'] = {
            kind: 'audio',
            attachment: { url: upload.url, name: upload.name, size: upload.size, mime: upload.mime },
            media: { ...(asset.duration ? { duration: asset.duration } : {}), ...(asset.waveform?.length ? { waveform: asset.waveform } : {}) },
          };
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, audio: { ...(m.audio ?? {}), uri: upload.url, size: upload.size, mimeType: upload.mime, name: upload.name } } : m)),
          );
          inFlightRef.current.delete(tempId);
          await deliver(tempId, '', undefined, replyToId, extra);
          return;
        }

        const upload = await transport.upload({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, kind: 'image' }, (f) => reportProgress(tempId, f));
        unmarkUploading(tempId);
        const frame = upload.width && upload.height ? { width: upload.width, height: upload.height } : undefined;
        const extra: OutboxEntry['extra'] | undefined = frame || upload.preview ? { media: { ...(frame ?? {}), ...(upload.preview ? { preview: upload.preview } : {}) } } : undefined;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, imageUrl: upload.url, mediaSize: frame ?? m.mediaSize } : m)));
        inFlightRef.current.delete(tempId);
        await deliver(tempId, '', upload.url, replyToId, extra);
      } catch (err) {
        unmarkUploading(tempId);
        inFlightRef.current.delete(tempId);
        if (isRetryable(err)) {
          failedQueueRef.current.set(tempId, { text: '', replyToId, asset });
          scheduleAutoRetry(tempId);
        } else failedQueueRef.current.delete(tempId);
        persistQueue();
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed', uploadProgress: undefined } : m)));
        const e = toTransportError(err);
        notify({
          level: 'error',
          code: e.kind === 'timeout' ? 'timeout' : e.serverCode === 'file_too_large' || e.status === 413 ? 'upload_too_large' : 'upload_failed',
          detail: kind,
        });
      }
    },
    [deliver, makeVideoPoster, markUploading, notify, persistQueue, reportProgress, scheduleAutoRetry, setMessages, transport, unmarkUploading],
  );


  // A gallery: every photo uploaded in the order it was picked,
  // then ONE message carrying the stored list. A failure anywhere
  // parks the whole picked set — the retry uploads them all again
  // (uploads are cheap and stateless; half-done sets are not)
  const uploadGalleryAndDeliver = useCallback(
    async (tempId: string, assets: PickedAsset[], replyToId?: string) => {
      if (inFlightRef.current.has(tempId)) return;
      inFlightRef.current.add(tempId);
      markUploading(tempId, 'media');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'sending' } : m)));
      try {
        const items: NonNullable<ChatMessage['gallery']> = [];
        for (const [index, asset] of assets.entries()) {
          // The bubble's ring walks the WHOLE set: photo i of n
          const upload = await transport.upload(
            { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, kind: 'image' },
            (f) => reportProgress(tempId, (index + f) / assets.length),
          );
          items.push({ url: upload.url, width: upload.width ?? asset.width, height: upload.height ?? asset.height, ...(upload.preview ? { preview: upload.preview } : {}) });
        }
        unmarkUploading(tempId);
        const extra: OutboxEntry['extra'] = { kind: 'image', gallery: items };
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, gallery: items } : m)));
        inFlightRef.current.delete(tempId);
        await deliver(tempId, '', undefined, replyToId, extra);
      } catch (err) {
        unmarkUploading(tempId);
        inFlightRef.current.delete(tempId);
        if (isRetryable(err)) {
          failedQueueRef.current.set(tempId, { text: '', replyToId, assets });
          scheduleAutoRetry(tempId);
        } else failedQueueRef.current.delete(tempId);
        persistQueue();
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed', uploadProgress: undefined } : m)));
        const e = toTransportError(err);
        notify({
          level: 'error',
          code: e.kind === 'timeout' ? 'timeout' : e.serverCode === 'file_too_large' || e.status === 413 ? 'upload_too_large' : 'upload_failed',
          detail: 'image',
        });
      }
    },
    [deliver, markUploading, notify, persistQueue, reportProgress, scheduleAutoRetry, setMessages, transport, unmarkUploading],
  );


  const sendMessage = useCallback(() => {
    const body = textRef.current.trim();

    // Edit mode: save the rewrite (optimistically — the room's
    // 'edited' echo confirms it), or leave the message as it was
    // when nothing changed. An emptied field cannot save
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
      transport
        .editMessage(conversationId, target.id, body)
        .then((saved) => setMessages((prev) => prev.map((m) => markEdited(m, target.id, saved.text, saved.editedAt))))
        .catch((err: unknown) => {
          // Offline: the rewrite stays on screen and replays on
          // restore (core/tasks.ts); a refusal reverts it
          if (isRetryable(err)) {
            getTaskQueue(storage, conversationId).add({ type: 'edit', messageId: target.id, text: body, previousText: previous, at: new Date().toISOString() });
            return;
          }
          setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, text: previous, editedAt: target.editedAt ?? undefined } : m)));
          notify({ level: 'error', code: 'edit_failed' });
        });
      return;
    }

    // A whitespace-only draft is cleared, never sent
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
  }, [conversationId, notify, persistDraft, setMessages, startSend, stopTyping, storage, transport]);


  const startEdit = useCallback((message: EditTarget) => {
    if (!message.isOwn || message.deleted) return;
    if (!editingRef.current) parkedDraftRef.current = textRef.current;
    editingRef.current = message;
    setEditingState(message);
    replyToRef.current = null;
    setReplyToState(null);
    persistReply(null);
    textRef.current = message.text;
    setText(message.text);
  }, [persistReply]);

  const cancelEdit = useCallback(() => {
    if (!editingRef.current) return;
    editingRef.current = null;
    setEditingState(null);
    textRef.current = parkedDraftRef.current;
    setText(parkedDraftRef.current);
    parkedDraftRef.current = '';
  }, []);


  // The quick reaction on an EMPTY field only — any visible
  // draft (whitespace included) routes through sendMessage
  const sendQuickLike = useCallback(
    (emoji = '👍') => {
      if (textRef.current.length > 0) {
        sendMessage();
        return;
      }
      startSend(emoji);
    },
    [sendMessage, startSend],
  );


  // The host's pickers hand an asset over; the caps are checked
  // here so a host need not repeat them
  const attach = useCallback(
    async (picked: PickedAsset) => {
      // The name follows the bytes (an iOS .HEIC handed over as JPEG)
      const asset: PickedAsset = { ...picked, name: normalizeAssetName(picked) };
      if (asset.kind === 'video') {
        if (asset.duration && asset.duration > limits.maxVideoSeconds + 1) {
          notify({ level: 'error', code: 'upload_too_large', detail: 'video_duration' });
          return;
        }
        if (typeof asset.size === 'number' && asset.size > limits.maxVideoBytes) {
          notify({ level: 'error', code: 'upload_too_large', detail: 'video' });
          return;
        }
      } else if (typeof asset.size === 'number' && asset.size > limits.maxUploadBytes) {
        notify({ level: 'error', code: 'upload_too_large', detail: asset.kind });
        return;
      }

      const frame = asset.width && asset.height ? { width: asset.width, height: asset.height } : undefined;
      const temp =
        asset.kind === 'video'
          ? createTemp('', undefined, undefined, {
              kind: 'video',
              video: { uri: asset.uri, duration: asset.duration, mimeType: asset.mimeType, name: asset.name, localThumbnailUri: asset.posterUri },
              mediaSize: frame,
            })
          : asset.kind === 'file'
            ? createTemp('', undefined, undefined, { kind: 'file', file: { name: asset.name ?? '', uri: asset.uri, size: asset.size, mimeType: asset.mimeType } })
            : asset.kind === 'audio'
              ? createTemp('', undefined, undefined, { kind: 'audio', audio: { uri: asset.uri, duration: asset.duration, size: asset.size, mimeType: asset.mimeType, name: asset.name, waveform: asset.waveform } })
              : createTemp('', undefined, asset.uri, { mediaSize: frame });
      if (!temp) return;
      await uploadAndDeliver(temp.tempId, asset, temp.replyToId);
    },
    [createTemp, limits, notify, uploadAndDeliver],
  );


  // The auto-retry timer lands here: the same three-way redrive
  // the restore sweep runs, against the parked payload
  const redrive = useCallback(
    (tempId: string) => {
      const payload = failedQueueRef.current.get(tempId);
      if (!payload) return;
      if (!messagesRef.current.some((m) => m.id === tempId)) return;
      if (payload.assets && !payload.extra?.gallery) void uploadGalleryAndDeliver(tempId, payload.assets, payload.replyToId);
      else if (payload.asset && !payload.imageUrl && !payload.extra?.attachment) void uploadAndDeliver(tempId, payload.asset, payload.replyToId);
      else void deliver(tempId, payload.text, payload.imageUrl, payload.replyToId, payload.extra);
    },
    [deliver, uploadAndDeliver, uploadGalleryAndDeliver],
  );
  useEffect(() => {
    redriveRef.current = redrive;
  });


  // Several picks at once. Only a pure multi-photo set becomes a
  // gallery; one pick — or a set with a video / document in it —
  // goes through attach() one message each, videos and all
  const attachMany = useCallback(
    async (picked: PickedAsset[]) => {
      if (picked.length === 0) return;
      if (picked.length === 1 || picked.some((a) => a.kind !== 'image')) {
        for (const one of picked) await attach(one);
        return;
      }
      const assets = picked.slice(0, 8).map((a) => ({ ...a, name: normalizeAssetName(a) }));
      for (const asset of assets) {
        if (typeof asset.size === 'number' && asset.size > limits.maxUploadBytes) {
          notify({ level: 'error', code: 'upload_too_large', detail: 'image' });
          return;
        }
      }
      const temp = createTemp('', undefined, undefined, {
        kind: 'image',
        gallery: assets.map((a) => ({ url: a.uri, width: a.width, height: a.height })),
      });
      if (!temp) return;
      await uploadGalleryAndDeliver(temp.tempId, assets, temp.replyToId);
    },
    [attach, createTemp, limits, notify, uploadGalleryAndDeliver],
  );


  // Tap-to-retry on a failed bubble. The queue entry is the
  // authoritative payload; a bubble whose entry is gone was
  // already retried and is skipped
  const retryMessage = useCallback(
    (message: RetryTarget) => {
      if (message.status !== 'failed') return;
      const payload = failedQueueRef.current.get(message.id);
      if (!payload) return;
      clearAutoRetry(message.id);
      if (!messagesRef.current.some((m) => m.id === message.id)) {
        failedQueueRef.current.delete(message.id);
        persistQueue();
        return;
      }
      if (payload.assets && !payload.extra?.gallery) {
        void uploadGalleryAndDeliver(message.id, payload.assets, payload.replyToId);
        return;
      }
      if (payload.asset && !payload.imageUrl && !payload.extra?.attachment) {
        void uploadAndDeliver(message.id, payload.asset, payload.replyToId);
        return;
      }
      void deliver(message.id, payload.text, payload.imageUrl, payload.replyToId, payload.extra);
    },
    [clearAutoRetry, deliver, persistQueue, uploadAndDeliver, uploadGalleryAndDeliver],
  );


  // Connectivity returned — re-drive every queued failure from
  // the ref snapshot. Entries still waiting for their rehydrated
  // bubble are skipped, not dropped
  const sweep = useCallback(() => {
    const present = new Set(messagesRef.current.map((m) => m.id));
    let changed = false;
    for (const [tempId, payload] of Array.from(failedQueueRef.current.entries())) {
      if (!present.has(tempId)) {
        if (rehydratedPendingRef.current.has(tempId)) continue;
        failedQueueRef.current.delete(tempId);
        changed = true;
        continue;
      }
      if (payload.assets && !payload.extra?.gallery) void uploadGalleryAndDeliver(tempId, payload.assets, payload.replyToId);
      else if (payload.asset && !payload.imageUrl && !payload.extra?.attachment) void uploadAndDeliver(tempId, payload.asset, payload.replyToId);
      else void deliver(tempId, payload.text, payload.imageUrl, payload.replyToId, payload.extra);
    }
    if (changed) persistQueue();
  }, [deliver, persistQueue, uploadAndDeliver, uploadGalleryAndDeliver]);
  const sweepRef = useRef(sweep);
  useEffect(() => {
    sweepRef.current = sweep;
  });
  useEffect(() => onNetworkRestore(() => sweepRef.current()), [onNetworkRestore]);


  const setReplyTo = useCallback(
    (message: ReplyTarget | null) => {
      replyToRef.current = message;
      setReplyToState(message);
      persistReply(message);
    },
    [persistReply],
  );


  // Prune queue entries whose temp no longer exists — except
  // rehydrated ones still waiting for their bubble
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


  const discardMessage = useCallback(
    (messageId: string) => {
      if (!isTempId(messageId)) return;
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
    canSend: !!currentUser,
    uploadingMedia,
    uploadingFile,
    sendMessage,
    sendQuickLike,
    attach,
    attachMany,
    retryMessage,
    discardMessage,
    replyTo,
    setReplyTo,
    editing,
    startEdit,
    cancelEdit,
  };
}
