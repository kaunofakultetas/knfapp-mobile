// -----------------------------------------------------------
//  [*] dataengine — storage
//
//  The key-value store the cache persists through: the
//  AsyncStorage surface plus key enumeration, so a React
//  Native host passes AsyncStorage itself, a web host wraps
//  localStorage, and tests use memoryStorage(). Every call
//  may reject — the cache treats storage as a convenience,
//  never a dependency, and reads failures as misses.
//
//  Used by:
//    - core/cache.ts — createCache persists through it
//    - provider/index.tsx — the env's `storage` (default memory)
// -----------------------------------------------------------

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  // Everything currently stored — clearAll and the sweeps walk
  // this; AsyncStorage provides it natively
  getAllKeys(): Promise<readonly string[]>;
  // Optional bulk delete — used when present (AsyncStorage has
  // it), else removeItem runs per key
  multiRemove?(keys: readonly string[]): Promise<void>;
}







// -----------------------------------------------------------
// memoryStorage
// -----------------------------------------------------------
//
// The zero-dependency default: a Map behind the storage
// surface. State dies with the process — real persistence is
// the host's choice, made by passing AsyncStorage (or any
// other implementation) to DataEngineProvider.
//
// Used by:
//   - provider/index.tsx — the default storage
//   - tests everywhere — dump() asserts persisted state
// -----------------------------------------------------------

export function memoryStorage(): KeyValueStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
    async getAllKeys() {
      return [...map.keys()];
    },
    async multiRemove(keys) {
      for (const key of keys) map.delete(key);
    },
    dump() {
      return Object.fromEntries(map);
    },
  };
}
