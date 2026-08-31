// -----------------------------------------------------------
//  [*] dataengine — provider
//
//  The one context every hook reads: the storage the cache
//  persists through, the network source, the shared cache
//  instance, and the restore bus. All of it has a working
//  zero-dependency default — a bare <DataEngineProvider> is
//  fully functional (memory storage, permanently online), and
//  a host upgrades piece by piece: AsyncStorage for real
//  offline copies, a netinfo wrapper for restore-on-reconnect.
//
//  Restore semantics: the bus fires when the network source
//  reports offline→online, and whenever the host calls
//  signalRestore() — the escape hatch for restore reasons the
//  network layer cannot see (a realtime socket reconnecting
//  after a server restart). Listeners never receive the
//  initial state, only transitions.
//
//  Used by:
//    - hooks/useNetworkRestore.ts — the restore bus
//    - hooks/useLoad.ts, hooks/useFeed.ts — via useNetworkRestore
//    - hooks/useFeed.ts — the cache instance
// -----------------------------------------------------------

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { createCache, type CacheHandle } from '../core/cache';
import { alwaysOnline, type NetworkSource } from '../core/network';
import { memoryStorage, type KeyValueStorage } from '../core/storage';


export interface DataEngineEnv {
  storage: KeyValueStorage;
  network: NetworkSource;
  cache: CacheHandle;
  // Subscribe to restore events (offline→online, signalRestore);
  // returns the unsubscribe
  onRestore(listener: () => void): () => void;
  // The host's own restore reason (a socket reconnect) — fans
  // out to every onRestore listener
  signalRestore(): void;
}

const DataEngineContext = createContext<DataEngineEnv | null>(null);







// -----------------------------------------------------------
// DataEngineProvider
// -----------------------------------------------------------
//
// Props are captured on first render — swapping storage or
// network mid-flight is not supported (a provider lives as
// long as its subtree; remount to reconfigure).
//
// Used by:
//   - the host app's root layout
//   - every test that mounts a hook
// -----------------------------------------------------------

export function DataEngineProvider({
  storage,
  network,
  children,
}: {
  storage?: KeyValueStorage;
  network?: NetworkSource;
  children: ReactNode;
}) {

  const storageRef = useRef<KeyValueStorage | null>(null);
  if (storageRef.current === null) storageRef.current = storage ?? memoryStorage();
  const networkRef = useRef<NetworkSource | null>(null);
  if (networkRef.current === null) networkRef.current = network ?? alwaysOnline();


  const env = useMemo<DataEngineEnv>(() => {
    const listeners = new Set<() => void>();
    // Guarded per listener: one throwing subscriber must not
    // block the rest of the fan-out (a screen's refetch closure
    // can throw on a half-unmounted tree)
    const fire = () =>
      listeners.forEach((fn) => {
        try {
          fn();
        } catch {
          // The restore bus reports nothing back — a bad listener
          // is its owner's bug, not the other screens' outage
        }
      });
    return {
      storage: storageRef.current as KeyValueStorage,
      network: networkRef.current as NetworkSource,
      cache: createCache(storageRef.current as KeyValueStorage),
      onRestore(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      signalRestore: fire,
    };
  }, []);


  // Offline→online transitions become restore events; the
  // previous state is tracked so a source that re-announces
  // "online" while already online fires nothing
  useEffect(() => {
    let online = env.network.isOnline();
    return env.network.subscribe((next) => {
      const was = online;
      online = next;
      if (!was && next) env.signalRestore();
    });
  }, [env]);


  return <DataEngineContext.Provider value={env}>{children}</DataEngineContext.Provider>;
}







// -----------------------------------------------------------
// useDataEngine
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useNetworkRestore.ts, hooks/useFeed.ts
//   - hosts needing the cache directly (logout clearAll)
// -----------------------------------------------------------

export function useDataEngine(): DataEngineEnv {
  const env = useContext(DataEngineContext);
  if (!env) throw new Error('useDataEngine must be used inside <DataEngineProvider>');
  return env;
}
