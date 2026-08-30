# Changelog

## 1.9.1 — 2026-08-30

- **Fix** — the context menu ran past the bottom edge on a message low
  on the screen: the stack clamp counted only Reply / Copy / Delete
  while the card also renders every host action. The clamp now
  measures the SAME rows the card draws, and a menu taller than the
  room left is capped and scrolls inside its card.

## 1.9.0 — 2026-08-30

The polish batch.

- **Blur placeholders** — photos, gallery tiles, video posters and
  link-card pictures draw their ~14px micro copy
  (`mediaPreview` / item `preview` / `imagePreview`) while the bytes
  download.
- **Upload progress** — a slim bar along the sending bubble's bottom
  edge follows `uploadProgress`.
- **Voice waveforms** — `KitAudio.waveform` draws amplitude bars in
  place of the plain track; a tap along either seeks.
- **PinnedBanner** — the room's pinned message above the list: snippet,
  a "1/3" counter, taps hand each shown pin up and cycle.
- **ConnectionBanner** — "Connecting…" / "No connection" strip; the
  host maps its engine status and network flag.
- **Forwarded mark** — the small italic row on a re-sent message
  (`message.forwarded`, `labels.forwarded`); a tiny timer glyph joins
  the time line while `expiresAt` is set.
- **Bubble guard** — a crashing custom renderer degrades to the
  unsupported row instead of killing the list.
- **Camera shortcut** — `onAttachCamera` draws a camera button inside
  the empty field.
- **Labels** — `connecting`, `noConnection`, `pinnedMessage`,
  `forwarded`, `attachCamera`.

## 1.8.0 — 2026-08-30

The upright list under a screen reader.

- **TalkBack/VoiceOver mode** — while a screen reader runs, the native
  list drops its inversion (the scaleY transform breaks swipe order):
  rows render oldest-first top to bottom — the web's proven upright
  path — older history pages through the explicit "Older messages"
  row, a detached window through "Newer messages", and the newest edge
  stops firing the older-page loader. Flips live when the reader
  toggles. `useScreenReaderEnabled` (the state twin of the ref hook)
  is exported for hosts.

## 1.7.0 — 2026-08-30

Mentions.

- **@-completion in the composer** — `mentionCandidates` (id, name,
  avatar): an "@partial" token at the cursor opens a horizontal strip
  of members (folded matching — case- and diacritic-insensitive,
  prefix first); a pick replaces the token with the full "@Name ".
- **Highlighted runs in the bubble** — `linkify(text, { mentionNames })`
  claims "@Name" runs at word boundaries (longest member name first,
  never inside an e-mail); `MessageList mentionNames` /
  `onPressMention(name, message)` make them tappable (open the
  member). `labels.mentionUser`.

## 1.6.0 — 2026-08-30

Voice notes.

- **AudioAttachment** — the voice-note row: round play/pause, a
  progress track, the remaining time while playing. Playback rides
  expo-audio, an OPTIONAL peer required at render time (a host
  without it gets an inert row that still names itself and its
  length). `KitMessage.audio`, `'audio'` in the kinds.
- **Composer recording bar** — with `onStartRecording` the mic button
  joins the attach buttons; while `recording` the whole row swaps for
  the bar (red dot, elapsed, discard, send) so nothing else can be
  tapped mid-take. Recording itself stays the HOST's (permission, the
  recorder) — the kit only draws.
- **Labels** — `voiceNote`, `recordVoice`, `sendVoice`,
  `cancelRecording`, `playVoice`, `pauseVoice`; reply quotes and
  spoken bubbles name a voice message properly.

## 1.5.0 — 2026-08-30

Gallery bubbles.

- **GalleryAttachment** — 2+ photos tile edge to edge: a pair of
  squares, a wide hero over a pair for odd counts, 2×2 past that, and
  a "+N" wash on the fourth tile for the rest. Every tile is its own
  tap target (`onPressGalleryImage(message, index)` threads from the
  list; absent, tiles fall back to `onPressImage`), long-presses reach
  the bubble menu, and the album speaks its count (`labels.gallery`).
  `KitMessage.gallery`; a lone photo keeps the classic full-bleed path.

## 1.4.0 — 2026-08-30

Link previews and the detached window.

- **LinkPreviewCard** — the card under a text message whose first link
  the backend unfurled: image, site name, title and a line of
  description, drawn on the bubble's ground; tap opens through
  `onPressLink`. `KitMessage.linkPreview`, `labels.linkPreview`.
- **Detached window** — a jump deep into history hands the list
  `hasNewer`: a "Newer messages" row appears at the visual bottom (a
  tap — or reaching the edge, natively — pulls the next page through
  `onLoadNewer`), and the scroll-to-latest button is FORCED, badged
  with the engine's `missedCount`, its press routed through
  `onReturnToLatest`. `loadingNewer` swaps the row for a spinner;
  `labels.loadNewer`.

## 1.3.0 — 2026-08-30

A review of the kit against production chat clients — platform
workarounds, feature surface, test coverage — and what came out of it.

- **Android edge-to-edge keyboard** — `KitKeyboardAvoidingView` pads by
  the keyboard height when the window did not resize; typed
  `keyboardVerticalOffset` and `behavior` props.
- **Fabric** — `pointerEvents` lives in `style` on every animated view.
- **List** — autoscroll threshold lifted while the context menu is open;
  `onEndReached` ignores non-positive distances; `scrollToIndex` is
  guarded, retries climb the measured frontier (12, deferred a frame);
  `EmptyState` slot + `labels.emptyChat`; list-level `scrollToLatest`
  accessibility action; `onAtLatestChange`; `onPressAvatar`;
  `flatListProps` passthrough; `testID="chatuikit-message-list"`.
- **Composer** — `canSend` (guest lock strip, inert controls);
  `textInputProps` passthrough; `keyboardAppearance` from the theme's
  `scheme`; keyboard dismissed on an orientation change; the web Enter
  rule reads `Platform.OS` at call time.
- **Kinds** — `custom` rendered through `components.MessageBody`; any
  unknown kind renders `labels.unsupportedMessage` instead of a blank
  bubble; `KNOWN_KINDS`.
- **Avatars** — per-sender disc colour by hash (`avatarColorFor`,
  `theme.avatarColors`, `DEFAULT_AVATAR_COLORS`), tappable portraits.
- **Theme** — `scheme`, `avatarColors`, `darkTheme`.
- **Labels** — partial `labels` merged over the locale's defaults;
  `emptyChat`, `signInToChat`, `unsupportedMessage`, `openProfile`.
- **Media** — extreme-aspect photos (a long screenshot) render as a
  compact row (`isExtremeAspect`); reaction pills scale with the font
  scale; reduced motion on the swipe spring, the jump flash and the menu.
- **Links** — `openHref` / `normalizeHref` (scheme default, `canOpenURL`).
- **Robustness** — every haptics call swallows its rejection;
  `composeAccessibilityLabel` for row labels.
- **Tests** — Composer, MessageList behaviour, attachments, bubble
  kinds/a11y, avatar, provider merge, keyboard view, openHref; `TZ=UTC`
  pinned; a public-surface pin.

## 1.2.1 — 2026-08-30

- Renamed: the package is `@knf/chatuikit` (folder `packages/chatuikit`,
  provider `ChatUiKitProvider`). The data engine now lives beside it in
  `@knf/chatengine`; the two never import each other.
- `Composer`'s `editing` prop accepts any `{ id, text }` (the engine's
  `EditTarget`).
- `example/ExampleRoom.tsx` — the kit drawn by `@knf/chatengine` over a fake
  transport (the reference pairing).
- Specs moved inside the package (`src/**/__tests__/`, beside what they
  pin) with their own `npm test`; the two that reached into the app were
  decoupled (the components spec now types rows as `KitMessage`, the
  timeline spec likewise). The app's labels-hook test stayed in the app.

## 1.2.0 — 2026-08-30

Media and structure: single-image sizing, video thumbnails, ratio
clamping and video handling the way mature chat clients do them.

- **Layout** — `src/` is split by purpose: `core/`, `provider/`, `hooks/`,
  `message/` (+ `attachments/`), `list/`, `menu/`, `composer/`, `avatar/`.
  Deep imports moved with the files (`@knf/chatuikit/core/timeline`,
  `@knf/chatuikit/list/MessageList`…); `@knf/chatuikit/provider` still resolves.
- **Natural proportions** — photos are no longer forced square by the picker
  crop, and every media bubble sizes through one rule, `fitMedia()`
  (`core/media.ts`): a viewport-share box, height-bound portraits, ratio
  clamps at 0.5–2.2, minimums, integer results. `KitMessage.mediaSize` lays a
  bubble out at its final size on the first frame.
- **Video** — `kind: 'video'` / `KitMessage.video` (`KitVideo`): the poster at
  its proportions with a play disc and the duration badge, a dark stage when
  there is no poster, a spinner while an own send uploads. `onPressVideo` on
  the list; `VideoPlayerModal` (expo-video, optional peer, required at render
  time) plays it full-window with native controls.
- **Files** — `FileCard` moved to `message/attachments/`, glyph keyed to the
  extension (`fileGlyph`), tolerant long-press.
- **Edits** — `KitMessage.editedAt` puts an "edited" mark on the time line;
  the composer takes `editing` / `onCancelEdit` (an editing strip, the send
  slot becomes a check, attach buttons dim).
- **Composer** — `onAttachMedia` (photo or video) and an optional
  `onAttachFile` paperclip, each with its own busy flag (`uploadingMedia`,
  `uploadingFile`); the reply strip's snippet comes from `replySnippet()`,
  which knows every kind.
- **Reply quotes** — `KitReply.kind` / `fileName`, so a quote of a video or a
  document says so.
- Labels: `video`, `videoUnavailable`, `playVideo`, `attachMedia`,
  `attachFile`, `uploadingMedia`, `uploadingFile`, `edited`,
  `editingMessage`, `cancelEdit`, `saveEdit` (LT + EN defaults).
- Breaking: `Composer` props `onAttachImage` → `onAttachMedia`,
  `uploadingImage` → `uploadingMedia`; `ReplyQuote`, `MessageText` and
  `FileCard` are their own modules (all re-exported from the index).

## 1.1.0 — 2026-08-30

Took the ideas from mature chat clients that held up (see README "Design
notes"):

- **Message kinds** — `KitMessageKind` (`text | image | file | system`) with
  `messageKind()` inference, so existing text/photo hosts change nothing.
  `system` rows render as centred captions (never grouped, never actionable);
  `file` messages render a document card that hands its uri to the link
  handler.
- **Menu registry** — `MessageContextMenu` takes `actions: KitMessageAction[]`
  (label, icon, `visible(message)`, `onPress`) appended between Copy and
  Delete; `buildMenuRows` is exported and pure for tests.
- **Unread** — `buildTimeline(…, { unreadFromId, unreadCount })` places an
  `UnreadSeparator` line above the first unread row; `MessageList`'s `unread`
  prop floats an `UnreadPill` ("N new messages ↑") until that line has been
  on screen.
- **Floating day** — the Telegram-style date pill while scrolling
  (`floatingDay` prop, default on; `floatingDayFor` exported).
- **Links** — `linkify` also recognises e-mail (`mailto:`) and international
  phone numbers (`tel:`); segments carry `kind`.
- **Theme text styles** — `KitTheme.text` (`body / name / caption / time`)
  as `TextStyle` overrides; `resolveTheme` fills the rest from `fonts`.
- **Component slots** — `ChatUiKitProvider components={…}` swaps
  TimeSeparator, TypingBubble, ConversationIntro, ScrollToLatestButton,
  SystemMessage, UnreadSeparator, UnreadPill, FloatingDay.
- **Reduced motion** — entering animations respect the OS preference
  (`useReducedMotionSafe`, tolerant of Reanimated builds without the hook).
- **`KitKeyboardAvoidingView`** — the keyboard rules, once, for the host's
  conversation screen.

## 1.0.0 — 2026-08-30

Extracted from the KNF app as a standalone package behind `ChatUiKitProvider`.
