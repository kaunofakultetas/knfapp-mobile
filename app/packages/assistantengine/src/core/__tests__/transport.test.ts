// -----------------------------------------------------------
//  [*] Tests — the transport, every discipline pinned
//
//  joinUrl's one-slash seam; the three faculty headers with
//  the bearer present only for a real token; the wrapped
//  fetch's four rules — a 2xx handed back untouched with its
//  body unread, a non-2xx read ONCE and thrown typed after one
//  onFailure call, a throwing seam mapped the same way, and a
//  listener that throws never becoming the failure; the
//  first-byte deadline on fake timers and on a seam that never
//  answers; the caller's cancel winning before and during the
//  wait and reading as 'aborted' with no report; the seam's
//  signal chained to the caller's. Then the upstream transport
//  built on it: the POST at the joined URL with the upstream's
//  body, and a chunk stream that parses.
// -----------------------------------------------------------

import { buildAssistantHeaders, createAssistantFetch, createKnfAssistantTransport, joinUrl, resolveFetch } from '../transport';
import { ASSISTANT_CHAT_PATH, AssistantTransportError, type AssistantFailure, type AssistantTransportConfig } from '../types';
import { createFakeAssistantServer, errorReply, hangForever, networkFailure, textReply } from '../../testing';


const BASE = 'https://knf.example.lt';
const URL_CHAT = `${BASE}${ASSISTANT_CHAT_PATH}`;

// A config over the reference fake, with every failure the
// wrapper reports written down
const rig = (overrides: Partial<AssistantTransportConfig> = {}) => {
  const server = createFakeAssistantServer();
  const failures: AssistantFailure[] = [];
  const config: AssistantTransportConfig = {
    baseUrl: BASE,
    getAuthToken: async () => 'tok',
    language: () => 'lt',
    clientVersion: '1.2.3',
    fetch: server.fetch,
    onFailure: (failure) => {
      failures.push(failure);
    },
    ...overrides,
  };
  return { server, failures, config, run: createAssistantFetch(config) };
};

// Await a promise that MUST reject with our error and hand it back
const rejection = async (promise: Promise<unknown>): Promise<AssistantTransportError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AssistantTransportError) return error;
    throw new Error(`expected an AssistantTransportError, got ${String(error)}`);
  }
  throw new Error('expected a rejection');
};

const post = (run: typeof fetch, init: RequestInit = {}) =>
  run(URL_CHAT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"messages":[]}', ...init });

// The wrapper reads the token over an await chain before its
// clock starts — under fake timers a microtask-turn loop walks
// it to the point where the request is on the wire
const flush = async (turns = 20): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
};


describe('joinUrl', () => {
  it.each([
    ['an origin and the path', 'https://knf.example.lt', '/api/assistant/chat', 'https://knf.example.lt/api/assistant/chat'],
    ['a trailing slash on the base', 'https://knf.example.lt/', '/api/assistant/chat', 'https://knf.example.lt/api/assistant/chat'],
    ['no leading slash on the path', 'https://knf.example.lt', 'api/assistant/chat', 'https://knf.example.lt/api/assistant/chat'],
    ['a prefix on the base, kept', 'https://knf.example.lt/mobile/', 'api/assistant/tools', 'https://knf.example.lt/mobile/api/assistant/tools'],
    ['several slashes on both sides', 'https://knf.example.lt//', '//api/assistant/chat', 'https://knf.example.lt/api/assistant/chat'],
    ['an empty base', '', '/api/assistant/chat', '/api/assistant/chat'],
  ])('%s', (_label, base, path, expected) => {
    expect(joinUrl(base, path)).toBe(expected);
  });
});


describe('resolveFetch', () => {
  it('hands the seam back as is', () => {
    const seam: typeof fetch = async () => new Response('');
    expect(resolveFetch(seam)).toBe(seam);
  });

  it('without a seam calls the global fetch as a method with the same arguments', async () => {
    const original = globalThis.fetch;
    const seen: unknown[][] = [];
    globalThis.fetch = async (...args: unknown[]) => {
      seen.push(args);
      return new Response('ok');
    };
    try {
      const response = await resolveFetch(undefined)('https://knf.example.lt/x', { method: 'GET' });
      expect(await response.text()).toBe('ok');
      expect(seen).toEqual([['https://knf.example.lt/x', { method: 'GET' }]]);
    } finally {
      globalThis.fetch = original;
    }
  });
});


describe('buildAssistantHeaders', () => {
  const base = { getAuthToken: async () => 'tok', language: () => 'lt' as const, clientVersion: '1.2.3' };

  it('answers one lowercase record: the caller\'s headers, Accept-Language, the client header, the bearer', async () => {
    await expect(buildAssistantHeaders(base, { 'Content-Type': 'application/json' })).resolves.toEqual({
      'content-type': 'application/json',
      'accept-language': 'lt',
      'x-knf-assistant-client': 'knfapp-mobile/1.2.3',
      authorization: 'Bearer tok',
    });
  });

  it.each([
    ['null', async () => null],
    ['an empty string', async () => ''],
    ['a rejection', async () => Promise.reject(new Error('session store down'))],
  ])('%s from getAuthToken is a guest — no Authorization key at all', async (_label, getAuthToken) => {
    const headers = await buildAssistantHeaders({ ...base, getAuthToken });
    expect(headers).toEqual({ 'accept-language': 'lt', 'x-knf-assistant-client': 'knfapp-mobile/1.2.3' });
  });

  it('reads the language fresh on every build', async () => {
    let language: 'lt' | 'en' = 'lt';
    const config = { ...base, language: () => language };
    expect((await buildAssistantHeaders(config))['accept-language']).toBe('lt');
    language = 'en';
    expect((await buildAssistantHeaders(config))['accept-language']).toBe('en');
  });

  it('accepts a Headers instance and an entries array as the base', async () => {
    const fromHeaders = await buildAssistantHeaders(base, new Headers({ Accept: 'text/event-stream' }));
    const fromEntries = await buildAssistantHeaders(base, [['Accept', 'text/event-stream']]);
    expect(fromHeaders.accept).toBe('text/event-stream');
    expect(fromEntries.accept).toBe('text/event-stream');
  });

  it('the faculty headers win over a caller\'s copy of them', async () => {
    const headers = await buildAssistantHeaders(base, { 'Accept-Language': 'de', Authorization: 'Bearer stale' });
    expect(headers['accept-language']).toBe('lt');
    expect(headers.authorization).toBe('Bearer tok');
  });
});


describe('createAssistantFetch — the request', () => {
  it('forwards the URL, the method and the body, with the faculty headers merged in', async () => {
    const { server, run } = rig();
    server.script(textReply(['Labas']));

    await post(run);

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].url).toBe(URL_CHAT);
    expect(server.calls[0].method).toBe('POST');
    expect(server.calls[0].body).toEqual({ messages: [] });
    expect(server.calls[0].headers).toEqual({
      'content-type': 'application/json',
      'accept-language': 'lt',
      'x-knf-assistant-client': 'knfapp-mobile/1.2.3',
      authorization: 'Bearer tok',
    });
  });

  it('a guest request carries no Authorization', async () => {
    const { server, run } = rig({ getAuthToken: async () => null });
    server.script(textReply(['Labas']));

    await post(run);

    expect(server.calls[0].headers).not.toHaveProperty('authorization');
  });

  it('hands a 2xx back untouched — the same object, its body unread', async () => {
    const { server, run, failures } = rig();
    let served: Response | null = null;
    server.script({
      respond: async () => {
        served = new Response('{"ok":true}', { status: 200 });
        return served;
      },
    });

    const response = await post(run);

    expect(response).toBe(served);
    expect(response.bodyUsed).toBe(false);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(failures).toEqual([]);
  });

  it('a 204 is a 2xx too — handed back, not a failure', async () => {
    const { server, run, failures } = rig();
    server.script(errorReply(204));

    const response = await post(run);

    expect(response.status).toBe(204);
    expect(failures).toEqual([]);
  });

  it('uses the global fetch when no seam is given', async () => {
    const original = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = async (input) => {
      seen.push(String(input));
      return new Response('', { status: 200 });
    };
    try {
      const { run } = rig({ fetch: undefined });
      await post(run);
      expect(seen).toEqual([URL_CHAT]);
    } finally {
      globalThis.fetch = original;
    }
  });
});


describe('createAssistantFetch — failures', () => {
  it('a non-2xx is read ONCE, mapped, reported once and thrown as AssistantTransportError', async () => {
    const { server, run, failures } = rig();
    let reads = 0;
    server.script({
      respond: async () => {
        const response = new Response('{"error":"expired"}', { status: 401 });
        const text = response.text.bind(response);
        response.text = () => {
          reads += 1;
          return text();
        };
        return response;
      },
    });

    const error = await rejection(post(run));

    expect(error.failure).toEqual({ code: 'auth', status: 401, message: 'expired' });
    expect(reads).toBe(1);
    expect(failures).toEqual([{ code: 'auth', status: 401, message: 'expired' }]);
  });

  it('429 with Retry-After rides through with retryAfterMs', async () => {
    const { server, run, failures } = rig();
    server.script(errorReply(429, { error: 'slow down' }, { 'retry-after': '30' }));

    const error = await rejection(post(run));

    expect(error.failure).toEqual({ code: 'quota', status: 429, retryAfterMs: 30_000, message: 'slow down' });
    expect(failures).toHaveLength(1);
  });

  it('a text body is not the server\'s words — a 503 without JSON reads as HTTP 503', async () => {
    const { server, run } = rig();
    server.script(errorReply(503, 'restarting'));

    const error = await rejection(post(run));

    expect(error.failure).toEqual({ code: 'unavailable', status: 503, message: 'HTTP 503' });
  });

  it('a throwing seam is mapped to network, reported once, rethrown typed with the cause kept', async () => {
    const { server, run, failures } = rig();
    server.script(networkFailure('Network request failed'));

    const error = await rejection(post(run));

    expect(error.failure).toEqual({ code: 'network', message: 'Network request failed' });
    expect(error.cause).toBeInstanceOf(TypeError);
    expect(failures).toEqual([{ code: 'network', message: 'Network request failed' }]);
  });

  it('an unscripted, unknown prompt is a loud rejection — never a plausible answer', async () => {
    const { run } = rig();

    const error = await rejection(run(URL_CHAT, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'kas naujo?' }] }] }) }));

    expect(error.failure.code).toBe('network');
    expect(error.failure.message).toContain('no reply scripted');
    expect(error.failure.message).toContain('kas naujo?');
  });

  it('a listener that throws never becomes the failure — the typed error still wins', async () => {
    const { server, run } = rig({
      onFailure: () => {
        throw new Error('telemetry down');
      },
    });
    server.script(errorReply(500, { error: 'boom' }));

    const error = await rejection(post(run));

    expect(error.failure).toEqual({ code: 'server', status: 500, message: 'boom' });
  });

  it('works without a listener at all', async () => {
    const { server, run } = rig({ onFailure: undefined });
    server.script(errorReply(500));

    const error = await rejection(post(run));

    expect(error.failure).toEqual({ code: 'server', status: 500, message: 'HTTP 500' });
  });
});


describe('createAssistantFetch — the first-byte deadline', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires after firstByteTimeoutMs without headers and reads as timeout, reported once', async () => {
    jest.useFakeTimers();
    const { server, run, failures } = rig({ firstByteTimeoutMs: 1_000 });
    server.script(hangForever());

    const pending = rejection(post(run));
    // The token read settles first — then the clock starts
    await flush();
    expect(server.calls).toHaveLength(1);
    jest.advanceTimersByTime(999);
    expect(failures).toEqual([]);
    jest.advanceTimersByTime(1);

    const error = await pending;
    expect(error.failure).toEqual({ code: 'timeout', message: 'No response headers within 1000 ms' });
    expect(failures).toEqual([{ code: 'timeout', message: 'No response headers within 1000 ms' }]);
    expect(server.calls[0].aborted).toBe(true);
  });

  it('defaults to 30 000 ms', async () => {
    jest.useFakeTimers();
    const { server, run, failures } = rig();
    server.script(hangForever());

    const pending = rejection(post(run));
    await flush();
    jest.advanceTimersByTime(29_999);
    expect(failures).toEqual([]);
    jest.advanceTimersByTime(1);

    expect((await pending).failure.message).toBe('No response headers within 30000 ms');
  });

  it('on real timers, a seam that never answers still times out', async () => {
    const { server, run } = rig({ firstByteTimeoutMs: 20 });
    server.script(hangForever());

    expect((await rejection(post(run))).failure.code).toBe('timeout');
  });

  it('a seam that ignores the signal entirely is still cut by the race', async () => {
    const { run } = rig({ firstByteTimeoutMs: 20, fetch: () => new Promise<Response>(() => undefined) });

    expect((await rejection(post(run))).failure.code).toBe('timeout');
  });

  it('the clock starts AFTER the token was read — a slow session store burns none of it', async () => {
    jest.useFakeTimers();
    let releaseToken: (token: string) => void = () => undefined;
    const { server, run, failures } = rig({
      firstByteTimeoutMs: 1_000,
      getAuthToken: () => new Promise<string>((resolve) => {
        releaseToken = resolve;
      }),
    });
    server.script(textReply(['Labas']));

    const pending = post(run);
    jest.advanceTimersByTime(5_000);
    expect(server.calls).toHaveLength(0);
    releaseToken('late-tok');

    const response = await pending;
    expect(response.ok).toBe(true);
    expect(server.calls[0].headers.authorization).toBe('Bearer late-tok');
    expect(failures).toEqual([]);
  });

  it('a streaming body is never time-boxed — headers in time, chunks long after', async () => {
    const { server, run, failures } = rig({ firstByteTimeoutMs: 30 });
    server.script(textReply(['lėtai ', 'bet ', 'ateina'], { delayMs: 25 }));

    const response = await post(run);
    const text = await new Response(response.body).text();

    expect(text).toContain('"delta":"ateina"');
    expect(text.endsWith('data: [DONE]\n\n')).toBe(true);
    expect(failures).toEqual([]);
  });
});


describe('createAssistantFetch — the caller\'s cancel', () => {
  it('already cancelled after the token read: aborted, never sent, never reported', async () => {
    const { server, run, failures } = rig();
    const controller = new AbortController();
    controller.abort();

    const error = await rejection(post(run, { signal: controller.signal }));

    expect(error.failure).toEqual({ code: 'aborted', message: 'Request aborted' });
    expect(server.calls).toHaveLength(0);
    expect(failures).toEqual([]);
  });

  it('cancelled during the token read: aborted, never sent', async () => {
    let releaseToken: (token: string) => void = () => undefined;
    const { server, run, failures } = rig({
      getAuthToken: () => new Promise<string>((resolve) => {
        releaseToken = resolve;
      }),
    });
    const controller = new AbortController();

    const pending = rejection(post(run, { signal: controller.signal }));
    controller.abort();
    releaseToken('tok');

    expect((await pending).failure.code).toBe('aborted');
    expect(server.calls).toHaveLength(0);
    expect(failures).toEqual([]);
  });

  it('cancelled while waiting for headers: the cancel wins over the deadline and reads as aborted', async () => {
    jest.useFakeTimers();
    try {
      const { server, run, failures } = rig({ firstByteTimeoutMs: 1_000 });
      server.script(hangForever());
      const controller = new AbortController();

      const pending = rejection(post(run, { signal: controller.signal }));
      await flush();
      jest.advanceTimersByTime(500);
      controller.abort();

      const error = await pending;
      expect(error.failure).toEqual({ code: 'aborted', message: 'Request aborted' });
      expect(failures).toEqual([]);
      expect(server.calls[0].aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the seam sees OUR signal, chained to the caller\'s — a cancel after headers still reaches the wire', async () => {
    const { server, run } = rig();
    server.script(textReply(['Labas']));
    const controller = new AbortController();

    await post(run, { signal: controller.signal });
    expect(server.calls[0].aborted).toBe(false);
    controller.abort();

    expect(server.calls[0].aborted).toBe(true);
  });

  it('a cancel after headers cuts the body with an AbortError', async () => {
    const { server, run } = rig();
    server.script(textReply(['vienas ', 'du ', 'trys'], { delayMs: 30 }));
    const controller = new AbortController();

    const response = await post(run, { signal: controller.signal });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    controller.abort();

    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
  });
});


describe('createKnfAssistantTransport', () => {
  it('POSTs the upstream body to baseUrl + the chat path and answers a parsed chunk stream', async () => {
    const { server, config } = rig({ baseUrl: `${BASE}/` });
    server.script(textReply(['Labas, ', 'KNF!']));
    const transport = createKnfAssistantTransport(config);

    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Labas' }] }],
      trigger: 'submit-message',
      messageId: undefined,
      abortSignal: undefined,
    });
    const chunks: unknown[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(server.calls[0].url).toBe(URL_CHAT);
    expect(server.calls[0].method).toBe('POST');
    expect(server.calls[0].body).toMatchObject({
      id: 'thread-1',
      trigger: 'submit-message',
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Labas' }] }],
    });
    expect(chunks.map((chunk) => (chunk as { type: string }).type)).toEqual([
      'start', 'start-step', 'text-start', 'text-delta', 'text-delta', 'text-end', 'finish-step', 'finish',
    ]);
    expect(chunks[3]).toEqual({ type: 'text-delta', id: 't1', delta: 'Labas, ' });
  });

  it('a non-2xx rejects sendMessages with the typed error', async () => {
    const { server, config, failures } = rig();
    server.script(errorReply(403, { error: 'refused' }));
    const transport = createKnfAssistantTransport(config);

    await expect(
      transport.sendMessages({ chatId: 't', messages: [], trigger: 'submit-message', messageId: undefined, abortSignal: undefined }),
    ).rejects.toMatchObject({ name: 'AssistantTransportError', failure: { code: 'auth', status: 403, message: 'refused' } });
    expect(failures).toHaveLength(1);
  });
});
