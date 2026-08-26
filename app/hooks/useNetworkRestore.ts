// -----------------------------------------------------------
//  [*] useNetworkRestore — refetch when the device comes back
//
//  Thin bridge to NetworkContext's restore events for anything
//  that shows cached or stale data. The callback is held in a
//  ref: consumers pass inline closures freely, the
//  subscription is created once and always invokes the closure
//  from the latest render — no per-render resubscribe, no
//  stale captures.
// -----------------------------------------------------------

// Restore events come from the connectivity provider
import { useNetwork } from '@/context/NetworkContext';

// Ref-held callback keeps the subscription stable
import { useEffect, useRef } from 'react';







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
//   - screens holding ad-hoc data outside those hooks
// -----------------------------------------------------------

export function useNetworkRestore(callback: () => void): void {
  const { onNetworkRestore } = useNetwork();


  // Latest-closure ref, updated after every render — the
  // long-lived subscription below never runs a stale callback
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });


  // Subscribe once per provider identity (NetworkContext
  // memoizes onNetworkRestore, so this is once per mount)
  useEffect(
    () => onNetworkRestore(() => callbackRef.current()),
    [onNetworkRestore],
  );
}
