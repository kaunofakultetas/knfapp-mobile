# socialengine

A headless social-interaction engine for React Native / Expo: optimistic
likes over a shadow cache, tap-spam coalescing through per-target toggle
queues, a relationship state machine, pessimistic poll voting,
notification grouping and an unread badge — behind one `SocialTransport`
interface. It owns no backend and draws no pixels, and it deliberately
owns no feed fetching either: pages of posts arrive through whatever the
host already uses (`@knf/dataengine`'s feed hooks, a query library, plain
`fetch`); this engine owns the INTERACTIONS — the writes and the small
reads around them — and hands their state to any UI (`@knf/socialuikit`
in this repo, or anything structurally compatible with `SocialPost`).

```tsx
import { SocialEngineProvider, useLikeToggle } from '@knf/socialengine';

<SocialEngineProvider
  transport={transport}              // your SocialTransport (see Adapters)
  currentUser={{ id, displayName }}  // or null — guests read everything
  notify={(n) => toast(t(keys[n.code]))}   // codes, never strings
  onRequireAuth={openLogin}          // a guest tapped a write
>
  …
</SocialEngineProvider>

function LikeButton({ post }) {
  // `post` is the immutable row from YOUR fetching layer; the hook
  // layers the viewer's intent over it and re-renders on every change
  const { liked, likeCount, pending, canLike, toggle } = useLikeToggle(post);
}
```

## Examples

- **`example/ExampleSocialScreen.tsx`** — the engine driving a bare React
  Native screen over `fakeSocialTransport`: no server, no UI kit, no
  host. A feed of post cards with optimistic like buttons, one poll voted
  pessimistically, a connect button walking the relationship machine, and
  the unread badge on the header. Paste it into a blank Expo project to
  see the engine alone.
- **Kit + engine together** — `packages/socialuikit` renders these same
  shapes; its example screen is the reference pairing of the two.

## The shadow cache

Feed rows are treated as immutable server truth: the engine never writes
into them. The viewer's in-flight intents (a like tapped, a request sent)
live in a shadow store keyed by id, and views render
`merge(base, shadow)`. The merge is a **diff**, not an overwrite: the
shadow remembers what the viewer wants (`liked: true`), and the count
shown is `base.likeCount` adjusted only by the *disagreement* between
shadow and base — `+1` when the shadow likes a row the base does not,
`−1` in the opposite direction, `0` when they agree. Because every
surface showing an id subscribes to the same shadow entry, a like toggled
in the feed is instantly right in search results and on the profile wall.

The payoff is that a **stale shadow is harmless**. When a refetch later
returns rows that already include the viewer's like, the disagreement —
and the adjustment — become zero on their own; nothing has to race a
network response to clean the shadow up, and a leftover entry can never
double count. The stores are wiped only when the signed-in account
changes, so one viewer's intents never bleed into the next one's rows.

## The toggle queue

A reader hammering the like button five times must produce at most two
requests — the one already in flight and the final intent — and must
always settle on the last intent, never interleave. The queue's rules,
exactly: `run()` while idle executes immediately; repeating the intent
that will run last anyway joins that task's promise instead of queueing
again; anything else **replaces** the queued task, rejecting the replaced
one with an `AbortError`-shaped error so its caller knows it was
superseded, not failed; when the active task settles — success or failure
— the queued one runs; a failure rejects only its own promise, the queue
keeps going. Queues are per key (one per post, one per user) through
`getToggleQueue(scope, key)`, scoped by object identity — two providers
sharing one transport share queues, two tests with fresh transports never
collide.

## Optimistic likes, pessimistic polls

Likes are optimistic because a like is cheap, reversible and *personal*:
the viewer's own flag plus a ±1 on a count, instantly revertable to the
pre-tap intent when the server refuses (auth refusals route to
`onRequireAuth`, everything else notifies `like_failed`). The server's
answer settles the flag only — the count in the answer is deliberately
dropped, because the next base refetch is the count's single source of
truth.

Polls are pessimistic — the one interaction here that is — because the
result of a vote is *other people's data*: the percentages revealed on
tap must be the server's truth, not a guess assembled client-side.
Nothing moves until `transport.vote` answers, and its resolved poll
replaces local state wholesale (counts, `votedByMe`, `closed`,
everything); a rejection changes nothing visible and surfaces as
`vote_failed`. Relationship *counts* follow the same reasoning: only the
relationship state is optimistic, while connection counts are never
guessed — a ±1 across accept/decline/disconnect races is exactly how
profiles drift, and the next profile fetch reconciles them for free.

## Adapters

An adapter implements `SocialTransport` for your backend. The core is
two likes-and-polls methods deep; everything else is optional, and the
hooks for a missing piece report `unsupported` / stay inert instead of
crashing:

```ts
interface SocialTransport {
  // the mandatory core
  setLiked(target: { type: 'post' | 'comment'; id }, liked): Promise<{ liked, likeCount }>;
  fetchPoll(pollId): Promise<Poll | null>;   // null = the post has no poll (a 404 maps here)
  vote(pollId, optionIds): Promise<Poll>;    // the answer replaces local state wholesale

  // optional halves
  setRelationship?(userId, action): Promise<RelationshipState>;  // connect | cancel | accept | decline | disconnect
  setBlocked?(userId, blocked): Promise<void>;
  report?(target, reason): Promise<void>;
  fetchNotifications?(cursor?): Promise<{ notifications, hasMore, cursor? }>;
  markNotificationsRead?(): Promise<void>;
  fetchUnreadCount?(): Promise<number>;      // the badge's cheap probe
}
```

Reject with anything; the engine only reads the common shapes — a
`status` / `httpStatus` number or a `code` of `network` / `timeout` — to
tell healable failures from definitive refusals (`isRetryableError`) and
to spot the auth case (`isAuthError`, 401/403).

To prove an adapter, call `describeSocialContract` in a jest file with a
harness that hands the suite a fresh transport plus the levers it needs
to shape the backend — including forcing a standing no client action can
reach (there is no client-side way to become `incoming`):

```ts
describeSocialContract('my adapter', () => ({
  transport: makeMyAdapter(stubHttp),
  seedPoll: async (poll) => { stub.polls[poll.id] = poll; return poll.id; },
  seedNotification: async (n) => stub.appendActivity(n),
  setRelationship: async (userId, state) => { stub.standing[userId] = state; },
}));
```

Green means the hooks behave on your backend exactly as they do on the
fake — which is what every hook test already proves. The optional halves
are checked only where the transport offers them; a likes-and-polls-only
backend passes with the relationship and activity checks quietly skipped.

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `types.ts` (the domain model), `transport.ts` (the contract, notice codes, the two error judgements), `shadow.ts` (the store + the diff-merges), `toggleQueue.ts`, `poll.ts` (pure arithmetic and gating), `notifications.ts` (the grouping rules) |
| `provider/` | `SocialEngineProvider` / `useSocialEngine` — transport, viewer, notices, the test-freezable clock, the two shadow stores |
| `hooks/` | `useLikeToggle`, `usePoll`, `useRelationship`, `useNotifications`, `useUnreadBadge` |
| `testing/` | `fakeSocialTransport()` (in-memory backend with `fail`, `stall`, seed levers) and `describeSocialContract()` (the conformance suite) |
| `adapters/knf/` | the KNF backend adapter — `createKnfSocialTransport({ http })` over an injected HttpClient; its banner lists what the mapping smooths over (a toggle-style like route, post-addressed single-answer polls, request-id resolution for accept/decline/cancel, absorbed already-in-that-state refusals, no activity endpoints) |

Adapter authors start from the fake (the reference implementation) and
prove theirs with `describeSocialContract()` — the KNF adapter's own
contract test is the worked example. A backend that truly cannot
withdraw a sent request declares `supportsCancel: false` on its harness
and the suite skips that leg.

## Tests live in the package

`npm test` here runs every spec under `src/**/__tests__/` and
`example/__tests__/` with the jest-expo preset and this package's own
`babel.config.js` — no host needed. Specs sit beside what they pin;
`testing/` ships, `__tests__` does not (`files` in package.json).

- `src/__tests__/surface.test.ts` — the exact export list, the fake's
  method roster, the retry and auth judgements.
- `src/__tests__/contract.test.ts` — the conformance suite run against
  the fake, with a page size small enough to really cross the cursor.
- `src/core/__tests__/` — the shadow diff-merge, the toggle queue's five
  rules, poll arithmetic and gating, the grouping rules.
- `src/hooks/__tests__/` — the hooks against controllable transports:
  the instant flip, tap-spam coalescing, revert-and-notify, the auth
  route, the guest gate, cross-surface consistency, pessimistic votes,
  the badge's app-state behaviour.
- `example/__tests__/example.test.tsx` — the example screen end to end
  over the seeded fake.

## What the host supplies

- **`transport`** — an adapter (above).
- **`currentUser`** — `{ id, displayName, avatarUrl?, handle? }` or
  `null` for a guest. Guests read everything; a guest tap on any write
  routes to `onRequireAuth` and never touches the transport — auth adds
  features, it never gates reading.
- **`notify`** — receives `{ level, code, detail? }`; map
  `SocialNoticeCode` to your strings. Emitted today: `like_failed`,
  `vote_failed`, `relationship_failed`, `notifications_failed`, and
  `auth_required` (the default `requireAuth` when no `onRequireAuth` is
  passed). `poll_load_failed`, `block_failed` and `report_failed` are
  reserved in the enum — poll load failures render inline as an
  error-plus-retry state instead of a notice, and the moderation calls
  have no hook yet.
- **`onRequireAuth`** — open your login flow; called instead of the
  transport whenever a guest taps a write.
- **Base rows** — the immutable server truth from your own fetching
  layer. When rendering lists outside the hooks, merge them yourself
  with `mergePostShadow` / `mergeRelationship` before render.
- **`now`** — never passed by hosts; tests freeze it so poll expiry is
  deterministic.

## Behaviours worth knowing

- Every surface showing one id moves together: the feed, search results
  and the profile wall subscribe to the same shadow entry.
- Tap spam coalesces to at most the in-flight request plus the final
  intent; superseded taps abort silently (`AbortError`-shaped) and never
  notify.
- A like's failure taxonomy, exactly: superseded → nothing; 401/403 →
  revert and route to `onRequireAuth`; anything else → revert and notify
  `like_failed`. Comments like through the same hook
  (`useLikeToggle(comment, 'comment')`).
- Poll percentages are **exact** — labels round for display, bar widths
  must not, or a three-way split leaves a visible gap. The denominator
  prefers `voterCount` (distinct people) over `totalVotes` (sum of
  option counts), so multiple-answer bars never read too short.
- Poll expiry is judged twice on purpose: the server's `closed` flag AND
  the client clock against `expiresAt` — whichever says "over" first
  wins, so a poll ending between refetches locks its UI immediately.
- `revealResults()` is a local, one-way peek — it never travels to the
  server, never flips back, and resets when the poll id changes.
- The relationship model is the superset of request-style (connect →
  accept) and instant-connect backends: the optimistic guess for
  `connect` is `outgoing`, and the server's confirmed word — `connected`
  on an instant backend — wins over the guess. `blockedBy` renders
  nothing actionable, by design.
- Notification grouping: only `like` and `connect_accept` merge by
  default; a merge needs the same kind, the same subject and a stamp
  within 48 h of the group's newest member; actors dedupe and cap at 5
  while the originals ride along; a group reads as read only when every
  member does. Unknown kinds still render as standalone rows.
- `markAllRead` flips every held row optimistically, runs the wire call
  behind it, and on refusal restores exactly the flags it changed.
- Likes and relationship actions taken OFFLINE keep their optimistic
  shadows and wait in a persisted task queue (the provider's `storage`);
  `onNetworkRestore` — or the next signed-in mount — replays the
  viewer's FINAL intent per target, once. A live settle purges its
  queued twin; an account switch throws the departing intents away.
- The KNF adapter serves the activity list from `/social/activity`
  (opaque keyset cursor, mark-read, the unread probe), so
  `useNotifications` and `useUnreadBadge` run against the real backend.
- The unread badge polls only while the app is active; returning to the
  foreground probes immediately and resumes the cadence; a failed probe
  keeps the last shown value; the count caps as `30+` (configurable).
- Changing the signed-in account (including to or from guest) wipes both
  shadow stores.
