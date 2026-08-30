// -----------------------------------------------------------
//  [*] dataengine — useLoad
//
//  Single-shot fetch for one-resource screens — the
//  load/refresh workhorse behind any screen that shows
//  exactly one resource. Behavior contract:
//    - loading is true only for the FIRST load of a given
//      deps combination — mount and every deps change, which
//      also clears data so the previous entity never flashes;
//    - refresh() re-fetches silently and keeps the current
//      data visible (pull-to-refresh);
//    - every fetch carries a sequence number; a superseded
//      response is dropped, so out-of-order answers can never
//      put stale data on screen;
//    - error is true only when a load failed AND there is
//      nothing to show — screens can treat it directly as
//      "render ErrorState"; a failed silent refresh keeps the
//      data on screen instead of swapping it for an error;
//    - connectivity returning triggers an automatic refetch —
//      silent behind shown data, full spinner over nothing.
//
//  The fetcher lives in a ref: refresh() always runs the
//  closure from the latest render, so captured props and
//  state are never stale.
//
//  Used by:
//    - the host's single-resource screens (a profile, an info
//      page, a stats panel, a poll widget)
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import { useNetworkRestore } from './useNetworkRestore';







// -----------------------------------------------------------
// UseLoadResult
// -----------------------------------------------------------
//
// Used by:
//   - useLoad (below)
//   - single-resource screens typing their load state
// -----------------------------------------------------------

export interface UseLoadResult<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  retry: () => void;
}







// -----------------------------------------------------------
// useLoad
// -----------------------------------------------------------
//
//   const { data, loading, error, refresh, retry } =
//     useLoad(() => fetchProfile(userId), [userId])
//     data    — T | null; null until the first success
//     loading — spinner flag for the current deps' first load
//     error   — failed with nothing to show → ErrorState
//     refresh — silent refetch, keeps data (pull-to-refresh)
//     retry   — full reload with spinner (ErrorState button)
//
// Used by:
//   - the host's single-resource screens
// -----------------------------------------------------------

export function useLoad<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): UseLoadResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);


  // Only the response matching the newest request may write —
  // the whole out-of-order and post-supersede protection
  const seqRef = useRef(0);


  // Mirror of data for decisions inside async flows (error
  // semantics, restore spinner mode) without stale closures
  const dataRef = useRef<T | null>(null);


  // Latest fetcher closure — a refresh() long after mount must
  // see current props/state, not the mount-time capture
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });


  // The seq of the initial (spinner) load still in flight, or
  // null — a silent refresh failing FASTER than a slow first
  // load must not flag an error the screen would show while
  // that first load is still on its way
  const pendingInitialSeqRef = useRef<number | null>(null);


  // One code path for all four triggers (mount, deps change,
  // refresh, retry); showSpinner marks the "first load" flavor
  const load = async (showSpinner: boolean): Promise<void> => {
    const seq = ++seqRef.current;

    if (showSpinner) {
      pendingInitialSeqRef.current = seq;
      setLoading(true);
      setError(false);
      // A deps change must not flash the previous entity
      setData(null);
      dataRef.current = null;
    }

    try {
      const result = await fetcherRef.current();
      if (seq !== seqRef.current) return;
      setData(result);
      dataRef.current = result;
      setError(false);
    } catch {
      if (seq !== seqRef.current) return;
      // A failed silent refresh defers to an initial load that
      // is still pending (see pendingInitialSeqRef above)
      if (!showSpinner && pendingInitialSeqRef.current !== null) return;
      // Error only when the screen would otherwise show nothing
      setError(dataRef.current === null);
    } finally {
      if (pendingInitialSeqRef.current === seq) pendingInitialSeqRef.current = null;
      if (seq === seqRef.current) setLoading(false);
    }
  };


  // Latest load closure, so the stable refresh/retry callbacks
  // below never run a stale capture
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });


  // Stable identities — screens hand these straight to
  // memoized children and effect deps without ref workarounds
  const refresh = useCallback(() => loadRef.current(false), []);
  const retry = useCallback(() => {
    void loadRef.current(true);
  }, []);


  // First load — with spinner — on mount and every deps
  // change; the caller owns the dependency list, exactly like
  // a bare useEffect, so the static check is opted out
  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);


  // Back online: silent refetch behind shown data, full
  // spinner when the screen shows nothing yet
  useNetworkRestore(() => {
    void load(dataRef.current === null);
  });


  return {
    data,
    loading,
    error,
    refresh,
    retry,
  };
}
