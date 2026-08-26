// -----------------------------------------------------------
//  [*] useFeed — paginated feeds with an offline first page
//
//  The engine behind every list screen: news, comments, the
//  social feed, conversations. One page-1 pipeline serves
//  mount, deps changes, pull-to-refresh and network restore;
//  loadMore appends pages behind it for FlatList onEndReached.
//
//  Behavior contract:
//    - loading covers only the FIRST page-1 load per deps
//      combination (mount and deps changes, which also clear
//      the previous list); refresh() runs silently behind the
//      shown items with the refreshing flag for RefreshControl;
//    - on page-1 success with a cacheKey, the items become the
//      offline copy; on page-1 failure with nothing live to
//      show, the cached copy is served and cachedAt exposes
//      its age for CachedBanner — otherwise error turns true,
//      and ONLY then (screens treat error as "render
//      ErrorState"; a failed silent refresh keeps the list);
//    - every page-1 request carries a sequence number:
//      superseded responses are dropped, and a page-1 load
//      invalidates any load-more in flight — never the other
//      way around — so out-of-order pages cannot interleave;
//    - a cached fallback has no live continuation, so hasMore
//      is forced off until a real page 1 succeeds;
//    - setItems(updater) mutates the list in place for
//      optimistic updates (likes, deletes) without a refetch.
//
//  itemsRef shadows the items state at every mutation point,
//  so async flows (error semantics, restore spinner mode) read
//  the truth immediately instead of waiting for a commit.
// -----------------------------------------------------------

// Offline copy of the first page
import { cacheGet, cacheSet } from '@/services/cache';

// Automatic refetch when connectivity returns
import { useNetworkRestore } from '@/hooks/useNetworkRestore';

// Feed state and lifecycle guards
import { useCallback, useEffect, useRef, useState } from 'react';







// -----------------------------------------------------------
// FeedPage / UseFeedOptions / UseFeedResult
// -----------------------------------------------------------
//
// FeedPage is the shape the caller's fetchPage adapter must
// return; screens wrap their domain API in a one-liner:
//   async (page) => { const r = await fetchNewsFeed(page);
//                     return { items: r.posts, hasMore: r.hasMore }; }
//
// Used by:
//   - useFeed (below)
//   - list screens typing their fetchPage adapters
// -----------------------------------------------------------

export interface FeedPage<T> {
  items: T[];
  hasMore: boolean;
}

export interface UseFeedOptions {
  cacheKey?: string;
  cacheMaxAge?: number;
  deps?: unknown[];
}

export interface UseFeedResult<T> {
  items: T[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: boolean;
  cachedAt: number | null;
  refresh: () => Promise<void>;
  loadMore: () => void;
  setItems: (updater: (items: T[]) => T[]) => void;
}







// -----------------------------------------------------------
// useFeed
// -----------------------------------------------------------
//
//   const feed = useFeed(fetchPage)               — plain feed
//   const feed = useFeed(fetchPage, {
//     cacheKey: CACHE_KEY_NEWS,                   — offline 1st page
//     cacheMaxAge: NEWS_CACHE_MAX_AGE,
//     deps: [source],                             — reload triggers
//   })
//     items / loading / refreshing / loadingMore / error
//     cachedAt          — non-null while showing the offline
//                         copy (CachedBanner timestamp)
//     refresh()         — RefreshControl onRefresh
//     loadMore()        — FlatList onEndReached
//     setItems(updater) — optimistic updates with exact revert
//
// Used by:
//   - app/(main)/tabs/news.tsx, tabs/messages.tsx — main feeds
//   - app/(main)/news-comments, friends, profile — sub-feeds
// -----------------------------------------------------------

export function useFeed<T>(
  fetchPage: (page: number) => Promise<FeedPage<T>>,
  opts: UseFeedOptions = {},
): UseFeedResult<T> {
  const { cacheKey, cacheMaxAge, deps = [] } = opts;


  const [items, setItemsState] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);


  // Page-1 sequence: only the newest page-1 request (and the
  // load-mores started under it) may touch state
  const seqRef = useRef(0);


  // Pagination cursor state that async flows read directly
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const firstLoadRef = useRef(false);
  const loadingMoreRef = useRef(false);


  // Shadow of items — kept in lockstep at every mutation point
  // (see file header)
  const itemsRef = useRef<T[]>([]);


  // Latest fetchPage closure — refresh/loadMore long after
  // mount must see current props/state, not mount-time captures
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  });


  // Single write door for full-list replacement
  const replaceItems = (next: T[]) => {
    itemsRef.current = next;
    setItemsState(next);
  };


  // The page-1 pipeline behind mount, deps changes, refresh
  // and network restore; 'initial' shows the full spinner and
  // clears the previous list, 'refresh' works silently
  const loadFirst = async (mode: 'initial' | 'refresh'): Promise<void> => {
    const seq = ++seqRef.current;
    firstLoadRef.current = true;

    if (mode === 'initial') {
      setLoading(true);
      setError(false);
      setCachedAt(null);
      replaceItems([]);
      pageRef.current = 1;
      hasMoreRef.current = true;
    } else {
      setRefreshing(true);
    }

    try {
      const page = await fetchPageRef.current(1);
      if (seq !== seqRef.current) return;

      replaceItems(page.items);
      pageRef.current = 1;
      hasMoreRef.current = page.hasMore;
      setError(false);
      setCachedAt(null);

      // Fire-and-forget: this page is now the offline copy
      if (cacheKey) void cacheSet(cacheKey, page.items);
    } catch {
      if (seq !== seqRef.current) return;

      // Offline fallback — only when nothing live is showing;
      // a failed silent refresh keeps the current list as-is
      if (cacheKey && itemsRef.current.length === 0) {
        const cached = await cacheGet<T[]>(cacheKey, cacheMaxAge);
        if (seq !== seqRef.current) return;
        if (cached) {
          replaceItems(cached.data);
          pageRef.current = 1;
          hasMoreRef.current = false; // no live continuation of a cached page
          setCachedAt(cached.cachedAt);
          setError(false);
          return;
        }
      }

      setError(itemsRef.current.length === 0);
    } finally {
      if (seq === seqRef.current) {
        firstLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  };


  // Append the next page. Guards: one at a time, never during
  // a page-1 load, never past the end (a cached fallback has
  // hasMore forced off). Failures keep hasMore so the next
  // onEndReached retries the same page.
  const loadMore = useCallback((): void => {
    if (firstLoadRef.current || loadingMoreRef.current || !hasMoreRef.current) {
      return;
    }

    // Deliberately NOT bumped: page-1 loads supersede this
    // request, this request supersedes nothing
    const seq = seqRef.current;
    const nextPage = pageRef.current + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    void (async () => {
      try {
        const page = await fetchPageRef.current(nextPage);
        if (seq !== seqRef.current) return;

        // Functional update so a concurrent optimistic
        // setItems is merged, not overwritten
        setItemsState((previous) => {
          const merged = [...previous, ...page.items];
          itemsRef.current = merged;
          return merged;
        });
        pageRef.current = nextPage;
        hasMoreRef.current = page.hasMore;
      } catch {
        // Retryable — see the banner
      } finally {
        if (seq === seqRef.current) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    })();
  }, []);


  // Optimistic-update door for screens (likes, deletes, pins);
  // the updater form makes exact reverts race-safe
  const setItems = useCallback((updater: (current: T[]) => T[]): void => {
    setItemsState((previous) => {
      const next = updater(previous);
      itemsRef.current = next;
      return next;
    });
  }, []);


  // First page — full spinner — on mount and every deps
  // change; the caller owns the dependency list, exactly like
  // a bare useEffect, so the static check is opted out
  useEffect(() => {
    void loadFirst('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);


  // Back online: refetch page 1 — silently behind the current
  // list, with the full spinner when nothing is on screen
  useNetworkRestore(() => {
    void loadFirst(itemsRef.current.length === 0 ? 'initial' : 'refresh');
  });


  return {
    items,
    loading,
    refreshing,
    loadingMore,
    error,
    cachedAt,
    refresh: () => loadFirst('refresh'),
    loadMore,
    setItems,
  };
}
