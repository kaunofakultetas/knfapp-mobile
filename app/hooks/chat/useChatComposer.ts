// -----------------------------------------------------------
//  [*] useChatComposer — optimistic sends, retry, typing
//
//  Everything between the InputBar and the server: optimistic
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
//  never Date.now(), which collides within a millisecond.
//
//  The failed-send queue is a ref map (tempId → payload), and
//  the restore sweep iterates THAT — state updaters stay pure,
//  because React may run them twice.
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
//    UseChatComposerResult — the hook's return shape
//    useChatComposer       — the hook itself
// -----------------------------------------------------------

// Send + upload endpoints
import { sendMessageApi, uploadImageApi } from '@/services/api';

// Typing emits ride the shared socket
import { emitStopTyping, emitTyping } from '@/services/socket';

// Self identity for the optimistic bubble
import { useAuth } from '@/context/AuthContext';

// Failure toasts and the connectivity-restore sweep
import { showToast } from '@/context/NetworkContext';
import { useNetworkRestore } from '@/hooks/useNetworkRestore';
import { useTranslation } from 'react-i18next';

// Message shape and the optimistic-id marker
import { TEMP_ID_PREFIX } from '@/hooks/chat/useChatMessages';
import type { ChatMessage } from '@/types';

// Image picking and lifecycle plumbing
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';


// Heartbeat/expiry pair — re-emit period must stay under the
// 5 s receiver expiry in useTypingIndicator
const TYPING_REEMIT_MS = 2000;

// Keystroke silence after which stop_typing is sent
const TYPING_IDLE_MS = 3000;







// -----------------------------------------------------------
// UseChatComposerResult
// -----------------------------------------------------------
//
// Used by:
//   - useChatComposer (below)
//   - app/(main)/chat-room/index.tsx — InputBar wiring
// -----------------------------------------------------------

export interface UseChatComposerResult {
  text: string;
  onChangeText: (next: string) => void;
  uploadingImage: boolean;
  sendMessage: () => void;
  sendQuickLike: () => void;
  attachImage: () => Promise<void>;
  retryMessage: (message: ChatMessage) => void;
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
//     composer.attachImage         — pick → upload → send;
//                                    uploadingImage covers the
//                                    upload window
//     composer.retryMessage(m)     — re-drive a failed bubble
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export function useChatComposer(
  conversationId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
): UseChatComposerResult {
  const { t } = useTranslation();
  const { user } = useAuth();


  const [text, setText] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);


  // Draft mirror read synchronously by sendMessage — the state
  // value may be a render behind on rapid double-taps
  const textRef = useRef('');


  // Monotonic temp-id source; Date.now() alone collides when
  // two quick-like taps land in the same millisecond
  const tempSeqRef = useRef(0);


  // tempId → payload for every failed send; the restore sweep
  // and tap-to-retry both re-drive from here
  const failedQueueRef = useRef(new Map<string, { text: string; imageUrl?: string }>());


  // Temp ids currently on the wire — guards a retry tap racing
  // the automatic restore sweep onto a duplicate request
  const inFlightRef = useRef(new Set<string>());


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
  // emits immediately, then at most every TYPING_REEMIT_MS
  const onChangeText = useCallback(
    (next: string) => {
      textRef.current = next;
      setText(next);

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
    [conversationId, stopTyping],
  );


  // One delivery path for fresh sends, retries and the restore
  // sweep: flip the temp to 'sending', post, then swap in the
  // server message — or mark 'failed' and queue for retry. If
  // the socket echo already replaced the temp, the map finds
  // nothing and the swap is a clean no-op.
  const deliver = useCallback(
    async (tempId: string, body: string, imageUrl?: string) => {
      if (inFlightRef.current.has(tempId)) return;
      inFlightRef.current.add(tempId);

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sending' } : m)),
      );

      try {
        const resp = await sendMessageApi(conversationId, body, imageUrl);
        failedQueueRef.current.delete(tempId);

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
        };
        setMessages((prev) => {
          // Socket echo may have delivered the server row first
          if (prev.some((m) => m.id === sent.id)) {
            return prev.filter((m) => m.id !== tempId);
          }
          return prev.map((m) => (m.id === tempId ? sent : m));
        });
      } catch {
        failedQueueRef.current.set(tempId, { text: body, imageUrl });
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)),
        );
        showToast('error', t('chat.sendError'));
      } finally {
        inFlightRef.current.delete(tempId);
      }
    },
    [conversationId, setMessages, t],
  );


  // Append the optimistic bubble (newest-first list → unshift)
  // and start delivery
  const startSend = useCallback(
    (body: string, imageUrl?: string) => {
      if (!user) return;

      tempSeqRef.current += 1;
      const tempId = `${TEMP_ID_PREFIX}${tempSeqRef.current}-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        conversationId,
        senderId: user.id,
        senderName: user.displayName,
        senderAvatar: user.avatarUrl,
        text: body,
        imageUrl,
        createdAt: new Date().toISOString(),
        isOwn: true,
        status: 'sending',
        reactions: [],
      };
      setMessages((prev) => [optimistic, ...prev]);

      void deliver(tempId, body, imageUrl);
    },
    [conversationId, deliver, setMessages, user],
  );


  // Send the draft. The ref is cleared before any async work,
  // so a double-tap's second read sees an empty draft
  const sendMessage = useCallback(() => {
    const body = textRef.current.trim();
    if (!body) return;

    textRef.current = '';
    setText('');
    stopTyping();
    startSend(body);
  }, [startSend, stopTyping]);


  // The thumbs-up button: a quick 👍 on an empty draft,
  // otherwise it behaves exactly like send
  const sendQuickLike = useCallback(() => {
    if (textRef.current.trim()) {
      sendMessage();
      return;
    }
    startSend('👍');
  }, [sendMessage, startSend]);


  // Pick → upload → send. uploadingImage drives the InputBar's
  // spinner and blocks a second pick while the first uploads
  const attachImage = useCallback(async () => {
    if (uploadingImage) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const upload = await uploadImageApi(
        asset.uri,
        asset.fileName || undefined,
        asset.mimeType || undefined,
      );
      // The RELATIVE url is what the message carries — bubbles
      // resolve it with getUploadUrl at render time
      startSend('', upload.url);
    } catch {
      showToast('error', t('chat.imageUploadError'));
    } finally {
      setUploadingImage(false);
    }
  }, [startSend, t, uploadingImage]);


  // Tap-to-retry on a failed bubble. The queue entry is the
  // authoritative payload; a bubble whose entry is gone was
  // already retried (stale press) and is skipped
  const retryMessage = useCallback(
    (message: ChatMessage) => {
      if (message.status !== 'failed') return;
      const payload = failedQueueRef.current.get(message.id);
      if (!payload) return;

      void deliver(message.id, payload.text, payload.imageUrl);
    },
    [deliver],
  );


  // Connectivity returned — re-drive every queued failure from
  // the ref snapshot (never from inside a state updater)
  useNetworkRestore(() => {
    for (const [tempId, payload] of Array.from(failedQueueRef.current.entries())) {
      void deliver(tempId, payload.text, payload.imageUrl);
    }
  });


  return {
    text,
    onChangeText,
    uploadingImage,
    sendMessage,
    sendQuickLike,
    attachImage,
    retryMessage,
  };
}
