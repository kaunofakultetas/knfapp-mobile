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

import { useEffect, useState } from 'react';

import type { StoreLike } from '../core/types';


export function useStoreValue<T>(store: StoreLike<T>): T {
  const [value, setValue] = useState<T>(() => store.get());

  useEffect(() => {
    const unsubscribe = store.subscribe(setValue);
    // Belt for stores that only fire on CHANGE: an explicit
    // re-read closes the render-to-effect gap either way
    setValue(store.get());
    return unsubscribe;
  }, [store]);

  return value;
}
