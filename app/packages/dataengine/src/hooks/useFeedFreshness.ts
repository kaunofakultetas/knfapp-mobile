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







// -----------------------------------------------------------
// UseFeedFreshnessResult
// -----------------------------------------------------------
//
// What the hook returns — the count plus the two levers that
// move it.
//
// Used by:
//   - useFeedFreshness (below) — the return shape
// -----------------------------------------------------------

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


  // The latest verdict, stamped with the baseline it was
  // measured against — a count belongs to ONE newest id
  const [probe, setProbe] = useState<{ baseline: string | null; count: number }>({
    baseline: newestId,
    count: 0,
  });


  // The refresh landed (or the feed changed identity): current
  // again by definition. Adjusted DURING render — the pattern
  // React documents for state that follows a prop — instead of
  // an effect-time reset that committed a stale count first
  if (probe.baseline !== newestId) {
    setProbe({ baseline: newestId, count: 0 });
  }
  const newCount = probe.baseline === newestId ? probe.count : 0;


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
        setProbe({ baseline, count: 0 });
        return;
      }
      const at = ids.indexOf(baseline);
      // Baseline not in the window: everything peeked is newer
      // (bounded by the peek's own size)
      setProbe({ baseline, count: at >= 0 ? at : ids.length });
    } catch {
      // Freshness is best-effort; the old count stands
    } finally {
      probingRef.current = false;
    }
  }, []);


  // The baseline a resolving probe measures against — the ref
  // follows the prop after commit (the count itself resets
  // during render, above)
  useEffect(() => {
    newestIdRef.current = newestId;
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


  const clear = useCallback(() => setProbe((current) => ({ ...current, count: 0 })), []);


  return { newCount, checkNow, clear };
}
