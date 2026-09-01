// -----------------------------------------------------------
//  [*] wayfindengine — useNavigation
//
//  Walking a route inside a component: one navigation cursor
//  per Route object, subscribed so every move re-renders with
//  the fresh NavigationState. The cursor lives exactly as long
//  as its route's identity — hand in a new Route (a re-route
//  after an off-route scan, a new destination) and the walker
//  starts at its first point; hand in null and there is
//  nothing to walk, so the state is null and every action is
//  inert (snapTo answers 'off-route', which is what a host
//  with no route should do with a scan anyway: route from
//  that node).
//
//  The state object is the cursor's own — identical between
//  moves, a different object after one — so it can be a memo
//  or effect dependency as it is. The actions are stable per
//  route as well; a move that changes nothing (next at the
//  end, an off-route snap) renders nothing.
//
//  advanceBySteps is the pedometer bridge: steps times the
//  provider's stride length, handed to the cursor's odometer,
//  which carries the overshoot between points and never walks
//  backwards. reset returns to the first point — a jump, so a
//  step count that trickles in afterwards measures from the
//  start.
//
//  Used by:
//    - src/index.ts — public surface; the host's route sheet
//      (Back / Next, the pano stage's marker yaw, the
//      pedometer nudge)
// -----------------------------------------------------------

import { useMemo, useSyncExternalStore } from 'react';

import { createNavigation, type Navigation } from '../core/navigation';
import type { NavigationState, Route } from '../core/types';
import { useWayfind } from '../provider';


export interface UseNavigationResult {
  state: NavigationState | null;
  next: () => void;
  back: () => void;
  jumpTo: (index: number) => void;
  // 'on-route' moved the cursor; 'off-route' changed nothing —
  // the host re-routes from that node
  snapTo: (nodeId: string) => 'on-route' | 'off-route';
  advanceByDistance: (metres: number) => void;
  // steps × the provider's strideM, through advanceByDistance
  advanceBySteps: (steps: number) => void;
  reset: () => void;
}


// Without a route there is nothing to subscribe to
const noSubscription = () => () => {};







// -----------------------------------------------------------
// useNavigation
// -----------------------------------------------------------
//
//   const nav = useNavigation(route)
//   nav.state?.step                — the instruction to show
//   nav.next() / nav.back()        — the sheet's buttons
//   nav.snapTo(scannedNodeId)      — 'off-route' → re-route
//   nav.advanceBySteps(delta)      — the pedometer's step delta
//
// Used by:
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function useNavigation(route: Route | null): UseNavigationResult {

  const env = useWayfind();


  // One cursor per route identity: a new Route object is a new
  // walk from its first point
  const nav = useMemo<Navigation | null>(() => (route ? createNavigation(env.index, route) : null), [env.index, route]);


  // The cursor is an external store with an identity-stable
  // snapshot, so the subscription re-renders exactly once per
  // move and never tears; a new cursor changes the subscribe
  // function, which re-reads the snapshot from the new one
  const subscribe = useMemo(() => (nav ? nav.subscribe : noSubscription), [nav]);
  const state = useSyncExternalStore(subscribe, () => (nav ? nav.state() : null));


  const actions = useMemo(
    () => ({
      next: () => nav?.next(),
      back: () => nav?.back(),
      jumpTo: (index: number) => nav?.jumpTo(index),
      snapTo: (nodeId: string): 'on-route' | 'off-route' => (nav ? nav.snapTo(nodeId) : 'off-route'),
      advanceByDistance: (metres: number) => nav?.advanceByDistance(metres),
      advanceBySteps: (steps: number) => nav?.advanceByDistance(steps * env.strideM),
      reset: () => nav?.jumpTo(0),
    }),
    [nav, env.strideM],
  );


  return useMemo(() => ({ state, ...actions }), [state, actions]);
}
