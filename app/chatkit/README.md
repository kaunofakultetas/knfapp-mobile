# chatkit

A reusable messaging kit for the app — the iMessage / Messenger
conversation experience without a SaaS dependency. The kit is
presentational: it renders the messages it is handed and calls back on
every intent; data, sockets and optimistic state stay in the host app's
hooks (`hooks/chat/*`).

## Pieces

| Piece | Role |
| --- | --- |
| `buildTimeline(messages, labels)` | Newest-first messages → rows. Consecutive same-sender messages within 3 min form a run (`GroupPosition` drives corner rounding, sender name, avatar, receipt); a centered time stamp (`Today 15:30`, `Yesterday`, weekday, date) is emitted on every day change or hour-long pause. Pure; memoize on the message array. |
| `MessageList` | Inverted FlatList (upright on web, with its own bottom-pinning), portraits beside incoming runs (`showAvatars`, direct and group alike), scroll anchoring with `autoscrollToTopThreshold` so a reader at the bottom follows new rows, rows keyed by `clientId` so an own send never remounts across the temp → server swap, history paging, the typing bubble at the bottom, the conversation intro at the top once history is exhausted, and a round scroll-to-latest button with a missed-message badge. Exposes `scrollToMessage(id)` / `scrollToLatest()` through its ref. Rows that arrive after mount slide in; history does not. |
| `MessageBubble` | Borderless grouped bubbles (brand for own, soft surface for others), reply quote block (tap → jump to the original, flash highlight), edge-to-edge photos, tappable links, unsent placeholder, reaction pills on the inner corner, receipt line (sending / sent / delivered / read / failed → retry), tap-to-reveal time, **swipe-to-reply** (pan gesture that fails on vertical movement; fires on release only while past the threshold), long-press that measures its frame for the context menu, screen-reader label with time and delivery state plus custom accessibility actions for every gesture. Memoised. `BubbleBody` is exported for the menu's floating copy. |
| `MessageContextMenu` | iMessage-style, hosted in a transparent full-window Modal so the header dims too: the pressed bubble floats in place (shifting only as far as needed, clipped when taller than the room left), reaction bar pops in above it (own reaction ringed; tap again clears), menu card below — Reply, Copy, Delete. Capabilities are snapshotted on open so the close animation stays intact; `onClosed` tells the host when to un-hide the source row. Android back and web Escape close it. |
| `Composer` | Photo button, growing pill field (1–5 lines) with the emoji toggle inside, send slot that cross-fades 👍 ⇄ brand arrow on a spring, reply strip with cancel (focuses the field), Enter-to-send on web (IME-safe), keyboard-aware bottom inset, counter near the limit. |
| `RoomHeaderTitle` | Portrait + name + status line (online / member count) for the stack header's `headerTitle` slot. |
| `TypingBubble`, `TimeSeparator`, `ConversationIntro`, `ReactionPills`, `ScrollToLatestButton`, `KitAvatar`, `StackedAvatars` | The parts, exported for custom layouts (`StackedAvatars` is a group's identity — two members' portraits overlapping, Messenger-style; also used by the conversation list rows). |

## Contract

Messages are the host's `ChatMessage` (re-exported as `KitMessage`):
`id, senderId, senderName, senderAvatar?, text, imageUrl?, createdAt (ISO),
isOwn, status, reactions[], replyTo?, deleted?`. The kit never mutates
them. Everything else arrives as props:

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
  onLongPressMessage={(target) => setMenuTarget(target)}   // { message, position, frame }
  onSwipeReply={setReplyTo}
  onPressQuote={jumpToQuoted}
  onPressImage onPressReactions onRetry onPressLink
/>
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
  `onBrandWash` plus the generic `ink*`, `surface*`, `line*`, `brand*`,
  `danger*`, `scrim`, `success`, `brandHeader`.
- **Fonts** through `constants/theme.ts` `fonts` (regular / medium /
  semiBold / bold).
- **NativeWind tokens** used by a handful of layout classes: spacing
  `sm`/`md`, colours `text-ink*`, `bg-surface*`, `bg-brand`,
  `bg-menu-surface`, `border-line`, `text-on-brand`, and the
  `font-raleway*` families.
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
