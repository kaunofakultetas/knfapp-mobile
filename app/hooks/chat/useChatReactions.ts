// -----------------------------------------------------------
//  [*] useChatReactions — picker state + optimistic toggles
//
//  Owns the long-press reaction picker (which message it aims
//  at, whether it is open) and the apply/clear actions. Both
//  actions are optimistic with an EXACT revert: the target's
//  reactions array is captured before the local rewrite and
//  restored verbatim if the API call fails, with a toast.
//
//  The REST react endpoints return no reactions payload — the
//  authoritative state arrives on the reaction_update socket
//  event (handled in useChatMessages), which reconciles the
//  optimistic guess either way.
//
//  Identity is consistent everywhere: the real user id from
//  useAuth goes into byUserIds and `bySelf` drives all self
//  highlighting — the legacy literal 'self' id (which leaked
//  into the reactors sheet as a name and broke the picker's
//  selected ring) is gone.
//
//  Split into:
//
//    REACTION_OPTIONS       — the fixed picker emoji set
//    UseChatReactionsResult — the hook's return shape
//    useChatReactions       — the hook itself
// -----------------------------------------------------------

// Reaction REST endpoints (socket reconciles afterwards)
import { reactToMessageApi, removeReactionApi } from '@/services/api';

// Self identity for byUserIds/bySelf bookkeeping
import { useAuth } from '@/context/AuthContext';

// Failure toasts
import { showToast } from '@/context/NetworkContext';
import { useTranslation } from 'react-i18next';

// Message + reaction shapes
import type { ChatMessage, ChatReaction } from '@/types';

// State plumbing
import { useCallback, useEffect, useRef, useState } from 'react';







// -----------------------------------------------------------
// REACTION_OPTIONS
// -----------------------------------------------------------
//
// Used by:
//   - useChatReactions (below) — exposed to the picker
// -----------------------------------------------------------

export const REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];







// -----------------------------------------------------------
// UseChatReactionsResult
// -----------------------------------------------------------
//
// Used by:
//   - useChatReactions (below)
//   - app/(main)/chat-room/index.tsx — picker wiring
// -----------------------------------------------------------

export interface UseChatReactionsResult {
  reactionOptions: string[];
  pickerOpen: boolean;
  pickerTargetId: string | null;
  openPicker: (messageId: string) => void;
  closePicker: () => void;
  applyReaction: (emoji: string) => void;
  clearReaction: () => void;
}







// -----------------------------------------------------------
// useChatReactions
// -----------------------------------------------------------
//
//   const reactions = useChatReactions(conversationId,
//                                      messages, setMessages)
//     reactions.openPicker(messageId) — long-press entry point
//     reactions.applyReaction(emoji)  — set/replace own
//                                       reaction on the target
//     reactions.clearReaction()       — remove own reaction
//     reactions.pickerTargetId        — screens derive the
//                                       selected ring from the
//                                       target's bySelf flags
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export function useChatReactions(
  conversationId: string,
  messages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
): UseChatReactionsResult {
  const { t } = useTranslation();
  const { user } = useAuth();


  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);


  // Capture source for the exact revert — a ref mirror avoids
  // reading a stale closure inside the async catch
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);


  const openPicker = useCallback((messageId: string) => {
    setPickerTargetId(messageId);
    setPickerOpen(true);
  }, []);


  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerTargetId(null);
  }, []);


  // Restore the captured reactions on the one message the
  // failed call touched — the exact revert
  const revert = useCallback(
    (messageId: string, prior: ChatReaction[]) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: prior } : m)),
      );
    },
    [setMessages],
  );


  // Set/replace own reaction: locally the user is removed from
  // every emoji group, then added to the picked one (backend
  // semantics — one emoji per user per message)
  const applyReaction = useCallback(
    (emoji: string) => {
      const messageId = pickerTargetId;
      closePicker();
      if (!messageId || !user) return;

      const prior = messagesRef.current.find((m) => m.id === messageId)?.reactions;
      if (!prior) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;

          const stripped = m.reactions
            .map((r) => ({ ...r, byUserIds: r.byUserIds.filter((uid) => uid !== user.id) }))
            .filter((r) => r.byUserIds.length > 0);

          const idx = stripped.findIndex((r) => r.emoji === emoji);
          if (idx >= 0) {
            const byUserIds = [...stripped[idx].byUserIds, user.id];
            stripped[idx] = { emoji, byUserIds, count: byUserIds.length, bySelf: true };
          } else {
            stripped.push({ emoji, byUserIds: [user.id], count: 1, bySelf: true });
          }

          return {
            ...m,
            reactions: stripped.map((r) => ({
              ...r,
              count: r.byUserIds.length,
              bySelf: r.byUserIds.includes(user.id),
            })),
          };
        }),
      );

      reactToMessageApi(conversationId, messageId, emoji).catch(() => {
        revert(messageId, prior);
        showToast('error', t('chat.reactionAddError'));
      });
    },
    [closePicker, conversationId, pickerTargetId, revert, setMessages, t, user],
  );


  // Remove own reaction from the target message
  const clearReaction = useCallback(() => {
    const messageId = pickerTargetId;
    closePicker();
    if (!messageId || !user) return;

    const prior = messagesRef.current.find((m) => m.id === messageId)?.reactions;
    if (!prior) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;

        const stripped = m.reactions
          .map((r) => ({ ...r, byUserIds: r.byUserIds.filter((uid) => uid !== user.id) }))
          .filter((r) => r.byUserIds.length > 0)
          .map((r) => ({ ...r, count: r.byUserIds.length, bySelf: false }));

        return { ...m, reactions: stripped };
      }),
    );

    removeReactionApi(conversationId, messageId).catch(() => {
      revert(messageId, prior);
      showToast('error', t('chat.reactionRemoveError'));
    });
  }, [closePicker, conversationId, pickerTargetId, revert, setMessages, t, user]);


  return {
    reactionOptions: REACTION_OPTIONS,
    pickerOpen,
    pickerTargetId,
    openPicker,
    closePicker,
    applyReaction,
    clearReaction,
  };
}
