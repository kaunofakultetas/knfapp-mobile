// -----------------------------------------------------------
//  [*] socialengine — transport
//
//  The one interface between the engine and a backend. An
//  adapter implements it; the conformance suite
//  (testing/socialContract.ts) proves the implementation
//  behaves the way every hook assumes. Everything beyond the
//  like/poll core is optional — a backend without
//  relationships or an activity feed still gets likes and
//  polls, and the hooks for the missing pieces report
//  'unsupported' instead of crashing.
//
//  Feed FETCHING is deliberately not here: pages of posts come
//  through whatever the host already uses (@knf/dataengine's
//  useFeed, a query library, plain fetch). This transport owns
//  INTERACTIONS — the writes and the small reads around them.
//
//  Error contract: reject with anything; the engine only
//  distinguishes retryable-shaped failures (network, timeout,
//  5xx — isRetryableError) from definitive refusals (every
//  4xx, 429 included), an httpStatus/status field of 401/403
//  marks the auth case, and a serverCode (or a bare `code`
//  slug) lets one refusal carry its own sentence.
//
//  Used by:
//    - provider/index.tsx — the env's `transport`
//    - every hook
//    - testing/fakeSocialTransport.ts — the reference implementation
//    - testing/socialContract.ts — the conformance suite
// -----------------------------------------------------------

import type { Poll, RelationshipState, SocialNotification } from './types';







// -----------------------------------------------------------
// LikeResult
// -----------------------------------------------------------
//
// What a like toggle settles to — the server's word on both
// the flag and the count, so shadows can be reconciled.
//
// Used by:
//   - SocialTransport (below) — setLiked's resolved answer
//   - adapters/knf/index.ts, testing/fakeSocialTransport.ts
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface LikeResult {
  liked: boolean;
  likeCount: number;
}







// -----------------------------------------------------------
// LikeTarget
// -----------------------------------------------------------
//
// What a like addresses — type and id together, since a post
// and a comment may share an id.
//
// Used by:
//   - SocialTransport (below) — setLiked's target
//   - core/tasks.ts — the queued like's target
//   - testing/fakeSocialTransport.ts — the like store's key
// -----------------------------------------------------------

export type LikeTarget = { type: 'post' | 'comment'; id: string };







// -----------------------------------------------------------
// RelationshipAction
// -----------------------------------------------------------
//
// The viewer asks to change a relationship. 'connect' sends the
// request (or follows, on instant backends), 'cancel' withdraws
// an outgoing one, 'accept'/'decline' answer an incoming one,
// 'disconnect' unfriends/unfollows.
//
// Used by:
//   - SocialTransport (below) — setRelationship's verb
//   - core/tasks.ts, hooks/useRelationship.ts
//   - adapters/knf/index.ts, testing/fakeSocialTransport.ts
// -----------------------------------------------------------

export type RelationshipAction = 'connect' | 'cancel' | 'accept' | 'decline' | 'disconnect';







// -----------------------------------------------------------
// NotificationsPage
// -----------------------------------------------------------
//
// One page of the activity list, with the cursor that asks for
// the next one.
//
// Used by:
//   - SocialTransport (below) — fetchNotifications' answer
//   - testing/fakeSocialTransport.ts
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface NotificationsPage {
  notifications: SocialNotification[];
  hasMore: boolean;
  cursor?: string;
}







// -----------------------------------------------------------
// SocialTransport
// -----------------------------------------------------------
//
// The contract itself — see the file banner for what is core
// and what is optional.
//
// Used by:
//   - provider/index.tsx — the env's `transport`
//   - every hook
//   - adapters/knf/index.ts, testing/fakeSocialTransport.ts,
//     testing/socialContract.ts
//   - services/socialTransport.ts — the host app's wiring
// -----------------------------------------------------------

export interface SocialTransport {
  // --- the core: likes + polls -------------------------------
  setLiked(target: LikeTarget, liked: boolean): Promise<LikeResult>;
  // null = the post simply has no poll (a 404 maps here);
  // anything else rejects
  fetchPoll(pollId: string): Promise<Poll | null>;
  // Resolves the full updated poll — voting is pessimistic, the
  // response replaces local state wholesale
  vote(pollId: string, optionIds: string[]): Promise<Poll>;

  // --- relationships (optional) ------------------------------
  setRelationship?(userId: string, action: RelationshipAction): Promise<RelationshipState>;
  setBlocked?(userId: string, blocked: boolean): Promise<void>;

  // --- moderation (optional) ---------------------------------
  report?(target: { type: 'post' | 'comment' | 'user'; id: string }, reason: string): Promise<void>;

  // --- the activity list (optional) --------------------------
  fetchNotifications?(cursor?: string): Promise<NotificationsPage>;
  markNotificationsRead?(): Promise<void>;
  // The cheap unread probe the badge polls — kept separate from
  // fetchNotifications so implementations can answer from a counter
  fetchUnreadCount?(): Promise<number>;
}







// -----------------------------------------------------------
// SocialNoticeCode
// -----------------------------------------------------------
//
// What the engine tells the host when an interaction cannot be
// carried out; hosts map codes to their own translated strings.
//
// Used by:
//   - SocialNotice (below)
//   - example/ExampleSocialScreen.tsx — a sample mapping
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export type SocialNoticeCode =
  | 'like_failed'
  | 'vote_failed'
  | 'poll_load_failed'
  | 'relationship_failed'
  // The backend refused a connect for a while — the other side
  // declined the last request (friend_request_cooldown); a
  // definitive refusal with its own sentence, not a retry
  | 'cooldown'
  | 'block_failed'
  | 'report_failed'
  | 'notifications_failed'
  | 'auth_required';







// -----------------------------------------------------------
// SocialNotice
// -----------------------------------------------------------
//
// The message itself — the code plus a level the host may use
// to pick toast styling.
//
// Used by:
//   - provider/index.tsx — notify's payload
//   - components/social/SocialEngineHost.tsx — the host's
//     code-to-toast mapping
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface SocialNotice {
  level: 'error' | 'info';
  code: SocialNoticeCode;
  detail?: string;
}







// -----------------------------------------------------------
// isRetryableError
// -----------------------------------------------------------
//
// Whether a failure can heal on its own — a real transport
// failure (status 0, a `code` of 'network'/'timeout', a
// TypeError from fetch) or a 5xx — and is worth queueing for
// the restore signal, or is a definitive refusal. EVERY 4xx is
// definitive, 429 included: the backend's 429s are a declined
// request's cooldown or a rate limit, and neither heals by
// replaying the same intent on every mount. Reads the common
// shapes without depending on any HTTP client.
//
// Used by:
//   - hooks/useLikeToggle.ts, hooks/useRelationship.ts — queue
//     an offline intent vs revert-and-notify
//   - provider/index.tsx — the drain: stop the walk vs drop
//     the task
//   - hosts and adapter authors, via the public surface
// -----------------------------------------------------------

export function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; httpStatus?: unknown; code?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.httpStatus === 'number' ? e.httpStatus : null;
  if (status !== null) return status === 0 || status >= 500;
  if (e.code === 'network' || e.code === 'timeout') return true;
  return false;
}







// -----------------------------------------------------------
// relationshipFailureCode
// -----------------------------------------------------------
//
// The notice a definitively refused relationship action
// surfaces as: 'cooldown' when the backend's machine code says
// the other side declined the last request
// (friend_request_cooldown), the generic failure otherwise.
// The slug is read from `serverCode` (the app's ApiError) or,
// failing that, from a bare `code` that is not a transport
// kind — the shape the fake transport and the adapter's own
// refusals use.
//
// Used by:
//   - hooks/useRelationship.ts — the definitive-refusal branch
//   - provider/index.tsx — the drain's relationship replay
// -----------------------------------------------------------

const TRANSPORT_KINDS = new Set(['http', 'network', 'timeout', 'canceled']);

export function relationshipFailureCode(err: unknown): SocialNoticeCode {
  if (!err || typeof err !== 'object') return 'relationship_failed';
  const e = err as { serverCode?: unknown; code?: unknown };
  const slug =
    typeof e.serverCode === 'string' ? e.serverCode
    : typeof e.code === 'string' && !TRANSPORT_KINDS.has(e.code) ? e.code
    : null;
  return slug === 'friend_request_cooldown' ? 'cooldown' : 'relationship_failed';
}







// -----------------------------------------------------------
// isAuthError
// -----------------------------------------------------------
//
// Reads `status` or `httpStatus` off the thrown value with no
// HTTP-client dependency — 401 and 403 only, nothing else.
//
// Used by:
//   - hooks — a 401/403 refusal surfaces as 'auth_required',
//     not as a generic failure
// -----------------------------------------------------------

export function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; httpStatus?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.httpStatus === 'number' ? e.httpStatus : null;
  return status === 401 || status === 403;
}
