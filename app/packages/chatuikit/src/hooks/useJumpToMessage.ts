// -----------------------------------------------------------
//  [*] chatuikit — useJumpToMessage
//
//    const listRef = useRef<MessageListHandle>(null)
//    const jump = useJumpToMessage(listRef, jumpTo, { onMissing, onJumpFailed })
//    <MessageList ref={listRef} highlightedId={jump.highlightedId}
//                 onJumpFailed={jump.onJumpFailed} … />
//    jump.jumpToMessage(id)  — a search hit, a pin
//    jump.jumpToQuoted(m)    — the bubble's quote tap
//
//  Jump to a message: scroll it into view and wash it for a
//  beat. A hit beyond the loaded history is handed to the
//  host's `jumpTo` (an engine anchors the window around the
//  target in one round trip) behind `jumping`, then the fresh
//  rows get a few render beats before the scroll retries. The
//  host hears the two ways a jump can end without a
//  highlight: `onMissing` when the target does not exist (or
//  never rendered in time), and `onJumpFailed` — wired to the
//  list's own prop — when the list ran out of scrollToIndex
//  retries and landed near its estimate. Both callbacks ride
//  latest-refs, so an inline arrow at the call site never
//  destabilises the returned handlers.
//
//  The list ref is the host's (it also goes on the list): a
//  ref handed back inside the result would mark the whole
//  result as ref-like for the compiler-era hook lint.
//
//  Used by:
//    - hosts, beside MessageList
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { MessageListHandle } from '../list/MessageList';
import type { KitMessage } from '../core/types';


// How many render beats a jump waits for the anchored window's
// rows to land before giving up on the scroll
const JUMP_RENDER_RETRIES = 6;
// Milliseconds between those render-beat scroll retries
const JUMP_RETRY_DELAY_MS = 80;
// How long the landed message stays washed before fading back
const HIGHLIGHT_MS = 1500;







// -----------------------------------------------------------
// useJumpToMessage
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — beside MessageList
// -----------------------------------------------------------

export function useJumpToMessage(
  listRef: RefObject<MessageListHandle | null>,
  // Resolves once the window around the target is loaded;
  // the literal 'missing' means the target does not exist
  jumpTo: (targetId: string) => Promise<unknown>,
  callbacks: { onMissing?: () => void; onJumpFailed?: () => void } = {},
) {

  // Latest-refs: the host may pass inline arrows without
  // rebuilding the memoised handlers below
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });


  // The wash: one timer, restarted by every jump, cleared on unmount
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlight = useCallback((targetId: string) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(targetId);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
  }, []);
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);


  const onJumpFailed = useCallback(() => callbacksRef.current.onJumpFailed?.(), []);


  // One anchor at a time: the ref guards synchronously, the
  // state drives the host's overlay
  const [jumping, setJumping] = useState(false);
  const jumpingRef = useRef(false);
  const jumpToMessage = useCallback(
    async (targetId: string) => {
      if (listRef.current?.scrollToMessage(targetId)) {
        highlight(targetId);
        return;
      }

      if (jumpingRef.current) return;
      jumpingRef.current = true;
      setJumping(true);
      try {
        const outcome = await jumpTo(targetId);
        if (outcome !== 'missing') {
          for (let attempt = 0; attempt < JUMP_RENDER_RETRIES; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, JUMP_RETRY_DELAY_MS));
            if (listRef.current?.scrollToMessage(targetId)) {
              highlight(targetId);
              return;
            }
          }
        }
        callbacksRef.current.onMissing?.();
      } finally {
        jumpingRef.current = false;
        setJumping(false);
      }
    },
    [highlight, jumpTo, listRef],
  );
  const jumpToQuoted = useCallback(
    (message: KitMessage) => {
      if (message.replyTo?.id) void jumpToMessage(message.replyTo.id);
    },
    [jumpToMessage],
  );


  return { jumping, highlightedId, jumpToMessage, jumpToQuoted, onJumpFailed };
}
