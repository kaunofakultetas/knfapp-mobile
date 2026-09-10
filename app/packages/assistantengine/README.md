# assistantengine

The faculty app's runtime seam for its AI assistant. Everything
KNF-specific between the upstream chat runtime and the AI container
lives here — the session, the language and the client version on
every request, one typed failure for every way the wire can break, a
first-byte deadline that never time-boxes a streaming answer, the
runtime hook that auto-continues after a server-executed tool, and
the frozen tool contract with its schema mirrors. The app imports
this package for runtime concerns and nothing else: the upstream
runtime, its stream protocol and the model layer are imported inside
this package only.

```tsx
import { AssistantRuntimeProvider, createKnfAssistantTransport, useKnfAssistantRuntime } from '@knf/assistantengine';

const transport = useMemo(() => createKnfAssistantTransport({
  baseUrl: 'https://knf.example.lt',                // the ORIGIN — the paths are appended
  getAuthToken: () => session.token(),              // null → guest, no Authorization header
  language: () => (i18n.language === 'lt' ? 'lt' : 'en'),
  clientVersion: Constants.expoConfig?.version ?? '0.0.0',
  onFailure: (failure) => toast(t(`assistant.failure.${failure.code}`)),
}), [session, i18n]);
const runtime = useKnfAssistantRuntime({ transport });

<AssistantRuntimeProvider runtime={runtime}>{/* the kit's thread */}</AssistantRuntimeProvider>
```

`baseUrl` is the origin plus whatever prefix the container is mounted
under — `'https://knf.example.lt'` yields
`https://knf.example.lt/api/assistant/chat`, `'https://knf.example.lt/mobile'`
yields `https://knf.example.lt/mobile/api/assistant/chat`. Ending it
in `/api` is the classic mistake: the two fixed paths already carry it.
`joinUrl(base, path)` is exported and pinned: exactly one slash at the
seam, a base prefix kept.

## Local runtime (no backend)

The same door also ships the upstream's local runtime, so a host can
run the thread against an adapter on the device — a development
stand-in before the AI container lands, or an offline mode:

```tsx
import { useLocalRuntime, type ChatModelAdapter } from '@knf/assistantengine';

const stub: ChatModelAdapter = {
  async *run() {
    yield { content: [{ type: 'text', text: 'Labas! ' }] };
    yield { content: [{ type: 'text', text: 'Labas! Čia vietinis atsakymas.' }] };
  },
};
const runtime = useLocalRuntime(stub); // then the provider as above
```

Each yielded `ChatModelRunResult` carries the assistant message's
WHOLE content so far, not a delta. The SERVER CONTRACT below does not
apply to this path — nothing touches the wire, no headers, no failure
mapping; the wire-backed path stays `useKnfAssistantRuntime` over the
transport.

## The transport

`createKnfAssistantTransport(config)` builds the upstream transport
aimed at `baseUrl + /api/assistant/chat`, sending through a wrapped
fetch (`createAssistantFetch`, also exported) with four disciplines:

- **Headers** — `Accept-Language` from `language()` on every request,
  `x-knf-assistant-client: knfapp-mobile/<clientVersion>`, and
  `Authorization: Bearer <token>` ONLY when `getAuthToken()` resolves
  a non-empty string. A rejecting or empty answer is a guest, never an
  error. Header names are emitted lowercase in one plain record, so
  any fetch seam reads them the same way.
- **The first-byte deadline** — `firstByteTimeoutMs` (default 30 000)
  aborts a request whose response HEADERS have not arrived; the
  streaming body is never time-boxed. The clock starts after the
  token was read, so a slow session store cannot burn the budget. The
  fetch is raced against our own abort rather than trusted to honour
  the signal: a seam that never settles still answers `'timeout'`.
- **Failures** — a non-2xx answer has its body read once and becomes
  one `AssistantFailure`, reported to `onFailure` and thrown as
  `AssistantTransportError`; a throwing fetch is mapped the same way.
  The upstream runtime turns a thrown transport error into the
  thread's error, which is where `useAssistantFailure()` reads it
  back. A 2xx is returned untouched — its body is the stream and the
  upstream owns the reading — so `onFailure` hears TRANSPORT
  failures only: a failure streamed after the headers (an `error`
  chunk, a malformed frame) surfaces through `useAssistantFailure()`
  as `'server'` and never passes through `onFailure`.
- **Cancel** — the caller's AbortSignal is chained onto ours, so a
  cancel wins over the deadline and reads as `'aborted'`. It is never
  reported to `onFailure` (it was asked for), and the chain stays
  installed after headers arrive so a stop mid-answer cuts the body.

`AssistantFailure` is `{ code, status?, retryAfterMs?, message }` with
the closed code set `'network' | 'timeout' | 'auth' | 'quota' |
'server' | 'unavailable' | 'aborted'`; `message` is the server's own
words when it sent any, the status text otherwise, and is never shown
raw — the host maps `code` to its i18n. `toAssistantFailure`,
`parseRetryAfter`, `readFailureBody` and `isAssistantTransportError`
are exported for hosts that catch on their own; `buildAssistantHeaders`
and `resolveFetch` are the two pieces the wrapped fetch and the tools
endpoint share.

## The hooks

`useKnfAssistantRuntime({ transport, initialMessages? })` — the
upstream chat runtime with `sendAutomaticallyWhen` set to its own
"last assistant message is complete with tool calls" predicate.
Tools run inside the container, which streams the call and its result
back and ends the response; the client then resends the thread on its
own and the model finishes its answer in the SAME assistant message.
Nothing else of the upstream's option surface is exposed because
nothing else is decided on the phone. `initialMessages` is a thread
the host persisted opaquely and hands back untouched.

`useAssistantFailure(): AssistantFailure | null` — the thread's error
as our value: an `AssistantTransportError` answers its failure
verbatim, any other error (a malformed frame, an `error` chunk
streamed mid-answer) answers `{ code: 'server', message }`, and a
healthy thread answers null. Like every assistant hook it must sit
UNDER `AssistantRuntimeProvider` — mounted outside an assistant
runtime it throws the upstream's provider error, never a silent
null, so a screen-level banner goes inside the provider, not above
it.

`useAssistantTokenUsage()` — the upstream's usage reader, passed
through unchanged.

## The tool contract

Three tools, FROZEN by camelCase name: `lookupSchedule`, `searchNews`,
`searchHandbook` (`ASSISTANT_TOOL_NAMES`, `isAssistantToolName`). The
container registers them with the model under exactly these names and
streams calls and results back under them; the kit renders a card per
name. `LookupScheduleInput/Output`, `SearchNewsInput/Output`,
`SearchHandbookInput/Output` (and `AssistantToolInput<N>` /
`AssistantToolOutput<N>` by name) are what a tool part carries;
`ASSISTANT_TOOL_SCHEMAS` are their hand-written JSON-schema mirrors —
type / properties / required / enum / items and nothing else — and
`describeToolsContract(name, load)` is the jest describe that holds
the two sides together: every frozen name served, every served
`input` and `output` equal to the mirror in `normalizeToolSchema`
form (documentation keys such as `description` dropped from schema
nodes — never from a `properties` map, whose keys are field names —
`required` and `enum` order ignored). `fetchAssistantTools(config)`
GETs the served contract with the same headers the chat sends.

## SERVER CONTRACT

This section is the specification the AI container is built from.
Everything in it is pinned on the client side by this package's
suites; the container's integration job runs `describeTransportContract`
and `describeToolsContract` against the live service — the Contract
mode subsection at the end says exactly what that job sends and what
the service must answer.

### Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/assistant/chat` | one model turn, answered as a UI-message event stream |
| `GET` | `/api/assistant/tools` | the served tool contract, `{ tools: [{ name, input, output }] }` |

Both are appended to the app's `baseUrl`; the container serves them
under exactly these paths behind the reverse proxy.

### Request headers

| Header | Value | When |
| --- | --- | --- |
| `content-type` | `application/json` | always (chat) |
| `accept-language` | `lt` or `en` | always — answer in this language |
| `x-knf-assistant-client` | `knfapp-mobile/<clientVersion>` | always — log it; do not gate on it in v1 |
| `authorization` | `Bearer <token>` | ONLY when the user is signed in |

The bearer is the same session token the rest of the faculty API
validates. Its ABSENCE is not an error — see the guest rules.

### Request body — `POST /api/assistant/chat`

The upstream transport posts this JSON; keys whose value would be
`undefined` are simply absent:

```json
{
  "id": "__LOCALID_EtsRKis",
  "trigger": "submit-message",
  "messages": [
    { "id": "TwNaJlykiWiobA1W", "role": "user", "metadata": { "custom": {} },
      "parts": [{ "type": "text", "text": "Kada rytoj paskaitos IS-3 grupei?" }] }
  ],
  "tools": {},
  "metadata": {}
}
```

| Field | Meaning | Server rule |
| --- | --- | --- |
| `id` | the client's thread id (`__LOCALID_…` for an unsaved thread) | an opaque key for logging / rate limiting; never required to be stable |
| `trigger` | `'submit-message'` (a new turn, or the automatic continuation after a tool) or `'regenerate-message'` | both are a fresh completion over `messages` |
| `messageId` | present ONLY on the automatic continuation after a tool round trip — the id of the assistant message being continued, which is the request's LAST message. Absent on a new turn AND on regenerate (there the replaced assistant message is simply gone from `messages`) | when it is present, the reply's `start` chunk must omit `messageId` or echo exactly this id — see the continuation rule below |
| `messages` | the whole thread in the upstream's message shape (below) | the model input; convert to model messages, including tool parts |
| `tools` | the client's tool map — always `{}`: the app registers no client-side tools | IGNORE; the server owns the tool definitions |
| `system` | the client's instructions when it registered any — the app registers none | IGNORE; the server owns the system prompt — never let a client set it |
| `callSettings`, `config`, `metadata` | upstream extras, absent or empty here | ignore |

A message is `{ id, role: 'user' | 'assistant' | 'system', parts: [...], metadata? }`.
The parts the container will see:

```json
{ "type": "text", "text": "…", "state": "done" }
{ "type": "step-start" }
{ "type": "tool-lookupSchedule", "toolCallId": "call_1", "state": "output-available",
  "input": { "group": "IS-3", "range": "day" },
  "output": { "lessons": [], "source": "live" } }
{ "type": "tool-searchNews", "toolCallId": "call_2", "state": "output-error",
  "input": { "query": "stipendijos" }, "errorText": "news index unavailable" }
```

A tool part's `type` is `tool-<name>` with one of the frozen names.
When the container continues a thread it converts an assistant
message's tool parts back into the tool call and the tool result it
produced earlier — the output is authoritative, never re-executed.

### Response — the stream protocol

A successful turn answers `200` with these headers and streams
server-sent events, flushed frame by frame:

```
content-type: text/event-stream
cache-control: no-cache
connection: keep-alive
x-vercel-ai-ui-message-stream: v1
x-accel-buffering: no
```

Every frame is `data: <one JSON chunk>\n\n`; the stream ends with
the terminator `data: [DONE]\n\n`. SSE comment lines (`: keep-alive`)
may be sent to hold proxies open — the client ignores them. The
chunk vocabulary is the upstream's UI-message stream, protocol
version `v1`; the fields below are exact. The vocabulary is CLOSED:
every frame is schema-checked, and a chunk whose `type` is outside
it fails the whole turn — even after the text already streamed.
Custom payloads ride `data-*` chunks, the one open branch; never
invent a type.

**Send the headers first.** The client's first-byte deadline
(30 s by default) measures the wait for response HEADERS, not for
the first token: commit the `200` and the headers before the model
is called, then stream. A model that takes a minute to its first
token is fine; a container that waits for the model before
answering is a `'timeout'`. The reverse proxy must not buffer this
route (`x-accel-buffering: no` is set for proxies that honour it;
disable response buffering and flush intervals for the path).

### Chunk sequence — a text reply

```
data: {"type":"start"}
data: {"type":"start-step"}
data: {"type":"text-start","id":"t1"}
data: {"type":"text-delta","id":"t1","delta":"Rytoj IS-3 grupei "}
data: {"type":"text-delta","id":"t1","delta":"paskaitų nėra."}
data: {"type":"text-end","id":"t1"}
data: {"type":"finish-step"}
data: {"type":"finish","finishReason":"stop"}
data: [DONE]
```

`start` may carry a `messageId` the client adopts for the assistant
message. On a FIRST reply — the request carries no `messageId` —
mint one or omit it, as you like. On the automatic continuation the
rule is hard: `start.messageId` must be omitted or equal the
REQUEST's `messageId`; any other id makes the client push a SECOND
assistant message instead of finishing the first (the split hides
on screen but the next turn resends the same tool call and result
twice, and persisted threads keep the duplicate).

`finishReason` is optional and, when sent, comes from the closed
set `stop | length | content-filter | tool-calls | error | other` —
a model provider's raw reason passed through (`tool_use`, say)
fails the turn after the answer already streamed; omitting it is
the safe choice. Reasoning may be streamed the same way with
`reasoning-start` / `reasoning-delta` (`{ id, delta }`) /
`reasoning-end` — the kit renders it as a collapsible row.

### Chunk sequence — a tool round trip

The container executes the tool itself and streams both the call
and its result, then ENDS the response:

```
data: {"type":"start"}
data: {"type":"start-step"}
data: {"type":"tool-input-start","toolCallId":"call_1","toolName":"lookupSchedule"}
data: {"type":"tool-input-available","toolCallId":"call_1","toolName":"lookupSchedule","input":{"group":"IS-3","range":"day"}}
data: {"type":"tool-output-available","toolCallId":"call_1","output":{"lessons":[{"title":"Duomenų bazės","start":"2026-09-08T09:00:00+03:00","end":"2026-09-08T10:30:00+03:00","room":"201","teacher":"J. Jonaitis","group":"IS-3","kind":"paskaita"}],"source":"live"}}
data: {"type":"finish-step"}
data: {"type":"finish","finishReason":"tool-calls"}
data: [DONE]
```

`tool-input-start` is optional; `tool-input-available` (with the
full `input`) and `tool-output-available` (with the full `output`,
matching the tool's output schema) are required, with matching
`toolCallId`s. A tool that failed answers
`{"type":"tool-output-error","toolCallId":"call_1","errorText":"…"}`
instead of the output.

Because the last step of the assistant message then holds only tool
parts with results, the client AUTOMATICALLY posts the thread again
(`trigger: "submit-message"`, `messageId` naming the assistant
message being continued, the assistant message carrying the
`tool-lookupSchedule` part in state `output-available` with `input`
and `output`). The container answers that second request with the
text sequence above, under the continuation rule: `start.messageId`
omitted or equal to the request's `messageId`, so the text lands in
the SAME assistant message on the phone. A fresh server-minted id
here splits the reply into a second assistant message — invisible
on screen, but the next turn resends the tool call and its result
twice, and a persisted thread keeps the duplicate. The reference
fake answers exactly this two-request dance, echoing the id.

A container that prefers to finish in ONE response may do so: after
`finish-step` for the tool step, emit `start-step` again and then
the text chunks. The last step then holds no tool parts and the
client does not resend. Both patterns are valid; never flag
`providerExecuted: true` on these tools — that marks a tool the
model provider ran, and hides it from the continuation logic.

### Errors

Before the first byte, answer with an HTTP status; the client maps
it as follows and shows a code-keyed message. A JSON body
`{ "error": "…" }`, `{ "message": "…" }` or
`{ "error": { "message": "…" } }` is read into `failure.message`;
anything else falls back to the status text, and to `HTTP <status>`
when there is none (many stacks send a bare status line).

| Status | `failure.code` | Notes |
| --- | --- | --- |
| `401`, `403` | `auth` | an invalid, expired or refused bearer — NEVER for a missing one |
| `429` | `quota` | send `Retry-After` (seconds or an HTTP-date) → `retryAfterMs` |
| `502`, `503`, `504` | `unavailable` | the container is down or restarting; `Retry-After` honoured when sent |
| any other `4xx` / `5xx` | `server` | bad request, too long, model refused, …; say why in the body |
| — (fetch threw) | `network` | DNS, offline, connection reset |
| — (no headers in time) | `timeout` | see the first-byte rule |
| — (the user cancelled) | `aborted` | never reported to `onFailure` |

After the first byte the only channel is the stream: emit
`{"type":"error","errorText":"…"}` and then `[DONE]`. The client
ends the turn in an error state that reads as
`{ code: 'server', message: errorText }` — through
`useAssistantFailure()` only, never through `onFailure`, which
hears transport failures alone. Prefer to detect auth and quota
problems before committing the headers.

### Guest rules

No `authorization` header ⇒ a guest. The app MUST work without a
login, so the chat answers guests — with tighter quotas (per device
or address, the container's choice), a `429` with `Retry-After`
when they are spent, and no personal data in tool results
(`lookupSchedule` needs a `group` or `teacher` from the guest; it
never infers one from an account). A signed-in user's bearer is
validated: invalid or expired ⇒ `401` (the app then re-authenticates
or falls back to guest); valid ⇒ the account's quota and, where the
tools support it, the account's own group as the default.

### The tools endpoint — `GET /api/assistant/tools`

Answers `200 application/json` with the frozen contract, guest
allowed, the same three request headers as the chat. `input` and
`output` are compared to the mirrors below structurally: key order
and the order inside `required` / `enum` do not matter, and
`description`, `title`, `examples`, `$schema`, `$id`, `$comment` may
be added freely to any SCHEMA node. The keys of a `properties` map
are field names, never documentation — all three outputs carry a
real `title` property, and removing or retyping it is drift. Any
difference beyond decoration — a renamed field, a changed type, an
added `required` — turns the contract suite red.

```json
{
  "tools": [
    {
      "name": "lookupSchedule",
      "input": {
        "type": "object",
        "properties": {
          "group": { "type": "string" },
          "teacher": { "type": "string" },
          "date": { "type": "string" },
          "range": { "type": "string", "enum": ["day", "week"] }
        }
      },
      "output": {
        "type": "object",
        "properties": {
          "lessons": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "title": { "type": "string" },
                "start": { "type": "string" },
                "end": { "type": "string" },
                "room": { "type": "string" },
                "teacher": { "type": "string" },
                "group": { "type": "string" },
                "kind": { "type": "string" }
              },
              "required": ["title", "start", "end"]
            }
          },
          "source": { "type": "string", "enum": ["live", "cache"] },
          "note": { "type": "string" }
        },
        "required": ["lessons", "source"]
      }
    },
    {
      "name": "searchNews",
      "input": {
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "source": { "type": "string" },
          "limit": { "type": "integer" }
        }
      },
      "output": {
        "type": "object",
        "properties": {
          "posts": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": { "type": "string" },
                "title": { "type": "string" },
                "summary": { "type": "string" },
                "date": { "type": "string" },
                "source": { "type": "string" },
                "url": { "type": "string" }
              },
              "required": ["id", "title", "date", "source"]
            }
          }
        },
        "required": ["posts"]
      }
    },
    {
      "name": "searchHandbook",
      "input": {
        "type": "object",
        "properties": {
          "query": { "type": "string" },
          "limit": { "type": "integer" }
        },
        "required": ["query"]
      },
      "output": {
        "type": "object",
        "properties": {
          "entries": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": { "type": "string" },
                "title": { "type": "string" },
                "excerpt": { "type": "string" },
                "section": { "type": "string" },
                "language": { "type": "string", "enum": ["lt", "en"] }
              },
              "required": ["id", "title", "excerpt", "language"]
            }
          }
        },
        "required": ["entries"]
      }
    }
  ]
}
```

Field semantics the schemas cannot carry: `lookupSchedule.date` is
`YYYY-MM-DD` and defaults to today; `range` defaults to `'day'`;
`start` / `end` are ISO-8601 with an offset; `source: 'cache'` means
the timetable source was down and the container answered from its
last good copy, with `note` explaining; `searchNews.limit` and
`searchHandbook.limit` default and cap server-side; a post's `date`
is ISO-8601 and `url` links to the faculty site; a handbook entry's
`language` is the language the excerpt is written in.

### Contract mode

The integration job proves the live service against the SAME
describes this package runs against its reference fake. For that
the container ships a contract mode (a flag or environment switch
of its own choosing) in which five fixed prompts — the text of the
request's last user message — get fixed answers. The prompts and
every answer are exported from `@knf/assistantengine/testing` as
`CONTRACT_PROMPTS` and `CONTRACT_REPLIES`; build the mode against
those constants, not against this prose. The job runs:

```ts
import { describeToolsContract, fetchAssistantTools } from '@knf/assistantengine';
import { describeTransportContract } from '@knf/assistantengine/testing';

const baseUrl = process.env.ASSISTANT_BASE_URL!;
describeTransportContract('live container', () => fetch, { baseUrl });
describeToolsContract('live container', () =>
  fetchAssistantTools({ baseUrl, getAuthToken: async () => null, language: () => 'lt', clientVersion: 'contract' }));
```

`describeTransportContract`'s third parameter is
`{ baseUrl?, firstByteTimeoutMs? }` — the fake ignores the base,
the job aims it at the service. Its requests carry
`accept-language: lt` and the client header
`knfapp-mobile/0.0.0-contract`; the bearer, when one is sent, is
the fixed string `contract-session-token`.

| Prompt | Sent as | Required answer |
| --- | --- | --- |
| `contract:text` | guest, AND once with the bearer (the headers case) — both succeed | `200` stream: one text part in exactly three deltas `"Labas! "`, `"Sutartis "`, `"veikia."` — assembling to `Labas! Sutartis veikia.` |
| `contract:tool` | guest | the TWO-REQUEST pattern, mandatory here: first response streams a `lookupSchedule` call with input `{"group":"IS-3","range":"day"}` and output `{"lessons": <fixtureLessons>, "source":"live"}` (`fixtureLessons` verbatim — the two Lithuanian lessons from the testing door), then `finish` and END the response; the continuation request is answered with the text `"Rytoj IS-3 grupei "`, `"dvi paskaitos."` under the continuation rule (`start.messageId` omitted or echoed). A one-response answer FAILS the suite — the case waits for the second request |
| `contract:slow` | guest | the five deltas `"Lėtas "`, `"atsakymas "`, `"dalimis "`, `"per "`, `"laiką."` with a ~40 ms pause BEFORE every chunk. The pacing is load-bearing: the cancel case aborts mid-stream and asserts the cut reached the wire — a reply that finishes at once cannot be cancelled in time |
| `contract:auth` | WITH the bearer `contract-session-token` | `401` with body `{"error":"contract: bearer refused"}` — contract mode refuses that token by convention |
| `contract:quota` | guest | `429` with header `Retry-After: 30` (delay-seconds form, exactly `30` — the suite asserts `retryAfterMs` 30 000) and body `{"error":"contract: quota spent"}` |

The remaining cases need nothing extra from the server: the
network case uses a throwing fetch and never reaches it, and the
cancel case ends with an already-aborted send that must produce no
request at all. In contract mode the tools path serves the mirrors
above unchanged — that is what `describeToolsContract` checks.

## Testing

`@knf/assistantengine/testing` ships the doubles the app proves
itself with, and the conformance describes the container team runs
against the live service:

- `createFakeAssistantServer()` — the container in memory, behind a
  `fetch`. Every request lands in `calls` as a `RecordedCall`
  `{ url, method, headers, body, aborted }` — `aborted` flips when
  the request's own signal fires, the proof a cancel reached the
  wire. `script(reply)` queues the answer to the NEXT request: a
  reply, or a function of the recorded call that returns one. Left
  unscripted, the fake is the REFERENCE CONTAINER: the chat path
  answers the `CONTRACT_PROMPTS` exactly as the live service must
  in its contract mode (the tool round trip's continuation
  included, under the continuation rule), the tools path serves the
  schema mirrors (`referenceTools()`), and any other prompt rejects
  loudly — `fake assistant server: no reply scripted…` — rather
  than answering something plausible.
- The reply builders: `textReply(chunks, { delayMs? })`,
  `toolReply({ name, input, output, text?, toolCallId? })` (without
  `text` the response ends after the tool step, so the runtime
  resends and the SECOND request needs an answer too; with `text`
  the answer rides a second step of the same response and nothing
  is resent), `streamReply(chunks, { delayMs? })` for any chunk
  list, `errorReply(status, body?, headers?)`,
  `jsonReply(body, { status?, headers? })` for the tools endpoint,
  `networkFailure(message?)` (rejects with a TypeError) and
  `hangForever()` (no headers, ever — the first-byte deadline's
  case). Frames are produced by the upstream's own stream writer,
  so every streamed reply is protocol-correct by construction.
- `createScriptedModelAdapter(steps)` — a model adapter for the
  upstream's local runtime (`useLocalRuntime` is re-exported
  alongside), for the app's screen tests where no wire is wanted:
  text deltas, tool calls with or without their outputs, waits a
  cancel cuts short, a scripted error — every run recorded, with
  an `aborted` flag of its own.
- `mountAssistantProbe(options)` / `mountRuntimeProbe(useRuntime)` —
  the REAL runtime under the REAL provider, with a reader that
  publishes the messages, the running flag and the failure after
  every commit: `send`, `cancel`, `until`, `settle`, `unmount`.
  `textOf` and `toolCallsOf` read a message back;
  `createRecordingFetch(inner)` wraps any fetch in the same call
  log the fake writes.
- `describeTransportContract(name, makeFetch, { baseUrl?,
  firstByteTimeoutMs? })` — the seven cases every server must pass
  through the REAL transport and runtime: a text reply accumulates,
  a tool reply auto-continues with the output in the second
  request, 401 → `'auth'` with one `onFailure`, 429 +
  `Retry-After: 30` → `'quota'` with 30 000 ms, a throwing fetch →
  `'network'`, the headers with and without a session, and a
  mid-stream cancel → no error, no `onFailure`. The Contract mode
  section above is what a live server answers to pass it.
- Fixtures `fixtureLessons`, `fixtureNewsPosts`,
  `fixtureHandbookEntries` in the tool output shapes, and the
  contract vocabulary `CONTRACT_PROMPTS` / `CONTRACT_REPLIES` the
  reference routing and the live contract mode share.

One thing every fake must know: under jest the runtime's stream
globals (`ReadableStream`, `TransformStream`, `TextDecoderStream`)
are the on-device polyfill, while `Response` and `fetch` stay the
host's. A body built with the host's `Response` cannot be piped
through the polyfill decoder the upstream parser uses, so a fake
resolves a Response-like object — `{ ok, status, statusText,
headers, body, text() }` — whose `body` was built in the test realm
(`createUIMessageStream` → `JsonToSseTransformStream` →
`TextEncoderStream`). The transport reads only those fields, on
device and under jest alike.

`npm test` inside the package (or the host's root jest run) covers
the failure mapping table, the transport's header, guest, deadline,
cancel and body-untouched rules, the runtime hook over the real
upstream and the fake server, the tool contract green against the
mirror and red against a drift, the doubles themselves, and the
transport contract against the fake.
