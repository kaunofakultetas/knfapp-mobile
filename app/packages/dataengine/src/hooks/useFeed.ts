// -----------------------------------------------------------
//  [*] dataengine — useFeed
//
//  Paginated feeds with an offline first page — the engine
//  behind every list screen a host builds: a news feed, a
//  comment thread, a conversation list. One page-1 pipeline
//  serves mount, deps changes, pull-to-refresh and network
//  restore; loadMore appends pages behind it for a FlatList's
//  onEndReached.
//
//  Behavior contract:
//    - loading covers only the FIRST page-1 load per deps
//      combination (mount and deps changes, which also clear
//      the previous list); refresh() runs silently behind the
//      shown items with the refreshing flag for RefreshControl;
//    - refresh('merge') folds the fresh page 1 INTO the loaded
//      list instead of replacing it: new rows are prepended,
//      overlapping rows are updated in place, rows the fresh
//      window covers but no longer lists are dropped, and the
//      pages behind page 1 stay exactly where they are — a
//      reader 60 posts deep keeps their place (a replace
//      shrank the list to one page and the scroll offset
//      clamped them onto a recent post). Only for feeds whose
//      order is "newest first" — a ranked or activity-sorted
//      list must replace; the silentRefreshMode option picks
//      the strategy for the automatic network-restore refresh;
//    - on page-1 success with a cacheKey, the items become the
//      offline copy (written through the provider's cache); on
//      page-1 failure with nothing live to show, the cached
//      copy is served and cachedAt exposes its age for the
//      host's stale-data banner — otherwise error turns true,
//      and ONLY then (screens treat error as "render the error
//      state"; a failed silent refresh keeps the list);
//    - every page-1 request carries a sequence number:
//      superseded responses are dropped, and a page-1 load
//      invalidates any load-more in flight — never the other
//      way around — so out-of-order pages cannot interleave;
//      superseding (and unmount) also fires an AbortSignal,
//      handed to fetchPage, so an adapter that forwards it
//      stops the download instead of finishing it for nothing;
//    - a cached fallback has no live continuation, so hasMore
//      is forced off until a real page 1 succeeds;
//    - setItems(updater) mutates the list in place for
//      optimistic updates (likes, deletes) without a refetch;
//      a silent refresh whose response predates such a
//      mutation is dropped rather than allowed to clobber it.
//
//  itemsRef shadows the items state at every mutation point,
//  so async flows (error semantics, restore spinner mode) read
//  the truth immediately instead of waiting for a commit.
//
//  Used by:
//    - the host's list screens, through the public surface
//    - index.ts — re-exported as part of @knf/dataengine
// -----------------------------------------------------------

// Offline copy of the first page; the provider's cache handle
// carries the epoch fence against a logout wipe racing an
// in-flight request
import { useDataEngine } from '../provider';

// Automatic refetch when connectivity returns
import { useNetworkRestore } from './useNetworkRestore';

// Feed state and lifecycle guards
import { useCallback, useEffect, useRef, useState } from 'react';

// Cache writes wait out animations so a fling never janks
import { InteractionManager } from 'react-native';







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

// How a silent refresh lands on a list that is already showing
export type RefreshStrategy = 'replace' | 'merge';

export interface UseFeedOptions<T = unknown> {
  cacheKey?: string;
  cacheMaxAge?: number;
  deps?: unknown[];
  // Row identity for the load-more dedupe; defaults to `.id`
  getId?: (item: T) => string;
  // Strategy for the automatic network-restore refresh (the
  // explicit refresh() call picks its own); defaults to replace
  silentRefreshMode?: RefreshStrategy;
}

export interface UseFeedResult<T> {
  items: T[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: boolean;
  cachedAt: number | null;
  // The id of the last row ABOVE an unfilled hole (a merge
  // refresh that shared nothing with the held rows), null when
  // the timeline is continuous; loadMore fills the hole
  gapAfterId: string | null;
  refresh: (strategy?: RefreshStrategy) => Promise<void>;
  loadMore: () => void;
  setItems: (updater: (items: T[]) => T[]) => void;
}







// -----------------------------------------------------------
// useFeed
// -----------------------------------------------------------
//
//   const feed = useFeed(fetchPage)               — plain feed
//   const feed = useFeed(fetchPage, {
//     cacheKey: 'feed:news',                      — offline 1st page
//     cacheMaxAge: NEWS_CACHE_MAX_AGE,
//     deps: [source],                             — reload triggers
//   })
//     items / loading / refreshing / loadingMore / error
//     cachedAt          — non-null while showing the offline
//                         copy (the host's stale-banner stamp)
//     refresh()         — RefreshControl onRefresh (replace)
//     refresh('merge')  — focus-return refresh that keeps the
//                         reader's place (newest-first feeds)
//     loadMore()        — FlatList onEndReached
//     setItems(updater) — optimistic updates with exact revert
//
// Used by:
//   - the host's main feeds and sub-feeds (news, comments,
//     conversations, friends, profiles)
// -----------------------------------------------------------

export function useFeed<T>(
  fetchPage: (page: number, signal?: AbortSignal) => Promise<FeedPage<T>>,
  opts: UseFeedOptions<T> = {},
): UseFeedResult<T> {
  const { cacheKey, cacheMaxAge, deps = [], getId, silentRefreshMode = 'replace' } = opts;


  // The provider's cache instance — one per provider, so its
  // epoch fence spans every feed under the same subtree
  const { cache } = useDataEngine();


  const [items, setItemsState] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  // A hole the reader can SEE: after a long absence a merge
  // refresh can share nothing with the held rows — the fresh
  // window and the old tail are stitched with a marker between
  // them instead of faked continuity. loadMore then fills INTO
  // the hole (the paging chain restarts behind the fresh
  // window) until an incoming row overlaps the old section —
  // or the chain exhausts — and the marker goes
  const [gapAfterId, setGapAfterId] = useState<string | null>(null);
  const gapAfterIdRef = useRef<string | null>(null);
  // Rows in the fresh-side section (everything ABOVE the hole)
  const gapIndexRef = useRef(0);
  const setGap = (afterId: string | null, index: number) => {
    gapAfterIdRef.current = afterId;
    gapIndexRef.current = index;
    setGapAfterId(afterId);
  };


  // Page-1 sequence: only the newest page-1 request (and the
  // load-mores started under it) may touch state
  const seqRef = useRef(0);


  // Optimistic-mutation fence: setItems bumps it, and a page-1
  // refresh compares its start-of-request snapshot on landing
  // (see loadFirst) so a stale response never undoes a mutation
  const mutationSeqRef = useRef(0);


  // Abort handle for the requests running under the current
  // sequence — a superseding page-1 load (or unmount) cancels
  // their transport instead of only ignoring the results
  const abortRef = useRef<AbortController | null>(null);


  // Pagination cursor state that async flows read directly
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const firstLoadRef = useRef(false);
  const loadingMoreRef = useRef(false);


  // Shadow of items — kept in lockstep at every mutation point
  // (see file header)
  const itemsRef = useRef<T[]>([]);

  // Whether the rows on screen are the offline copy — a merge
  // must never fold a live page into cached rows (the cached
  // list has no continuation; a real page 1 replaces it)
  const servingCacheRef = useRef(false);


  // Latest fetchPage closure — refresh/loadMore long after
  // mount must see current props/state, not mount-time captures
  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  });


  // Row identity for the load-more dedupe — live-ranked
  // LIMIT/OFFSET windows overlap whenever the backend ordering
  // moves (or an optimistic prepend shifts it) between requests
  const resolveId = getId ?? ((item: T) => (item as { id?: string }).id ?? '');
  const resolveIdRef = useRef(resolveId);
  useEffect(() => {
    resolveIdRef.current = resolveId;
  });


  // Single write door for full-list replacement — the
  // functional form keeps itemsRef and state moving together
  // in commit order when a concurrent setItems shares a batch
  const replaceItems = (next: T[]) => {
    setItemsState(() => {
      itemsRef.current = next;
      return next;
    });
  };


  // Fold a fresh page 1 into the list on screen (see the file
  // header). The "covered depth" is how far down the old list
  // the fresh window still reaches once the rows it prepended
  // are accounted for: an old row inside that depth that the
  // fresh page no longer lists is gone server-side (deleted,
  // or ranked out) and is dropped; rows deeper than that are
  // beyond what page 1 can know and are left untouched
  const mergeFirstPage = (previous: T[], fresh: T[]): T[] => {
    const idOf = resolveIdRef.current;
    const freshById = new Map<string, T>();
    for (const item of fresh) {
      const key = idOf(item);
      if (key !== '') freshById.set(key, item);
    }
    const previousIds = new Set(previous.map(idOf));
    const newOnes = fresh.filter((item) => {
      const key = idOf(item);
      return key === '' || !previousIds.has(key);
    });
    const coveredDepth = Math.max(0, fresh.length - newOnes.length);

    const kept: T[] = [];
    previous.forEach((item, index) => {
      const key = idOf(item);
      const listed = key !== '' && freshById.has(key);
      if (index < coveredDepth && key !== '' && !listed) return;
      kept.push(listed ? (freshById.get(key) as T) : item);
    });
    return [...newOnes, ...kept];
  };


  // The page-1 pipeline behind mount, deps changes, refresh
  // and network restore; 'initial' shows the full spinner and
  // clears the previous list, 'refresh' works silently — by
  // replacing the list or, with the 'merge' strategy, folding
  // the fresh page into it
  const loadFirst = async (
    mode: 'initial' | 'refresh',
    strategy: RefreshStrategy = 'replace',
  ): Promise<void> => {
    const seq = ++seqRef.current;
    // Cancel the superseded transport too — its responses were
    // already doomed by the seq bump, this stops the download
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Wipe fence: cache.clearAll (logout) bumps the epoch, and
    // a request started before the wipe must not write the
    // departing account's data back after it
    const epoch = cache.epoch();
    // Mutation fence: a refresh response generated before an
    // optimistic setItems (like, delete) landed must not put
    // the pre-mutation rows back on screen
    const mutationSeq = mutationSeqRef.current;
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
      const page = await fetchPageRef.current(1, controller.signal);
      if (seq !== seqRef.current) return;

      // Drop a refresh snapshot that raced an optimistic
      // setItems — replacing would flip the mutation back
      // (a like undone by pre-like rows); the mutation's own
      // server reconcile or the next refresh catches up
      if (mode === 'refresh' && mutationSeq !== mutationSeqRef.current) return;

      if (
        mode === 'refresh' &&
        strategy === 'merge' &&
        itemsRef.current.length > 0 &&
        !servingCacheRef.current
      ) {
        const idOf = resolveIdRef.current;
        const held = new Set(itemsRef.current.map(idOf));
        const overlaps = page.items.some((item) => {
          const key = idOf(item);
          return key !== '' && held.has(key);
        });
        if (!overlaps && page.items.length > 0 && !page.hasMore) {
          // The fresh window shares nothing with the held rows
          // AND is the server's whole memory — the old rows are
          // gone upstream; keeping them would show ghosts
          replaceItems(page.items);
          pageRef.current = 1;
          hasMoreRef.current = false;
          setGap(null, 0);
        } else if (!overlaps && page.items.length > 0) {
          // An unknown hole sits between the fresh window and
          // the old tail: mark it, and restart the paging chain
          // behind the FRESH window so loadMore fills the hole
          replaceItems([...page.items, ...itemsRef.current]);
          pageRef.current = 1;
          hasMoreRef.current = true;
          setGap(idOf(page.items[page.items.length - 1]) || null, page.items.length);
        } else {
          // The pages behind page 1 are still on screen, so the
          // paging cursor and hasMore stay exactly as they were;
          // a window touching held rows proves continuity
          replaceItems(mergeFirstPage(itemsRef.current, page.items));
          setGap(null, 0);
        }
      } else {
        replaceItems(page.items);
        pageRef.current = 1;
        hasMoreRef.current = page.hasMore;
        setGap(null, 0);
      }
      servingCacheRef.current = false;
      setError(false);
      setCachedAt(null);

      // Fire-and-forget: this page is now the offline copy.
      // Deferred past interactions (serializing a whole page
      // mid-fling janks the list), re-checking both fences on
      // the far side of the deferral
      // An EMPTY success never overwrites the copy: a transient
      // backend hiccup that 200s an empty list must not destroy
      // the offline fallback it exists for (an empty cache shows
      // nothing offline anyway — old rows beat a blank screen)
      if (cacheKey && page.items.length > 0) {
        InteractionManager.runAfterInteractions(() => {
          if (seq === seqRef.current && epoch === cache.epoch()) {
            void cache.set(cacheKey, page.items);
          }
        });
      }
    } catch {
      if (seq !== seqRef.current) return;

      // Offline fallback — only when nothing live is showing;
      // a failed silent refresh keeps the current list as-is
      if (cacheKey && itemsRef.current.length === 0) {
        const cached = await cache.get<T[]>(cacheKey, cacheMaxAge);
        if (seq !== seqRef.current) return;
        // The epoch check keeps a pre-wipe read from serving
        // the departing account's copy after logout
        if (cached && epoch === cache.epoch()) {
          replaceItems(cached.data);
          pageRef.current = 1;
          hasMoreRef.current = false; // no live continuation of a cached page
          servingCacheRef.current = true;
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


  // Latest loadFirst closure, so the stable refresh callback
  // below never runs a stale capture
  const loadFirstRef = useRef(loadFirst);
  useEffect(() => {
    loadFirstRef.current = loadFirst;
  });


  // Stable identity — screens hand refresh straight to
  // memoized children and effect deps without ref workarounds
  const refresh = useCallback(
    (strategy: RefreshStrategy = 'replace') => loadFirstRef.current('refresh', strategy),
    [],
  );


  // Append the next page. Guards: one at a time, never during
  // a page-1 load, never past the end (a cached fallback has
  // hasMore forced off). Failures keep hasMore so the next
  // onEndReached retries the same page. A page that dedupes to
  // NOTHING new ends paging whatever hasMore claims — the
  // stalled-backend guard; any page-1 load re-arms it.
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
        // Runs under the current page-1 controller, so the
        // page-1 load that supersedes it also aborts it
        const page = await fetchPageRef.current(nextPage, abortRef.current?.signal);
        if (seq !== seqRef.current) return;

        // Functional update so a concurrent optimistic
        // setItems is merged, not overwritten. Incoming rows
        // already on screen are dropped — overlapping OFFSET
        // windows would otherwise become duplicate list keys
        // Computed OUTSIDE the state updater: React double-
        // invokes updaters to surface impurity, and the gap
        // branch is stateful — itemsRef is the synchronous
        // source of truth every writer here maintains
        const idOf = resolveIdRef.current;
        const previous = itemsRef.current;
        const seen = new Set(previous.map(idOf));
        const fresh = page.items.filter((item) => {
          const key = idOf(item);
          return key === '' || !seen.has(key);
        });
        const progressed = fresh.length > 0;


        let merged: T[];
        if (gapAfterIdRef.current === null) {
          // No hole: pages append at the tail as ever
          merged = [...previous, ...fresh];
        } else {
          // Filling the hole: the page continues the FRESH
          // window, so its rows land AT the marker. The hole
          // closes when the page reaches rows the old tail
          // already holds (overlap = continuity re-proven) or
          // when the chain exhausts
          const gapIndex = gapIndexRef.current;
          const oldSection = new Set(previous.slice(gapIndex).map(idOf));
          const reachedOld = page.items.some((item) => {
            const key = idOf(item);
            return key !== '' && oldSection.has(key);
          });
          merged = [...previous.slice(0, gapIndex), ...fresh, ...previous.slice(gapIndex)];
          if (reachedOld || !page.hasMore || fresh.length === 0) {
            setGap(null, 0);
          } else {
            setGap(idOf(fresh[fresh.length - 1]) || gapAfterIdRef.current, gapIndex + fresh.length);
          }
        }
        itemsRef.current = merged;
        setItemsState(merged);
        pageRef.current = nextPage;
        // Stall guard: a page that deduped to NOTHING new ends
        // paging whatever hasMore claims — a backend that ignores
        // its offset (or re-ranks live) returns the same window
        // with hasMore true forever, and onEndReached would
        // hammer it in a loop. Any page-1 load re-arms paging
        // from the fresh response
        hasMoreRef.current = progressed ? page.hasMore : false;
      } catch {
        // Retryable — see the banner
      } finally {
        // Unconditional: a page-1 load that superseded this
        // request never clears the flags on our behalf, and a
        // stuck loadingMoreRef would kill pagination for good
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    })();
  }, []);


  // Optimistic-update door for screens (likes, deletes, pins);
  // the updater form makes exact reverts race-safe
  const setItems = useCallback((updater: (current: T[]) => T[]): void => {
    // Move the fence, so an in-flight silent refresh knows its
    // response predates this mutation and drops itself
    mutationSeqRef.current += 1;
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


  // Unmount: bump the seq so every in-flight handler drops on
  // the floor, then cancel the transport itself
  useEffect(
    () => () => {
      seqRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );


  // Back online: refetch page 1 — silently behind the current
  // list, with the full spinner when nothing is on screen
  useNetworkRestore(() => {
    void loadFirst(itemsRef.current.length === 0 ? 'initial' : 'refresh', silentRefreshMode);
  });


  return {
    items,
    loading,
    refreshing,
    loadingMore,
    error,
    cachedAt,
    gapAfterId,
    refresh,
    loadMore,
    setItems,
  };
}
