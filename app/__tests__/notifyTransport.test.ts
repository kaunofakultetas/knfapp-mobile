// -----------------------------------------------------------
//  [*] Tests — services/notifyTransport HTTP bridge
//
//  The HTTP client → NotifyHttpClient bridge, pinned on both
//  sides: every verb goes through request(api.<verb>(path,
//  body)), delete carries the token in the body with the 5 s
//  logout time-box and a bearer header ONLY when a captured
//  token is supplied, and an ApiError leaves the bridge
//  untouched — the adapter's failure mapping reads its
//  {status, code}, which the end-to-end cases prove (401 →
//  auth, network → network, 404 on delete → success).
// -----------------------------------------------------------

import { ApiError } from '@/services/api/client';
import { notifyTransport } from '@/services/notifyTransport';

import { createKnfNotifyTransport, TransportFailure, type NotifyHttpClient } from '@knf/notifyengine';


const mockApi = {
  get: jest.fn<Promise<unknown>, unknown[]>(),
  post: jest.fn<Promise<unknown>, unknown[]>(),
  put: jest.fn<Promise<unknown>, unknown[]>(),
  delete: jest.fn<Promise<unknown>, unknown[]>(),
};
// Pass-through by default: whatever api.<verb> resolves or
// rejects with is what the bridge sees, exactly like the real
// request() re-throws an ApiError as-is
const mockRequest = jest.fn(async (promise: Promise<unknown>) => promise);

jest.mock('@/services/api/client', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }
  return {
    ApiError,
    api: {
      get: (...args: unknown[]) => mockApi.get(...args),
      post: (...args: unknown[]) => mockApi.post(...args),
      put: (...args: unknown[]) => mockApi.put(...args),
      delete: (...args: unknown[]) => mockApi.delete(...args),
    },
    request: (promise: Promise<unknown>) => mockRequest(promise),
  };
});

// Pulled in by the package barrel's device adapter, never
// called here — its import-time token auto-registration and
// the dev-shell warning must not run
jest.mock('expo-notifications', () => ({}));

// The real adapter, with its factory spied so the test can
// grab the bridge object the module handed it
jest.mock('@knf/notifyengine', () => {
  const actual = jest.requireActual('@knf/notifyengine');
  return { ...actual, createKnfNotifyTransport: jest.fn(actual.createKnfNotifyTransport) };
});


// The unit under test — captured once, before any mock reset
const http: NotifyHttpClient = jest.mocked(createKnfNotifyTransport).mock.calls[0][0].http;

const TOKEN = 'ExponentPushToken[bridge-token-0001]';
const ALL_ON = { news: true, chat: true, schedule: true, admin: true };

// Resolves with whatever the call rejected with
const failureOf = async (call: Promise<unknown>): Promise<unknown> => call.then(() => undefined, (e: unknown) => e);


beforeEach(() => {
  for (const verb of Object.values(mockApi)) verb.mockReset();
  mockRequest.mockClear();
});


describe('http bridge — verbs', () => {
  it('get: request(api.get(path))', async () => {
    const wire = Promise.resolve({ ok: 1 });
    mockApi.get.mockReturnValue(wire);

    await expect(http.get('/notifications/channels')).resolves.toEqual({ ok: 1 });
    expect(mockApi.get).toHaveBeenCalledWith('/notifications/channels');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0][0]).toBe(wire);
  });

  it('post: request(api.post(path, body))', async () => {
    const wire = Promise.resolve({ tokenId: 'abc' });
    mockApi.post.mockReturnValue(wire);

    await expect(http.post('/notifications/register', { token: TOKEN })).resolves.toEqual({ tokenId: 'abc' });
    expect(mockApi.post).toHaveBeenCalledWith('/notifications/register', { token: TOKEN });
    expect(mockRequest.mock.calls[0][0]).toBe(wire);
  });

  it('put: request(api.put(path, body))', async () => {
    const wire = Promise.resolve({ enabled: false });
    mockApi.put.mockReturnValue(wire);

    await expect(http.put('/notifications/chat-preview', { enabled: false })).resolves.toEqual({ enabled: false });
    expect(mockApi.put).toHaveBeenCalledWith('/notifications/chat-preview', { enabled: false });
    expect(mockRequest.mock.calls[0][0]).toBe(wire);
  });
});


describe('http bridge — delete', () => {
  it('sends the body as data with the 5 s time-box and NO auth header by default', async () => {
    const wire = Promise.resolve({});
    mockApi.delete.mockReturnValue(wire);

    await http.delete('/notifications/register', { body: { token: TOKEN } });

    expect(mockApi.delete).toHaveBeenCalledWith('/notifications/register', {
      data: { token: TOKEN },
      timeout: 5000,
    });
    // The config object must not even carry a `headers` key —
    // an undefined header would still override the interceptor
    const config = mockApi.delete.mock.calls[0][1] as Record<string, unknown>;
    expect('headers' in config).toBe(false);
    expect(mockRequest.mock.calls[0][0]).toBe(wire);
  });

  it('adds the bearer header ONLY when a captured authToken is given', async () => {
    mockApi.delete.mockReturnValue(Promise.resolve({}));

    await http.delete('/notifications/register', { body: { token: TOKEN }, authToken: 'captured-jwt' });

    expect(mockApi.delete).toHaveBeenCalledWith('/notifications/register', {
      data: { token: TOKEN },
      timeout: 5000,
      headers: { Authorization: 'Bearer captured-jwt' },
    });
  });

  it('tolerates a call with no options at all', async () => {
    mockApi.delete.mockReturnValue(Promise.resolve({}));

    await http.delete('/notifications/register');

    expect(mockApi.delete).toHaveBeenCalledWith('/notifications/register', { data: undefined, timeout: 5000 });
  });
});


describe('http bridge — failures', () => {
  it('lets an ApiError propagate untouched, status and code preserved', async () => {
    const err = new ApiError('dead session', 401, 'http');
    mockApi.get.mockImplementation(() => Promise.reject(err));

    await expect(http.get('/notifications/channels')).rejects.toBe(err);
    const caught = (await failureOf(http.get('/notifications/channels'))) as ApiError;
    expect(caught.status).toBe(401);
    expect(caught.code).toBe('http');
  });
});


describe('notifyTransport — the adapter reads the untouched ApiError', () => {
  it('401 becomes a typed auth failure', async () => {
    mockApi.get.mockImplementation(() => Promise.reject(new ApiError('dead', 401, 'http')));

    const failure = await failureOf(notifyTransport.getChannels());
    expect(failure).toBeInstanceOf(TransportFailure);
    expect((failure as TransportFailure).code).toBe('auth');
  });

  it("code 'network' and 'timeout' become network failures", async () => {
    mockApi.post.mockImplementation(() => Promise.reject(new ApiError('network', 0, 'network')));
    const offline = (await failureOf(
      notifyTransport.register({ token: TOKEN, platform: 'ios', language: 'lt' }),
    )) as TransportFailure;
    expect(offline.code).toBe('network');

    mockApi.post.mockImplementation(() => Promise.reject(new ApiError('timeout', 0, 'timeout')));
    const slow = (await failureOf(
      notifyTransport.register({ token: TOKEN, platform: 'ios', language: 'lt' }),
    )) as TransportFailure;
    expect(slow.code).toBe('network');
  });

  it('a 404 on unregister is success — the token was already forgotten', async () => {
    mockApi.delete.mockImplementation(() => Promise.reject(new ApiError('gone', 404, 'http')));

    await expect(notifyTransport.unregister({ token: TOKEN, authToken: 'captured-jwt' })).resolves.toBeUndefined();
    expect(mockApi.delete).toHaveBeenCalledWith('/notifications/register', {
      data: { token: TOKEN },
      timeout: 5000,
      headers: { Authorization: 'Bearer captured-jwt' },
    });
  });

  it('a healthy round trip reaches the adapter through the bridge', async () => {
    mockApi.get.mockReturnValue(Promise.resolve({ channels: { ...ALL_ON, chat: false } }));

    await expect(notifyTransport.getChannels()).resolves.toEqual({ ...ALL_ON, chat: false });
    expect(mockApi.get).toHaveBeenCalledWith('/notifications/channels');
  });
});
