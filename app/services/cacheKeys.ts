// -----------------------------------------------------------
//  [*] cacheKeys — the app's offline cache vocabulary
//
//  The key builders and per-resource TTLs the screens hand to
//  @knf/dataengine's cache (the storage, TTL/version
//  handling, sweeps and the logout wipe fence all live in the
//  package now). Kept in one place so no two screens can
//  collide on a string. Account-private feeds (news wall,
//  conversations) take the viewer's user id so no account —
//  guest included — can ever read another's entry.
//
//  Split into:
//
//    cache keys — per-account/parameter builders
//    max ages   — per-resource TTLs (ms)
// -----------------------------------------------------------


// -----------------------------------------------------------
// Cache keys
// -----------------------------------------------------------
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
// passed as the maxAgeMs argument of the engine cache's get.
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


// The published building graph, kept without a TTL — a stale
// map beats no map, and the ETag revalidates it for free
export function cacheKeyWayfindGraph(buildingId: string): string {
  return `wayfind:graph:${buildingId}`;
}

// A server-hosted plan drawing by its content hash — immutable
export function cacheKeyWayfindPlan(path: string): string {
  return `wayfind:plan:${path}`;
}
