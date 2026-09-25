// -----------------------------------------------------------
//  [*] Hooks — usePlanXml
//
//  The SVG text of one level's plan. A bundled reference
//  ('plan:L1') answers at once from the seed; a server
//  reference ('/api/wayfind/plans/<sha>.svg') is fetched once
//  and kept under its hash without a TTL — the name IS the
//  content, so it never goes stale (which is also why the key
//  carries PLAN_CACHE_VERSION: the one thing a hash cannot
//  tell apart is a copy the app itself damaged on the way
//  in). Null while a server plan
//  is on its way (the plan viewer draws its overlay over
//  nothing) and null for a reference nothing resolves. A fetch
//  that failed (offline, no cached copy) is tried again on the
//  next network restore, so a student who walks into coverage
//  gets the drawing without leaving the screen.
//
//  prefetchPlans warms the same cache for every level of a
//  graph ahead of time, so a floor the student never opened
//  still draws in a stairwell with no signal.
//
//  Used by:
//    - app/(main)/tabs/map.tsx — the plan view
//    - hooks/useBuildingGraph.ts — prefetchPlans on a server graph
// -----------------------------------------------------------

import { useEffect, useState } from 'react';

import { fetchPlanXml } from '@/services/api';
import { cacheKeyWayfindPlan } from '@/services/cacheKeys';
import { BUNDLED_PLANS } from '@/services/wayfind/seed';
import { useDataEngine, type CacheHandle } from '@knf/dataengine';
import type { BuildingGraph } from '@knf/wayfindengine';


// The fetched-plan cache namespace, appended to every key.
// Bumped to v2 when the API client stopped entity-decoding
// responses: every copy cached before that had its '&amp;',
// '&lt;' and '&quot;' rewritten into bare characters — XML
// that no longer parses — and a content-hash key with no
// maxAge would have served that copy until logout. The v1
// entries are simply never read again; the logout wipe
// clears them.
const PLAN_CACHE_VERSION = 'v2';







// -----------------------------------------------------------
// planCacheKey
// -----------------------------------------------------------
//
// The one key a fetched plan lives under — the hook and the
// prefetch must agree on it to the character.
//
// Used by:
//   - usePlanXml / prefetchPlans (below)
// -----------------------------------------------------------

const planCacheKey = (reference: string): string => `${cacheKeyWayfindPlan(reference)}:${PLAN_CACHE_VERSION}`;







// -----------------------------------------------------------
// prefetchPlans
// -----------------------------------------------------------
//
// Every server-hosted plan of a graph fetched into the cache
// unless it is there already — one at a time, best effort (a
// failure just leaves that floor to the hook's own fetch and
// its restore retry). Bundled references need nothing.
//
// Used by:
//   - hooks/useBuildingGraph.ts — after a server graph lands
// -----------------------------------------------------------

export async function prefetchPlans(graph: BuildingGraph, cache: CacheHandle): Promise<void> {

  for (const level of graph.levels) {
    const reference = typeof level.plan === 'string' ? level.plan : null;
    if (!reference || !reference.startsWith('/api/') || BUNDLED_PLANS[reference]) continue;
    try {
      const key = planCacheKey(reference);
      if (await cache.get<string>(key)) continue;
      await cache.set(key, await fetchPlanXml(reference));
    } catch {
      // Offline or refused — the plan view fetches it when shown
    }
  }
}







// -----------------------------------------------------------
// usePlanXml
// -----------------------------------------------------------
//
//   usePlanXml('plan:L1')       — a bundled seed plan, at once
//   usePlanXml('/api/...svg')   — fetched once, kept by hash
//   usePlanXml(null)            — no reference → null
//
// Used by:
//   - app/(main)/tabs/map.tsx — the plan view
// -----------------------------------------------------------

export function usePlanXml(reference: string | null | undefined): string | null {

  const { cache, onRestore } = useDataEngine();
  const bundled = reference ? (BUNDLED_PLANS[reference] ?? null) : null;
  const [fetched, setFetched] = useState<{ reference: string; xml: string } | null>(null);
  // Bumped by a network restore after a failed fetch — the
  // effect's cue to try again
  const [attempt, setAttempt] = useState(0);


  useEffect(() => {
    if (!reference || bundled || !reference.startsWith('/api/')) return;
    let alive = true;
    let stopRestore: (() => void) | null = null;
    void (async () => {
      const key = planCacheKey(reference);
      const cached = await cache.get<string>(key);
      if (!alive) return;
      if (cached) {
        setFetched({ reference, xml: cached.data });
        return;
      }
      try {
        const xml = await fetchPlanXml(reference);
        if (!alive) return;
        setFetched({ reference, xml });
        void cache.set(key, xml);
      } catch {
        // Offline without a cached copy — the overlay still draws,
        // and the next restore tries again
        if (alive) stopRestore = onRestore(() => setAttempt((n) => n + 1));
      }
    })();
    return () => {
      alive = false;
      stopRestore?.();
    };
  }, [reference, bundled, cache, onRestore, attempt]);


  if (bundled) return bundled;
  return fetched && fetched.reference === reference ? fetched.xml : null;
}
