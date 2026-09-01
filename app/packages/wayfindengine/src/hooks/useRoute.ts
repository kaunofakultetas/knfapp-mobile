// -----------------------------------------------------------
//  [*] wayfindengine — useRoute
//
//  The route between two nodes, memoised: the search runs
//  again only when an endpoint, the graph or an option
//  actually changes, so a screen may pass an inline options
//  literal and still hold one Route object across renders — a
//  new object would restart the navigation cursor beneath it.
//  Options are compared by content, not identity, for exactly
//  that reason — through the provider's routingKey, so the
//  order the fields are spelt in does not count either, and
//  the provider's own defaults arrive identity-stable the same
//  way.
//
//  The provider's routing options are the building's defaults
//  (the faculty may refuse a closed stairwell for everyone);
//  the call's options win field by field on top of them, and
//  walkingSpeeds merges one level deeper so a call that slows
//  the stairs keeps the provider's hallway pace. `avoid` is a
//  whole intent and replaces the list.
//
//  A null endpoint is 'idle' — the screen has not chosen yet —
//  distinct from the router's 'unknown_node' (chosen, but not
//  in the graph) and 'no_path'.
//
//  Used by:
//    - src/index.ts — public surface; the host's map screen
//      routes from the entrance (or a scanned node) to the
//      picked room
// -----------------------------------------------------------

import { useMemo } from 'react';

import { findRoute } from '../core/route';
import type { Route, RoutingOptions } from '../core/types';
import { routingKey, useWayfind } from '../provider';


export interface UseRouteResult {
  route: Route | null;
  // Why route is null; null when there is a route
  reason: 'unknown_node' | 'no_path' | 'idle' | null;
}

const IDLE: UseRouteResult = { route: null, reason: 'idle' };







// -----------------------------------------------------------
// useRoute
// -----------------------------------------------------------
//
//   const { route, reason } = useRoute(fromNodeId, toNodeId)
//   useRoute(from, to, { accessibility: 'accessible' })
//
// Used by:
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function useRoute(fromNodeId: string | null, toNodeId: string | null, options?: RoutingOptions): UseRouteResult {

  const env = useWayfind();


  // The canonical serialisation is the call's identity — an
  // inline literal re-created every render changes nothing —
  // and the merge reads the call's options back out of the
  // key, so it depends on exactly what it uses
  const optionsKey = routingKey(options);
  const merged = useMemo<RoutingOptions>(() => {
    const call: RoutingOptions = JSON.parse(optionsKey) ?? {};
    const result: RoutingOptions = { ...env.routing, ...call };
    if (env.routing.walkingSpeeds || call.walkingSpeeds) {
      result.walkingSpeeds = { ...env.routing.walkingSpeeds, ...call.walkingSpeeds };
    }
    return result;
  }, [env.routing, optionsKey]);


  return useMemo<UseRouteResult>(() => {
    if (fromNodeId == null || toNodeId == null) return IDLE;
    const { route, reason } = findRoute(env.index, fromNodeId, toNodeId, merged);
    return { route, reason: route ? null : (reason ?? 'no_path') };
  }, [env.index, fromNodeId, toNodeId, merged]);
}
