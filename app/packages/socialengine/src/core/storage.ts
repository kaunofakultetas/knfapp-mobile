// -----------------------------------------------------------
//  [*] socialengine — storage
//
//  The key-value store the offline task queue persists
//  through: the AsyncStorage surface, so a React Native host
//  passes AsyncStorage itself, a web host wraps localStorage,
//  and tests use memorySocialStorage(). Every call may reject —
//  the engine treats storage as a convenience, never a
//  dependency: without one, queued intents still replay within
//  the session and simply do not survive a relaunch.
//
//  Used by:
//    - core/tasks.ts — the queue's persistence
//    - provider/index.tsx — the env's `storage` (default memory)
// -----------------------------------------------------------

export interface SocialStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}







// -----------------------------------------------------------
// memorySocialStorage
// -----------------------------------------------------------
//
// Used by:
//   - provider/index.tsx — the default storage
//   - tests — dump() asserts persisted state
// -----------------------------------------------------------

export function memorySocialStorage(): SocialStorage & { dump(): Record<string, string> } {
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
