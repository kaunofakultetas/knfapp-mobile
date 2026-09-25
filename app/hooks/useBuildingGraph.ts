// -----------------------------------------------------------
//  [*] Hooks — useBuildingGraph
//
//  The building graph the map tab routes over, from the best
//  source at hand: the bundled seed at once (the tab works
//  with no network and no login), the cached copy of the last
//  published graph if it is newer, and the server's when it
//  answers — revalidated with the cached ETag on mount and on
//  every network restore, so a phone that already holds the
//  current revision pays a 304. Revisions decide, never
//  timestamps: the seed is revision 0, every publish counts
//  up, and a candidate only replaces what is shown when its
//  revision is higher. The graph object is stable between
//  updates — the engine memoises its index on identity. A
//  candidate the engine could not index (not an object with
//  the four arrays) is never shown: a damaged cached copy
//  would otherwise crash the tab on every open, since the
//  cache outlives restarts — and its ETag is not sent either,
//  so the server answers a whole fresh copy that replaces it.
//  A fresh server graph also warms the plan cache for every
//  level (prefetchPlans), so the plan view works offline on
//  floors the student has not opened yet.
//
//  Used by:
//    - components/map/WayfindHost.tsx — the provider's graph
// -----------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

import { prefetchPlans } from '@/hooks/usePlanXml';
import { fetchBuildingGraph } from '@/services/api';
import { cacheKeyWayfindGraph } from '@/services/cacheKeys';
import { KNF_BUILDING_ID, KNF_GRAPH } from '@/services/wayfind/seed';
import { useDataEngine } from '@knf/dataengine';
import type { BuildingGraph } from '@knf/wayfindengine';


// The cached copy carries its ETag so a cold start still
// revalidates cheaply
interface StoredGraph {
  graph: BuildingGraph;
  etag: string | null;
}







// -----------------------------------------------------------
// BuildingGraphState
// -----------------------------------------------------------
//
// What the hook answers: the graph to route over and which
// source it came from.
//
// Used by:
//   - useBuildingGraph (below) — the return shape
//   - components/map/WayfindHost.tsx — destructures graph
// -----------------------------------------------------------

export interface BuildingGraphState {
  graph: BuildingGraph;
  source: 'seed' | 'cache' | 'server';
}







// -----------------------------------------------------------
// revisionOf
// -----------------------------------------------------------
//
// A graph without a numeric revision counts as revision 0 —
// the seed's rank.
//
// Used by:
//   - useBuildingGraph (below) — the adopt comparisons
// -----------------------------------------------------------

const revisionOf = (graph: BuildingGraph): number => (typeof graph.revision === 'number' ? graph.revision : 0);







// -----------------------------------------------------------
// isBuildingGraph
// -----------------------------------------------------------
//
// Whether a candidate is a graph the engine can index without
// throwing — an object whose levels, nodes, edges and rooms
// are arrays. The server only ever publishes that shape; this
// guards what a proxy or a storage bug might hand over instead.
//
// Used by:
//   - useBuildingGraph (below) — the cached copy and every
//     server answer
// -----------------------------------------------------------

export const isBuildingGraph = (value: unknown): value is BuildingGraph => {
  if (!value || typeof value !== 'object') return false;
  const graph = value as Record<string, unknown>;
  return ['levels', 'nodes', 'edges', 'rooms'].every((key) => Array.isArray(graph[key]));
};







// -----------------------------------------------------------
// useBuildingGraph
// -----------------------------------------------------------
//
//   useBuildingGraph()            — the KNF building
//   useBuildingGraph(buildingId)  — another building's graph
//
// Used by:
//   - components/map/WayfindHost.tsx — the provider's graph
// -----------------------------------------------------------

export function useBuildingGraph(buildingId: string = KNF_BUILDING_ID): BuildingGraphState {

  const { cache, onRestore } = useDataEngine();
  const [state, setState] = useState<BuildingGraphState>({ graph: KNF_GRAPH, source: 'seed' });


  // The ETag travels with the cached copy so a cold start still
  // revalidates cheaply; it is read through a ref because the
  // restore listener must not re-subscribe per fetch
  const etagRef = useRef<string | null>(null);
  const revisionRef = useRef(revisionOf(KNF_GRAPH));

  const adopt = (graph: BuildingGraph, source: BuildingGraphState['source']) => {
    if (revisionOf(graph) <= revisionRef.current && source !== 'server') return;
    if (revisionOf(graph) < revisionRef.current) return;
    revisionRef.current = revisionOf(graph);
    setState({ graph, source });
  };


  useEffect(() => {
    let alive = true;
    const key = cacheKeyWayfindGraph(buildingId);

    const revalidate = async () => {
      try {
        const answer = await fetchBuildingGraph(buildingId, etagRef.current);
        if (!alive || answer.kind === 'unchanged' || !isBuildingGraph(answer.graph)) return;
        etagRef.current = answer.etag;
        adopt(answer.graph, 'server');
        void cache.set<StoredGraph>(key, { graph: answer.graph, etag: answer.etag });
        void prefetchPlans(answer.graph, cache);
      } catch {
        // Offline or a server without a published map — the seed
        // or the cache stands
      }
    };

    void (async () => {
      const cached = await cache.get<StoredGraph>(key);
      if (!alive) return;
      // A damaged copy lends neither its graph nor its ETag
      if (cached && isBuildingGraph(cached.data?.graph)) {
        etagRef.current = cached.data.etag;
        adopt(cached.data.graph, 'cache');
      }
      await revalidate();
    })();

    const stop = onRestore(() => {
      void revalidate();
    });
    return () => {
      alive = false;
      stop();
    };
  }, [buildingId, cache, onRestore]);


  return state;
}
