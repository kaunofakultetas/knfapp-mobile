// -----------------------------------------------------------
//  [*] chatengine — useReactions
//
//  The reaction picker's state (which message it aims at) and
//  the apply / clear actions. Both are optimistic and reconcile
//  in two steps: on success the transport's authoritative
//  groups land on the target (bySelf recomputed for this
//  viewer) — gated by a per-message epoch, so a delayed
//  response never clobbers a newer 'reactions' event or a later
//  local pick; on failure only the acting user's own membership
//  change is undone — computed against the CURRENT list, so
//  events that arrived in flight survive the revert.
//
//  Split into:
//
//    DEFAULT_REACTION_OPTIONS — the picker's emoji set
//    UseReactionsResult       — the hook's return shape
//    useReactions             — the hook itself
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import { isRetryable } from '../core/errors';
import { reactionsForViewer, withSelfReaction } from '../core/reducers';
import { getTaskQueue } from '../core/tasks';
import type { ChatMessage, ReactionGroup } from '../core/types';
import { useChatEngine } from '../provider';


export const DEFAULT_REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];


export interface UseReactionsResult {
  reactionOptions: string[];
  pickerOpen: boolean;
  pickerTargetId: string | null;
  openPicker: (messageId: string) => void;
  closePicker: () => void;
  // Set / replace own reaction on the picker's target
  applyReaction: (emoji: string) => void;
  // Remove own reaction from the picker's target
  clearReaction: () => void;
  // The same two actions aimed at an explicit message — for
  // accessibility actions that skip the picker
  reactTo: (messageId: string, emoji: string | null) => void;
}







// -----------------------------------------------------------
// useReactions
// -----------------------------------------------------------
//
// Used by:
//   - the host's chat room screen (directly or via useChatRoom)
// -----------------------------------------------------------

export function useReactions(
  conversationId: string,
  messages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  options: { reactionOptions?: string[] } = {},
): UseReactionsResult {
  const { transport, currentUser, notify, storage } = useChatEngine();
  const reactionOptions = options.reactionOptions ?? DEFAULT_REACTION_OPTIONS;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);


  // Ordering guard for the REST reconcile: every local dispatch
  // and every 'reactions' event for a message bumps its epoch;
  // a response lands only while the epoch still matches. A room
  // switch clears the map
  const epochRef = useRef(new Map<string, number>());
  useEffect(() => {
    epochRef.current.clear();
    return transport.realtime.subscribe((event) => {
      if (event.type !== 'reactions' || event.conversationId !== conversationId) return;
      const epochs = epochRef.current;
      epochs.set(event.messageId, (epochs.get(event.messageId) ?? 0) + 1);
    });
  }, [conversationId, transport]);

  const bumpEpoch = useCallback((messageId: string) => {
    const next = (epochRef.current.get(messageId) ?? 0) + 1;
    epochRef.current.set(messageId, next);
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


  const applyServer = useCallback(
    (messageId: string, groups: ReactionGroup[], epoch: number) => {
      if ((epochRef.current.get(messageId) ?? 0) !== epoch) return;
      const viewerId = currentUser?.id ?? null;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: reactionsForViewer(groups, viewerId) } : m)));
    },
    [currentUser, setMessages],
  );

  const reactTo = useCallback(
    (messageId: string, emoji: string | null) => {
      if (!currentUser) return;
      const userId = currentUser.id;
      const target = messagesRef.current.find((m) => m.id === messageId);
      // The target can vanish between long-press and pick (a
      // fresh-head rebuild) — say so instead of doing nothing
      if (!target) {
        notify({ level: 'error', code: 'reaction_target_gone' });
        return;
      }
      const priorEmoji = target.reactions.find((r) => r.byUserIds.includes(userId))?.emoji ?? null;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: withSelfReaction(m.reactions, userId, emoji) } : m)));
      const epoch = bumpEpoch(messageId);
      const call = emoji ? transport.setReaction(conversationId, messageId, emoji) : transport.removeReaction(conversationId, messageId);
      call
        .then((groups) => applyServer(messageId, groups, epoch))
        .catch((err: unknown) => {
          // Offline: the pick stays and replays on restore; a
          // refusal undoes this user's change only
          if (isRetryable(err)) {
            getTaskQueue(storage, conversationId).add({ type: 'reaction', messageId, emoji, at: new Date().toISOString() });
            return;
          }
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: withSelfReaction(m.reactions, userId, priorEmoji) } : m)));
          notify({ level: 'error', code: emoji ? 'reaction_add_failed' : 'reaction_remove_failed' });
        });
    },
    [applyServer, bumpEpoch, conversationId, currentUser, notify, setMessages, storage, transport],
  );

  const applyReaction = useCallback(
    (emoji: string) => {
      const messageId = pickerTargetId;
      closePicker();
      if (!messageId) return;
      reactTo(messageId, emoji);
    },
    [closePicker, pickerTargetId, reactTo],
  );

  const clearReaction = useCallback(() => {
    const messageId = pickerTargetId;
    closePicker();
    if (!messageId) return;
    reactTo(messageId, null);
  }, [closePicker, pickerTargetId, reactTo]);


  return { reactionOptions, pickerOpen, pickerTargetId, openPicker, closePicker, applyReaction, clearReaction, reactTo };
}
