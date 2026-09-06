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
//  Split into:
//
//    resolveFetch               — the seam or the global
//    joinUrl                    — base + fixed path, no '//'
//    buildAssistantHeaders      — the three faculty headers
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
//    - core/__tests__/transport.test.ts and both hook suites
//    - the app's assistant screen wiring, once it lands —
//      no app import yet
// -----------------------------------------------------------

import { AssistantChatTransport } from '@assistant-ui/ai-sdk';
import type { UIMessage } from 'ai';

import { readFailureBody, toAssistantFailure } from './errors';
import {
  ASSISTANT_CHAT_PATH,
  ASSISTANT_CLIENT_HEADER,
  AssistantTransportError,
  type AssistantFailure,
  type AssistantTransportConfig,
} from './types';


const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 30_000;


// The transport the app types against — the upstream class over
// the upstream message shape, named once here so the app never
// imports either
export type KnfAssistantTransport = AssistantChatTransport<UIMessage>;

// The slice of the config every request's headers need — the
// tools endpoint builds the same headers without a timeout or
// a failure listener
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

async function readToken(getAuthToken: AssistantTransportConfig['getAuthToken']): Promise<string | null> {
  try {
    const token = await getAuthToken();
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    // A session store that cannot answer has no session
    return null;
  }
}


// A promise that only ever rejects — when the signal fires (or
// at once, if it already has), with the error shape a real
// fetch throws on abort
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
    if (callerSignal?.aborted) return fail({ code: 'aborted', message: 'Request aborted' });
    callerSignal?.addEventListener('abort', forwardAbort, { once: true });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await Promise.race([run(input, { ...init, headers, signal: controller.signal }), rejectOnAbort(controller.signal)]);
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
//   - the app's assistant screen wiring, once it lands: one
//     instance per session, memoized, handed to
//     useKnfAssistantRuntime — no app import yet
// -----------------------------------------------------------

export function createKnfAssistantTransport(config: AssistantTransportConfig): KnfAssistantTransport {
  return new AssistantChatTransport<UIMessage>({
    api: joinUrl(config.baseUrl, ASSISTANT_CHAT_PATH),
    fetch: createAssistantFetch(config),
  });
}
