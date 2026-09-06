# Changelog

## 1.0.0 — 2026-09-05

The assistant runtime seam, built against the upstream chat
runtime, its stream protocol and the model layer — imported here
and nowhere else in the app.

- **Transport** — `createKnfAssistantTransport(config)`: the
  upstream transport at `baseUrl + /api/assistant/chat` over a
  wrapped fetch that carries `Accept-Language`, the client header
  and `Authorization` only for a non-empty token (a rejecting or
  empty session store is a guest); races the wait for response
  HEADERS against `firstByteTimeoutMs` (default 30 000) while never
  time-boxing the body; reads a non-2xx body once, reports the
  typed failure to `onFailure` and throws `AssistantTransportError`;
  chains the caller's abort so a cancel wins over the deadline,
  reads as `'aborted'`, is reported nowhere and keeps cutting the
  body after headers. `joinUrl` keeps a base prefix and never
  doubles a slash. `createAssistantFetch`, `buildAssistantHeaders`
  and `resolveFetch` exported for hosts.
- **Failures** — one `AssistantFailure { code, status?,
  retryAfterMs?, message }` over the closed set `network | timeout |
  auth | quota | server | unavailable | aborted`; `toAssistantFailure`
  maps 401/403, 429 (+ `Retry-After` as seconds or an HTTP-date),
  502–504, the rest of 4xx/5xx, `AbortError`, `TimeoutError` and
  anything else fetch threw; `parseRetryAfter`, `readFailureBody`,
  `isAssistantTransportError` alongside.
- **Runtime hook** — `useKnfAssistantRuntime({ transport,
  initialMessages? })`: the upstream runtime with automatic
  continuation after a server-executed tool round trip and nothing
  else of its option surface. `useAssistantFailure()` reads the
  thread's error back as the typed value; `useAssistantTokenUsage`
  passes the upstream's reader through; `AssistantRuntimeProvider`
  re-exported so the app imports one package.
- **Tool contract** — `lookupSchedule`, `searchNews`,
  `searchHandbook` frozen in `ASSISTANT_TOOL_NAMES`, their
  input/output types, hand-written JSON-schema-lite mirrors in
  `ASSISTANT_TOOL_SCHEMAS`, `normalizeToolSchema` (documentation
  keys dropped from schema nodes — never a field name in a
  `properties` map — `required`/`enum` order ignored),
  `fetchAssistantTools` over `GET /api/assistant/tools`, and
  `describeToolsContract` — the seven-case conformance describe.
- **Server contract** — the README's SERVER CONTRACT section:
  endpoints, headers, the exact request body, the stream protocol
  and framing, the chunk sequences for a text reply and a tool
  round trip (with the two-request continuation the runtime
  performs and the `start.messageId` rule that keeps it in one
  assistant message), status → failure mapping, guest rules, the
  tools endpoint's required answer, and the contract mode the
  integration job drives.
- **Testing doubles** — `createFakeAssistantServer` with its reply
  builders (`textReply`, `toolReply`, `streamReply`, `errorReply`,
  `jsonReply`, `networkFailure`, `hangForever`), its script queue
  and its reference routing over `CONTRACT_PROMPTS` /
  `CONTRACT_REPLIES`; `createScriptedModelAdapter` over the
  upstream's local runtime; `mountAssistantProbe` /
  `mountRuntimeProbe` with `textOf`, `toolCallsOf` and
  `createRecordingFetch`; `describeTransportContract` — the
  seven-case transport conformance describe — and the fixtures
  `fixtureLessons`, `fixtureNewsPosts`, `fixtureHandbookEntries`,
  all from `@knf/assistantengine/testing`.
