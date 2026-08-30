// -----------------------------------------------------------
//  [*] chatengine — useTyping
//
//  Who is typing in one conversation, from the transport's
//  'typing' events — the raw list; the host formats it. A typer
//  expires after 5 s without a fresh event; the composer
//  heartbeats every 2 s while keystrokes keep coming, so an
//  active typist never flickers off. Own typing (a second
//  session of the same account) and non-members never show.
//
//  Split into:
//
//    TypingUser — one active typer
//    useTyping  — the hook itself
// -----------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

import { useChatEngine } from '../provider';


// Must exceed the composer's 2 s heartbeat, with slack for a
// slow polling round-trip
const TYPING_EXPIRY_MS = 5000;


export interface TypingUser {
  userId: string;
  displayName: string;
}







// -----------------------------------------------------------
// useTyping
// -----------------------------------------------------------
//
//   const { typingUsers } = useTyping(conversationId, chat.profiles)
//
// Used by:
//   - the host's chat room screen (directly or via useChatRoom)
// -----------------------------------------------------------

export function useTyping(conversationId: string, participants?: readonly (string | { id: string })[]): { typingUsers: TypingUser[] } {
  const { transport, currentUser } = useChatEngine();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const selfIdRef = useRef<string | null>(currentUser?.id ?? null);
  useEffect(() => {
    selfIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);

  const memberIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    memberIdsRef.current =
      participants && participants.length > 0 ? new Set(participants.map((p) => (typeof p === 'string' ? p : p.id))) : null;
  }, [participants]);

  useEffect(() => {
    if (!conversationId) return;
    const timeouts = timeoutsRef.current;

    const unsubscribe = transport.realtime.subscribe((event) => {
      if (event.type !== 'typing' || event.conversationId !== conversationId) return;
      if (event.userId === selfIdRef.current) return;

      if (!event.active) {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== event.userId));
        const timer = timeouts.get(event.userId);
        if (timer) {
          clearTimeout(timer);
          timeouts.delete(event.userId);
        }
        return;
      }

      if (memberIdsRef.current && !memberIdsRef.current.has(event.userId)) return;
      setTypingUsers((prev) => (prev.some((u) => u.userId === event.userId) ? prev : [...prev, { userId: event.userId, displayName: event.displayName }]));
      const existing = timeouts.get(event.userId);
      if (existing) clearTimeout(existing);
      timeouts.set(
        event.userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== event.userId));
          timeouts.delete(event.userId);
        }, TYPING_EXPIRY_MS),
      );
    });

    // Ensure a connection exists even when this is the first
    // realtime consumer (single-flight — cheap otherwise)
    transport.realtime.connect().catch(() => {});

    return () => {
      unsubscribe();
      for (const timer of timeouts.values()) clearTimeout(timer);
      timeouts.clear();
      setTypingUsers([]);
    };
  }, [conversationId, transport]);

  return { typingUsers };
}
