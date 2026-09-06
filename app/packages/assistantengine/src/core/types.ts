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

export type AssistantLanguage = 'lt' | 'en';

// The two container endpoints, FIXED — appended to the host's
// baseUrl by joinUrl(); the server mirrors them verbatim
export const ASSISTANT_CHAT_PATH = '/api/assistant/chat';
export const ASSISTANT_TOOLS_PATH = '/api/assistant/tools';

// Every request names its client — value 'knfapp-mobile/<clientVersion>'
export const ASSISTANT_CLIENT_HEADER = 'x-knf-assistant-client';


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
}


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
export type AssistantFailureCode = 'network' | 'timeout' | 'auth' | 'quota' | 'server' | 'unavailable' | 'aborted';

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


// The one exception the transport throws — the upstream
// runtime surfaces it as the thread's error, and
// useAssistantFailure() reads `failure` straight back out
export class AssistantTransportError extends Error {
  readonly failure: AssistantFailure;

  constructor(failure: AssistantFailure, options?: { cause?: unknown }) {
    super(failure.message, options);
    this.name = 'AssistantTransportError';
    this.failure = failure;
  }
}
