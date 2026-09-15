// -----------------------------------------------------------
//  [*] assistantengine — types
//
//  The whole seam in one place: where the AI container lives
//  (two frozen paths under one base URL), what every request
//  carries (session, language, client version), how long the
//  app waits for a FIRST BYTE, and the one failure shape every
//  wire problem collapses into. Failures are typed VALUES with
//  a closed code set — a screen switches on `code`, never on
//  a status number or an exception string — and the single
//  error class carries that value so the upstream runtime can
//  throw it and a hook can read it back.
//
//  Used by:
//    - core/errors.ts, core/transport.ts, tools/contract.ts,
//      hooks/useAssistantFailure.ts
//    - testing/index.tsx — the paths and the failure type
//    - hosts typing their transport config and failure handling
// -----------------------------------------------------------







// -----------------------------------------------------------
// AssistantLanguage
// -----------------------------------------------------------
//
// The two UI languages the faculty ships — what language()
// answers, and what Accept-Language carries.
//
// Used by:
//   - AssistantTransportConfig (below) — language()'s return
//   - tools/contract.ts — localized tool descriptions
// -----------------------------------------------------------

export type AssistantLanguage = 'lt' | 'en';







// -----------------------------------------------------------
// ASSISTANT_CHAT_PATH
// -----------------------------------------------------------
//
// The container's chat endpoint, FIXED — appended to the
// host's baseUrl by joinUrl(); the server mirrors it verbatim.
//
// Used by:
//   - core/transport.ts — the chat URL
//   - testing/index.tsx — the fake server's chat route
// -----------------------------------------------------------

export const ASSISTANT_CHAT_PATH = '/api/assistant/chat';







// -----------------------------------------------------------
// ASSISTANT_TOOLS_PATH
// -----------------------------------------------------------
//
// The container's tool-manifest endpoint, FIXED — appended to
// the host's baseUrl by joinUrl(); the server mirrors it
// verbatim.
//
// Used by:
//   - tools/contract.ts — fetchAssistantTools' URL
//   - testing/index.tsx — the fake server's tools route
// -----------------------------------------------------------

export const ASSISTANT_TOOLS_PATH = '/api/assistant/tools';







// -----------------------------------------------------------
// ASSISTANT_CLIENT_HEADER
// -----------------------------------------------------------
//
// Every request names its client through this header — value
// 'knfapp-mobile/<clientVersion>'.
//
// Used by:
//   - core/transport.ts — the client header on chat requests
//   - tools/contract.ts — the same header on tool fetches
//   - testing/index.tsx — the fake server asserts it
// -----------------------------------------------------------

export const ASSISTANT_CLIENT_HEADER = 'x-knf-assistant-client';







// -----------------------------------------------------------
// AssistantTransportConfig
// -----------------------------------------------------------
//
// Everything a host decides about the wire, in one object —
// the transport and the tools fetch both take it (the tools
// path reads only the header slice).
//
// Used by:
//   - core/transport.ts — createKnfAssistantTransport,
//     createAssistantFetch, and the AssistantHeadersConfig
//     slice
//   - tools/contract.ts — fetchAssistantTools
// -----------------------------------------------------------

export interface AssistantTransportConfig {
  // The ORIGIN plus an optional path prefix the two fixed
  // paths are appended to: 'https://knf.example.lt' yields
  // https://knf.example.lt/api/assistant/chat, and
  // 'https://knf.example.lt/mobile' yields
  // https://knf.example.lt/mobile/api/assistant/chat. An
  // '/api' suffix here is the classic mistake — the paths
  // already carry it. Trailing slashes are tolerated
  baseUrl: string;
  // null = guest — no Authorization header at all. A rejecting
  // or empty answer counts as guest too: a 'Bearer ' with
  // nothing behind it is never right
  getAuthToken: () => Promise<string | null>;
  // → Accept-Language, read fresh on every request
  language: () => AssistantLanguage;
  // → the client header
  clientVersion: string;
  // The fetch to send through — the test seam; default
  // globalThis.fetch
  fetch?: typeof fetch;
  // Aborts a request whose response HEADERS have not arrived
  // in time; default 30 000. A streaming body is never
  // time-boxed — a slow model is not a dead network
  firstByteTimeoutMs?: number;
  // Telemetry / toasts for TRANSPORT failures only — a non-2xx
  // answer, a throwing fetch, the first-byte deadline — called
  // once per failed request for every code but 'aborted' (a
  // cancel is the user's own act). A failure streamed after
  // the headers (an `error` chunk, a malformed frame) never
  // passes through here: read it via useAssistantFailure.
  // Wrapped in try/catch — a throwing listener never becomes
  // the failure it reports
  onFailure?: (failure: AssistantFailure) => void;
  // The server-side thread this chat persists into, resolved
  // fresh on EVERY send — the host returns the id it already
  // holds, or creates the thread on the first send (so an
  // abandoned empty chat never mints a row) and returns the
  // new id. The wrapper injects it into the chat body as
  // `threadId`; null/undefined sends a stateless turn, and a
  // REJECTING resolver fails the request (a thread the host
  // meant to persist must not silently degrade to stateless).
  // Absent = the transport never touches the body
  threadId?: () => string | null | undefined | Promise<string | null | undefined>;
}







// -----------------------------------------------------------
// AssistantFailureCode
// -----------------------------------------------------------
//
// The closed code set a screen switches on:
//
// 'network'     — the request never reached a server (DNS,
//                 offline, a throwing fetch)
// 'timeout'     — no response headers inside firstByteTimeoutMs
// 'auth'        — 401 / 403: the bearer is missing where it
//                 is required, expired, or refused
// 'quota'       — 429, with retryAfterMs when the server said
//                 how long to wait
// 'server'      — any other 4xx / 5xx, or a failure the model
//                 layer reported mid-stream
// 'unavailable' — 502 / 503 / 504: the container is down or
//                 restarting, retryAfterMs when present
// 'aborted'     — the caller's own AbortSignal fired
//
// Used by:
//   - AssistantFailure (below) — the `code` field
//   - hosts typing their failure handling
// -----------------------------------------------------------

export type AssistantFailureCode = 'network' | 'timeout' | 'auth' | 'quota' | 'server' | 'unavailable' | 'aborted';







// -----------------------------------------------------------
// AssistantFailure
// -----------------------------------------------------------
//
// The one failure VALUE every wire problem collapses into —
// compared by value, carried by AssistantTransportError,
// read back by useAssistantFailure().
//
// Used by:
//   - core/errors.ts — built by toAssistantFailure
//   - core/transport.ts — thrown and reported via onFailure
//   - tools/contract.ts — the tools endpoint's failure path
//   - hooks/useAssistantFailure.ts — the hook's return value
//   - testing/index.tsx — the probe publishes it
// -----------------------------------------------------------

export interface AssistantFailure {
  code: AssistantFailureCode;
  // The HTTP status when a response produced this failure
  status?: number;
  // Milliseconds to hold off before retrying, from Retry-After
  // (seconds or an HTTP-date); present only when the server
  // sent one that parsed
  retryAfterMs?: number;
  // The server's own words when it sent any (`error` or
  // `message` in a JSON body), else the status text, else a
  // fixed English fallback — never shown raw to a user, the
  // host maps `code` to its i18n
  message: string;
}







// -----------------------------------------------------------
// AssistantTransportError
// -----------------------------------------------------------
//
// The one exception the transport throws — the upstream
// runtime surfaces it as the thread's error, and
// useAssistantFailure() reads `failure` straight back out
//
// Used by:
//   - core/transport.ts, tools/contract.ts — every throw
//   - core/errors.ts — the isAssistantTransportError guard
// -----------------------------------------------------------

export class AssistantTransportError extends Error {
  readonly failure: AssistantFailure;

  constructor(failure: AssistantFailure, options?: { cause?: unknown }) {
    // The message carries the code and HTTP status ON PURPOSE:
    // the thread's error banner prints error.message, and a
    // student's screenshot must name the failure precisely —
    // "auth 401: Session expired", not just the prose
    super(`${failure.code}${failure.status !== undefined ? ` ${failure.status}` : ''}: ${failure.message}`, options);
    this.name = 'AssistantTransportError';
    this.failure = failure;
  }
}
