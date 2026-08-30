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
//  that.
//
//  Filtering is defensive: the backend's include_self=False
//  only skips the emitting SOCKET, so a second session of the
//  same account would still show the user their own typing —
//  events carrying the signed-in user's id are dropped here.
//  When the caller passes the room's participants, events
//  from ids outside that list are ignored too (the server
//  also gates non-members, this is the client's belt).
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

// Self identity — own typing from a second session never shows
import { useAuth } from '@/context/AuthContext';

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
//   const { typingUsers } = useTypingIndicator(conversationId,
//                                              chat.profiles)
//     typingUsers — TypingUser[]; empty when nobody types.
//                   Format in the screen:
//                   1 → t('chat.typing', { name })
//                   n → t('chat.typingMultiple', { names })
//
//   The second argument (member ids, or objects carrying an
//   id — chat.profiles fits as-is) is optional; when present,
//   typing events from ids outside it are ignored.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the typing banner
// -----------------------------------------------------------

export function useTypingIndicator(
  conversationId: string,
  participants?: readonly (string | { id: string })[],
): { typingUsers: TypingUser[] } {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);


  // Expiry timer per typer — refreshed on every typing event
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());


  // Self id and member ids through refs — the subscription
  // effect must not resubscribe when auth hydrates or the
  // member list loads mid-session
  const selfIdRef = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    selfIdRef.current = user?.id ?? null;
  }, [user]);

  const memberIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    memberIdsRef.current =
      participants && participants.length > 0
        ? new Set(participants.map((p) => (typeof p === 'string' ? p : p.id)))
        : null;
  }, [participants]);


  useEffect(() => {
    if (!conversationId) return;

    const timeouts = timeoutsRef.current;


    const unsubTyping = onTyping((data: TypingEvent) => {
      if (data.conversationId !== conversationId) return;
      // Own typing (a second session) and non-members never show
      if (data.userId === selfIdRef.current) return;
      if (memberIdsRef.current && !memberIdsRef.current.has(data.userId)) return;

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
      if (data.userId === selfIdRef.current) return;

      setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
      const timer = timeouts.get(data.userId);
      if (timer) {
        clearTimeout(timer);
        timeouts.delete(data.userId);
      }
    });


    // Ensure a connection exists even when this hook is the
    // first socket consumer (single-flight — cheap otherwise);
    // a refused connect is not this hook's problem to surface
    connectSocket().catch(() => {});


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
