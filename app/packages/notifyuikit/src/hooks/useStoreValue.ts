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
//    - the host's settings screen, on engine stores directly
// -----------------------------------------------------------

import { useCallback, useSyncExternalStore } from 'react';

import type { StoreLike } from '../core/types';







// -----------------------------------------------------------
// useStoreValue
// -----------------------------------------------------------
//
//   const perm = useStoreValue(engine.permission)   — any
//     engine store (or StoreLike) as live React state
//
// Used by:
//   - PermissionGate.tsx / NotifySettingsPanel.tsx
//   - the host's settings screen, on engine stores directly
// -----------------------------------------------------------

export function useStoreValue<T>(store: StoreLike<T>): T {
  // useSyncExternalStore re-reads the snapshot after
  // subscribing, so a change in the render-to-subscribe gap can
  // never leave a stale value on screen — including for stores
  // that only fire on CHANGE
  const subscribe = useCallback((onChange: () => void) => store.subscribe(() => onChange()), [store]);
  const getValue = useCallback(() => store.get(), [store]);
  return useSyncExternalStore(subscribe, getValue);
}
