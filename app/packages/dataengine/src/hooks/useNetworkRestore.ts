// -----------------------------------------------------------
//  [*] dataengine — useNetworkRestore
//
//  Run a callback each time connectivity returns — the bridge
//  to the provider's restore bus for anything that shows
//  cached or stale data. The callback is held in a ref:
//  consumers pass inline closures freely, the subscription is
//  created once and always invokes the closure from the
//  latest render — no per-render resubscribe, no stale
//  captures.
//
//  What counts as a restore is the provider's business, not
//  this hook's: an offline→online transition of the injected
//  network source, or the host calling signalRestore() for a
//  reason the network layer cannot see (a realtime socket
//  reconnecting). This hook only relays.
//
//  Used by:
//    - hooks/useLoad.ts, hooks/useFeed.ts — automatic refetch
//    - host screens holding ad-hoc data outside those hooks
// -----------------------------------------------------------

import { useEffect, useRef } from 'react';

import { useDataEngine } from '../provider';







// -----------------------------------------------------------
// useNetworkRestore
// -----------------------------------------------------------
//
//   useNetworkRestore(() => refetch())   — run the latest
//                                          closure each time
//                                          connectivity returns
//
// Used by:
//   - hooks/useLoad.ts, hooks/useFeed.ts — automatic refetch
//   - host screens holding ad-hoc data outside those hooks
// -----------------------------------------------------------

export function useNetworkRestore(callback: () => void): void {
  const { onRestore } = useDataEngine();


  // Latest-closure ref, updated after every render — the
  // long-lived subscription below never runs a stale callback
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });


  // Subscribe once per provider identity (the env is memoized
  // for the provider's lifetime, so this is once per mount)
  useEffect(
    () => onRestore(() => callbackRef.current()),
    [onRestore],
  );
}
