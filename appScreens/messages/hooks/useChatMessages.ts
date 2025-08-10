// Source of truth for chat messages and participants. Responsible for
// seeding local store when empty and clearing unread on entry.
import { useEffect, useState } from 'react';
import type { ChatUIMessage } from '../components/types';
import { mapChatMessageToUI } from '../lib/mappers';
import { clearUnread, getConversationsWithSeed } from '../lib/storage';

export function useChatMessages(conversationId: string) {
  const [messages, setMessages] = useState<ChatUIMessage[]>([]);
  const [participants, setParticipants] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const list = await getConversationsWithSeed();
        const conv = list.find((c) => c.id === conversationId);
        if (conv) {
          setMessages((conv.messages || []).map(mapChatMessageToUI));
          const map: Record<string, string> = {};
          conv.participants.forEach((p) => (map[p.id] = p.displayName));
          map['self'] = 'Tu';
          setParticipants(map);
        }
        await clearUnread(conversationId);
      } catch {}
    })();
  }, [conversationId]);

  return { messages, setMessages, participants } as const;
}


