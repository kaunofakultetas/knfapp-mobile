// -----------------------------------------------------------
//  [*] API — client core
//
//  The one axios instance every domain module (auth, news,
//  chat…) sends its requests through, plus the error and URL
//  plumbing they all share. Three things happen here and
//  nowhere else:
//    - the Bearer token from AsyncStorage 'auth' is attached
//      to every request (requests go out anonymous when no
//      session is stored — the app works logged-out);
//    - every successful response is html-entity-decoded
//      recursively — the backend html.escape()s every string
//      it returns, URLs included, so screens must NEVER call
//      decodeHtmlEntities themselves;
//    - every failure is normalized into an ApiError by
//      request() — screens never see a raw AxiosError.
//
//  Error language contract: 'http' errors keep the backend's
//  own message text (entity-decoded) for display; 'timeout'
//  and 'network' errors carry only their code as the message
//  and screens translate them via t('toast.timeout') /
//  t('toast.networkError'). This layer stays language-free.
//
//  Split into:
//
//    API_BASE_URL — env-configured backend base URL
//    ApiErrorCode — 'http' | 'timeout' | 'network'
//    ApiError     — the only error type request() throws
//    api          — the axios instance (token + decoding)
//    request      — unwrap .data, normalize every failure
//    getUploadUrl — relative upload path → absolute URL
// -----------------------------------------------------------

// Entity decoding for the backend's escape-everything middleware
import { decodeHtmlEntities } from '@/services/htmlDecode';

// Persisted session token
import AsyncStorage from '@react-native-async-storage/async-storage';

// HTTP
import axios, { AxiosError, type AxiosResponse } from 'axios';







// -----------------------------------------------------------
// API_BASE_URL
// -----------------------------------------------------------
//
// EXPO_PUBLIC_API_URL when set (any deployed build must set
// it), falling back to the local dev backend. Includes the
// '/api' prefix — endpoint paths in the domain modules start
// after it.
//
// Used by:
//   - api, getUploadUrl (below)
//   - services/socket.ts — derives the socket.io origin
// -----------------------------------------------------------

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api';







// -----------------------------------------------------------
// ApiErrorCode
// -----------------------------------------------------------
//
// Used by:
//   - ApiError (below)
//   - screens — mapping 'timeout' / 'network' onto toast i18n keys
// -----------------------------------------------------------

export type ApiErrorCode = 'http' | 'timeout' | 'network';







// -----------------------------------------------------------
// ApiError
// -----------------------------------------------------------
//
// The single error shape the whole app handles. For 'http'
// the message is the backend's error text (already entity-
// decoded) and status/data carry the response; for 'timeout'
// and 'network' the message is just the code — the display
// text for those lives in i18n, not here.
//
// Used by:
//   - request (below)
//   - context/AuthContext.tsx — login/register failure messages
//   - services/api/news.ts — fetchPoll 404 / votePollApi 409 checks
// -----------------------------------------------------------

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  data: unknown;

  constructor(message: string, status: number, code: ApiErrorCode, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}







// -----------------------------------------------------------
// api
// -----------------------------------------------------------
//
// The axios instance behind every request: 15 s default
// timeout (uploads override it per call), Bearer token
// injected from the persisted session, and one response
// interceptor that entity-decodes every string field of every
// successful response — see the file header.
//
// Used by:
//   - every services/api/* domain module
// -----------------------------------------------------------

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});


// Attach the session token when one is stored; unreadable
// storage means an anonymous request, never a failed one
api.interceptors.request.use(async (config) => {
  try {
    const raw = await AsyncStorage.getItem('auth');
    if (raw) {
      const { token } = JSON.parse(raw) as { token?: string };
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Proceed without a token
  }
  return config;
});


// The backend html.escape()s EVERY string on output — URLs
// included, so an '&' inside a query string arrives as
// '&amp;' and breaks images/links unless decoded. Walk the
// payload once here so no screen ever decodes by hand.
const decodeDeep = (value: unknown): unknown => {
  if (typeof value === 'string') return decodeHtmlEntities(value);
  if (Array.isArray(value)) return value.map(decodeDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        decodeDeep(entry),
      ]),
    );
  }
  return value;
};

api.interceptors.response.use((response) => {
  response.data = decodeDeep(response.data);
  return response;
});







// -----------------------------------------------------------
// request
// -----------------------------------------------------------
//
//   request(api.get<Shape>('/path'))         — resolves Shape
//   request(api.post<Shape>('/path', body))  — resolves Shape
//
// Unwraps response.data and converts every failure into an
// ApiError — domain modules stay one-liners and screens catch
// exactly one error type.
//
// Used by:
//   - every services/api/* domain module
// -----------------------------------------------------------

// Error responses bypass the success interceptor, so the
// backend's message is entity-decoded here instead
const normalizeError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;
  if (err instanceof AxiosError && err.response) {
    const body = err.response.data as { error?: string } | undefined;
    const message =
      (typeof body?.error === 'string' && body.error) ||
      err.response.statusText ||
      `HTTP ${err.response.status}`;
    return new ApiError(
      decodeHtmlEntities(message),
      err.response.status,
      'http',
      err.response.data,
    );
  }
  if (
    err instanceof AxiosError &&
    (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')
  ) {
    return new ApiError('timeout', 0, 'timeout');
  }
  return new ApiError('network', 0, 'network', err);
};

export async function request<T>(promise: Promise<AxiosResponse<T>>): Promise<T> {
  try {
    const { data } = await promise;
    return data;
  } catch (err) {
    throw normalizeError(err);
  }
}







// -----------------------------------------------------------
// getUploadUrl
// -----------------------------------------------------------
//
//   getUploadUrl('/api/uploads/x.jpg') → http://host/api/uploads/x.jpg
//   getUploadUrl('uploads/x.jpg')      → http://host/api/uploads/x.jpg
//   getUploadUrl('https://…')          → unchanged
//
// The backend stores and returns RELATIVE upload paths
// ('/api/uploads/…'); screens resolve them to absolute URLs
// at render time with this — never the other way around
// (persisting an absolute URL bakes the current host into the
// database). Works whether or not API_BASE_URL carries the
// '/api' suffix, and joins with exactly one '/'.
//
// Used by:
//   - components/ui/Avatar.tsx — avatar images
//   - app/(main)/tabs/news.tsx — feed post images
//   - app/(main)/tabs/id.tsx — avatar upload preview
//   - app/(main)/news-post/index.tsx — post detail image
//   - app/(main)/create-post/index.tsx — attached-image preview
//   - app/(main)/profile/index.tsx — profile header + post images
//   - hooks/chat/useChatComposer.ts — sent-image preview
// -----------------------------------------------------------

export function getUploadUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;

  // Origin without the '/api' suffix or trailing slashes, so
  // the join below controls the prefix exactly once
  const origin = API_BASE_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  const lead = path.startsWith('/') ? path : `/${path}`;
  const prefixed = lead.startsWith('/api/') ? lead : `/api${lead}`;
  return `${origin}${prefixed}`;
}
