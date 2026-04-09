// Sends messages via the backend API with optimistic UI updates.
// Emits typing indicators via Socket.IO.
import { useCallback, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { ChatUIMessage } from '../components/types';
import { sendMessageApi, uploadImageApi, getUploadUrl } from '@/services/api';
import { emitTyping, emitStopTyping } from '@/services/socket';

export function useChatComposer(
  conversationId: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatUIMessage[]>>,
) {
  const [newMessage, setNewMessage] = useState('');
  const [emojiBarOpen, setEmojiBarOpen] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const handleTextChange = useCallback((text: string) => {
    setNewMessage(text);

    // Emit typing indicator with debounce
    if (text.length > 0 && !isTypingRef.current) {
      isTypingRef.current = true;
      emitTyping(conversationId);
    }

    // Reset stop-typing timer
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        emitStopTyping(conversationId);
      }
    }, 2000);
  }, [conversationId]);

  const sendText = async (text: string, imageUrl?: string) => {
    // Stop typing indicator when sending
    if (isTypingRef.current) {
      isTypingRef.current = false;
      emitStopTyping(conversationId);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const tempId = `temp-${Date.now()}`;
    const time = new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });

    // Optimistic UI update
    const optimistic: ChatUIMessage = {
      id: tempId,
      text,
      time,
      user: 'Tu',
      isOwn: true,
      status: 'sent',
      imageUrl,
      reactions: [],
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const resp = await sendMessageApi(conversationId, text, imageUrl);
      // Replace temp message with real one
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                id: resp.message.id,
                text: resp.message.text,
                time: resp.message.time,
                user: resp.message.senderName,
                isOwn: true,
                status: 'read',
                imageUrl: resp.message.imageUrl || undefined,
                reactions: [],
              }
            : m,
        ),
      );
    } catch {
      // Mark as failed but keep in UI
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'sent' } : m)),
      );
    }
  };

  const sendMessage = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setNewMessage('');
    await sendText(text);
  };

  const sendThumbsUp = async () => {
    if (newMessage.trim()) return sendMessage();
    await sendText('👍');
  };

  const attachImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    try {
      const upload = await uploadImageApi(
        asset.uri,
        asset.fileName || undefined,
        asset.mimeType || undefined,
      );
      await sendText('', getUploadUrl(upload.url));
    } catch {
      // Upload failed — show optimistic error or silently fail
    }
  };

  return {
    newMessage,
    setNewMessage: handleTextChange,
    emojiBarOpen,
    setEmojiBarOpen,
    sendMessage,
    sendThumbsUp,
    attachImage,
  } as const;
}
