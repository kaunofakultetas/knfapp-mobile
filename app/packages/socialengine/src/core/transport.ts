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
//  5xx, 429 — isRetryableError) from definitive refusals, and
//  an httpStatus/status field of 401/403 marks the auth case.
//
//  Used by:
//    - provider/index.tsx — the env's `transport`
//    - every hook
//    - testing/fakeSocialTransport.ts — the reference implementation
//    - testing/socialContract.ts — the conformance suite
// -----------------------------------------------------------

import type { Poll, RelationshipState, SocialNotification } from './types';


// What a like toggle settles to — the server's word on both
// the flag and the count, so shadows can be reconciled
export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

export type LikeTarget = { type: 'post' | 'comment'; id: string };

// The viewer asks to change a relationship. 'connect' sends the
// request (or follows, on instant backends), 'cancel' withdraws
// an outgoing one, 'accept'/'decline' answer an incoming one,
// 'disconnect' unfriends/unfollows
export type RelationshipAction = 'connect' | 'cancel' | 'accept' | 'decline' | 'disconnect';

export interface NotificationsPage {
  notifications: SocialNotification[];
  hasMore: boolean;
  cursor?: string;
}

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

// What the engine tells the host when an interaction cannot be
// carried out; hosts map codes to their own translated strings
export type SocialNoticeCode =
  | 'like_failed'
  | 'vote_failed'
  | 'poll_load_failed'
  | 'relationship_failed'
  | 'block_failed'
  | 'report_failed'
  | 'notifications_failed'
  | 'auth_required';

export interface SocialNotice {
  level: 'error' | 'info';
  code: SocialNoticeCode;
  detail?: string;
}







// -----------------------------------------------------------
// isRetryableError
// -----------------------------------------------------------
//
// The engine's one error judgement: whether a failure can heal
// on its own (network, timeout, 5xx, 429 — worth retrying or
// queueing) or is a definitive refusal. Reads the common
// shapes without depending on any HTTP client: a `status` or
// `httpStatus` number, a `code` of 'network'/'timeout', a
// TypeError from fetch.
//
// Used by:
//   - hooks/useLikeToggle.ts, hooks/useRelationship.ts —
//     whether a failed toggle reverts silently or notifies
// -----------------------------------------------------------

export function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; httpStatus?: unknown; code?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.httpStatus === 'number' ? e.httpStatus : null;
  if (status !== null) return status === 0 || status === 429 || status >= 500;
  if (e.code === 'network' || e.code === 'timeout') return true;
  return false;
}







// -----------------------------------------------------------
// isAuthError
// -----------------------------------------------------------
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
