// -----------------------------------------------------------
//  [*] useUnreadCount — total unread messages for the badge
//
//  Fetches the total unread count when the user is (or
//  becomes) authenticated, resets to 0 on logout, and tracks
//  socket traffic in between: a new message from someone else
//  bumps the count immediately, then a debounced server
//  re-count (500 ms) reconciles — the message may belong to
//  the conversation the user currently has open, which the
//  backend already counts as read.
//
//  Correctness notes:
//    - every fetch carries a sequence number, so a slow
//      response never overwrites a newer one — and none can
//      resurrect a count after the logout reset;
//    - socket subscriptions are registry-based and survive
//      reconnects, but connectSocket() is awaited, so a
//      cancelled flag stops the effect from subscribing after
//      its own cleanup has already run.
// -----------------------------------------------------------

// Auth reactivity — the count belongs to exactly one user
import { useAuth } from '@/context/AuthContext';

// The authoritative server count
import { fetchTotalUnreadCount } from '@/services/api';

// Live increments and read receipts
import {
  connectSocket,
  onMessagesRead,
  onNewMessage,
  type SocketMessage,
} from '@/services/socket';

// Local count state and lifecycle guards
import { useCallback, useEffect, useRef, useState } from 'react';







// -----------------------------------------------------------
// useUnreadCount
// -----------------------------------------------------------
//
//   const { count, refresh } = useUnreadCount()
//     count   — total unread messages; 0 while logged out
//     refresh — force a server re-count (e.g. after marking a
//               conversation read via REST)
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — Messages tab Badge
// -----------------------------------------------------------

export function useUnreadCount(): {
  count: number;
  refresh: () => Promise<void>;
} {
  const { isAuthenticated, user } = useAuth();
  const [count, setCount] = useState(0);
  const userId = user?.id ?? null;


  // Only the newest fetch may write; bumped on logout so an
  // in-flight response cannot land after the reset to 0
  const seqRef = useRef(0);


  // Replace the optimistic count with the server's number;
  // failures keep whatever is showing (backend unreachable)
  const refresh = useCallback(async (): Promise<void> => {
    const seq = ++seqRef.current;
    try {
      const { unreadCount } = await fetchTotalUnreadCount();
      if (seq === seqRef.current) setCount(unreadCount);
    } catch {
      // Offline or expired session — keep the current count
    }
  }, []);


  // Auth reactivity: fetch on login and on user change, reset
  // on logout (the badge must never show another user's count)
  useEffect(() => {
    if (!isAuthenticated) {
      seqRef.current += 1;
      setCount(0);
      return;
    }
    void refresh();
  }, [isAuthenticated, userId, refresh]);


  // Socket traffic keeps the count live between fetches. The
  // registry keeps handlers valid across reconnects; the
  // cancelled flag covers cleanup racing the awaited connect.
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    let unsubscribeMessage: (() => void) | undefined;
    let unsubscribeRead: (() => void) | undefined;
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

    // Debounced server re-count: socket bursts collapse into a
    // single request, and optimistic increments for the open
    // conversation get corrected instead of drifting
    const scheduleReconcile = () => {
      if (reconcileTimer) clearTimeout(reconcileTimer);
      reconcileTimer = setTimeout(() => {
        reconcileTimer = null;
        void refresh();
      }, 500);
    };

    void (async () => {
      // Best-effort connect: a failure only delays events — the
      // registry subscriptions below stay valid regardless
      try {
        await connectSocket();
      } catch {
        // Ignored — see comment above
      }
      if (cancelled) return;

      unsubscribeMessage = onNewMessage((message: SocketMessage) => {
        // Own outgoing messages echo back over the socket and
        // are never unread
        if (message.senderId === userId) return;
        setCount((previous) => previous + 1);
        scheduleReconcile();
      });

      unsubscribeRead = onMessagesRead(() => {
        scheduleReconcile();
      });
    })();

    return () => {
      cancelled = true;
      if (reconcileTimer) clearTimeout(reconcileTimer);
      unsubscribeMessage?.();
      unsubscribeRead?.();
    };
  }, [isAuthenticated, userId, refresh]);


  return { count, refresh };
}
