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
//  nothing) and null for a reference nothing resolves.
//
//  Used by:
//    - app/(main)/tabs/map.tsx — the plan view
// -----------------------------------------------------------

import { useEffect, useState } from 'react';

import { fetchPlanXml } from '@/services/api';
import { cacheKeyWayfindPlan } from '@/services/cacheKeys';
import { BUNDLED_PLANS } from '@/services/wayfind/seed';
import { useDataEngine } from '@knf/dataengine';


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

  const { cache } = useDataEngine();
  const bundled = reference ? (BUNDLED_PLANS[reference] ?? null) : null;
  const [fetched, setFetched] = useState<{ reference: string; xml: string } | null>(null);


  useEffect(() => {
    if (!reference || bundled || !reference.startsWith('/api/')) return;
    let alive = true;
    void (async () => {
      const key = `${cacheKeyWayfindPlan(reference)}:${PLAN_CACHE_VERSION}`;
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
        // Offline without a cached copy — the overlay still draws
      }
    })();
    return () => {
      alive = false;
    };
  }, [reference, bundled, cache]);


  if (bundled) return bundled;
  return fetched && fetched.reference === reference ? fetched.xml : null;
}
