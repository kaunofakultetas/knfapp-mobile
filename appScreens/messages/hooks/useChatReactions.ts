// Reaction UI state with optimistic updates and API persistence.
import { useEffect, useRef, useState } from 'react';
import type { ChatUIMessage } from '../components/types';
import { reactToMessageApi, removeReactionApi } from '@/services/api';
import { showToast } from '@/context/NetworkContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useChatReactions(
  conversationId: string,
  messages: ChatUIMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatUIMessage[]>>,
  participants: Record<string, string>,
) {
  const myUserIdRef = useRef<string>('self');
  useEffect(() => {
    AsyncStorage.getItem('auth').then((raw) => {
      if (raw) {
        try {
          myUserIdRef.current = JSON.parse(raw).user?.id ?? 'self';
        } catch { /* ignore */ }
      }
    });
  }, []);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [reactionViewerOpen, setReactionViewerOpen] = useState(false);
  const [reactionViewerRows, setReactionViewerRows] = useState<
    Array<{ emoji: string; names: string[] }>
  >([]);
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

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== mid) return m;
        const prevReactions = m.reactions || [];
        // Remove user from all reactions first
        let reactions = prevReactions
          .map((r) => ({
            ...r,
            byUserIds: (r.byUserIds || []).filter((uid) => uid !== myUserIdRef.current),
          }))
          .filter((r) => (r.byUserIds?.length || 0) > 0);
        // Add to selected emoji
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const byUserIds = [...(reactions[idx].byUserIds || []), 'self'];
          reactions[idx] = { ...reactions[idx], byUserIds, count: byUserIds.length, bySelf: true };
        } else {
          reactions.push({ emoji, byUserIds: [myUserIdRef.current], count: 1, bySelf: true });
        }
        return { ...m, reactions };
      }),
    );

    setReactionPickerOpen(false);
    setReactionTargetId(null);

    // Persist to API
    reactToMessageApi(conversationId, mid, emoji).catch(() => {
      showToast('error', 'Nepavyko pridėti reakcijos');
    });
  };

  const clearReaction = async () => {
    const mid = reactionTargetId;
    if (!mid) return;

    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== mid) return m;
        const reactions = (m.reactions || [])
          .map((r) => ({
            ...r,
            byUserIds: (r.byUserIds || []).filter((uid) => uid !== myUserIdRef.current),
          }))
          .filter((r) => (r.byUserIds?.length || 0) > 0)
          .map((r) => ({ ...r, count: r.byUserIds?.length || 0, bySelf: false }));
        return { ...m, reactions };
      }),
    );

    setReactionPickerOpen(false);
    setReactionTargetId(null);

    // Persist to API
    removeReactionApi(conversationId, mid).catch(() => {
      showToast('error', 'Nepavyko pašalinti reakcijos');
    });
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
