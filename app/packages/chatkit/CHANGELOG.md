# Changelog

## 1.2.0 — 2026-08-30

Media and structure. Studied how Stream sizes a single image and renders a
video thumbnail, how Flyer clamps image ratios, how Rocket.Chat and
gifted-chat treat video, and took the parts that held up.

- **Layout** — `src/` is split by purpose: `core/`, `provider/`, `hooks/`,
  `message/` (+ `attachments/`), `list/`, `menu/`, `composer/`, `avatar/`.
  Deep imports moved with the files (`@knf/chatkit/core/timeline`,
  `@knf/chatkit/list/MessageList`…); `@knf/chatkit/provider` still resolves.
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

Studied gifted-chat, Flyer chat-ui, Stream Chat RN and Rocket.Chat side by
side and took the ideas that held up (see README "Design notes"):

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
- **Component slots** — `ChatKitProvider components={…}` swaps
  TimeSeparator, TypingBubble, ConversationIntro, ScrollToLatestButton,
  SystemMessage, UnreadSeparator, UnreadPill, FloatingDay.
- **Reduced motion** — entering animations respect the OS preference
  (`useReducedMotionSafe`, tolerant of Reanimated builds without the hook).
- **`KitKeyboardAvoidingView`** — the keyboard rules, once, for the host's
  conversation screen.

## 1.0.0 — 2026-08-30

Extracted from the KNF app as a standalone package behind `ChatKitProvider`.
