// -----------------------------------------------------------
//  [*] dataengine — cache
//
//  The offline copy: values stored with a timestamp so a
//  screen can serve stale data (and show its age) when the
//  network is down. Every entry lives under one prefix, which
//  is what lets clearAll() wipe the lot on logout — a cached
//  private feed must never survive into the next account.
//
//  Everything is best-effort: storage failures and corrupt
//  entries read as cache misses, never as thrown errors —
//  except clearAll, which reports failure so a logout flow can
//  retry the one wipe with a privacy consequence.
//
//  createCache is instance-based (the provider makes one per
//  storage), so tests and multi-tenant hosts get isolated
//  caches; the epoch fence is per instance for the same
//  reason. Key naming and per-resource TTLs are the host's —
//  the package only insists a key is a stable string.
//
//  Used by:
//    - provider/index.tsx — one instance per provider
//    - hooks/useFeed.ts — first-page offline copy
// -----------------------------------------------------------

import type { KeyValueStorage } from './storage';


// Bumped whenever the shape of the stored envelope changes — a
// stored entry with a different version reads as a miss
const CACHE_SCHEMA_VERSION = 1;

// On-disk entry shape; v is CACHE_SCHEMA_VERSION at write
// time, cachedAt is ms epoch
interface CacheEntry<T> {
  v: number;
  data: T;
  cachedAt: number;
}

export interface CacheHandle {
  // Write one value; failures are swallowed (the cache is optional)
  set<T>(key: string, data: T): Promise<void>;
  // null when missing, expired, wrong-version or corrupt —
  // expired and wrong-version entries are evicted on the way out
  get<T>(key: string, maxAgeMs?: number): Promise<{ data: T; cachedAt: number } | null>;
  // Evict one entry
  remove(key: string): Promise<void>;
  // Drop every entry under a key prefix older than maxAgeMs
  sweepPrefix(prefix: string, maxAgeMs: number): Promise<void>;
  // Wipe every entry of this cache; false when the wipe failed
  clearAll(): Promise<boolean>;
  // Wipe fence: the number clearAll has run. A writer captures
  // it before fetching and skips its late set() when it moved —
  // an in-flight fetch must not re-write a wiped entry
  epoch(): number;
}







// -----------------------------------------------------------
// createCache
// -----------------------------------------------------------
//
// Used by:
//   - provider/index.tsx — DataEngineProvider builds the one
//     instance its hooks share
//   - hosts with special needs (a second namespace) directly
// -----------------------------------------------------------

export function createCache(storage: KeyValueStorage, options: { prefix?: string; maxEntries?: number } = {}): CacheHandle {

  const prefix = options.prefix ?? 'cache:';
  // Optional entry cap: TTLs alone never bound COUNT, and a
  // parameterised feed writing one row per combination grows
  // until the storage quota makes every set fail — silently,
  // because set swallows. Oldest cachedAt evicts first (write
  // age, deliberately not LRU — reads stay write-free)
  const maxEntries = options.maxEntries;
  let epoch = 0;


  const remove = async (key: string): Promise<void> => {
    try {
      await storage.removeItem(prefix + key);
    } catch {
      // Best-effort — a lingering entry only means stale data
    }
  };


  // Per-key best-effort: the fallback loop keeps going past a
  // rejecting removeItem (fail-fast would abandon every key
  // after the first bad one) and reports whether every key went
  const bulkRemove = async (keys: string[]): Promise<boolean> => {
    if (keys.length === 0) return true;
    if (storage.multiRemove) {
      await storage.multiRemove(keys);
      return true;
    }
    let clean = true;
    for (const key of keys) {
      try {
        await storage.removeItem(key);
      } catch {
        clean = false;
      }
    }
    return clean;
  };


  return {
    async set(key, data) {
      try {
        const entry: CacheEntry<unknown> = { v: CACHE_SCHEMA_VERSION, data, cachedAt: Date.now() };
        await storage.setItem(prefix + key, JSON.stringify(entry));


        if (maxEntries !== undefined) {
          const keys = (await storage.getAllKeys()).filter((k) => k.startsWith(prefix));
          if (keys.length > maxEntries) {
            // Read the stamps and drop the oldest overflow; a
            // corrupt entry counts as oldest (stamp 0)
            const stamped = await Promise.all(
              keys.map(async (k) => {
                try {
                  const raw = await storage.getItem(k);
                  const parsed = raw ? (JSON.parse(raw) as Partial<CacheEntry<unknown>>) : null;
                  return { k, at: typeof parsed?.cachedAt === 'number' ? parsed.cachedAt : 0 };
                } catch {
                  return { k, at: 0 };
                }
              }),
            );
            stamped.sort((a, b) => a.at - b.at);
            await bulkRemove(stamped.slice(0, keys.length - maxEntries).map((s) => s.k));
          }
        }
      } catch {
        // Storage full or unavailable — the cache is optional
      }
    },

    // A maxAgeMs of 0 means "always expired", hence the
    // !== undefined check instead of truthiness. A negative age
    // means the clock moved backwards — skew fails toward
    // refetch, never toward stale data. An unvalidated cachedAt
    // would make the expiry check NaN-compare and serve garbage
    // as fresh, so the stamp is type-checked before comparing
    async get(key, maxAgeMs) {
      try {
        const raw = await storage.getItem(prefix + key);
        if (!raw) return null;


        const entry = JSON.parse(raw) as Partial<CacheEntry<unknown>> | null;
        if (!entry || typeof entry.cachedAt !== 'number') return null;


        if (entry.v !== CACHE_SCHEMA_VERSION) {
          await remove(key);
          return null;
        }


        const age = Date.now() - entry.cachedAt;
        if (age < 0 || (maxAgeMs !== undefined && age > maxAgeMs)) {
          await remove(key);
          return null;
        }
        return { data: entry.data as never, cachedAt: entry.cachedAt };
      } catch {
        return null;
      }
    },

    remove,

    // get() only evicts entries it is actually asked for — but a
    // browsing screen can write one row per parameter combination
    // and never re-read most of them, so without a sweep those
    // rows would sit in storage forever. Corrupt and
    // wrong-version blobs go too (a NaN age compares false on
    // both bounds and falls through to the version check)
    async sweepPrefix(keyPrefix, maxAgeMs) {
      try {
        const keys = await storage.getAllKeys();
        const candidates = keys.filter((key) => key.startsWith(prefix + keyPrefix));
        if (candidates.length === 0) return;

        const now = Date.now();
        const dead: string[] = [];
        for (const key of candidates) {
          try {
            const raw = await storage.getItem(key);
            if (!raw) continue;
            const entry = JSON.parse(raw) as Partial<CacheEntry<unknown>> | null;
            const cachedAt = entry && typeof entry.cachedAt === 'number' ? entry.cachedAt : NaN;
            const age = now - cachedAt;
            if (age < 0 || age > maxAgeMs || entry?.v !== CACHE_SCHEMA_VERSION) dead.push(key);
          } catch {
            dead.push(key);
          }
        }
        await bulkRemove(dead);
      } catch {
        // Best-effort — a failed sweep only leaves stale blobs
      }
    },

    // Bumps the epoch FIRST so an in-flight fetch cannot
    // re-write a wiped entry after the fact, and resolves false
    // (instead of swallowing) when the wipe itself failed —
    // a logout flow must never block on storage, but it may retry
    async clearAll() {
      epoch += 1;

      try {
        const keys = await storage.getAllKeys();
        return await bulkRemove(keys.filter((key) => key.startsWith(prefix)));
      } catch {
        return false;
      }
    },

    epoch: () => epoch,
  };
}
