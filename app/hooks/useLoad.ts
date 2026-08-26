// -----------------------------------------------------------
//  [*] useLoad — single-shot fetch for one-resource screens
//
//  The load/refresh workhorse behind profile, info, admin
//  stats, poll widgets and every other screen that shows
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
// -----------------------------------------------------------

// Automatic refetch when connectivity returns
import { useNetworkRestore } from '@/hooks/useNetworkRestore';

// Load state and lifecycle guards
import { useEffect, useRef, useState } from 'react';







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
//   - single-resource screens: profile, info, admin stats,
//     poll widgets
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


  // One code path for all four triggers (mount, deps change,
  // refresh, retry); showSpinner marks the "first load" flavor
  const load = async (showSpinner: boolean): Promise<void> => {
    const seq = ++seqRef.current;

    if (showSpinner) {
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
      // Error only when the screen would otherwise show nothing
      setError(dataRef.current === null);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };


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
    refresh: () => load(false),
    retry: () => {
      void load(true);
    },
  };
}
