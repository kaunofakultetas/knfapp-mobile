# assistantuikit

Chat surfaces for an AI assistant, built on the upstream React
Native primitives and nothing else: a keyboard-safe thread with an
empty state and suggestion chips, user and assistant bubbles with
streaming markdown, a collapsible thinking row, tool cards behind a
name-keyed renderer registry, a typing indicator, copy / regenerate
/ branch actions, an error strip with retry, and a composer that
grows to six lines. Every label is handed in by the host, colours
are tokens, and the kit owns no i18n, no navigation, no native
modules and no knowledge of any tool — it never imports an engine,
it is typed against the upstream part shapes alone.

```tsx
import { AssistantThread, ToolCardShell } from '@knf/assistantuikit';

// The runtime and its provider come from your engine package —
// the kit renders whatever thread they put in scope
<AssistantRuntimeProvider runtime={runtime}>
  <AssistantThread
    labels={labels}                                 // your i18n, your words
    colors={myTokens}                               // optional; neutral defaults
    suggestions={[{ title: t('…'), prompt: t('…') }]}
    copyToClipboard={(text) => Clipboard.setStringAsync(text)}
    onPressLink={(url) => Linking.openURL(url)}
    contentPaddingBottom={tabBarHeight}
    tools={{
      lookupSchedule: (part) => {
        // input/output arrive as `unknown` — narrow them
        // against your engine's types
        const output = part.output as LookupScheduleOutput | undefined;
        return (
          <ToolCardShell title={t('…')} status={part.status} labels={labels} colors={myTokens}>
            <LessonList lessons={output?.lessons} />
          </ToolCardShell>
        );
      },
    }}
  />
</AssistantRuntimeProvider>
```

**AssistantThread** is the screen body: the message list, the empty
state, the error strip and the composer in one column. Put it at
the screen root (or under a header the window already accounts
for) — the keyboard math reads the column's own frame: iOS pads
through the platform's avoiding view, and on Android the column
pads itself by the keyboard's height whenever the edge-to-edge
window keeps its height under it (where the window still resizes,
the pad stays out of the way). A drag on the list dismisses the
keyboard — interactively on iOS, on the drag on Android. The list
keeps what the reader sees still while a reply streams in, follows
the tail through the upstream auto-scroll while pinned to it, and
offers a "↓" button (labelled for screen readers with
`scrollToLatest`) the moment an upward move leaves the tail — it
never yanks, and the button stays until the reader is back at the
tail. The empty state renders only while the thread is truly empty
(no messages and not loading history).

**AssistantMessage** is one row, by role: the user's words verbatim
in a brand bubble on the right, the assistant's answer in a surface
bubble on the left — text through `MarkdownText` (streaming-aware),
reasoning as a closed "thinking" row, tool calls as cards, the
typing dots while an answer has started and nothing has arrived.
Under a settled assistant bubble: copy (only when a clipboard was
wired — the label flips to `copied` for a moment, and dims when the
message has no text to copy), regenerate on the last assistant
message only, and `‹ n / count ›` whenever the message has siblings,
its arrows dimmed at their edge. A message that settled with
NOTHING in it — the shape a failed or cancelled run leaves before
any content arrived — renders no bubble at all: the error strip
owns that moment and its retry. System messages render nothing.

**Tool cards** are the host's. `tools` maps a tool name to a renderer
that receives `{ toolName, input, output?, status, errorText? }` —
`status` is `'running'` while the result is owed, `'done'` once it
landed, `'failed'` when the result is an error. `input` and `output`
arrive as `unknown`: the kit knows no tool, so the host narrows them
against its engine's types. `errorText` is one readable line — a
string error as is, an Error-shaped object or the runtime's
`{ error: … }` envelope by the text inside it, anything else as
JSON. The renderer returns what to draw; `ToolCardShell` is the
frame the generic card uses, offered so a host's cards match. A name
with no renderer falls to the generic card: the tool name, the
status word, the raw input and output behind a show/hide toggle.
The lookup is an own-property read, so a tool named after an
`Object.prototype` member still falls through.

**AssistantErrorBanner** appears when the message in scope ended in
an error: the host's title and body, the runtime's own message
under them, and a retry. Inside `AssistantThread` it sits above the
composer under the last message's scope and retry reloads that
message; rendered on its own it must sit under a message provider.

## AssistantThread props

| Prop | Default | What it does |
| --- | --- | --- |
| `labels` | — | `AssistantLabels` — every string the surfaces can show (below) |
| `colors` | `defaultColors` | `AssistantColors` — `ink`, `inkSoft`, `line`, `brand`, `onBrand`, `surface`, `surfaceSoft`, `danger` |
| `tools` | — | `Record<string, ToolCardRenderer>` — a renderer per tool name; a name with no entry falls to the generic card |
| `suggestions` | — | `AssistantSuggestion[]` — `{ title, prompt, description? }`; one chip each in the empty state, tapping sends the prompt |
| `copyToClipboard` | — | `(text) => Promise<void> \| void`; without it the copy action is not rendered at all |
| `onPressLink` | — | `(url) => void`; markdown links call it — the kit never navigates |
| `contentPaddingBottom` | `0` | Bottom padding on the whole column, under the composer — so a floating tab bar or the home indicator never covers Send |

## AssistantLabels

| Key | Where it shows |
| --- | --- |
| `placeholder` | the composer field |
| `send`, `cancel` | the composer button — Send while idle, Cancel while a run is in flight |
| `retry` | the error strip's button |
| `copy`, `copied` | the copy action, before and for a moment after a successful copy |
| `regenerate` | the reload action on the last assistant message |
| `thinking` | the reasoning row's header |
| `emptyTitle`, `emptyBody` | the empty state |
| `errorTitle`, `errorBody` | the error strip, above the runtime's own message |
| `toolRunning`, `toolDone`, `toolFailed` | the tool card's status word |
| `showDetails`, `hideDetails` | the tool card's details toggle |
| `previousBranch`, `nextBranch` | the branch picker arrows (screen-reader labels) |
| `scrollToLatest` | the floating "↓" button (screen-reader label — the glyph alone says nothing) |

## The other exports

| Export | Props | What it is |
| --- | --- | --- |
| `AssistantMessage` | — | one row by role; reads labels, colours, tools and callbacks from the nearest `AssistantThread` or `AssistantKitProvider` |
| `AssistantComposer` | `labels`, `colors?` | the input strip on its own |
| `AssistantErrorBanner` | `labels`, `colors?`, `onRetry` | the error strip on its own — render it under a message provider |
| `ToolCardShell` | `title`, `status`, `labels`, `colors?`, `children?`, `details?` | the card frame: status dot, title, status word, body, details behind the toggle |
| `TypingIndicator` | `colors?`, `testID?` | the three dots; still at half strength when the OS asks for less motion |
| `MarkdownText` | `text`, `colors?`, `onPressLink?`, `isStreaming?` | the markdown renderer — paragraphs with bold / italic / code / links, headings 1-3, fenced code, lists nested one level, blockquotes, rules; an open marker stays plain text while `isStreaming` |
| `parseMarkdown` | `(text) => MarkdownBlock[]` | the pure parser under it |
| `AssistantKitProvider` | `labels`, `colors?`, `tools?`, `copyToClipboard?`, `onPressLink?` | carries the kit context to bubbles a host lays out in a list of its own |
| `defaultColors` | — | the neutral palette |

## testIDs

Stable across all of it: `assistantuikit-thread`,
`assistantuikit-keyboard-column`, `assistantuikit-composer-input`,
`assistantuikit-composer-send`, `assistantuikit-composer-cancel`,
`assistantuikit-message-user`, `assistantuikit-message-assistant`,
`assistantuikit-typing`, `assistantuikit-tool-<name>`,
`assistantuikit-error`, `assistantuikit-suggestion-<index>`,
`assistantuikit-scroll-latest`, `assistantuikit-copy`,
`assistantuikit-regenerate`.

`npm test` inside the package (or the host's root jest run) drives
the real primitives under the real local runtime with a scripted
model (`src/__tests__/support/scriptedRuntime.tsx`) and pins the
composer (empty / typed / cancel / clear / button-only submit / the
six-line cap), the empty state and the chips, both bubbles and the
streaming flag, the empty-failure bubble that renders nothing, the
thinking row, the typing dots (in the bubble, after a tool call,
reduced motion at half strength), the tool registry and the generic
card, the error strip and retry, copy and its flip (fake timers)
and its dim, regenerate and the branch picker with its edge dim,
the keyboard column on both platforms, the "latest" button's
hysteresis and label, the provider guard, the link-and-ink wiring
through the real renderer, the markdown parser and renderer, and
the export surface.
