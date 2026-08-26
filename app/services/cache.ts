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
//  entries read as cache misses, never as thrown errors.
//
//  Split into:
//
//    cacheSet / cacheGet — read/write with TTL
//    cacheRemove         — evict one entry
//    cacheClearAll       — wipe everything (logout)
//    cache keys          — well-known keys + builders
//    max ages            — per-resource TTLs
// -----------------------------------------------------------

// The only storage backend — no in-memory layer on top
import AsyncStorage from '@react-native-async-storage/async-storage';


// Namespaces cache entries so cacheClearAll can find them all
const CACHE_PREFIX = 'cache:';

// On-disk entry shape; cachedAt is ms epoch
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}







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
    const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
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
// maxAgeMs, or the stored blob is not a valid entry (legacy
// format, corruption) — an unvalidated cachedAt would make the
// expiry check NaN-compare and serve garbage as fresh. A
// maxAgeMs of 0 means "always expired", hence the !==
// undefined check instead of truthiness.
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


    if (maxAgeMs !== undefined && Date.now() - entry.cachedAt > maxAgeMs) {
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
//   - screens invalidating a single stale resource (e.g. a
//     schedule combination after a settings change)
// -----------------------------------------------------------

export async function cacheRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // Best-effort — a lingering entry only means stale data
  }
}







// -----------------------------------------------------------
// cacheClearAll
// -----------------------------------------------------------
//
// Removes every 'cache:'-prefixed key, leaving auth and app
// settings untouched.
//
// Used by:
//   - context/AuthContext.tsx — logout (privacy: cached
//     conversations belong to the departing account)
// -----------------------------------------------------------

export async function cacheClearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {
    // Best-effort — logout must never block on storage
  }
}







// -----------------------------------------------------------
// Cache keys
// -----------------------------------------------------------
//
// Well-known keys and per-parameter builders, kept here so no
// two screens can collide on a string.
//
// Used by:
//   - app/(main)/tabs/news.tsx — CACHE_KEY_NEWS
//   - app/(main)/tabs/messages.tsx — CACHE_KEY_CONVERSATIONS
//   - app/(main)/tabs/schedule.tsx — cacheKeySchedule
//   - app/(main)/info — cacheKeyInfo
// -----------------------------------------------------------

export const CACHE_KEY_NEWS = 'news:feed';

export const CACHE_KEY_SOCIAL_FEED = 'social:feed';

export const CACHE_KEY_CONVERSATIONS = 'conversations:list';

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
