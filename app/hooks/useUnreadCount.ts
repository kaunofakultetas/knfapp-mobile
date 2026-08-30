// -----------------------------------------------------------
//  [*] useUnreadCount — total unread messages for the badge
//
//  Fetches the total unread count when the user is (or
//  becomes) authenticated, resets to 0 on logout, and tracks
//  socket traffic in between: a new message from someone else
//  bumps the count immediately — unless it belongs to the
//  conversation on screen (hooks/chat/activeConversation),
//  which the room is marking read as it lands — then a
//  debounced server re-count (500 ms) reconciles bursts. App
//  foregrounding, network restore and socket reconnects
//  re-fetch too, so the badge never depends on live events
//  alone.
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

// The room currently on screen — its messages are being read
// as they land, never counted
import { getActiveConversation } from '@/hooks/chat/activeConversation';

// The authoritative server count
import { fetchTotalUnreadCount } from '@/services/api';

// Live increments, read receipts, unsends and reconnects
import {
  connectSocket,
  getSocketStatus,
  onMessageDeleted,
  onMessagesRead,
  onNewMessage,
  onSocketStatusChange,
  type SocketMessage,
} from '@/services/socket';

// Revalidation when connectivity returns
import { useNetworkRestore } from '@/hooks/useNetworkRestore';

// Local count state and lifecycle guards
import { useCallback, useEffect, useRef, useState } from 'react';

// Revalidation when the app returns to the foreground
import { AppState } from 'react-native';







// -----------------------------------------------------------
// useUnreadCount
// -----------------------------------------------------------
//
//   const { count, refresh } = useUnreadCount()
//     count   — total unread messages; 0 while logged out
//     refresh — force a server re-count; the hook also calls
//               it on app-active, network restore and every
//               socket reconnect, so the badge self-heals
//               without live events
//
// Used by:
//   - components/navigation/TabBar.tsx — Messages tab Badge
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
    let unsubscribeDeleted: (() => void) | undefined;
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

    // Debounced server re-count: socket bursts collapse into a
    // single request, so a run of optimistic increments settles
    // on the server's number instead of drifting
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
        // Neither is a message for the room being read — and
        // no reconcile either: the room's mark-read flush is
        // slower than the debounce, so a re-count now would
        // flash the message as unread; the messages_read
        // receipt below re-counts AFTER the server has
        // committed the read
        if (message.conversationId === getActiveConversation()) return;
        setCount((previous) => previous + 1);
        scheduleReconcile();
      });

      unsubscribeRead = onMessagesRead(({ readerId }) => {
        // Only the CURRENT user's reads move their own badge —
        // this is its self-heal path; someone else reading
        // your messages changes nothing you count
        if (readerId === userId) scheduleReconcile();
      });

      unsubscribeDeleted = onMessageDeleted(() => {
        // An unsent message may have been unread — re-count
        scheduleReconcile();
      });
    })();

    return () => {
      cancelled = true;
      if (reconcileTimer) clearTimeout(reconcileTimer);
      unsubscribeMessage?.();
      unsubscribeRead?.();
      unsubscribeDeleted?.();
    };
  }, [isAuthenticated, userId, refresh]);


  // Revalidation beyond live socket events: foregrounding,
  // connectivity restore and every reconnect can all have
  // missed traffic the badge should reflect
  useEffect(() => {
    if (!isAuthenticated) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [isAuthenticated, refresh]);


  useNetworkRestore(() => {
    if (isAuthenticated) void refresh();
  });


  useEffect(() => {
    if (!isAuthenticated) return;
    // Only a transition INTO 'connected' re-fetches — a
    // reconnect emits the status twice (Socket connect + the
    // Manager's reconnect), and repeats must not double-fetch
    let last = getSocketStatus();
    return onSocketStatusChange((status) => {
      if (status === 'connected' && last !== 'connected') void refresh();
      last = status;
    });
  }, [isAuthenticated, refresh]);


  return { count, refresh };
}
