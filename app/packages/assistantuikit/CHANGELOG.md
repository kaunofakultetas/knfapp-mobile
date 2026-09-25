# Changelog

## Unreleased — 2026-09-25

- **Host fonts** — `AssistantFonts` (`regular` / `medium` /
  `semibold` / `bold` / `mono`) on the thread, the provider and every
  text-drawing export; a mapped weight is drawn in its family with no
  synthesized `fontWeight`, an unmapped one keeps the system face.
  `defaultFonts` on the root export.
- **Touch floor** — the composer's Send/Cancel and field, the
  suggestion chips, the tool card's details toggle and the source
  rows all stand at 44pt; the "latest" disc reaches it by `hitSlop`.
- **Keyboard** — the column measures itself in the window: iOS gets
  the offset of a host header above it, Android pads only the part
  the keyboard covers.
- **Markdown** — a streaming answer re-parses only the block being
  written (`createStreamingParser`, internal); an emphasis opener
  with no possible closer is text at once (linear, not quadratic);
  a nested marker-kind switch becomes a second nested list (`next`);
  bare URLs and e-mail addresses are links.
- **Colours** — `brandText` joins `AssistantColors`: links and the
  details toggle are brand-coloured TEXT and take it, `brand` stays
  the fill (bubbles, buttons, dots).
- **Bubbles** — widths follow the live window (rotation,
  split-screen); the sources footer shows titles only, never the
  retrieval `section` key; the error strip is announced as an alert
  and its technical line is selectable.

## 1.0.0 — 2026-09-05

Chat surfaces over the upstream React Native primitives — every
label from the host, colours as tokens, no knowledge of any tool.

- **AssistantThread** — the screen body: message list, empty
  state, error strip and composer in one keyboard-safe column —
  iOS through the platform's avoiding view, Android by the kit's
  own pad whenever the edge-to-edge window keeps its height under
  the keyboard, drag-dismiss in the mode each platform honours;
  visible content held still while the tail grows, the upstream
  auto-scroll while pinned, a labelled "↓" button the moment an
  upward move leaves the tail (hysteresis: it stays until the
  reader is back); `contentPaddingBottom` pads the column under
  the composer, clear of a floating tab bar or home indicator.
- **AssistantMessage** — user bubble right on brand, assistant
  bubble left on surface; text through the streaming-aware
  markdown renderer, reasoning as a closed thinking row, tool
  calls as cards, typing dots while nothing has arrived; copy
  (only with a wired clipboard, dimmed without text to copy),
  regenerate on the last answer, the branch picker whenever a
  message has siblings with its arrows dimmed at their edge; a
  message that settled empty — a failed or cancelled run —
  renders no bubble, the error strip owns that moment.
- **Tool cards** — a name-keyed renderer registry handed the
  reduced part (`toolName`, `input`, `output`, `status`,
  `errorText` — string errors, Error-shaped objects and the
  runtime's `{ error }` envelope all reduced to their text); a
  name without a renderer falls to the generic card with the raw
  payload behind a toggle that announces its expanded state;
  own-property lookup. `ToolCardShell` is the shared frame.
- **AssistantComposer** — multiline to six lines, Send disabled
  on empty, Cancel while a run is in flight, submit by button only.
- **AssistantErrorBanner** — the host's words, the runtime's
  message, retry as a reload of the failed message.
- **TypingIndicator** — three dots on the core Animated module
  (the native driver only where one exists), placed still at half
  strength when the OS asks for less motion.
- **MarkdownText** + `parseMarkdown` — the small dialect a chat
  answer uses, tolerant of unterminated markers while streaming.
- **AssistantKitProvider** — the context that carries labels,
  colours and the tool registry to bubbles a host lays out itself.
- Suites over the real primitives and the real local runtime with
  a scripted model; stable testIDs for host tests.
