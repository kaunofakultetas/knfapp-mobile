// Loads messages from the backend API and builds participant map.
// Listens for real-time messages via Socket.IO.
import { useEffect, useRef, useState } from 'react';
import type { ChatUIMessage } from '../components/types';
import { fetchMessages, markConversationRead } from '@/services/api';
import type { ApiMessage } from '@/services/api';
import {
  connectSocket,
  onNewMessage,
  onReactionUpdate,
  type SocketMessage,
  type ReactionUpdate,
} from '@/services/socket';
import AsyncStorage from '@react-native-async-storage/async-storage';

function apiMessageToUI(m: ApiMessage): ChatUIMessage {
  return {
    id: m.id,
    text: m.text,
    time: m.time,
    user: m.senderName,
    isOwn: m.isOwn,
    status: 'read',
    imageUrl: m.imageUrl || undefined,
    reactions: m.reactions.map((r) => ({
      emoji: r.emoji,
      count: r.count,
      bySelf: r.bySelf,
      byUserIds: r.byUserIds,
    })),
  };
}

export function useChatMessages(conversationId: string) {
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);
  const [participants, setParticipants] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);
  const userIdLoadedRef = useRef(false);

  // Load current user ID for isOwn detection on socket messages
  useEffect(() => {
    AsyncStorage.getItem('auth').then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          currentUserIdRef.current = parsed.user?.id ?? null;
        } catch { /* ignore */ }
      }
      userIdLoadedRef.current = true;
    });
  }, []);

  // Fetch initial messages
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const resp = await fetchMessages(conversationId);
        if (cancelled) return;

        const uiMessages = resp.messages.map(apiMessageToUI);
        setMessages(uiMessages);

        // Build participant map from message senders
        const map: Record<string, string> = {};
        for (const m of resp.messages) {
          map[m.senderId] = m.senderName;
        }
        setParticipants(map);

        // Mark as read
        markConversationRead(conversationId).catch(() => {});
      } catch {
        // API unavailable — leave messages empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId]);

  // Listen for real-time messages and reaction updates via Socket.IO
  useEffect(() => {
    let unsubMessage: (() => void) | undefined;
    let unsubReaction: (() => void) | undefined;

    (async () => {
      const sock = await connectSocket();
      if (!sock) return;

      unsubMessage = onNewMessage((data: SocketMessage) => {
        // Only process messages for this conversation
        if (data.conversationId !== conversationId) return;

        const myId = currentUserIdRef.current;
        const isOwn = data.senderId === myId;

        // Skip if this is our own message (already added optimistically by composer)
        if (isOwn) return;

        const uiMsg: ChatUIMessage = {
          id: data.id,
          text: data.text,
          time: data.time,
          user: data.senderName,
          isOwn: false,
          status: 'read',
          imageUrl: data.imageUrl || undefined,
          reactions: data.reactions.map((r) => ({
            emoji: r.emoji,
            count: r.count,
            bySelf: r.byUserIds.includes(myId ?? ''),
            byUserIds: r.byUserIds,
          })),
        };

        setMessages((prev) => {
          // Deduplicate — avoid adding if already present
          if (prev.some((m) => m.id === data.id)) return prev;
          return [...prev, uiMsg];
        });

        // Update participant map
        setParticipants((prev) => ({
          ...prev,
          [data.senderId]: data.senderName,
        }));

        // Mark as read
        markConversationRead(conversationId).catch(() => {});
      });

      unsubReaction = onReactionUpdate((data: ReactionUpdate) => {
        if (data.conversationId !== conversationId) return;

        const myId = currentUserIdRef.current;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== data.messageId) return m;
            return {
              ...m,
              reactions: data.reactions.map((r) => ({
                emoji: r.emoji,
                count: r.count,
                bySelf: r.byUserIds.includes(myId ?? ''),
                byUserIds: r.byUserIds,
              })),
            };
          }),
        );
      });
    })();

    return () => {
      unsubMessage?.();
      unsubReaction?.();
    };
  }, [conversationId]);

  return { messages, setMessages, participants, loading } as const;
}
