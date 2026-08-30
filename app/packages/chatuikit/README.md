# chatuikit

A reusable messaging UI kit for Expo / React Native — the iMessage /
Messenger conversation experience without a SaaS dependency. The kit is
presentational: it renders the messages it is handed and calls back on
every intent; data, sockets and optimistic state stay in the host app's
hooks — in this repo, `@knf/chatengine` (`packages/chatengine`), whose
hooks hand this kit `ChatMessage` rows that are structurally `KitMessage`.

The package is standalone: nothing in `src/` imports from the host (an
ESLint rule enforces it), and everything host-specific arrives through
one provider:

```tsx
import { ChatUiKitProvider, defaultLabels } from '@knf/chatuikit';

<ChatUiKitProvider
  theme={{ colors, fonts }}          // KitTheme — 24 colour tokens + 4 font families (see theme.ts)
  labels={labels}                    // KitLabels — or defaultLabels.lt / defaultLabels.en
  locale="lt"                        // for the timeline's day labels
  resolveImageUrl={toLoadableUrl}    // stored image ref → URL expo-image can load (or null)
  formatTime={iso => '15:30'}        // the short time under a bubble
>
  …screens that render kit components…
</ChatUiKitProvider>
```

Every field is optional and falls back to neutral defaults (a system-font
light palette, English labels, an identity resolver), so tests and demos
need no ceremony — `example/ExampleConversation.tsx` renders a fake
conversation with no host at all, and `example/ExampleRoom.tsx` is the
reference pairing with `@knf/chatengine` (the engine's hooks over a fake
transport drawn by this kit — timeline from `conversation.messages`, every
kit callback answered by an engine action, the context menu's host rows
carrying Edit). In this app the provider is mounted by
`components/chat/ChatUiKitHost.tsx`, which maps the KNF palette, Raleway,
the `chat.*` catalog and `getUploadUrl` onto it.

## Layout

`src/` is split by purpose, so a reader (and a future fork) finds a piece
by what it does:

| Folder | What lives there |
| --- | --- |
| `core/` | Pure logic, no React Native rendering: `types.ts` (the message contract), `timeline.ts` (messages → rows), `linkify.ts`, `media.ts` (the media fitting rule, duration / size formatters), `metrics.ts` (the geometry constants) |
| `provider/` | The host seam: `ChatUiKitProvider` + the `useKit*` hooks (`index.tsx`), `theme.ts`, `labels.ts` |
| `hooks/` | Cross-cutting React hooks (`a11y.ts`: reduced motion, screen-reader state) |
| `message/` | One row and its parts: `MessageBubble`, `ReplyQuote`, `MessageText`, `ReactionPills`, `SystemMessage`, and `attachments/` — `ImageAttachment`, `VideoAttachment`, `FileCard`, `VideoPlayerModal` |
| `list/` | The timeline: `MessageList` and its furniture (`TimeSeparator`, `FloatingDay`, `UnreadSeparator`, `UnreadPill`, `ScrollToLatestButton`, `TypingBubble`, `ConversationIntro`) |
| `menu/` | `MessageContextMenu` |
| `composer/` | `Composer`, `KitKeyboardAvoidingView` |
| `avatar/` | `KitAvatar`, `StackedAvatars`, `RoomHeaderTitle` |

`index.ts` is the public surface; deep imports (`@knf/chatuikit/core/timeline`)
work for the pure helpers. An ESLint rule keeps every file inside the
package (`../../../*` and beyond, and `@/*`, are refused).

## What a host gets

| Area | Kit |
| --- | --- |
| Message kinds | text, photo, **video** (poster + play disc + duration, played through `VideoPlayerModal`), **file** (document card with an extension-keyed glyph), **system** (centred caption) — `messageKind()` infers text/photo/video/file from what the message carries, so hosts that only send text and photos set nothing |
| Media sizing | photos and posters render at their **natural proportions** through one rule, `fitMedia()` (a single-image fit with ratio clamps): the box is a share of the viewport, portraits are height-bound, panoramas crop at 2.2:1; a host that passes `mediaSize` gets the final layout on the first frame, one that does not gets a 4:3 guess that settles on load |
| Editing | an **edited** mark on the time line (`editedAt`), an **editing strip** in the composer (`editing` / `onCancelEdit`) with the send slot morphing into a check |
| Guests | `Composer canSend={false}` locks the field and buttons and says why (`labels.signInToChat`) |
| Kinds | `custom` messages render through `components.MessageBody`; an unknown kind shows the unsupported placeholder, never a blank bubble |
| Keyboard | `KitKeyboardAvoidingView` handles iOS padding, Android adjustResize AND Android edge-to-edge (pads by the keyboard height when the window did not resize); `keyboardVerticalOffset` for non-root screens |
| Avatars | per-sender disc colour by hash (`theme.avatarColors`), tappable (`onPressAvatar`) |
| Empty state | `components.EmptyState` / `labels.emptyChat` once history is known to be empty |
| Grouping | runs by sender within 3 min, day/time separators, the **unread line** above the first unread row |
| Overlays | scroll-to-latest with a missed-count badge, the **"N new messages ↑" pill** until the unread line has been seen, the **floating date** while scrolling |
| Detached window | a jump deep into history (`hasNewer`) shows a **"Newer messages" row** at the visual bottom (`onLoadNewer`, auto on reaching the edge) and forces the scroll button, badged with the engine's `missedCount`, its press routed through `onReturnToLatest` |
| Galleries | 2+ photos in one message tile as an **album** (pair / hero-over-pair / 2×2, a "+N" wash past four), every tile its own tap target (`onPressGalleryImage`), the count spoken (`labels.gallery`) |
| Voice notes | an **audio row** (play/pause, progress, remaining time; expo-audio as an optional render-time peer) and the composer's **recording bar** (mic button, red dot + elapsed, discard / send) — recording itself stays the host's |
| Mentions | an **@-completion strip** in the composer (`mentionCandidates`, folded prefix matching) and **highlighted "@Name" runs** in bubbles (`mentionNames`, tap → `onPressMention`) |
| Screen readers | with TalkBack/VoiceOver running the list goes **upright** (oldest-first, no inverted transform — swipe order reads chronologically), with explicit paging rows instead of edge auto-load |
| Polish | **blur placeholders** on every picture, an **upload-progress bar** on sending bubbles, **voice waveforms** with tap-to-seek, the **pinned** and **connection** banners, the forwarded mark, the disappearing-messages glyph, a **bubble guard** (a crashing custom renderer degrades to the unsupported row), and the composer's **camera shortcut** |
| Bubble | reply quote (tap → jump + flash), edge-to-edge photos, tappable **URLs, e-mails and phone numbers**, a **link preview card** when the message carries one (`linkPreview` — image, site name, title, description; tap → `onPressLink`), unsent placeholder, reaction pills, receipts, tap-to-reveal time, swipe-to-reply |
| Menu | reactions bar + Reply / Copy / **host actions** (`actions` — Report, Pin, Forward…) / Delete, floating copy of the bubble |
| Composer | photo/video and document attach buttons (each with its own busy state), growing field, emoji toggle, 👍 ⇄ send ⇄ save morph, reply / editing strip, Enter-to-send on web, keyboard-aware inset |
| Theme | 24 colour tokens, 4 font families, **text styles** (`body / name / caption / time`) |
| Accessibility | labels + custom actions per gesture, new-message announcements, **reduced-motion** respected |
| Swap-outs | `components={…}` on the provider for the time separator, typing bubble, intro, system row, unread line, unread pill, floating day, scroll button, empty state, custom message body |
| Escape hatches | `flatListProps` on the list, `textInputProps` on the composer — the kit's own props win where they overlap |

## Tests

`npm test` in this folder runs `src/**/__tests__/` (jest-expo + the
package's own babel config) without the host app: the pure helpers
(`linkify`, `buildTimeline`, `fitMedia`, `buildMenuRows`, `replySnippet`,
`fileGlyph`), the a11y hooks, and render-level pins for `MessageList` /
`MessageBubble`. `__tests__` is excluded from the published `files`.

## Design notes

What the kit keeps on purpose: a *derived* timeline (positions computed
once per list, not per row at render); one provider seam instead of
forty `render*` props; a data-driven menu with capability predicates; a
message-kind union so new content types are additive; and zero engine —
sockets, optimistic state and pagination stay the host's, which is what
keeps it backend-agnostic.

Resolution: the app aliases `@knf/chatuikit` to `packages/chatuikit/src` in
`tsconfig.json` (paths) and `babel.config.js` (module-resolver), which
covers Metro, tsc and jest alike; `package.json` carries the peer
dependencies for the day it is published or moved to a workspace.

## Pieces

| Piece | Role |
| --- | --- |
| `buildTimeline(messages, labels)` | Newest-first messages → rows. Consecutive same-sender messages within 3 min form a run (`GroupPosition` drives corner rounding, sender name, avatar, receipt); a centered time stamp (`Today 15:30`, `Yesterday`, weekday, date) is emitted on every day change or hour-long pause. Pure; memoize on the message array. |
| `MessageList` | Inverted FlatList (upright on web, with its own bottom-pinning), portraits beside incoming runs (`showAvatars`, direct and group alike), scroll anchoring with `autoscrollToTopThreshold` so a reader at the bottom follows new rows, rows keyed by `clientId` so an own send never remounts across the temp → server swap, history paging, the typing bubble at the bottom, the conversation intro at the top once history is exhausted, and a round scroll-to-latest button with a missed-message badge. Exposes `scrollToMessage(id)` / `scrollToLatest()` through its ref. Rows that arrive after mount slide in; history does not. |
| `MessageBubble` | Borderless grouped bubbles (brand for own, soft surface for others), reply quote block (tap → jump to the original, flash highlight), edge-to-edge photos and video posters at their natural proportions, document cards, tappable links, unsent placeholder, reaction pills on the inner corner, receipt line (sending / sent / delivered / read / failed → retry), tap-to-reveal time, **swipe-to-reply** (pan gesture that fails on vertical movement; fires on release only while past the threshold), long-press that measures its frame for the context menu, screen-reader label with time and delivery state plus custom accessibility actions for every gesture. Memoised. `BubbleBody` is exported for the menu's floating copy. |
| `MessageContextMenu` | iMessage-style, hosted in a transparent full-window Modal so the header dims too: the pressed bubble floats in place (shifting only as far as needed, clipped when taller than the room left), reaction bar pops in above it (own reaction ringed; tap again clears), menu card below — Reply, Copy, Delete. Capabilities are snapshotted on open so the close animation stays intact; `onClosed` tells the host when to un-hide the source row. Android back and web Escape close it. |
| `Composer` | Media (photo / video) and paperclip buttons, growing pill field (1–5 lines) with the emoji toggle inside, send slot that cross-fades 👍 ⇄ brand arrow (⇄ check while editing) on a spring, reply / editing strip with cancel (focuses the field), Enter-to-send on web (IME-safe), keyboard-aware bottom inset, counter near the limit. |
| `ImageAttachment`, `VideoAttachment`, `FileCard`, `VideoPlayerModal` | The attachment renderers, exported for custom bubbles. `VideoPlayerModal` is a full-window expo-video stage the host mounts while a video is open; expo-video is an optional peer, required at render time, so a host without it still bundles the kit and the modal explains itself instead of crashing. |
| `fitMedia`, `mediaBoxFor`, `formatDuration`, `formatBytes`, `replySnippet`, `fileGlyph` | Pure helpers, tested. |
| `RoomHeaderTitle` | Portrait + name + status line (online / member count) for the stack header's `headerTitle` slot. |
| `TypingBubble`, `TimeSeparator`, `ConversationIntro`, `ReactionPills`, `ScrollToLatestButton`, `KitAvatar`, `StackedAvatars` | The parts, exported for custom layouts (`StackedAvatars` is a group's identity — two members' portraits overlapping, Messenger-style; also used by the conversation list rows). |

## Contract

Messages are the kit's own `KitMessage` (a host type only has to be
structurally compatible — extra fields are fine):
`id, senderId, senderName, senderAvatar?, text, imageUrl?, createdAt (ISO),
isOwn, status, reactions[], replyTo?, deleted?` plus the optional
`kind`, `video` (`KitVideo`: uri, thumbnailUri, duration…), `file`
(`KitFile`), `mediaSize` (natural pixel size) and `editedAt`. The kit
never mutates them. Everything else arrives as props:

```tsx
const timeline = useMemo(() => buildTimeline(messages, { today, yesterday, locale }), [messages]);

<MessageList
  ref={listRef}
  items={timeline}
  typing={{ label: 'Ona rašo…', name, avatarUrl } /* or null */}
  isGroup={isGroup}
  showAvatars
  intro={{ title, subtitle, avatarUrl, isGroup }}
  loadingOlder hasMore onLoadOlder
  revealedId highlightedId
  onPressMessage={toggleTime}
  menuTargetId={hiddenId}                                   // hidden under the floating copy
  canAct={(m) => !isOptimistic(m)}
  canReply={(m) => !isOptimistic(m) && !m.deleted}
  onLongPressMessage={(target) => setMenuTarget(target)}   // { message, position, frame }
  onSwipeReply={setReplyTo}
  onPressQuote={jumpToQuoted}
  onPressImage onPressVideo onPressReactions onRetry onPressLink
/>

{playing ? <VideoPlayerModal visible uri={playing} onClose={() => setPlaying(null)} /> : null}
```

The screen in `app/(main)/chat-room/index.tsx` is the reference wiring
(presence polling, jump-to-quoted / search jump, temp-message rules).

## Theming and strings

Colours come from `useTheme()`; the kit relies on dedicated palette
tokens — `chatCanvas`, `bubbleIn`, `bubbleOut`, `quoteWash` — so a host
supplies its look in one place. Every string goes through `labels.ts`
(`useKitLabels()`), the kit's only i18n touchpoint; copy the `chat`
block of `i18n/lt.json` when reusing the kit elsewhere.

## Platform notes

- Reanimated `Animated.View` ignores `className` — animated nodes use
  plain styles. A NativeWind `Pressable` with a `className` drops
  function-styles on web — static colours live in classes, pressed
  feedback in `active:` variants.
- react-native-web renders inverted lists rotated; `MessageList` keeps
  one `isWeb` branch (upright array, bottom pinning, explicit
  load-older row).
- Nested buttons are invalid HTML, so inner pressables (quote, photo,
  links) carry labels but no button role; the bubble is the button.
- There is no pull-to-refresh: the socket keeps the feed live and a
  RefreshControl on an inverted list renders upside-down.

## What the host must supply

- **Palette** through `useTheme()` — the kit reads `chatCanvas`,
  `bubbleIn`, `bubbleOut`, `quoteWash`, `menuSurface`, `shadow`,
  `accent`, `onBrand`, `onBrandWash` plus the generic `ink*`,
  `surface*`, `line*`, `brand*`, `danger*`, `scrim`, `success`,
  `brandHeader`.
- **Fonts** through `constants/theme.ts` `fonts` (regular / medium /
  semiBold / bold).
- **NativeWind tokens** used by a handful of layout classes: spacing
  `sm`/`md`, colours `text-ink*`, `text-brand`, `bg-surface*`,
  `bg-brand`, `bg-menu-surface`, `border-line`, `text-on-brand`, and
  the `font-raleway*` families.
- **Strings** through `labels.ts` (`useKitLabels()`), which maps the
  `chat.*` / `common.*` i18n keys — the kit's only i18n touchpoint.
- **Resolvers**: `getUploadUrl` (relative upload paths → absolute) and
  `formatTime` from `services/format`.

## Extracting to a package

Inline `ChatMessage`, `ChatReaction`, `ChatReplyRef` into `types.ts`;
replace `labels.ts` with a labels prop or context; swap `useTheme` /
`fonts` for an injected theme object; convert the few NativeWind
classes listed above to style objects; inject `getUploadUrl` /
`formatTime`. Nothing else reaches into the app.
