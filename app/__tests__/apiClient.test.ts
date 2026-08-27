// -----------------------------------------------------------
//  [*] Tests — services/api/client
//
//  The contract every screen relies on: exactly one error
//  type with a code, entity-decoded payloads, and upload
//  paths resolved consistently.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { AxiosError, type AxiosResponse } from 'axios';

import { api, ApiError, API_BASE_URL, getUploadUrl, request } from '@/services/api/client';


// Resolves with the ApiError a request() call rejects with
const failure = async (call: Promise<unknown>): Promise<ApiError> => {
  try {
    await call;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected the request to reject');
};

// Builds the AxiosError shape axios throws for an HTTP failure
const httpFailure = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    data,
    status,
    statusText: 'Error',
    headers: {},
    config: {} as never,
  } as AxiosResponse);


describe('getUploadUrl', () => {
  it('resolves relative upload paths under the API base', () => {
    expect(getUploadUrl('/api/uploads/x.jpg')).toBe(`${API_BASE_URL}/uploads/x.jpg`);
    expect(getUploadUrl('uploads/x.jpg')).toBe(`${API_BASE_URL}/uploads/x.jpg`);
  });

  it('passes absolute URLs through', () => {
    expect(getUploadUrl('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg');
  });
});


describe('request', () => {
  it('unwraps response data', async () => {
    await expect(request(Promise.resolve({ data: { ok: true } } as AxiosResponse))).resolves.toEqual({ ok: true });
  });

  it('normalizes http failures with the decoded backend message', async () => {
    const err = await failure(request(Promise.reject(httpFailure(404, { error: 'Not &amp; found' }))));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('http');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not & found');
  });

  it('maps timeouts and network failures to codes, not text', async () => {
    const timeout = await failure(request(Promise.reject(new AxiosError('t', 'ECONNABORTED'))));
    expect(timeout.code).toBe('timeout');
    const network = await failure(request(Promise.reject(new AxiosError('n', 'ERR_NETWORK'))));
    expect(network.code).toBe('network');
    expect(network.status).toBe(0);
  });
});


describe('response interceptor', () => {
  it('entity-decodes every string in the payload, URLs included', () => {
    const fulfilled = (api.interceptors.response as unknown as {
      handlers: { fulfilled: (r: AxiosResponse) => AxiosResponse }[];
    }).handlers[0].fulfilled;
    const out = fulfilled({
      data: { title: 'A &amp; B', imageUrl: '/api/u/x.jpg?a=1&amp;b=2', tags: ['&lt;x&gt;'], n: 3 },
    } as AxiosResponse);
    expect(out.data).toEqual({ title: 'A & B', imageUrl: '/api/u/x.jpg?a=1&b=2', tags: ['<x>'], n: 3 });
  });
});
