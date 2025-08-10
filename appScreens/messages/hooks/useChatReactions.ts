import type { ChatMessage } from '@/types';
// Reaction UI state + persistence. Enforces single-emoji-per-user and
// computes counts deterministically on every update.
import { useState } from 'react';
import type { ChatUIMessage } from '../components/types';
import { updateConversation } from '../lib/storage';

export function useChatReactions(
  conversationId: string,
  messages: ChatUIMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatUIMessage[]>>,
  participants: Record<string, string>
) {
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [reactionViewerOpen, setReactionViewerOpen] = useState(false);
  const [reactionViewerRows, setReactionViewerRows] = useState<Array<{ emoji: string; names: string[] }>>([]);
  const reactionOptions = ['👍', '❤️', '😂', '😮', '😢', '😡'];

  const openReactionPicker = (messageId: string) => {
    setReactionTargetId(messageId);
    setReactionPickerOpen(true);
  };

  const openReactionsViewer = (item: ChatUIMessage) => {
    const rows: Array<{ emoji: string; names: string[] }> = [];
    (item.reactions || []).forEach((r) => {
      const namesArr = (r.byUserIds || []).map((uid: string) => participants[uid] || uid);
      if (namesArr.length) rows.push({ emoji: r.emoji, names: namesArr });
    });
    setReactionViewerRows(rows);
    setReactionViewerOpen(true);
  };

  const applyReaction = async (emoji: string) => {
    const mid = reactionTargetId;
    if (!mid) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== mid) return m;
        const prevReactions = m.reactions || [];
        const hadSame = prevReactions.some((r) => r.emoji === emoji && (r.byUserIds || []).includes('self'));
        if (hadSame) return m;
        let reactions = prevReactions
          .map((r) => ({ ...r, byUserIds: (r.byUserIds || []).filter((uid) => uid !== 'self') }))
          .filter((r) => (r.byUserIds?.length || 0) > 0);
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const byUserIds = Array.from(new Set([...(reactions[idx].byUserIds || []), 'self']));
          reactions[idx] = { ...reactions[idx], byUserIds, count: byUserIds.length, bySelf: true } as any;
        } else {
          reactions.push({ emoji, byUserIds: ['self'], count: 1, bySelf: true } as any);
        }
        reactions = reactions.map((r) => ({
          ...r,
          count: r.byUserIds?.length || 0,
          bySelf: (r.byUserIds || []).includes('self'),
        }));
        return { ...m, reactions };
      })
    );
    await updateConversation(conversationId, (c) => ({
      ...c,
      messages: c.messages.map((mm) => {
        if (mm.id !== mid) return mm;
        const prevReactions = mm.reactions || [];
        const hadSame = prevReactions.some((r) => r.emoji === emoji && (r.byUserIds || []).includes('self'));
        if (hadSame) return mm;
        let reactions = prevReactions
          .map((r) => ({ ...r, byUserIds: (r.byUserIds || []).filter((uid) => uid !== 'self') }))
          .filter((r) => (r.byUserIds?.length || 0) > 0);
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const byUserIds = Array.from(new Set([...(reactions[idx].byUserIds || []), 'self']));
          reactions[idx] = { ...reactions[idx], byUserIds, count: byUserIds.length, bySelf: true } as any;
        } else {
          reactions.push({ emoji, byUserIds: ['self'], count: 1, bySelf: true } as any);
        }
        reactions = reactions.map((r) => ({
          ...r,
          count: r.byUserIds?.length || 0,
          bySelf: (r.byUserIds || []).includes('self'),
        }));
        return { ...mm, reactions } as ChatMessage;
      }),
    }));
    setReactionPickerOpen(false);
    setReactionTargetId(null);
  };

  const clearReaction = async () => {
    const mid = reactionTargetId;
    if (!mid) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== mid) return m;
        const reactions = (m.reactions || [])
          .map((r) => ({ ...r, byUserIds: (r.byUserIds || []).filter((uid) => uid !== 'self') }))
          .filter((r) => (r.byUserIds?.length || 0) > 0)
          .map((r) => ({ ...r, count: r.byUserIds?.length || 0, bySelf: false }));
        return { ...m, reactions };
      })
    );
    await updateConversation(conversationId, (c) => ({
      ...c,
      messages: c.messages.map((mm) => {
        if (mm.id !== mid) return mm;
        const reactions = (mm.reactions || [])
          .map((r) => ({ ...r, byUserIds: (r.byUserIds || []).filter((uid) => uid !== 'self') }))
          .filter((r) => (r.byUserIds?.length || 0) > 0)
          .map((r) => ({ ...r, count: r.byUserIds?.length || 0, bySelf: false })) as any;
        return { ...mm, reactions } as ChatMessage;
      }),
    }));
    setReactionPickerOpen(false);
    setReactionTargetId(null);
  };

  return {
    reactionOptions,
    reactionPickerOpen,
    reactionTargetId,
    reactionViewerOpen,
    reactionViewerRows,
    setReactionPickerOpen,
    setReactionViewerOpen,
    openReactionPicker,
    openReactionsViewer,
    applyReaction,
    clearReaction,
  } as const;
}


