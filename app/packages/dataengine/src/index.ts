// -----------------------------------------------------------
//  [*] @knf/dataengine — public surface
//
//  Everything a host may import, in one place. The runtime
//  export list is pinned by src/__tests__/surface.test.ts —
//  adding here is deliberate; removing or renaming is a
//  breaking change for every host.
// -----------------------------------------------------------

// Storage + network sources (interfaces + zero-dependency defaults)
export { memoryStorage, type KeyValueStorage } from './core/storage';
export { alwaysOnline, manualNetwork, type NetworkSource } from './core/network';

// The offline cache
export { createCache, type CacheHandle } from './core/cache';

// The provider every hook reads
export { DataEngineProvider, useDataEngine, type DataEngineEnv } from './provider';

// Refetch when connectivity (or the host's own signal) returns
export { useNetworkRestore } from './hooks/useNetworkRestore';

// Single-resource screens
export { useLoad, type UseLoadResult } from './hooks/useLoad';

// Paginated feeds with an offline first page
export {
  useFeed,
  type FeedPage,
  type RefreshStrategy,
  type UseFeedOptions,
  type UseFeedResult,
} from './hooks/useFeed';
