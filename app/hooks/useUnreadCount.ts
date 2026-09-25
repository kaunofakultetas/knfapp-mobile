// -----------------------------------------------------------
//  [*] useUnreadCount — total unread messages for the badge
//
//  Fetches the total unread count when the user is (or
//  becomes) authenticated, resets to 0 on logout, and tracks
//  socket traffic in between: a new message from someone else
//  bumps the count immediately — unless it belongs to the
//  conversation on screen (hooks/chat/activeConversation),
//  which the room is marking read as it lands — then a
//  debounced server re-count (500 ms) reconciles bursts. A
//  message for the open room gets no bump but IS reconciled,
//  on a slower clock (2 s, past the room's own mark-read
//  window): a reader scrolled up in that room never marks it
//  read, and the badge would otherwise freeze under the
//  server's count — and no later message pulls that slow
//  re-count back in, which would count the open room's message
//  before its read committed. App foregrounding, network
//  restore and socket reconnects re-fetch too, so the badge
//  never depends on live events alone.
//
//  System lines (group created, timer set, a member left)
//  never count — the server's unread excludes them — so they
//  bump nothing. A screen that removes a whole room (delete,
//  leave) asks for an immediate re-count through
//  requestUnreadRecount instead of waiting for the next event.
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
import { getActiveConversation } from '@knf/chatengine';

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
import { useNetworkRestore } from '@knf/dataengine';

// Local count state and lifecycle guards
import { useCallback, useEffect, useRef, useState } from 'react';

// Revalidation when the app returns to the foreground
import { AppState } from 'react-native';


// A socket burst settles this long before ONE server re-count
const RECONCILE_MS = 500;

// A message for the room on screen re-counts on this slower
// clock — longer than the room's READ_DEBOUNCE_MS (1.5 s in
// chatengine's useConversation), so the server's number lands
// AFTER the room's mark-read committed when it was going to,
// and is right when it never was (the reader scrolled up)
const ACTIVE_ROOM_RECONCILE_MS = 2_000;

// The mounted hooks' re-count callbacks — requestUnreadRecount
// reaches every badge without prop drilling
const recountListeners = new Set<() => void>();







// -----------------------------------------------------------
// requestUnreadRecount
// -----------------------------------------------------------
//
// Asks every mounted useUnreadCount for a server re-count
// NOW — for the moments no socket event follows: a room the
// reader deleted or left took its unread messages with it,
// and the badge would otherwise keep them until the next
// message arrived.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — after a delete/leave
// -----------------------------------------------------------

export function requestUnreadRecount(): void {
  recountListeners.forEach((listener) => listener());
}







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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the logout is the event: the badge zeroes as in-flight fetches are invalidated
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
    // When the pending re-count fires (ms epoch) — see below
    let reconcileDue = 0;

    // Debounced server re-count: socket bursts collapse into a
    // single request, so a run of optimistic increments settles
    // on the server's number instead of drifting. The delay is
    // the caller's — the open room's messages ask for the slow
    // clock (see ACTIVE_ROOM_RECONCILE_MS) — and a later call
    // may push the pending re-count further out but never pull
    // it IN: a fast re-count for another room's message would
    // otherwise land before the open room's mark-read committed
    // and flash its message as unread
    const scheduleReconcile = (delayMs: number = RECONCILE_MS) => {
      const due = Math.max(Date.now() + delayMs, reconcileTimer ? reconcileDue : 0);
      if (reconcileTimer) clearTimeout(reconcileTimer);
      reconcileDue = due;
      reconcileTimer = setTimeout(() => {
        reconcileTimer = null;
        void refresh();
      }, Math.max(due - Date.now(), 0));
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
        // are never unread — and neither is a system line (the
        // server's count excludes them; a bump here flickered
        // the badge +1 on every timer toggle or leave)
        if (message.senderId === userId) return;
        if (message.kind === 'system') return;
        // Neither is a message for the room being read — no
        // bump, and no re-count on the fast clock: the room's
        // mark-read flush is slower than the debounce, so a
        // re-count now would flash the message as unread. It
        // is reconciled on the slow clock instead — the room
        // only marks read while pinned to the newest end, and
        // a reader scrolled up emits no messages_read receipt
        // for the self-heal below to run on
        if (message.conversationId === getActiveConversation()) {
          scheduleReconcile(ACTIVE_ROOM_RECONCILE_MS);
          return;
        }
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


  // Explicit asks from screens that removed a room
  useEffect(() => {
    if (!isAuthenticated) return;
    const listener = () => void refresh();
    recountListeners.add(listener);
    return () => {
      recountListeners.delete(listener);
    };
  }, [isAuthenticated, refresh]);


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
