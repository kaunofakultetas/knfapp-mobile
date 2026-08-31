# socialuikit

A reusable social-feed UI kit for Expo / React Native — post cards, media
albums, link previews, polls, comments, profile headers, connect buttons,
activity rows and feed chrome without a SaaS dependency. The kit is
presentational: it renders the rows it is handed and calls back on every
intent; fetching, caching, optimistic state and relationship machinery
stay in the host's hooks — in this repo `@knf/dataengine` (the data
layer) and `@knf/socialengine` (the interactions layer), whose domain
types are structural twins of this kit's `Kit*` shapes.

The package is standalone: nothing in `src/` imports from the host (an
ESLint rule enforces it), and everything host-specific arrives through
one provider:

```tsx
import { SocialUiKitProvider } from '@knf/socialuikit';

<SocialUiKitProvider
  scheme="light"                            // or 'dark' — picks the base theme
  theme={{ colors: { brand: '#7B003F' } }}  // deep partial, merged over the scheme's base
  locale="lt"                               // 'lt' (default) or 'en' picks the label catalog
  labels={{ share: 'Dalintis' }}            // partial, merged over the locale's defaults
  components={{ Avatar }}                   // swap-outs: Avatar, PostPoll, EmptyState
  env={{ resolveImageUrl, openHref, now }}  // the three host functions
>
  …screens that render kit components…
</SocialUiKitProvider>
```

Every field is optional and falls back to neutral defaults (the light
faculty-burgundy theme, Lithuanian labels, an identity URL resolver, a
no-op link opener, the real clock), so tests and demos need no ceremony.
`example/ExampleFeedScreen.tsx` renders the whole kit on one screen with
no host and no server — the dataset, optimistic like flips, a live poll
through `pollSlot`, the connect flow and the comment bar — and is the
wiring a host copies.

## Layout

`src/` is split by purpose, so a reader (and a future fork) finds a
piece by what it does:

| Folder | What lives there |
| --- | --- |
| `core/` | Pure logic, no rendering: `types.ts` (the view vocabulary — `KitPost`, `KitPoll`, `KitNotification`…), `format.ts` (`formatCount`, `clampSnippet`) |
| `provider/` | The host seam: `SocialUiKitProvider` + the `useKit*` hooks (`index.tsx`), `theme.ts`, `labels.ts` |
| `time/` | `RelativeTime` — the self-updating stamp and (with `hasFuture`) the countdown |
| `post/` | `PostCard` and its `ActionRow` |
| `media/` | `MediaGallery` (+ the pure `gallerySpans` layout table), `LinkCard` |
| `poll/` | `PollBlock` — ballots on one face, tallies on the other |
| `comments/` | `CommentRow`, `CommentComposer` |
| `social/` | `ConnectButton`, `ProfileHeader` |
| `notifications/` | `NotificationRow` |
| `feed/` | `FeedList`, `NewPostsPill`, `GapRow` (the visible timeline hole, tap-to-fill), `RowErrorBoundary` |

`index.ts` is the public surface, pinned by `src/__tests__/surface.test.ts`;
an ESLint rule keeps every file inside the package.

## What a host gets

| Area | Kit |
| --- | --- |
| Card content | author row (portrait, name, self-updating stamp, **edited** mark, **source chip**), body folded at `snippetLength` with a read-more hint only when the fold actually cut something, at most **one** attachment block (media beats link — a shared article with photos reads as an album, never both), the poll slot, the action strip, and a **deleted** face that keeps the card's slot with nothing left to press |
| Gallery rules | albums render in a fixed **3:2 frame** whatever the count, so the feed scrolls at a steady rhythm; a **lone image keeps its own proportions** (aspect clamped to 0.5–2.2, unknown size falls back to 3:2); at most four tiles with a **"+N" wash** on the last; video tiles carry a play glyph and a duration chip; described media gets the ALT badge; `gallerySpans` is the layout table, exported pure |
| Link cards | sized by what the unfurler found — image → large card, description → compact row, bare url+title → one minimal line; the site line falls back to the hostname stripped of `www.`; the whole card is one accessibility element ("site — title") |
| The poll contract | **display truth only** — the kit never counts, never fetches, and a cast vote only becomes real when the host reflects it back through `poll.votedByMe`; results show whenever there is nothing left to ask (voted / closed / expired on the provider's clock) or after the one-way "see results" peek; single-choice rows are radios whose **tap is the vote**, multi-choice rows collect ticks for one submit; bars are drawn at the **exact** share while labels round; ties share the crown; both faces fold past four options |
| Guest-first | auth adds features, never gates reading: `CommentComposer canComment={false}` degrades to a friendly prompt with a sign-in button, `PollBlock signedOut` puts the sign-in hint where submit would be, and `ConnectButton` renders **nothing** for `self` — and nothing for `blockedBy`, because a block must never advertise itself to its target |
| Optimistic likes | the card is a pure, memo-wrapped renderer — `likedByMe` and the counts arrive from the host, so an optimistic toggle just patches the feed item; `ActionRow pendingLike` dims the heart but keeps it tappable (the host's queue coalesces rapid flips) |
| Feed chrome | a top-down FlatList where **every row is sealed in its own error boundary** (one malformed post fails alone, with a try-again that re-renders it); paging ignores the mount-time zero-distance misfires and stays inert without `hasMore` or during a page; pull-to-refresh mounts only when wired; the **new-posts pill** scrolls back to the top AND reports to the host; virtualisation tuned for card-sized rows; `flatListProps` as the escape hatch (the kit's own props win) |
| Activity | grouped rows — up to five stacked portraits, the sentence built by the label functions ("Ona ir dar 3 žmonės pamėgo jūsų įrašą"), a one-line subject snippet; **unknown kinds degrade** to a generic line instead of crashing old clients; unread rows take the tint, the brand dot and a `-unread` testID |
| Comments | the composer owns its draft and clears **only when `onSubmit` resolves true** (false keeps the text for a retry); whitespace never submits; a second tap mid-flight is swallowed; the bottom edge is safe-area aware while the keyboard is down |
| Time | `RelativeTime` keeps itself honest on **one** timeout aimed at the next text-change boundary (never sooner than 10 s); `hasFuture` turns it into a countdown; a future stamp without it is treated as clock skew and reads "Ką tik" |
| Accessibility | cards are `accessible={false}` so the author row, tiles, link and actions stay **separate stops**; an activity row is deliberately **one** target with one spoken sentence (it has exactly one action); spoken action names carry the live tally and flip with state ("Patinka, 12 patiktukų" → "Nebepatinka, …"); every part carries a `socialuikit-*` testID |
| Theming | 18 colour tokens, 3 font slots, 3 radii; light and dark bases with `resolveTheme` deep-merging a host partial — overriding one colour never costs the rest |
| Hardening | `parseServerStamp` reads zone-less server stamps as UTC (a SQLite default must never render device-local); `isSafeHref` gates link taps to web schemes; `clampSnippet` never splits an emoji, flag pair or joiner family |
| Labels — LT first | every string flows through the catalog; **count-taking keys are functions** because Lithuanian declines the noun three ways (1 įrašas / 2 įrašai / 10 įrašų — teens take the third form) and a bare-number template cannot be localised after the fact; `defaultLabels` ships `lt` and `en`, a partial merges over the chosen locale |
| Slots | `components.Avatar` (every portrait everywhere), `components.PostPoll` (the poll body when the host passes no `pollSlot` — the poll payload rides in `post.custom`, typed only by the host), `components.EmptyState` |

## Tests

`npm test` in this folder runs `src/**/__tests__/` plus the example's
own spec (jest-expo + the package's babel config, `TZ=UTC` pinned)
without the host app: the pure helpers, the provider merge rules and
LT/EN catalog parity, render-level pins for every component, the poll
contract clause by clause, and the public surface. `__tests__` is
excluded from the published `files`.

## What the host must supply

- **Rows** in the `Kit*` shapes — structural compatibility is enough,
  extra fields are fine; `@knf/socialengine`'s domain types map with the
  identity function. The kit never mutates or re-derives them: counts,
  `likedByMe`, `isOwn` and poll tallies are display truth.
- **`env`** on the provider: `resolveImageUrl` (stored path → loadable
  URL), `openHref` (what tapping a link does — the kit never opens
  anything itself), `now` (the clock behind stamps, countdowns and poll
  expiry — inject a frozen one in tests).
- **Callbacks** per intent: like/comment/share taps, author and media
  taps, poll votes, connect verbs, notification opens, comment submits.
- **Theme and labels**: a deep theme partial mapping the host palette
  and fonts, and a label catalog (or a few overridden keys).
- **A `SafeAreaProvider`** above `CommentComposer`
  (react-native-safe-area-context) — the example mounts its own.
- **Everything that navigates**: routing, auth flows, share sheets,
  image viewers. The kit hands back intents; the host decides where
  they lead.

Resolution: the app aliases `@knf/socialuikit` to
`packages/socialuikit/src` in `tsconfig.json` (paths) and
`babel.config.js` (module-resolver), which covers Metro, tsc and jest
alike; `package.json` carries the peer dependencies for the day it is
published or moved to a workspace.

## Pairing with the engines

The kit is one of three independent packages that meet only in the
host — none of them import each other:

- **`@knf/dataengine`** — the data layer: offline-first single-resource
  loads, paginated feeds with a merge refresh, a TTL cache and
  refetch-on-reconnect behind injected storage and network sources. It
  produces the row arrays and paging flags `FeedList` asks for
  (`items`, `hasMore`, `loadingMore`, `refreshing`, `newCount`).
- **`@knf/socialengine`** — the interactions layer: optimistic likes
  over a shadow cache with coalesced toggle queues, a relationship
  state machine, pessimistic poll voting, notification grouping and the
  unread badge, behind one transport interface. Its hooks answer the
  kit's callbacks (`onPressLike`, `onVote`, the connect verbs) and hand
  back the patched display truth the kit re-renders.

Because the engine's domain types and this kit's view types are
structural twins, the host's glue is mostly prop-plumbing: rows straight
from the engines into the components, intents straight back into engine
actions. `example/ExampleFeedScreen.tsx` shows the same loop with plain
`useState` standing in for both engines.
