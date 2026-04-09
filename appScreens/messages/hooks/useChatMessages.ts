// Loads messages from the backend API and builds participant map.
// Falls back gracefully if the API is unavailable.
import { useEffect, useState } from 'react';
import type { ChatUIMessage } from '../components/types';
import { fetchMessages, markConversationRead } from '@/services/api';
import type { ApiMessage } from '@/services/api';

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

  return { messages, setMessages, participants, loading } as const;
}
