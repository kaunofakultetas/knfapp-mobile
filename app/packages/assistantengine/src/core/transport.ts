// -----------------------------------------------------------
//  [*] assistantengine — the transport
//
//  The upstream chat transport pointed at the container, with
//  its fetch wrapped in the faculty's disciplines. Every
//  request carries the session (Authorization only when a
//  token exists — a guest sends none), the UI language
//  (Accept-Language) and the client version; the wait for
//  response HEADERS is raced against firstByteTimeoutMs while
//  the streaming body is never time-boxed; a non-2xx answer
//  has its body read ONCE, becomes one typed AssistantFailure,
//  is reported to onFailure and THROWN as
//  AssistantTransportError — the upstream runtime turns a
//  thrown transport error into the thread's error, which is
//  exactly where useAssistantFailure() reads it back. A 2xx
//  is returned untouched: its body is the stream, and the
//  upstream owns the reading. The caller's AbortSignal is
//  chained onto ours, so a cancel wins over the deadline and
//  reads as 'aborted' — reported nowhere, since it was asked
//  for — and keeps cutting the body long after headers came.
//
//  A configured threadId resolver is asked on every send
//  which server-side thread the turn persists into, and its
//  answer is stamped into the chat body as `threadId` — the
//  lazy-creation seam: the host mints the thread on the
//  first send and just returns the id afterwards.
//
//  The body's history is WINDOWED on the way out: the last
//  HISTORY_WINDOW messages at most, opening on a user turn,
//  with tool results kept only on the newest
//  TOOL_EVIDENCE_WINDOW (the container prunes older tool
//  traffic before the model anyway). A long conversation used
//  to die for good the day its history crossed the container's
//  message-count or body-size ceiling — every send a 400, and
//  Retry re-sent the same body.
//
//  Split into:
//
//    resolveFetch               — the seam or the global
//    joinUrl                    — base + fixed path, no '//'
//    buildAssistantHeaders      — the three faculty headers
//    trimHistory                — the history window
//    prepareRequestBody         — window + threadId injection
//    createAssistantFetch       — the wrapped fetch
//    createKnfAssistantTransport — the upstream transport built
//                                 on it
//
//  Used by:
//    - hooks/useKnfAssistantRuntime.ts — the transport type
//    - tools/contract.ts — joinUrl, buildAssistantHeaders,
//      resolveFetch
//    - testing/index.tsx — describeTransportContract builds
//      the real transport for its rig
//    - core/__tests__/transport.test.ts, transportThread.test.ts
//      and both hook suites
//    - app/(main)/tabs/assistant.tsx — createKnfAssistantTransport
// -----------------------------------------------------------

import { AssistantChatTransport } from '@assistant-ui/ai-sdk';
import type { UIMessage } from 'ai';

import { readFailureBody, serverCodeOf, serverMessage, toAssistantFailure } from './errors';
import {
  ASSISTANT_CHAT_PATH,
  ASSISTANT_CLIENT_HEADER,
  AssistantTransportError,
  type AssistantFailure,
  type AssistantTransportConfig,
} from './types';


// Milliseconds to wait for response HEADERS before aborting —
// the streaming body itself is never time-boxed (a slow model
// is not a dead network)
const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 30_000;

// The most history messages one request carries — well under
// the container's 60-message ceiling, and 20 exchanges is more
// context than a faculty question needs
const HISTORY_WINDOW = 40;

// Only the newest this-many messages keep their tool parts —
// the container prunes tool traffic older than its last ten
// MODEL messages (fewer UI messages still), so an older result
// is bytes toward the body ceiling and nothing to the model
const TOOL_EVIDENCE_WINDOW = 10;







// -----------------------------------------------------------
// KnfAssistantTransport
// -----------------------------------------------------------
//
// The transport the app types against — the upstream class over
// the upstream message shape, named once here so the app never
// imports either.
//
// Used by:
//   - createKnfAssistantTransport (below) — the return type
//   - hooks/useKnfAssistantRuntime.ts — the options' transport
//     field
// -----------------------------------------------------------

export type KnfAssistantTransport = AssistantChatTransport<UIMessage>;







// -----------------------------------------------------------
// AssistantHeadersConfig
// -----------------------------------------------------------
//
// The slice of the config every request's headers need — the
// tools endpoint builds the same headers without a timeout or
// a failure listener.
//
// Used by:
//   - buildAssistantHeaders (below) — its config parameter
//   - exported through the barrel for hosts; nothing else
//     in-tree imports it yet
// -----------------------------------------------------------

export type AssistantHeadersConfig = Pick<AssistantTransportConfig, 'getAuthToken' | 'language' | 'clientVersion'>;







// -----------------------------------------------------------
// resolveFetch
// -----------------------------------------------------------
//
// The injected seam when there is one, else the global — called
// as a method on globalThis, because an unbound `fetch` is an
// illegal invocation in browser engines.
//
// Used by:
//   - createAssistantFetch (below)
//   - tools/contract.ts — fetchAssistantTools
// -----------------------------------------------------------

export function resolveFetch(seam: typeof fetch | undefined): typeof fetch {
  return seam ?? ((input, init) => globalThis.fetch(input, init));
}







// -----------------------------------------------------------
// joinUrl
// -----------------------------------------------------------
//
//   joinUrl('https://knf.example.lt', '/api/assistant/chat')
//     → 'https://knf.example.lt/api/assistant/chat'
//   joinUrl('https://knf.example.lt/mobile/', 'api/assistant/chat')
//     → 'https://knf.example.lt/mobile/api/assistant/chat'
//   joinUrl('', '/api/assistant/chat')  → '/api/assistant/chat'
//
// Exactly one slash at the seam whatever either side brought;
// a base prefix is KEPT — the base is an origin plus whatever
// the container is mounted under, never a path into it.
//
// Used by:
//   - createKnfAssistantTransport (below)
//   - tools/contract.ts — fetchAssistantTools
// -----------------------------------------------------------

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}







// -----------------------------------------------------------
// buildAssistantHeaders
// -----------------------------------------------------------
//
// The request's headers as one plain lowercase-keyed record:
// whatever the caller brought (the upstream's content-type),
// then Accept-Language from language(), the client header,
// and Authorization ONLY for a non-empty token — a rejecting
// or empty getAuthToken is a guest, never an error. A record
// rather than a Headers instance so every fetch seam reads it
// the same way, and a fake can index it directly.
//
// Used by:
//   - createAssistantFetch (below)
//   - tools/contract.ts — fetchAssistantTools
// -----------------------------------------------------------

export async function buildAssistantHeaders(config: AssistantHeadersConfig, base?: HeadersInit): Promise<Record<string, string>> {
  const headers = new Headers(base);
  headers.set('Accept-Language', config.language());
  headers.set(ASSISTANT_CLIENT_HEADER, `knfapp-mobile/${config.clientVersion}`);
  const token = await readToken(config.getAuthToken);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const record: Record<string, string> = {};
  headers.forEach((value, name) => {
    record[name] = value;
  });
  return record;
}







// -----------------------------------------------------------
// readToken
// -----------------------------------------------------------
//
// A rejecting or empty getAuthToken is a guest, never an
// error.
//
// Used by:
//   - buildAssistantHeaders (above)
// -----------------------------------------------------------

async function readToken(getAuthToken: AssistantTransportConfig['getAuthToken']): Promise<string | null> {
  try {
    const token = await getAuthToken();
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    // A session store that cannot answer has no session
    return null;
  }
}







// -----------------------------------------------------------
// trimHistory
// -----------------------------------------------------------
//
//   trimHistory(fiftyMessages) → the last ≤ 40, from a user
//                                turn, old tool parts dropped
//   trimHistory(fiveMessages)  → the SAME array, untouched
//
// The history window. A cut window never opens on an
// assistant message — a reply with no question above it
// reads to the model as talking to itself. Older than the
// newest TOOL_EVIDENCE_WINDOW, an assistant message loses its
// tool parts (`tool-*`, `dynamic-tool`); its text, and every
// message's id and order, stay — the container persists only
// the newest ten request messages, none of which is ever
// touched here. Returns the input array itself when nothing
// changed, so a short conversation's body goes out
// byte-identical.
//
// Used by:
//   - prepareRequestBody (below)
//   - core/__tests__/transportThread.test.ts
// -----------------------------------------------------------

export function trimHistory(messages: readonly unknown[]): unknown[] {
  let start = Math.max(0, messages.length - HISTORY_WINDOW);
  if (start > 0) {
    while (start < messages.length - 1 && roleOf(messages[start]) !== 'user') start += 1;
  }
  const evidenceFrom = messages.length - TOOL_EVIDENCE_WINDOW;

  let changed = start > 0;
  const kept = messages.slice(start).map((message, offset) => {
    if (start + offset >= evidenceFrom) return message;
    const stripped = withoutToolParts(message);
    if (stripped !== message) changed = true;
    return stripped;
  });
  return changed ? kept : (messages as unknown[]);
}







// -----------------------------------------------------------
// roleOf
// -----------------------------------------------------------
//
// A wire message's role, when it is shaped like one.
//
// Used by:
//   - trimHistory (above), withoutToolParts (below)
// -----------------------------------------------------------

function roleOf(message: unknown): unknown {
  return (message as { role?: unknown } | null)?.role;
}







// -----------------------------------------------------------
// withoutToolParts
// -----------------------------------------------------------
//
// An assistant message minus its tool parts — a NEW object
// only when there was one to drop, the message itself
// otherwise.
//
// Used by:
//   - trimHistory (above)
// -----------------------------------------------------------

function withoutToolParts(message: unknown): unknown {
  const parts = (message as { parts?: unknown } | null)?.parts;
  if (roleOf(message) !== 'assistant' || !Array.isArray(parts)) return message;
  const isTool = (part: unknown) => {
    const type = (part as { type?: unknown } | null)?.type;
    return typeof type === 'string' && (type.startsWith('tool-') || type === 'dynamic-tool');
  };
  if (!parts.some(isTool)) return message;
  return { ...(message as Record<string, unknown>), parts: parts.filter((part) => !isTool(part)) };
}







// -----------------------------------------------------------
// resolverFailure
// -----------------------------------------------------------
//
//   resolverFailure({ status: 429, data: {...} })
//     → { code: 'quota', status: 429, serverCode?, message }
//
// A threadId resolver's rejection as the typed failure, its
// HTTP identity KEPT: the host's HTTP client error carries
// `status`, the answer body as `data` and maybe its own
// `serverCode`/`code` — read by shape, the engine imports no
// host class. 401/403 auth, 429 quota, 502-504 unavailable,
// any other status server (a 500 on thread-create is no
// connectivity problem); no status is the network, or the
// timeout when the client said so. The message names the
// step and then the server's own words, and the server's
// machine code rides along — the banner's technical line
// once read only "Thread could not be created".
//
// Used by:
//   - prepareRequestBody (below)
// -----------------------------------------------------------

function resolverFailure(error: unknown): AssistantFailure {
  const shaped = (error ?? {}) as { status?: unknown; data?: unknown; serverCode?: unknown; code?: unknown };
  const status = typeof shaped.status === 'number' && shaped.status > 0 ? shaped.status : undefined;
  const code: AssistantFailure['code'] =
    status === 401 || status === 403 ? 'auth'
    : status === 429 ? 'quota'
    : status === 502 || status === 503 || status === 504 ? 'unavailable'
    : status !== undefined ? 'server'
    : shaped.code === 'timeout' ? 'timeout'
    : 'network';
  const words = serverMessage(shaped.data);
  const serverCode = serverCodeOf(shaped.data) ?? (typeof shaped.serverCode === 'string' && shaped.serverCode ? shaped.serverCode : null);
  return {
    code,
    ...(status !== undefined ? { status } : {}),
    ...(serverCode ? { serverCode } : {}),
    message: words ? `Thread could not be created — ${words}` : 'Thread could not be created',
  };
}







// -----------------------------------------------------------
// prepareRequestBody
// -----------------------------------------------------------
//
// The body seam, for a JSON string body: first the threadId
// resolver (when one is configured) is asked which thread
// this send persists into, then the body is parsed ONCE —
// the history windowed (trimHistory) and the thread stamped
// as `threadId` next to the upstream's own fields. A body
// that is not a JSON object string passes through untouched
// (defensive: the upstream only ever sends one), and so does
// one where nothing changed. A THROWING resolver fails the
// request — the host was creating the thread and could not,
// and a silently stateless turn would lose the person's
// history — with the refusal's identity kept
// (resolverFailure).
//
// Used by:
//   - createAssistantFetch (below)
// -----------------------------------------------------------

async function prepareRequestBody(
  config: AssistantTransportConfig,
  body: BodyInit | null | undefined,
  fail: (failure: AssistantFailure, cause?: unknown) => never,
): Promise<BodyInit | null | undefined> {
  if (typeof body !== 'string') return body;

  let threadId: string | null | undefined;
  if (config.threadId) {
    try {
      threadId = await config.threadId();
    } catch (error) {
      return fail(resolverFailure(error), error);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;

  const fields = parsed as Record<string, unknown>;
  const messages = Array.isArray(fields.messages) ? trimHistory(fields.messages) : fields.messages;
  if (messages === fields.messages && !threadId) return body;
  return JSON.stringify({ ...fields, messages, ...(threadId ? { threadId } : {}) });
}







// -----------------------------------------------------------
// rejectOnAbort
// -----------------------------------------------------------
//
// A promise that only ever rejects — when the signal fires (or
// at once, if it already has), with the error shape a real
// fetch throws on abort.
//
// Used by:
//   - createAssistantFetch (below) — raced against the seam
// -----------------------------------------------------------

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_, reject) => {
    const abort = () => reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' }));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}







// -----------------------------------------------------------
// createAssistantFetch
// -----------------------------------------------------------
//
// The wrapped fetch the transport sends through. Headers are
// built BEFORE the deadline starts, so the clock measures the
// network wait alone; a cancel that lands during the token
// read never fires the request. The fetch is RACED against
// our own abort rather than trusted to honour the signal — a
// seam that never settles still answers 'timeout' on the
// deadline and 'aborted' on a cancel. Failure precedence on
// a throw: the caller's abort, then our deadline, then the
// error's own shape. Every throw out of here is an
// AssistantTransportError; onFailure hears every code but
// 'aborted'.
//
// Used by:
//   - createKnfAssistantTransport (below)
//   - exported for a host that needs the same disciplines on
//     another endpoint — none does yet
// -----------------------------------------------------------

export function createAssistantFetch(config: AssistantTransportConfig): typeof fetch {
  const timeoutMs = config.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS;

  const report = (failure: AssistantFailure): void => {
    try {
      config.onFailure?.(failure);
    } catch {
      // Telemetry must never become the failure it reports
    }
  };

  return async (input, init) => {
    const run = resolveFetch(config.fetch);
    const callerSignal = init?.signal ?? null;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();

    const fail = (failure: AssistantFailure, cause?: unknown): never => {
      callerSignal?.removeEventListener('abort', forwardAbort);
      if (failure.code !== 'aborted') report(failure);
      throw new AssistantTransportError(failure, { cause });
    };

    const headers = await buildAssistantHeaders(config, init?.headers);
    const body = await prepareRequestBody(config, init?.body, fail);
    if (callerSignal?.aborted) return fail({ code: 'aborted', message: 'Request aborted' });
    callerSignal?.addEventListener('abort', forwardAbort, { once: true });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await Promise.race([run(input, { ...init, headers, body, signal: controller.signal }), rejectOnAbort(controller.signal)]);
    } catch (error) {
      clearTimeout(timer);
      if (callerSignal?.aborted) return fail({ code: 'aborted', message: 'Request aborted' }, error);
      if (timedOut) return fail({ code: 'timeout', message: `No response headers within ${timeoutMs} ms` }, error);
      return fail(toAssistantFailure(error), error);
    }
    clearTimeout(timer);

    // The abort forwarder stays installed on purpose: the
    // caller's stop() must still cut the body it is about to
    // read, and the upstream retires its signal with the run
    if (response.ok) return response;
    return fail(toAssistantFailure(response, await readFailureBody(response)));
  };
}







// -----------------------------------------------------------
// createKnfAssistantTransport
// -----------------------------------------------------------
//
//   const transport = createKnfAssistantTransport({
//     baseUrl, getAuthToken, language, clientVersion,
//     fetch?, firstByteTimeoutMs?, onFailure?,
//   });
//
// The upstream transport aimed at baseUrl + the chat path,
// sending through the wrapped fetch. The upstream adds the
// request body (thread id, messages, trigger, its tool map —
// empty here, tools run in the container) and reads the
// event stream back; nothing of that is ours to touch.
//
// Used by:
//   - testing/index.tsx — the conformance rig, and through it
//     every suite that mounts the probe over a fake wire
//   - core/__tests__/transport.test.ts — the disciplines above
//   - app/(main)/tabs/assistant.tsx — one instance per chat
//     mount, memoized, handed to useKnfAssistantRuntime
// -----------------------------------------------------------

export function createKnfAssistantTransport(config: AssistantTransportConfig): KnfAssistantTransport {
  return new AssistantChatTransport<UIMessage>({
    api: joinUrl(config.baseUrl, ASSISTANT_CHAT_PATH),
    fetch: createAssistantFetch(config),
  });
}
