# Changelog

## 1.0.0 — 2026-08-30

First cut.

- `SocialTransport` — the backend seam: a mandatory like/poll core
  (`setLiked`, `fetchPoll`, `vote`) and optional halves (relationships,
  blocking, reporting, the activity list, the unread probe) that the
  hooks degrade around instead of crashing on. Feed fetching stays out
  by design — the engine owns interactions, not pages of posts.
  `isRetryableError` / `isAuthError` are the engine's only error
  judgements, reading bare `status` / `httpStatus` / `code` shapes.
- Shadow cache — `createShadowStore`, `mergePostShadow` (the diff-merge:
  the count moves only where shadow and base disagree, so a stale shadow
  is harmless and can never double count), `mergeRelationship`; both
  stores wiped when the signed-in account changes.
- Toggle queue — `createToggleQueue` / `getToggleQueue`: tap spam
  coalesces to at most the in-flight request plus the final intent;
  a superseded task rejects `AbortError`-shaped; queues live per key,
  scoped by transport identity.
- Poll arithmetic — `pollPercent` (exact, `voterCount`-preferring),
  `pollLeaders`, `isPollExpired` (server flag OR client clock),
  `showPollResults` (voted, over, or locally revealed).
- Notification grouping — `groupNotifications`: `like` and
  `connect_accept` merge per subject inside a 48 h window; content-
  bearing and actionable kinds stand alone; actors dedupe and cap while
  the originals ride along; a group reads as read only when every
  member does.
- `SocialEngineProvider` — transport, viewer (`null` = guest, auth adds
  features and never gates reading), notices (codes), `onRequireAuth`,
  the test-freezable clock, the two shadow stores.
- Hooks: `useLikeToggle` (optimistic, posts and comments), `usePoll`
  (pessimistic votes — the server's answer replaces state wholesale),
  `useRelationship` (optimistic state, counts never guessed),
  `useNotifications` (paged, deduped, grouped; optimistic `markAllRead`
  with exact revert), `useUnreadBadge` (app-state-aware polling,
  `'N+'` cap).
- `testing/fakeSocialTransport` and `testing/describeSocialContract` —
  the reference in-memory backend (with `fail`, `stall` and seed levers)
  and the conformance suite any adapter can run.
- `example/ExampleSocialScreen.tsx` — a bare-RN screen over the fake
  (likes, one poll, a connect button, the unread badge), with its own
  end-to-end spec.
- Specs live inside the package (`src/**/__tests__/`,
  `example/__tests__/`) with their own `npm test` (jest-expo + the
  package's babel config); `__tests__` is excluded from `files`.
- **KNF adapter** — `createKnfSocialTransport({ http })` under
  `adapters/knf/`, proven by the conformance suite over stubbed routes;
  its banner lists everything the mapping smooths over (toggle-style
  likes, post-addressed single-answer polls, request-id resolution for
  accept/decline/cancel — the sender-side reject carries the
  withdrawal — absorbed already-in-that-state refusals, no activity
  endpoints).
