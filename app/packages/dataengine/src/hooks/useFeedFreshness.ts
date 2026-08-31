// -----------------------------------------------------------
//  [*] dataengine — useFeedFreshness
//
//  The cheap "new posts" probe behind a jump-to-top pill: on
//  an interval (only while the app is foregrounded), ask the
//  host's `peek` for the newest few ids and count how many sit
//  AHEAD of the newest row the feed already holds. Counting
//  ids-ahead — instead of diffing totals — means deletions and
//  re-rankings can never inflate the number, and the count is
//  naturally bounded by how many ids the peek returns.
//
//  The count clears itself when the feed's newest id changes
//  (the refresh landed) and by clear() (the reader tapped the
//  pill). A peek that fails stays silent — freshness is a
//  convenience, never an error state.
//
//  Used by:
//    - hosts feeding a new-posts pill (@knf/socialuikit's
//      NewPostsPill takes exactly this count)
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';


export interface UseFeedFreshnessResult {
  // How many peeked ids sit ahead of the feed's newest row —
  // 0 while the feed is current
  newCount: number;
  // Probe immediately (a screen focus, a pull hint)
  checkNow: () => Promise<void>;
  // The reader acted (tapped the pill, refreshed by hand)
  clear: () => void;
}







// -----------------------------------------------------------
// useFeedFreshness
// -----------------------------------------------------------
//
//   const { newCount, clear } = useFeedFreshness(
//     feed.items[0]?.id ?? null,
//     () => fetchNewestIds(),        — a page-1 ids peek
//     { intervalMs: 60_000 },
//   );
//
// Used by:
//   - list screens with a new-posts pill
// -----------------------------------------------------------

export function useFeedFreshness(
  newestId: string | null,
  peek: () => Promise<string[]>,
  options: { intervalMs?: number; enabled?: boolean } = {},
): UseFeedFreshnessResult {

  const intervalMs = options.intervalMs ?? 60_000;
  const enabled = options.enabled ?? true;

  const [newCount, setNewCount] = useState(0);


  // The latest closure and baseline, without resubscribing the
  // interval per render
  const peekRef = useRef(peek);
  const newestIdRef = useRef(newestId);
  useEffect(() => {
    peekRef.current = peek;
  });

  // A fetch already on the wire absorbs concurrent ticks
  const probingRef = useRef(false);


  const checkNow = useCallback(async () => {
    if (probingRef.current) return;
    probingRef.current = true;
    try {
      const ids = await peekRef.current();
      const baseline = newestIdRef.current;
      if (baseline === null) {
        setNewCount(0);
        return;
      }
      const at = ids.indexOf(baseline);
      // Baseline not in the window: everything peeked is newer
      // (bounded by the peek's own size)
      setNewCount(at >= 0 ? at : ids.length);
    } catch {
      // Freshness is best-effort; the old count stands
    } finally {
      probingRef.current = false;
    }
  }, []);


  // The refresh landed (or the feed changed identity): current
  // again by definition
  useEffect(() => {
    newestIdRef.current = newestId;
    setNewCount(0);
  }, [newestId]);


  // The interval, gated on the app being foregrounded. The
  // AppState mock's currentState is a function under jest —
  // anything non-string reads as active
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const state = AppState.currentState;
      if (typeof state === 'string' && state !== 'active') return;
      void checkNow();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, checkNow]);


  const clear = useCallback(() => setNewCount(0), []);


  return { newCount, checkNow, clear };
}
