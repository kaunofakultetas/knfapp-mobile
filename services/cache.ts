/**
 * Offline data cache using AsyncStorage.
 *
 * Stores API responses with timestamps so they can be served when the
 * device is offline. Each cache entry is a JSON blob with:
 *   { data: T, cachedAt: number (ms epoch) }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'cache:';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

/** Store data in the offline cache. */
export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Best-effort — storage full or other issue
  }
}

/**
 * Retrieve cached data.
 * Returns null if no cache exists or if the entry is older than maxAgeMs.
 */
export async function cacheGet<T>(key: string, maxAgeMs?: number): Promise<{ data: T; cachedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (maxAgeMs && Date.now() - entry.cachedAt > maxAgeMs) {
      return null; // Expired
    }
    return { data: entry.data, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

// ── Cache keys ─────────────────────────────────────────────────────────────

/** News feed first page cache key. */
export const CACHE_KEY_NEWS = 'news:feed';

/** Schedule cache key for a specific day/group/semester combination. */
export function cacheKeySchedule(day: number, group?: string | null, semester?: string | null): string {
  return `schedule:${day}:${group || '*'}:${semester || '*'}`;
}

/** Faculty info cache key for a specific language. */
export function cacheKeyInfo(lang: string): string {
  return `info:${lang}`;
}

/** Conversations list cache key. */
export const CACHE_KEY_CONVERSATIONS = 'conversations:list';

// ── Max ages ───────────────────────────────────────────────────────────────

/** 24 hours — news can be stale but still useful offline. */
export const NEWS_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

/** 7 days — schedule changes rarely mid-week. */
export const SCHEDULE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** 7 days — faculty info is mostly static. */
export const INFO_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** 1 hour — conversations list is fairly dynamic but useful offline. */
export const CONVERSATIONS_CACHE_MAX_AGE = 1 * 60 * 60 * 1000;
