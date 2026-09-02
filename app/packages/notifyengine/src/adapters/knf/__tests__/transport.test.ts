// -----------------------------------------------------------
//  [*] Tests — the KNF transport adapter, wire shapes exact
//
//  createKnfNotifyTransport over a hand-rolled recording HTTP
//  client: every request is pinned byte-for-byte (paths,
//  bodies, the DELETE options passthrough), garbage bodies
//  become typed 'server' failures, wire errors map onto the
//  three failure codes, and the unknown-channel guard fires
//  locally BEFORE anything reaches the wire. Token grammar is
//  the registration machine's business — here tokens only
//  travel verbatim. The conformance suite runs at the end over
//  an in-memory backend to prove the adapter is swappable.
// -----------------------------------------------------------

import { createKnfNotifyTransport, type NotifyHttpClient } from '../index';
import { TransportFailure, type ChannelKey } from '../../../core/types';
import { describeTransportContract } from '../../../testing';


// The registration payload every wire-shape test reuses
const REG = { token: 'ExponentPushToken[t-1]', platform: 'ios' as const, language: 'lt' as const };

// Wire errors off the host client carry {status?, code?} on a
// real Error — mirror that shape exactly
const wireError = (shape: { status?: number; code?: string }) => Object.assign(new Error('wire'), shape);

// Await a promise that MUST reject and hand back the failure
const failureOf = async (promise: Promise<unknown>): Promise<TransportFailure> => {
  try {
    await promise;
  } catch (error) {
    return error as TransportFailure;
  }
  throw new Error('expected a rejection');
};


// -----------------------------------------------------------
// createMockHttp
// -----------------------------------------------------------
//
// The hand-rolled NotifyHttpClient: records every call with
// its full argument shape and answers from the per-method
// responders passed in — a responder that throws becomes a
// rejection, exactly like a wire error.
//
// Used by:
//   - every wire-shape test below
// -----------------------------------------------------------

interface RecordedCall {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  body?: unknown;
  options?: { body?: unknown; authToken?: string };
}

interface MockHttp extends NotifyHttpClient {
  calls: RecordedCall[];
}

function createMockHttp(respond: Partial<{
  get: (path: string) => unknown;
  post: (path: string, body: unknown) => unknown;
  put: (path: string, body: unknown) => unknown;
  delete: (path: string, options?: { body?: unknown; authToken?: string }) => unknown;
}> = {}): MockHttp {
  const self: MockHttp = {
    calls: [],
    get: async (path) => {
      self.calls.push({ method: 'get', path });
      return respond.get?.(path);
    },
    post: async (path, body) => {
      self.calls.push({ method: 'post', path, body });
      return respond.post?.(path, body);
    },
    put: async (path, body) => {
      self.calls.push({ method: 'put', path, body });
      return respond.put?.(path, body);
    },
    delete: async (path, options) => {
      self.calls.push({ method: 'delete', path, options });
      return respond.delete?.(path, options);
    },
  };
  return self;
}


describe('register — wire shape', () => {
  it('POSTs /notifications/register with exactly {token, platform, language}', async () => {
    const http = createMockHttp({ post: () => ({ tokenId: 'uuid-7', created: true }) });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.register(REG)).resolves.toEqual({ tokenId: 'uuid-7', created: true });
    expect(http.calls).toEqual([{
      method: 'post',
      path: '/notifications/register',
      body: { token: 'ExponentPushToken[t-1]', platform: 'ios', language: 'lt' },
    }]);
  });

  it('passes tokens through verbatim — grammar belongs to the registration machine', async () => {
    // Deliberately NOT a well-formed token: the adapter must not
    // inspect, trim, or reject it — that check lives upstream
    const weird = '  totally://not-a-token ☃ ';
    const http = createMockHttp({ post: () => ({ tokenId: 'uuid-1', created: true }) });
    const transport = createKnfNotifyTransport({ http });

    await transport.register({ ...REG, token: weird });
    await transport.unregister({ token: weird });

    expect(http.calls[0].body).toEqual({ token: weird, platform: 'ios', language: 'lt' });
    expect(http.calls[1].options).toEqual({ body: { token: weird } });
    expect(http.calls).toHaveLength(2);
  });

  it.each([
    ['an empty object', {}],
    ['a null body', null],
    ['a numeric tokenId', { tokenId: 7, created: true }],
    ['an empty-string tokenId', { tokenId: '', created: true }],
  ])('a garbage body (%s) rejects as a typed server failure', async (_label, body) => {
    const transport = createKnfNotifyTransport({ http: createMockHttp({ post: () => body }) });

    const failure = await failureOf(transport.register(REG));
    expect(failure).toBeInstanceOf(TransportFailure);
    expect(failure.code).toBe('server');
  });

  it('created is trusted only as literal true — anything else reads false', async () => {
    const http = createMockHttp({ post: () => ({ tokenId: 'uuid-3', created: 'yes' }) });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.register(REG)).resolves.toEqual({ tokenId: 'uuid-3', created: false });
  });
});

describe('unregister — DELETE passthrough and the 404 swallow', () => {
  it('DELETEs /notifications/register with {body:{token}, authToken} passed through', async () => {
    const http = createMockHttp();
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.unregister({ token: 'ExponentPushToken[t-1]', authToken: 'jwt-abc' }))
      .resolves.toBeUndefined();
    expect(http.calls).toEqual([{
      method: 'delete',
      path: '/notifications/register',
      options: { body: { token: 'ExponentPushToken[t-1]' }, authToken: 'jwt-abc' },
    }]);
  });

  it('without an authToken the body still rides in options', async () => {
    const http = createMockHttp();
    const transport = createKnfNotifyTransport({ http });

    await transport.unregister({ token: 'ExponentPushToken[t-1]' });
    expect(http.calls).toEqual([{
      method: 'delete',
      path: '/notifications/register',
      options: { body: { token: 'ExponentPushToken[t-1]' } },
    }]);
  });

  it('a 404 RESOLVES — an already-forgotten token is exactly the state we wanted', async () => {
    const http = createMockHttp({ delete: () => { throw wireError({ status: 404 }); } });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.unregister({ token: 'ExponentPushToken[gone]' })).resolves.toBeUndefined();
    expect(http.calls).toHaveLength(1);
  });

  it('a 500 rejects with the server code', async () => {
    const http = createMockHttp({ delete: () => { throw wireError({ status: 500 }); } });
    const transport = createKnfNotifyTransport({ http });

    const failure = await failureOf(transport.unregister({ token: 'ExponentPushToken[t-1]' }));
    expect(failure).toBeInstanceOf(TransportFailure);
    expect(failure.code).toBe('server');
  });
});

describe('failure code mapping — auth is distinct from network', () => {
  it.each([
    ['code network', 'network', { code: 'network' }],
    ['code timeout', 'network', { code: 'timeout' }],
    ['status 401', 'auth', { status: 401 }],
    ['status 403', 'auth', { status: 403 }],
    ['status 500', 'server', { status: 500 }],
    ['a shapeless throw', 'server', {}],
  ] as const)('%s maps to %s', async (_label, expected, shape) => {
    const http = createMockHttp({ post: () => { throw wireError(shape); } });
    const transport = createKnfNotifyTransport({ http });

    const failure = await failureOf(transport.register(REG));
    expect(failure).toBeInstanceOf(TransportFailure);
    expect(failure.code).toBe(expected);
  });
});

describe('getChannels', () => {
  it('GETs /notifications/channels and answers the full boolean state', async () => {
    const http = createMockHttp({ get: () => ({ news: true, chat: false, schedule: true, admin: true }) });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.getChannels()).resolves.toEqual({
      news: true, chat: false, schedule: true, admin: true,
    });
    expect(http.calls).toEqual([{ method: 'get', path: '/notifications/channels' }]);
  });

  it('a missing or non-boolean key rejects typed — fabricated all-true defaults would un-mute real opt-outs', async () => {
    for (const body of [{ chat: false }, { news: 'no', chat: 0, schedule: 1, admin: true }]) {
      const transport = createKnfNotifyTransport({ http: createMockHttp({ get: () => body }) });
      const failure = await failureOf(transport.getChannels());
      expect(failure).toBeInstanceOf(TransportFailure);
      expect(failure.code).toBe('server');
    }
  });

  it.each([
    ['a string', 'garbage'],
    ['null', null],
    ['a number', 42],
  ])('a non-object body (%s) rejects as a typed server failure', async (_label, body) => {
    const transport = createKnfNotifyTransport({ http: createMockHttp({ get: () => body }) });

    const failure = await failureOf(transport.getChannels());
    expect(failure).toBeInstanceOf(TransportFailure);
    expect(failure.code).toBe('server');
  });
});

describe('putChannels', () => {
  it('rejects an unknown key BEFORE calling http — the wire stays untouched', async () => {
    const http = createMockHttp();
    const transport = createKnfNotifyTransport({ http });

    const patch = { marketing: false } as unknown as Partial<Record<ChannelKey, boolean>>;
    const failure = await failureOf(transport.putChannels(patch));
    expect(failure).toBeInstanceOf(TransportFailure);
    expect(failure.code).toBe('server');
    expect(failure.message).toBe('Unknown channel "marketing"');
    expect(http.calls).toEqual([]);
  });

  it('PUTs {channels: patch} and unwraps the FULL {channels:{...}} envelope answer', async () => {
    const http = createMockHttp({ put: () => ({ channels: { news: true, chat: false, schedule: true, admin: true } }) });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.putChannels({ chat: false })).resolves.toEqual({
      news: true, chat: false, schedule: true, admin: true,
    });
    expect(http.calls).toEqual([{
      method: 'put',
      path: '/notifications/channels',
      body: { channels: { chat: false } },
    }]);
  });

  it('a bare record body (no envelope) is accepted too', async () => {
    const http = createMockHttp({ put: () => ({ news: false, chat: true, schedule: true, admin: true }) });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.putChannels({ news: false })).resolves.toEqual({
      news: false, chat: true, schedule: true, admin: true,
    });
  });
});

describe('chat preview', () => {
  it('GETs /notifications/chat-preview and returns the validated boolean', async () => {
    const http = createMockHttp({ get: () => ({ enabled: false }) });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.getChatPreview()).resolves.toBe(false);
    expect(http.calls).toEqual([{ method: 'get', path: '/notifications/chat-preview' }]);
  });

  it('a non-boolean enabled on GET rejects as a typed server failure', async () => {
    const transport = createKnfNotifyTransport({ http: createMockHttp({ get: () => ({ enabled: 'yes' }) }) });

    const failure = await failureOf(transport.getChatPreview());
    expect(failure).toBeInstanceOf(TransportFailure);
    expect(failure.code).toBe('server');
  });

  it('PUT sends {enabled} and the server boolean wins over the sent value', async () => {
    const http = createMockHttp({ put: () => ({ enabled: false }) });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.putChatPreview(true)).resolves.toBe(false);
    expect(http.calls).toEqual([{
      method: 'put',
      path: '/notifications/chat-preview',
      body: { enabled: true },
    }]);
  });

  it('PUT falls back to the SENT value when the body lacks a boolean', async () => {
    const http = createMockHttp({ put: () => ({}) });
    const transport = createKnfNotifyTransport({ http });

    await expect(transport.putChatPreview(false)).resolves.toBe(false);
    await expect(transport.putChatPreview(true)).resolves.toBe(true);
    expect(http.calls.map((c) => c.body)).toEqual([{ enabled: false }, { enabled: true }]);
  });
});


// -----------------------------------------------------------
// createBackendHttp
// -----------------------------------------------------------
//
// An in-memory faculty backend behind the NotifyHttpClient
// surface — token upserts, a 404 for a token it never saw,
// channel state served in the {channels:{...}} envelope — so
// the conformance suite exercises the REAL adapter end to end.
//
// Used by:
//   - the transport contract run below
// -----------------------------------------------------------

function createBackendHttp(): NotifyHttpClient {
  let nextId = 1;
  const tokens = new Map<string, string>();
  let channels: Record<ChannelKey, boolean> = { news: true, chat: true, schedule: true, admin: true };
  let chatPreview = true;

  return {
    get: async (path) =>
      path === '/notifications/channels' ? { channels: { ...channels } } : { enabled: chatPreview },
    post: async (_path, body) => {
      const { token } = body as { token: string };
      // The real backend: grammar-checked 400, UUID-string ids
      if (!/^ExponentPushToken\[[A-Za-z0-9_-]{10,64}\]$/.test(token)) throw wireError({ status: 400 });
      const existing = tokens.get(token);
      if (existing !== undefined) return { tokenId: existing, created: false };
      const tokenId = `uuid-${nextId++}`;
      tokens.set(token, tokenId);
      return { tokenId, created: true };
    },
    put: async (path, body) => {
      if (path === '/notifications/channels') {
        channels = { ...channels, ...(body as { channels: Partial<Record<ChannelKey, boolean>> }).channels };
        return { channels: { ...channels } };
      }
      chatPreview = (body as { enabled: boolean }).enabled;
      return { enabled: chatPreview };
    },
    delete: async (_path, options) => {
      const token = (options?.body as { token?: string })?.token ?? '';
      // The unknown-token 404 the adapter must swallow
      if (!tokens.has(token)) throw wireError({ status: 404 });
      tokens.delete(token);
    },
  };
}

describeTransportContract('KNF adapter over an in-memory wire', () =>
  createKnfNotifyTransport({ http: createBackendHttp() }));
