// -----------------------------------------------------------
//  [*] assistantengine — errors
//
//  Every way a request can fail, folded into one
//  AssistantFailure by pure functions: a response's status
//  picks the code (401/403 auth, 429 quota, 502-504
//  unavailable, the rest of 4xx/5xx server), Retry-After
//  becomes milliseconds whether it came as seconds or as an
//  HTTP-date, the server's own `error`/`message` wins over the
//  status text; a thrown error is read by NAME — 'AbortError'
//  (or an aborted signal) is the user's cancel, 'TimeoutError'
//  (a host's own deadline signal, AbortSignal.timeout say) is
//  'timeout' — the transport's first-byte deadline builds that
//  failure itself and never throws one — and anything else
//  that escaped fetch is the network. Nothing here touches
//  the wire: the body is read ONCE by readFailureBody and
//  handed in, so the mapping stays synchronous and testable
//  as a table.
//
//  Split into:
//
//    isAssistantTransportError — the guard
//    parseRetryAfter           — seconds or HTTP-date → ms
//    readFailureBody           — the one body read, JSON or text
//    toAssistantFailure        — the mapping table
//
//  Used by:
//    - core/transport.ts, tools/contract.ts — every failure path
//    - hooks/useAssistantFailure.ts — the guard
// -----------------------------------------------------------

import { AssistantTransportError, type AssistantFailure } from './types';


// The subset of a Response the mapping reads — a hand-made
// {status, statusText, headers} in a test is as good as the
// real thing
interface ResponseLike {
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
}

function isResponseLike(value: unknown): value is ResponseLike {
  if (!value || typeof value !== 'object') return false;
  const shaped = value as { status?: unknown; headers?: { get?: unknown } };
  return typeof shaped.status === 'number' && typeof shaped.headers?.get === 'function';
}

function nameOf(value: unknown): string | null {
  const name = (value as { name?: unknown })?.name;
  return typeof name === 'string' ? name : null;
}

function messageOf(value: unknown): string | null {
  const message = (value as { message?: unknown })?.message;
  return typeof message === 'string' && message.length > 0 ? message : null;
}


// -----------------------------------------------------------
// isAssistantTransportError
// -----------------------------------------------------------
//
// instanceof first; the duck-typed fallback keeps the guard
// honest across a second copy of the class (a bundler that
// split the package, a mocked module boundary in a test).
//
// Used by:
//   - toAssistantFailure (below) — an already-typed error passes
//     through untouched
//   - hooks/useAssistantFailure.ts — reads the failure back
//   - hosts triaging a caught error
// -----------------------------------------------------------

export function isAssistantTransportError(error: unknown): error is AssistantTransportError {
  if (error instanceof AssistantTransportError) return true;
  if (!error || typeof error !== 'object') return false;
  const failure = (error as { failure?: { code?: unknown } }).failure;
  return nameOf(error) === 'AssistantTransportError' && typeof failure?.code === 'string';
}


// -----------------------------------------------------------
// parseRetryAfter
// -----------------------------------------------------------
//
// The header's two grammars: delay-seconds ('30', '2.5'
// tolerated) and an HTTP-date, which becomes the distance
// from `now` (a date already in the past answers 0 — retry at
// once, not never). Anything else answers undefined.
//
// Used by:
//   - toAssistantFailure (below)
// -----------------------------------------------------------

export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, at - now);
}


// -----------------------------------------------------------
// readFailureBody
// -----------------------------------------------------------
//
// The ONE read of a failed response's body: JSON when it
// parses, the raw text otherwise, an empty string when the
// body cannot be read at all (already consumed, or the
// connection dropped mid-read). Never throws.
//
// Used by:
//   - transport.ts — before toAssistantFailure on a non-2xx
//   - tools/contract.ts — the tools endpoint's failure path
// -----------------------------------------------------------

export async function readFailureBody(response: Response): Promise<unknown> {
  let text = '';
  try {
    text = await response.text();
  } catch {
    // A body that cannot be read leaves the status to speak
  }
  if (text.length === 0) return '';
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}


// -----------------------------------------------------------
// toAssistantFailure
// -----------------------------------------------------------
//
//   toAssistantFailure(response, body)   — a non-2xx Response
//                                          (or {status, statusText,
//                                          headers}) plus its
//                                          already-read body
//   toAssistantFailure(error)            — anything fetch threw
//
//   401 / 403          → 'auth'
//   429                → 'quota'        (+ retryAfterMs)
//   502 / 503 / 504    → 'unavailable'  (+ retryAfterMs when sent)
//   any other status   → 'server'
//   AbortError / aborted signal → 'aborted'
//   TimeoutError                → 'timeout'
//   TypeError / other throw     → 'network'
//   AssistantTransportError     → its own failure, untouched
//
// The message is the server's `error` or `message` (a string,
// or an object carrying a string `message`) when the body is
// JSON, else the status text, else 'HTTP <status>'.
// retryAfterMs and status are present only when derived —
// the object compares by value in a mapping table.
//
// Used by:
//   - transport.ts, tools/contract.ts — every failure path
//   - hosts mapping an error they caught themselves
// -----------------------------------------------------------

export function toAssistantFailure(input: unknown, body?: unknown): AssistantFailure {
  if (isAssistantTransportError(input)) return input.failure;
  if (isResponseLike(input)) return fromResponse(input, body);
  return fromThrown(input);
}

function fromResponse(response: ResponseLike, body: unknown): AssistantFailure {
  const { status } = response;
  const message = serverMessage(body) ?? response.statusText ?? '';
  const base: AssistantFailure = { code: 'server', status, message: message || `HTTP ${status}` };
  if (status === 401 || status === 403) return { ...base, code: 'auth' };
  if (status === 429) return withRetryAfter({ ...base, code: 'quota' }, response);
  if (status === 502 || status === 503 || status === 504) return withRetryAfter({ ...base, code: 'unavailable' }, response);
  return base;
}

function withRetryAfter(failure: AssistantFailure, response: ResponseLike): AssistantFailure {
  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
  return retryAfterMs === undefined ? failure : { ...failure, retryAfterMs };
}

function serverMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (typeof error === 'string' && error.length > 0) return error;
  if (typeof message === 'string' && message.length > 0) return message;
  return messageOf(error);
}

function fromThrown(error: unknown): AssistantFailure {
  const name = nameOf(error);
  const signalAborted = (error as { aborted?: unknown })?.aborted === true;
  if (name === 'AbortError' || signalAborted) {
    return { code: 'aborted', message: messageOf(error) ?? 'Request aborted' };
  }
  if (name === 'TimeoutError') {
    return { code: 'timeout', message: messageOf(error) ?? 'No response headers in time' };
  }
  return { code: 'network', message: messageOf(error) ?? 'Network request failed' };
}
