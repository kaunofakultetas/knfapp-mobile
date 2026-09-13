// -----------------------------------------------------------
//  [*] chatengine — storage
//
//  The key-value store the outbox and drafts persist through:
//  the AsyncStorage surface, so a React Native host passes
//  AsyncStorage itself, a web host wraps localStorage, and
//  tests use memoryStorage(). Every call may reject — the
//  engine treats storage as a convenience, never a dependency.
//
//  Used by:
//    - provider/index.tsx — the env's `storage` (default memory)
//    - core/outbox.ts, hooks/useComposer.ts
// -----------------------------------------------------------







// -----------------------------------------------------------
// KeyValueStorage
// -----------------------------------------------------------
//
// The persistence surface the engine writes through — the
// AsyncStorage method shape.
//
// Used by:
//   - memoryStorage (below) — the default implementation
//   - provider/index.tsx — the env's `storage`
//   - core/outbox.ts / core/tasks.ts — outbox and task queues
// -----------------------------------------------------------

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}







// -----------------------------------------------------------
// memoryStorage
// -----------------------------------------------------------
//
// The zero-dependency default: a Map behind the storage
// surface. State dies with the process — real persistence is
// the host's choice, made by passing AsyncStorage (or any
// other implementation) to ChatEngineProvider.
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
    dump() {
      return Object.fromEntries(map);
    },
  };
}
