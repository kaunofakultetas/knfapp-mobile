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
//  Split into (TTLs first, then the key builders):
//
//    max ages   — per-resource TTLs (ms), passed as the
//                 maxAgeMs argument of the engine cache's get
//    cache keys — per-account/parameter builders
// -----------------------------------------------------------







// -----------------------------------------------------------
// NEWS_CACHE_MAX_AGE
// -----------------------------------------------------------
//
// 24 hours — news can be stale but still useful offline.
//
// Used by:
//   - app/(main)/tabs/news.tsx — the feed's cacheMaxAge
// -----------------------------------------------------------

export const NEWS_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;







// -----------------------------------------------------------
// SCHEDULE_CACHE_MAX_AGE
// -----------------------------------------------------------
//
// 7 days — the schedule rarely changes mid-week.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — dated-events reads and
//     the 'schedule:' prefix sweep
// -----------------------------------------------------------

export const SCHEDULE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;







// -----------------------------------------------------------
// INFO_CACHE_MAX_AGE
// -----------------------------------------------------------
//
// 7 days — faculty info is mostly static.
//
// Used by:
//   - app/(main)/info/index.tsx — the cached fallback read
// -----------------------------------------------------------

export const INFO_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;







// -----------------------------------------------------------
// CONVERSATIONS_CACHE_MAX_AGE
// -----------------------------------------------------------
//
// 1 hour — conversations move fast but still help offline.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — the list's cacheMaxAge
// -----------------------------------------------------------

export const CONVERSATIONS_CACHE_MAX_AGE = 1 * 60 * 60 * 1000;







// -----------------------------------------------------------
// cacheKeyNews
// -----------------------------------------------------------
//
// The feed mixes public news with the viewer's wall posts and
// like state — scope it per account ('guest' when signed out).
//
// Used by:
//   - app/(main)/tabs/news.tsx — the unfiltered feed's cacheKey
// -----------------------------------------------------------

export function cacheKeyNews(userId: string | 'guest'): string {
  return `news:feed:${userId}`;
}







// -----------------------------------------------------------
// cacheKeyConversations
// -----------------------------------------------------------
//
// Conversation previews are private to one account.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — the list's cacheKey
// -----------------------------------------------------------

export function cacheKeyConversations(userId: string): string {
  return `conversations:list:${userId}`;
}







// -----------------------------------------------------------
// cacheKeyScheduleEvents
// -----------------------------------------------------------
//
// One DATED week of lecture events — BOTH perspectives'
// dataset, keyed by the window's ISO Monday plus the scope:
// the group ('*' when every group rides along), or 't:' plus
// the teacher's display string when the teacher scope is set
// (the prefix keeps a teacher's rows apart from a group that
// could share the spelling). No semester in the key: the
// dates themselves say which term the rows are.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — loadEvents + staleness
//     checks
// -----------------------------------------------------------

export function cacheKeyScheduleEvents(weekStart: string, group?: string | null, teacher?: string | null): string {
  if (teacher) return `schedule:events:${weekStart}:t:${teacher}`;
  return `schedule:events:${weekStart}:${group || '*'}`;
}







// -----------------------------------------------------------
// cacheKeyInfo
// -----------------------------------------------------------
//
// Info pages differ per language.
//
// Used by:
//   - app/(main)/info/index.tsx — the cached fallback read
// -----------------------------------------------------------

export function cacheKeyInfo(lang: string): string {
  return `info:${lang}`;
}







// -----------------------------------------------------------
// cacheKeyWayfindGraph
// -----------------------------------------------------------
//
// The published building graph, kept without a TTL — a stale
// map beats no map, and the ETag revalidates it for free.
//
// Used by:
//   - hooks/useBuildingGraph.ts — the cached graph read
// -----------------------------------------------------------

export function cacheKeyWayfindGraph(buildingId: string): string {
  return `wayfind:graph:${buildingId}`;
}







// -----------------------------------------------------------
// cacheKeyWayfindPlan
// -----------------------------------------------------------
//
// A server-hosted plan drawing by its content hash — immutable.
//
// Used by:
//   - hooks/usePlanXml.ts — the cached plan read
// -----------------------------------------------------------

export function cacheKeyWayfindPlan(path: string): string {
  return `wayfind:plan:${path}`;
}
