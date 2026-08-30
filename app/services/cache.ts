// -----------------------------------------------------------
//  [*] Cache — offline data cache on AsyncStorage
//
//  Feeds the offline experience: first pages of feeds and
//  mostly-static resources are stored with a timestamp so
//  screens can serve stale data (CachedBanner shows its age)
//  when the network is down. Every entry lives under the
//  'cache:' prefix, which is what lets cacheClearAll() wipe
//  the lot on logout — the conversations cache is private data
//  and must never survive into the next account.
//
//  Everything is best-effort: storage failures and corrupt
//  entries read as cache misses, never as thrown errors —
//  except cacheClearAll, which reports failure so logout can
//  retry the one wipe with a privacy consequence.
//
//  Split into:
//
//    cacheEpoch          — wipe fence for in-flight writers
//    cacheSet / cacheGet — read/write with TTL + eviction
//    cacheRemove         — evict one entry
//    cacheSweepPrefix    — drop expired entries under a prefix
//    cacheClearAll       — wipe everything (logout)
//    cache keys          — per-account/parameter builders
//    max ages            — per-resource TTLs
// -----------------------------------------------------------

// The only storage backend — no in-memory layer on top
import AsyncStorage from '@react-native-async-storage/async-storage';


// Namespaces cache entries so cacheClearAll can find them all
const CACHE_PREFIX = 'cache:';

// Bumped whenever the shape of any cached blob changes — a
// stored entry with a different version reads as a miss
const CACHE_SCHEMA_VERSION = 1;

// On-disk entry shape; v is CACHE_SCHEMA_VERSION at write
// time, cachedAt is ms epoch
interface CacheEntry<T> {
  v: number;
  data: T;
  cachedAt: number;
}

// Wipe fence: incremented by cacheClearAll so an in-flight
// fetch that started before a logout wipe can detect it and
// skip its late cacheSet (useFeed captures it before fetching)
export let cacheEpoch = 0;







// -----------------------------------------------------------
// cacheSet
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useFeed.ts — first-page write on every successful
//     fetch when a cacheKey is configured
// -----------------------------------------------------------

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { v: CACHE_SCHEMA_VERSION, data, cachedAt: Date.now() };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — the cache is optional
  }
}







// -----------------------------------------------------------
// cacheGet
// -----------------------------------------------------------
//
// Returns null when nothing is stored, the entry is older than
// maxAgeMs, its schema version is not the current one, or the
// stored blob is not a valid entry (legacy format, corruption)
// — an unvalidated cachedAt would make the expiry check
// NaN-compare and serve garbage as fresh. A maxAgeMs of 0
// means "always expired", hence the !== undefined check
// instead of truthiness. A negative age means the clock moved
// backwards — skew fails toward refetch, never toward stale
// data (same clamp formatRelative applies). Expired and
// wrong-version entries are evicted on the way out so dead
// blobs do not pile up in storage.
//
// Used by:
//   - hooks/useFeed.ts — offline fallback for page 1
// -----------------------------------------------------------

export async function cacheGet<T>(
  key: string,
  maxAgeMs?: number,
): Promise<{ data: T; cachedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;


    const entry = JSON.parse(raw) as Partial<CacheEntry<T>> | null;
    if (!entry || typeof entry.cachedAt !== 'number') return null;


    if (entry.v !== CACHE_SCHEMA_VERSION) {
      await cacheRemove(key);
      return null;
    }


    const age = Date.now() - entry.cachedAt;
    if (age < 0 || (maxAgeMs !== undefined && age > maxAgeMs)) {
      await cacheRemove(key);
      return null;
    }
    return { data: entry.data as T, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}







// -----------------------------------------------------------
// cacheRemove
// -----------------------------------------------------------
//
// Used by:
//   - cacheGet (above) — evicting expired and wrong-version
//     entries as they are read
// -----------------------------------------------------------

export async function cacheRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // Best-effort — a lingering entry only means stale data
  }
}







// -----------------------------------------------------------
// cacheSweepPrefix
// -----------------------------------------------------------
//
// Drops every entry under one key prefix whose age exceeds
// maxAgeMs (corrupt and wrong-version blobs go too). cacheGet
// only evicts entries it is actually asked for — but schedule
// browsing writes one row per day/group/semester combination
// and never re-reads most of them, so without a sweep those
// rows would sit in AsyncStorage forever. Best-effort like
// everything here: a failed sweep changes nothing.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — expired 'schedule:'
//     entries, once per mount
// -----------------------------------------------------------

export async function cacheSweepPrefix(prefix: string, maxAgeMs: number): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const candidates = keys.filter((key) => key.startsWith(CACHE_PREFIX + prefix));
    if (candidates.length === 0) return;

    const now = Date.now();
    const dead: string[] = [];
    for (const key of candidates) {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const entry = JSON.parse(raw) as Partial<CacheEntry<unknown>> | null;
        const cachedAt = entry && typeof entry.cachedAt === 'number' ? entry.cachedAt : NaN;
        const age = now - cachedAt;
        // NaN compares false on both bounds, so a corrupt stamp
        // falls through to the version check and gets swept
        if (age < 0 || age > maxAgeMs || entry?.v !== CACHE_SCHEMA_VERSION) dead.push(key);
      } catch {
        dead.push(key);
      }
    }
    if (dead.length > 0) await AsyncStorage.multiRemove(dead);
  } catch {
    // Best-effort — a failed sweep only leaves stale blobs
  }
}







// -----------------------------------------------------------
// cacheClearAll
// -----------------------------------------------------------
//
// Removes every 'cache:'-prefixed key, leaving auth and app
// settings untouched. Bumps cacheEpoch FIRST so an in-flight
// fetch cannot re-write a wiped entry after the fact, and
// resolves false (instead of swallowing) when the wipe itself
// failed, so logout can retry the one storage operation with a
// privacy consequence.
//
// Used by:
//   - context/AuthContext.tsx — logout / establishSession
//     (privacy: cached conversations belong to the departing
//     account)
// -----------------------------------------------------------

export async function cacheClearAll(): Promise<boolean> {
  cacheEpoch += 1;

  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
    return true;
  } catch {
    // Reported, not thrown — logout must never block on storage
    return false;
  }
}







// -----------------------------------------------------------
// Cache keys
// -----------------------------------------------------------
//
// Per-parameter builders, kept here so no two screens can
// collide on a string. Account-private feeds (news wall,
// conversations) take the viewer's user id so no account —
// guest included — can ever read another's entry.
//
// Used by:
//   - app/(main)/tabs/news.tsx — cacheKeyNews
//   - app/(main)/tabs/messages.tsx — cacheKeyConversations
//   - app/(main)/tabs/schedule.tsx — cacheKeySchedule
//   - app/(main)/info — cacheKeyInfo
// -----------------------------------------------------------

// The feed mixes public news with the viewer's wall posts and
// like state — scope it per account ('guest' when signed out)
export function cacheKeyNews(userId: string | 'guest'): string {
  return `news:feed:${userId}`;
}

// Conversation previews are private to one account
export function cacheKeyConversations(userId: string): string {
  return `conversations:list:${userId}`;
}

// Day/group/semester each change the result set — '*' keeps
// the unfiltered variant distinct from filtered ones
export function cacheKeySchedule(
  day: number,
  group?: string | null,
  semester?: string | null,
): string {
  return `schedule:${day}:${group || '*'}:${semester || '*'}`;
}

// Info pages differ per language
export function cacheKeyInfo(lang: string): string {
  return `info:${lang}`;
}







// -----------------------------------------------------------
// Max ages
// -----------------------------------------------------------
//
// TTLs matched to how fast each resource actually changes;
// passed as the maxAgeMs argument of cacheGet.
//
// Used by:
//   - the same screens as their cache keys above
// -----------------------------------------------------------

// 24 hours — news can be stale but still useful offline
export const NEWS_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

// 7 days — the schedule rarely changes mid-week
export const SCHEDULE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// 7 days — faculty info is mostly static
export const INFO_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// 1 hour — conversations move fast but still help offline
export const CONVERSATIONS_CACHE_MAX_AGE = 1 * 60 * 60 * 1000;
