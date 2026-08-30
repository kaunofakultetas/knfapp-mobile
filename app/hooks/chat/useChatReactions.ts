// -----------------------------------------------------------
//  [*] useChatReactions — picker state + optimistic toggles
//
//  Owns the long-press reaction picker (which message it aims
//  at, whether it is open) and the apply/clear actions. Both
//  actions are optimistic and reconcile in two steps: on
//  success the REST response's authoritative `reactions`
//  array lands on the target (bySelf recomputed for this
//  viewer) — gated by a per-message epoch, so a delayed
//  response never clobbers a newer reaction_update or a
//  later local pick that landed while it was in flight; on
//  failure only the acting user's own membership change is
//  undone — computed against the CURRENT list, so
//  reaction_update socket events that arrived while the call
//  was in flight survive the revert. The socket event
//  (handled in useChatMessages) stays the cross-client path.
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
//    withSelfReaction       — one user's membership rewrite
//    UseChatReactionsResult — the hook's return shape
//    useChatReactions       — the hook itself
// -----------------------------------------------------------

// Reaction REST endpoints — they resolve to the authoritative
// reactions array (the socket event mirrors it to other clients)
import { reactToMessageApi, removeReactionApi, type ApiReactionGroup } from '@/services/api';

// Socket reaction events bump the per-message epoch that keeps
// a delayed REST response from rolling back newer state
import { onReactionUpdate } from '@/services/socket';

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
// withSelfReaction
// -----------------------------------------------------------
//
// Rewrites ONE user's membership across an emoji-group array:
// strips them from every group, re-adds them to `emoji` (null
// = none) and recomputes count/bySelf. Serves both the
// optimistic pass (the new pick) and the failure revert — the
// inverse of an optimistic apply is this same rewrite with
// the user's previous emoji.
//
// Used by:
//   - useChatReactions (below)
// -----------------------------------------------------------

function withSelfReaction(
  reactions: ChatReaction[],
  userId: string,
  emoji: string | null,
): ChatReaction[] {
  const stripped = reactions
    .map((r) => ({ ...r, byUserIds: r.byUserIds.filter((uid) => uid !== userId) }))
    .filter((r) => r.byUserIds.length > 0);

  if (emoji) {
    const idx = stripped.findIndex((r) => r.emoji === emoji);
    if (idx >= 0) stripped[idx] = { ...stripped[idx], byUserIds: [...stripped[idx].byUserIds, userId] };
    else stripped.push({ emoji, byUserIds: [userId], count: 1, bySelf: true });
  }

  return stripped.map((r) => ({
    ...r,
    count: r.byUserIds.length,
    bySelf: r.byUserIds.includes(userId),
  }));
}







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


  // Capture source for the pre-tap self emoji (what a failure
  // revert restores) — a ref mirror avoids reading a stale
  // closure inside the async handlers
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);


  // Ordering guard for the REST reconcile: reaction state has
  // two writers — the socket's reaction_update events (commit
  // order, applied in useChatMessages) and the REST responses
  // below, which are NOT ordered against them: a delayed
  // response can resolve after a newer event already rendered.
  // Every local dispatch and every socket event for a message
  // bumps its epoch; applyServer lands only while the epoch
  // still matches its dispatch-time capture. A room switch
  // clears the map, so a cross-room straggler can never apply
  const reactionEpochRef = useRef(new Map<string, number>());
  useEffect(() => {
    reactionEpochRef.current.clear();
    return onReactionUpdate((event) => {
      if (event.conversationId !== conversationId) return;
      const epochs = reactionEpochRef.current;
      epochs.set(event.messageId, (epochs.get(event.messageId) ?? 0) + 1);
    });
  }, [conversationId]);

  const bumpEpoch = useCallback((messageId: string) => {
    const next = (reactionEpochRef.current.get(messageId) ?? 0) + 1;
    reactionEpochRef.current.set(messageId, next);
    return next;
  }, []);


  const openPicker = useCallback((messageId: string) => {
    setPickerTargetId(messageId);
    setPickerOpen(true);
  }, []);


  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerTargetId(null);
  }, []);


  // Undo the acting user's optimistic change against the LIVE
  // list — never a stale snapshot, so reaction_update events
  // that landed in flight keep everything they brought
  const revertSelf = useCallback(
    (messageId: string, userId: string, priorEmoji: string | null) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions: withSelfReaction(m.reactions, userId, priorEmoji) } : m,
        ),
      );
    },
    [setMessages],
  );


  // The REST response's authoritative array replaces the guess
  // on success (bySelf recomputed for this viewer); the socket
  // event covers the other clients. A moved epoch means newer
  // state (a socket event, a later local pick) already landed
  // while this call was in flight — the stale body is dropped
  const applyServer = useCallback(
    (messageId: string, userId: string, reactions: ApiReactionGroup[], epoch: number) => {
      if ((reactionEpochRef.current.get(messageId) ?? 0) !== epoch) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                reactions: reactions.map((r) => ({
                  ...r,
                  count: r.byUserIds.length,
                  bySelf: r.byUserIds.includes(userId),
                })),
              }
            : m,
        ),
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

      const target = messagesRef.current.find((m) => m.id === messageId);
      // The target can vanish between long-press and pick (a
      // resync fresh-head rebuild) — say so instead of closing
      // the picker and doing nothing
      if (!target) {
        showToast('error', t('chat.reactionTargetGone'));
        return;
      }
      // The emoji this user had before the tap (null = none) —
      // what a failed call re-applies
      const priorEmoji = target.reactions.find((r) => r.byUserIds.includes(user.id))?.emoji ?? null;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions: withSelfReaction(m.reactions, user.id, emoji) } : m,
        ),
      );

      const epoch = bumpEpoch(messageId);
      reactToMessageApi(conversationId, messageId, emoji)
        .then((reactions) => applyServer(messageId, user.id, reactions, epoch))
        .catch(() => {
          revertSelf(messageId, user.id, priorEmoji);
          showToast('error', t('chat.reactionAddError'));
        });
    },
    [applyServer, bumpEpoch, closePicker, conversationId, pickerTargetId, revertSelf, setMessages, t, user],
  );


  // Remove own reaction from the target message
  const clearReaction = useCallback(() => {
    const messageId = pickerTargetId;
    closePicker();
    if (!messageId || !user) return;

    const target = messagesRef.current.find((m) => m.id === messageId);
    // Same silent-abort hole as applyReaction — surface it
    if (!target) {
      showToast('error', t('chat.reactionTargetGone'));
      return;
    }
    const priorEmoji = target.reactions.find((r) => r.byUserIds.includes(user.id))?.emoji ?? null;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, reactions: withSelfReaction(m.reactions, user.id, null) } : m,
      ),
    );

    const epoch = bumpEpoch(messageId);
    removeReactionApi(conversationId, messageId)
      .then((reactions) => applyServer(messageId, user.id, reactions, epoch))
      .catch(() => {
        revertSelf(messageId, user.id, priorEmoji);
        showToast('error', t('chat.reactionRemoveError'));
      });
  }, [applyServer, bumpEpoch, closePicker, conversationId, pickerTargetId, revertSelf, setMessages, t, user]);


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
