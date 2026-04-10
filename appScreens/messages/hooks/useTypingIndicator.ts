// Tracks who is typing in a conversation via Socket.IO events.
import { useEffect, useRef, useState } from 'react';
import {
  connectSocket,
  onTyping,
  onStopTyping,
  type TypingEvent,
  type StopTypingEvent,
} from '@/services/socket';

interface TypingUser {
  userId: string;
  displayName: string;
}

export function useTypingIndicator(conversationId: string) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    let unsubTyping: (() => void) | undefined;
    let unsubStopTyping: (() => void) | undefined;

    (async () => {
      const sock = await connectSocket();
      if (!sock) return;

      unsubTyping = onTyping((data: TypingEvent) => {
        if (data.conversationId !== conversationId) return;

        setTypingUsers((prev) => {
          if (prev.some((u) => u.userId === data.userId)) return prev;
          return [...prev, { userId: data.userId, displayName: data.displayName }];
        });

        // Auto-remove after 3 seconds if no stop_typing received
        const existing = timeoutsRef.current.get(data.userId);
        if (existing) clearTimeout(existing);
        timeoutsRef.current.set(
          data.userId,
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
            timeoutsRef.current.delete(data.userId);
          }, 3000),
        );
      });

      unsubStopTyping = onStopTyping((data: StopTypingEvent) => {
        if (data.conversationId !== conversationId) return;
        setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        const t = timeoutsRef.current.get(data.userId);
        if (t) {
          clearTimeout(t);
          timeoutsRef.current.delete(data.userId);
        }
      });
    })();

    return () => {
      unsubTyping?.();
      unsubStopTyping?.();
      // Clear all timeouts
      for (const t of timeoutsRef.current.values()) clearTimeout(t);
      timeoutsRef.current.clear();
    };
  }, [conversationId]);

  // Build display text: "Alice is typing..." or "Alice, Bob are typing..."
  // Uses Lithuanian format by default but the caller can override via i18n
  const typingText =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0].displayName} ra\u0161o...`
        : `${typingUsers.map((u) => u.displayName).join(', ')} ra\u0161o...`;

  return { typingUsers, typingText };
}
