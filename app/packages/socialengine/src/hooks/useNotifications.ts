// -----------------------------------------------------------
//  [*] socialengine — useNotifications
//
//  The activity list as the UI wants it: fetched page by page
//  through the transport, deduped by id (backends overlap
//  pages around a moving cursor), grouped by
//  groupNotifications. A transport without fetchNotifications
//  reports supported false and stays completely inert — the
//  host simply hides the entry point.
//
//  A loaded list is only ever EMPTIED by the server answering
//  empty. A moment with no viewer (the session re-hydrating
//  under a mounted screen, a sign-out) hides the held rows —
//  the hook answers no groups for nobody — but keeps them for
//  the same account's return, which shows them again at once
//  and re-reads behind them; only a DIFFERENT account starts
//  from nothing (its predecessor's rows must never show).
//
//  markAllRead is pessimistic on the wire but optimistic on
//  the flip: every held row reads as read immediately, the
//  transport call runs behind it, and a refusal puts the old
//  flags back and notifies ('notifications_failed'). A backend
//  without markNotificationsRead still gets the local flip —
//  there is just nothing to fail. The flip also rides the
//  provider's unread signal: the badge (useUnreadBadge) drops
//  to zero with the list instead of waiting out its poll
//  interval, and a refusal tells it to re-probe.
//
//  Used by:
//    - the host's activity screen (via @knf/socialuikit or
//      directly)
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { groupNotifications, type GroupNotificationsOptions } from '../core/notifications';
import type { NotificationGroup, SocialNotification } from '../core/types';
import { useSocialEngine } from '../provider';







// -----------------------------------------------------------
// UseNotificationsResult
// -----------------------------------------------------------
//
// What the hook hands the activity screen.
//
// Used by:
//   - useNotifications (below) — the return shape
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface UseNotificationsResult {
  // False when the transport has no fetchNotifications — every
  // field stays at rest and every call resolves as a no-op
  supported: boolean;
  groups: NotificationGroup[];
  loading: boolean;
  // A failed page load; the next successful refresh/loadMore
  // clears it
  error: boolean;
  hasMore: boolean;
  // A next page is on the wire (a list footer spinner)
  loadingMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  // Resolves once the wire call settles (immediately when the
  // backend has none) — the local flip happens up front
  markAllRead: () => Promise<void>;
}







// -----------------------------------------------------------
// dedupeById
// -----------------------------------------------------------
//
// First occurrence of an id wins — with pages sorted newest
// first, that is the freshest copy of the row.
//
// Used by:
//   - useNotifications (below) — refresh and loadMore
// -----------------------------------------------------------

const dedupeById = (list: SocialNotification[]): SocialNotification[] => {
  const seen = new Set<string>();
  const out: SocialNotification[] = [];
  for (const row of list) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
};







// -----------------------------------------------------------
// useNotifications
// -----------------------------------------------------------
//
//   const { groups, loadMore } = useNotifications()
//   useNotifications({ grouping: { windowMs } })   — custom
//                                                    grouping
//
// Used by:
//   - the host's activity screen
// -----------------------------------------------------------

export function useNotifications(options?: { grouping?: GroupNotificationsOptions }): UseNotificationsResult {
  const { transport, notify, currentUser, unread } = useSocialEngine();
  // Inert for guests as much as for a transport without the
  // feed: a guest never asks the wire (the real backend would
  // answer 401 and the host would toast a failure at nobody)
  const supported = currentUser !== null && typeof transport.fetchNotifications === 'function';
  const viewerId = currentUser?.id ?? null;

  const [rows, setRows] = useState<SocialNotification[]>([]);
  const [loading, setLoading] = useState(supported);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);


  // Mirrors for callbacks that must read the present value
  // without re-identifying on every render
  const rowsRef = useRef<SocialNotification[]>([]);
  const cursorRef = useRef<string | undefined>(undefined);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  // Bumped by refresh and unmount so a response from an earlier
  // request generation is dropped on the floor
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  // Whose rows are held — a different account's never show
  const ownerRef = useRef<string | null>(null);


  const commitRows = useCallback((next: SocialNotification[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);


  // First page — REPLACES what is held (a pull-to-refresh).
  // `supported` is a real dependency of all three callbacks: a
  // hook that first renders with no viewer (the provider
  // re-hydrating the session) must not keep a closure that
  // never asks the wire once the viewer arrives — the list
  // would stay empty for good
  const refresh = useCallback(async () => {
    const fetchPage = supported ? transport.fetchNotifications?.bind(transport) : undefined;
    if (!fetchPage) return;

    const seq = ++seqRef.current;
    setLoading(true);
    setError(false);
    try {
      const page = await fetchPage();
      if (seq !== seqRef.current) return;
      cursorRef.current = page.cursor;
      hasMoreRef.current = page.hasMore;
      commitRows(dedupeById(page.notifications));
      setHasMore(page.hasMore);
      setLoading(false);
    } catch {
      if (seq !== seqRef.current) return;
      setError(true);
      setLoading(false);
    }
  }, [supported, transport, commitRows]);


  // Next page — APPENDS, dropping ids already held
  const loadMore = useCallback(async () => {
    const fetchPage = supported ? transport.fetchNotifications?.bind(transport) : undefined;
    if (!fetchPage) return;
    // Nothing left to ask for, or a page already on the wire
    if (!hasMoreRef.current || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const seq = seqRef.current;
    try {
      const page = await fetchPage(cursorRef.current);
      if (seq !== seqRef.current) return;
      cursorRef.current = page.cursor;
      hasMoreRef.current = page.hasMore;
      commitRows(dedupeById([...rowsRef.current, ...page.notifications]));
      setHasMore(page.hasMore);
      setError(false);
    } catch {
      if (seq !== seqRef.current) return;
      setError(true);
    } finally {
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [supported, transport, commitRows]);


  const markAllRead = useCallback(async () => {
    if (!supported || typeof transport.fetchNotifications !== 'function') return;

    // The optimistic flip — the list reads as read before the
    // wire answers, and the badge follows it at once
    const before = rowsRef.current;
    if (before.some((n) => !n.read)) {
      commitRows(before.map((n) => (n.read ? n : { ...n, read: true })));
    }
    unread.emit('cleared');

    // The wire call still runs on an all-read list: the server
    // may hold unread rows beyond the pages fetched so far
    const call = transport.markNotificationsRead?.bind(transport);
    if (!call) return;
    try {
      await call();
    } catch {
      // The server still counts them — the badge re-asks it
      unread.emit('stale');
      if (!mountedRef.current) return;
      // Restore only the flags this flip changed — rows that
      // arrived meanwhile keep their own state
      const wasUnread = new Set(before.filter((n) => !n.read).map((n) => n.id));
      commitRows(rowsRef.current.map((n) => (wasUnread.has(n.id) && n.read ? { ...n, read: false } : n)));
      notify({ level: 'error', code: 'notifications_failed' });
    }
  }, [supported, transport, notify, unread, commitRows]);


  // The first page loads itself, and loads again whenever a
  // viewer (re)appears; a different account starts from
  // nothing. With no viewer the requests in flight are void
  // and the held rows stay parked (see the file banner)
  useEffect(() => {
    mountedRef.current = true;
    if (supported) {
      if (ownerRef.current !== null && ownerRef.current !== viewerId) {
        seqRef.current += 1;
        cursorRef.current = undefined;
        hasMoreRef.current = false;
        commitRows([]);
        setHasMore(false);
      }
      ownerRef.current = viewerId;
      void refresh();
    } else {
      seqRef.current += 1;
      setLoading(false);
      setError(false);
    }
    return () => {
      mountedRef.current = false;
      seqRef.current += 1;
    };
  }, [supported, viewerId, refresh, commitRows]);


  // Hosts should keep the grouping object stable — an inline
  // literal re-groups every render (correct, just wasted work).
  // Nobody signed in sees no rows, whatever is parked
  const grouping = options?.grouping;
  const groups = useMemo(
    () => (supported ? groupNotifications(rows, grouping) : []),
    [supported, rows, grouping],
  );


  return {
    supported,
    groups,
    loading,
    error,
    hasMore: supported && hasMore,
    loadingMore,
    refresh,
    loadMore,
    markAllRead,
  };
}
