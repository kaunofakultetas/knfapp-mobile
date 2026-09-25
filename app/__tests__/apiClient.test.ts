// -----------------------------------------------------------
//  [*] Tests — services/api/client
//
//  The contract every screen relies on: exactly one error
//  type with a code, payloads passed through untouched, and
//  upload paths resolved consistently.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { api, ApiError, API_BASE_URL, getUploadThumbUrl, getUploadUrl, request } from '@/services/api/client';







// -----------------------------------------------------------
// failure
// -----------------------------------------------------------
//
// Resolves with the ApiError a request() call rejects with
//
// Used by:
//   - the request tests below
// -----------------------------------------------------------

const failure = async (call: Promise<unknown>): Promise<ApiError> => {
  try {
    await call;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected the request to reject');
};







// -----------------------------------------------------------
// httpFailure
// -----------------------------------------------------------
//
// Builds the AxiosError shape axios throws for an HTTP failure
//
// Used by:
//   - the request and interceptor tests below
// -----------------------------------------------------------

const httpFailure = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    data,
    status,
    statusText: 'Error',
    headers: {},
    config: {} as never,
  } as AxiosResponse);







// -----------------------------------------------------------
// answer
// -----------------------------------------------------------
//
// A 200 answered by a stand-in adapter, so the instance's
// whole interceptor chain runs over the body — the only place
// a rewrite could hide
//
// Used by:
//   - the pass-through tests below
// -----------------------------------------------------------

const answer = (data: unknown) => (config: InternalAxiosRequestConfig) =>
  Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config } as AxiosResponse);


describe('getUploadUrl', () => {
  it('resolves relative upload paths under the API base', () => {
    expect(getUploadUrl('/api/uploads/x.jpg')).toBe(`${API_BASE_URL}/uploads/x.jpg`);
    expect(getUploadUrl('uploads/x.jpg')).toBe(`${API_BASE_URL}/uploads/x.jpg`);
  });

  it('keeps same-origin absolute URLs, refuses foreign hosts, passes local schemes', () => {
    expect(getUploadUrl(`${API_BASE_URL}/uploads/x.jpg`)).toBe(`${API_BASE_URL}/uploads/x.jpg`);
    expect(getUploadUrl('https://cdn.example/x.jpg')).toBeNull();
    expect(getUploadUrl('file:///tmp/picked.jpg')).toBe('file:///tmp/picked.jpg');
  });
});


describe('getUploadThumbUrl', () => {
  const stored = '0123456789abcdef0123456789abcdef';

  it('asks for the small derivative of a stored still photo (KNF-136)', () => {
    expect(getUploadThumbUrl(`/api/uploads/${stored}.jpg`)).toBe(`${API_BASE_URL}/uploads/${stored}.jpg?s=thumb`);
    expect(getUploadThumbUrl(`/api/uploads/${stored}.png`)).toBe(`${API_BASE_URL}/uploads/${stored}.png?s=thumb`);
  });

  it('resolves everything else exactly as getUploadUrl does', () => {
    // An animation's first frame is no thumbnail of it
    expect(getUploadThumbUrl(`/api/uploads/${stored}.gif`)).toBe(`${API_BASE_URL}/uploads/${stored}.gif`);
    expect(getUploadThumbUrl('file:///tmp/picked.jpg')).toBe('file:///tmp/picked.jpg');
    expect(getUploadThumbUrl('https://cdn.example/x.jpg')).toBeNull();
  });
});


describe('request', () => {
  it('unwraps response data', async () => {
    await expect(request(Promise.resolve({ data: { ok: true } } as AxiosResponse))).resolves.toEqual({ ok: true });
  });

  it('normalizes http failures, keeping the backend message verbatim', async () => {
    // The message is raw debugging text — screens translate via
    // apiErrorKey and never render it
    const err = await failure(request(Promise.reject(httpFailure(404, { error: 'Not &amp; found', code: 'not_found' }))));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('http');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not &amp; found');
    expect(err.serverCode).toBe('not_found');
  });

  it('logs a 4xx as an expected outcome — never the dev LogBox red toast — and a 5xx as a fault', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try {
      for (const status of [400, 401, 403, 404, 409, 429]) {
        await failure(request(Promise.reject(httpFailure(status, { error: 'Invalid credentials' }))));
      }
      expect(error).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledTimes(6);

      await failure(request(Promise.reject(httpFailure(500, { error: 'boom' }))));
      await failure(request(Promise.reject(new AxiosError('n', 'ERR_NETWORK'))));
      expect(error).toHaveBeenCalledTimes(2);
    } finally {
      error.mockRestore();
      info.mockRestore();
    }
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
  // The backend sends raw JSON — nothing is escaped on output —
  // so an entity in a body is CONTENT the user typed and must
  // reach the screen as typed; decoding it would rewrite the
  // text, and the next edit would save the rewrite
  it('passes a JSON payload holding entities through unchanged', async () => {
    const body = { title: 'Teisė &amp; ekonomika', imageUrl: '/api/u/x.jpg?a=1&amp;b=2', tags: ['&lt;x&gt;'], n: 3 };
    const out = await api.get('/news', { adapter: answer(body) });
    expect(out.data).toEqual({ title: 'Teisė &amp; ekonomika', imageUrl: '/api/u/x.jpg?a=1&amp;b=2', tags: ['&lt;x&gt;'], n: 3 });
    expect(out.data).toBe(body);
  });

  // A plan SVG rides the same instance as text: '&amp;' is the
  // only legal '&' inside XML, and '&lt;' the only legal '<'
  it('passes a raw SVG text body through byte for byte', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>1 &amp; 2 &lt; 3</text></svg>';
    const out = await api.get('/wayfind/plans/abc.svg', { adapter: answer(svg), responseType: 'text', transformResponse: (data) => data });
    expect(out.data).toBe(svg);
  });
});
