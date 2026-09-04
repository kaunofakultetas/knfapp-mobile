// -----------------------------------------------------------
//  [*] notifyuikit — useStoreValue
//
//  One engine store into one React state: subscribes on mount
//  (the store fires immediately with the current value, so
//  there is no first-frame gap), unsubscribes on unmount, and
//  re-subscribes if the host swaps the store instance.
//
//  Used by:
//    - PermissionGate.tsx / NotifySettingsPanel.tsx
// -----------------------------------------------------------

import { useCallback, useSyncExternalStore } from 'react';

import type { StoreLike } from '../core/types';


export function useStoreValue<T>(store: StoreLike<T>): T {
  // useSyncExternalStore re-reads the snapshot after
  // subscribing, so a change in the render-to-subscribe gap can
  // never leave a stale value on screen — including for stores
  // that only fire on CHANGE
  const subscribe = useCallback((onChange: () => void) => store.subscribe(() => onChange()), [store]);
  const getValue = useCallback(() => store.get(), [store]);
  return useSyncExternalStore(subscribe, getValue);
}
