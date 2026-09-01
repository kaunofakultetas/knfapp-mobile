// -----------------------------------------------------------
//  [*] Hooks — usePlanXml
//
//  The SVG text of one level's plan. A bundled reference
//  ('plan:L1') answers at once from the seed; a server
//  reference ('/api/wayfind/plans/<sha>.svg') is fetched once
//  and kept under its hash without a TTL — the name IS the
//  content, so it never goes stale. Null while a server plan
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


export function usePlanXml(reference: string | null | undefined): string | null {

  const { cache } = useDataEngine();
  const bundled = reference ? (BUNDLED_PLANS[reference] ?? null) : null;
  const [fetched, setFetched] = useState<{ reference: string; xml: string } | null>(null);


  useEffect(() => {
    if (!reference || bundled || !reference.startsWith('/api/')) return;
    let alive = true;
    void (async () => {
      const key = cacheKeyWayfindPlan(reference);
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
