// -----------------------------------------------------------
//  [*] useTypingIndicator — who is typing in this room
//
//  Tracks the typers of one conversation from the user_typing /
//  user_stop_typing socket events and returns the raw list —
//  the SCREEN formats it through t('chat.typing') /
//  t('chat.typingMultiple'), keeping this hook language-free.
//
//  Subscriptions go through the synchronous socket registry
//  (they exist before the async connect resolves), so there is
//  no subscribe/cleanup race and nothing to cancel — the old
//  await-then-subscribe shape leaked listeners on fast
//  unmounts. connectSocket() is still kicked so the indicator
//  works even if this hook mounts before any other socket
//  consumer.
//
//  A typer expires after 5 s without a fresh event. The
//  composer heartbeats every 2 s while keystrokes keep coming
//  (see useChatComposer), so an active typist never flickers
//  off — the old 3 s expiry against a single emit did exactly
//  that. The backend broadcasts both events with
//  include_self=False, so the local user never appears.
//
//  Split into:
//
//    TypingUser         — one active typer
//    useTypingIndicator — the hook itself
// -----------------------------------------------------------

// Registry-backed typing subscriptions
import {
  connectSocket,
  onStopTyping,
  onTyping,
  type StopTypingEvent,
  type TypingEvent,
} from '@/services/socket';

// State plumbing
import { useEffect, useRef, useState } from 'react';


// Must exceed the composer's 2 s heartbeat, with slack for a
// slow polling round-trip
const TYPING_EXPIRY_MS = 5000;







// -----------------------------------------------------------
// TypingUser
// -----------------------------------------------------------
//
// Used by:
//   - useTypingIndicator (below)
//   - app/(main)/chat-room/index.tsx — the typing banner
// -----------------------------------------------------------

export interface TypingUser {
  userId: string;
  displayName: string;
}







// -----------------------------------------------------------
// useTypingIndicator
// -----------------------------------------------------------
//
//   const { typingUsers } = useTypingIndicator(conversationId)
//     typingUsers — TypingUser[]; empty when nobody types.
//                   Format in the screen:
//                   1 → t('chat.typing', { name })
//                   n → t('chat.typingMultiple', { names })
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the typing banner
// -----------------------------------------------------------

export function useTypingIndicator(conversationId: string): { typingUsers: TypingUser[] } {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);


  // Expiry timer per typer — refreshed on every typing event
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());


  useEffect(() => {
    if (!conversationId) return;

    const timeouts = timeoutsRef.current;


    const unsubTyping = onTyping((data: TypingEvent) => {
      if (data.conversationId !== conversationId) return;

      setTypingUsers((prev) =>
        prev.some((u) => u.userId === data.userId)
          ? prev
          : [...prev, { userId: data.userId, displayName: data.displayName }],
      );

      // Refresh the expiry window on every (heartbeat) event
      const existing = timeouts.get(data.userId);
      if (existing) clearTimeout(existing);
      timeouts.set(
        data.userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
          timeouts.delete(data.userId);
        }, TYPING_EXPIRY_MS),
      );
    });


    const unsubStopTyping = onStopTyping((data: StopTypingEvent) => {
      if (data.conversationId !== conversationId) return;

      setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
      const timer = timeouts.get(data.userId);
      if (timer) {
        clearTimeout(timer);
        timeouts.delete(data.userId);
      }
    });


    // Ensure a connection exists even when this hook is the
    // first socket consumer (single-flight — cheap otherwise)
    void connectSocket();


    return () => {
      unsubTyping();
      unsubStopTyping();
      for (const timer of timeouts.values()) clearTimeout(timer);
      timeouts.clear();
      setTypingUsers([]);
    };
  }, [conversationId]);


  return { typingUsers };
}
