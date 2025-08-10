// Encapsulates composer state and send flows (text, 👍, image). Persists changes
// via storage helpers and leaves scroll behavior to the list component.
import { useState } from 'react';
import type { ChatUIMessage } from '../components/types';
import { updateConversation } from '../lib/storage';

export function useChatComposer(conversationId: string, setMessages: React.Dispatch<React.SetStateAction<ChatUIMessage[]>>) {
  const [newMessage, setNewMessage] = useState('');
  const [emojiBarOpen, setEmojiBarOpen] = useState(false);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const ui: ChatUIMessage = {
      id: Date.now().toString(),
      text: newMessage.trim(),
      time: new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
      user: 'Tu',
      isOwn: true,
      status: 'sent',
    };
    setMessages((prev) => [...prev, ui]);
    setNewMessage('');
    setTimeout(() => {
      setMessages((prev) => prev.map((m) => (m.id === ui.id ? { ...m, status: 'read' } : m)));
    }, 1200);
    await updateConversation(conversationId, (c) => ({
      ...c,
      messages: [
        ...c.messages,
        {
          id: ui.id,
          conversationId: c.id,
          senderId: 'self',
          senderName: 'Tu',
          text: ui.text,
          time: ui.time,
          status: 'sent',
        },
      ],
      lastUpdatedMs: Date.now(),
    }));
  };

  const sendThumbsUp = async () => {
    if (newMessage.trim()) return sendMessage();
    const ui: ChatUIMessage = {
      id: Date.now().toString(),
      text: '👍',
      time: new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
      user: 'Tu',
      isOwn: true,
      status: 'sent',
    };
    setMessages((prev) => [...prev, ui]);
    await updateConversation(conversationId, (c) => ({
      ...c,
      messages: [
        ...c.messages,
        {
          id: ui.id,
          conversationId: c.id,
          senderId: 'self',
          senderName: 'Tu',
          text: ui.text,
          time: ui.time,
          status: 'sent',
        },
      ],
      lastUpdatedMs: Date.now(),
    }));
  };

  const attachImage = async () => {
    const id = Date.now().toString();
    const time = new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
    const imgUrl = `https://picsum.photos/seed/${id}/600/400`;
    const ui: ChatUIMessage = {
      id,
      text: '',
      time,
      user: 'Tu',
      isOwn: true,
      status: 'sent',
      imageUrl: imgUrl,
      reactions: [],
    };
    setMessages((prev) => [...prev, ui]);
    await updateConversation(conversationId, (c) => ({
      ...c,
      messages: [
        ...c.messages,
        {
          id,
          conversationId: c.id,
          senderId: 'self',
          senderName: 'Tu',
          text: '',
          time,
          status: 'sent',
          imageUrl: imgUrl,
          reactions: [],
        },
      ],
      lastUpdatedMs: Date.now(),
    }));
  };

  return {
    newMessage,
    setNewMessage,
    emojiBarOpen,
    setEmojiBarOpen,
    sendMessage,
    sendThumbsUp,
    attachImage,
  } as const;
}


