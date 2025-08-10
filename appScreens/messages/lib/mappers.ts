// Mapping boundary from persisted shapes to UI-friendly shapes. Keeps UI components
// decoupled from persistence concerns and eases future backend migration.
import type { ChatMessage } from '@/types';
import type { ChatUIMessage } from '../components/types';

export function mapChatMessageToUI(m: ChatMessage): ChatUIMessage {
  return {
    id: m.id,
    text: m.text,
    time: m.time,
    user: m.senderName,
    isOwn: m.senderId === 'self',
    status: m.status,
    liked: m.liked,
    imageUrl: m.imageUrl,
    reactions: (m.reactions || []).map((r) => ({
      emoji: r.emoji,
      count: typeof r.count === 'number' ? r.count : (r.byUserIds?.length ?? 1),
      bySelf: r.bySelf,
      byUserIds: r.byUserIds,
    })),
  };
}


