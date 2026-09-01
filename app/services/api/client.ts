// -----------------------------------------------------------
//  [*] API — client core
//
//  The one axios instance every domain module (auth, news,
//  chat…) sends its requests through, plus the error and URL
//  plumbing they all share. Four things happen here and
//  nowhere else:
//    - the Bearer token from services/session is attached to
//      every request (requests go out anonymous when no
//      session is stored — the app works logged-out);
//    - every successful response is html-entity-decoded
//      recursively — the backend html.escape()s every string
//      it returns, URLs included, so screens must NEVER call
//      decodeHtmlEntities themselves;
//    - a 401 (or a 403 'Account deactivated') on an
//      authenticated non-auth request emits sessionInvalid —
//      once per burst — so AuthContext drops the dead session
//      to guest state instead of every screen erroring;
//    - every failure is normalized into an ApiError by
//      request() — screens never see a raw AxiosError.
//
//  Error language contract: ApiError.message is NEVER shown
//  to the user. Screens translate every failure via
//  t(apiErrorKey(err, …)) (services/api/errors.ts), keyed on
//  ApiError.status and the backend's machine `code` slug
//  carried as ApiError.serverCode. This layer stays
//  language-free.
//
//  Split into:
//
//    API_BASE_URL — env-configured backend base URL
//    ApiErrorCode — 'http' | 'timeout' | 'network' | 'canceled'
//    ApiError     — the only error type request() throws
//    api          — the axios instance (token + decoding +
//                   session-invalidation emit)
//    request      — unwrap .data, normalize every failure
//    getUploadUrl — relative upload path → absolute URL
// -----------------------------------------------------------

// Entity decoding for the backend's escape-everything middleware
import { decodeHtmlEntities } from '@/services/htmlDecode';

// Every normalized failure leaves a diagnosable trace
import { logError } from '@/services/log';

// Persisted session token (cached — no per-request storage I/O)
import { getStoredToken } from '@/services/session';

// Tells AuthContext a stored session died mid-run
import { emitSessionInvalid } from './session-events';

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
// A production build with the env var unset would silently
// talk cleartext to localhost — that is a build mistake, so
// it fails loudly at module load; dev just warns once. A
// non-https scheme in production only warns (the deployed web
// container gets its URL from the gitignored docker-compose
// and must not be broken blind).
//
// Used by:
//   - api, getUploadUrl (below)
//   - services/socket.ts — derives the socket.io origin
//   - app/(main)/tabs/settings.tsx — shown in the about block
// -----------------------------------------------------------

const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!ENV_API_URL) {
  if (__DEV__) {
    console.warn(
      'EXPO_PUBLIC_API_URL is not set — falling back to http://localhost:8000/api',
    );
  } else {
    throw new Error(
      'EXPO_PUBLIC_API_URL is not set — a production build must configure the API base URL',
    );
  }
}

export const API_BASE_URL = ENV_API_URL || 'http://localhost:8000/api';

if (!__DEV__ && !/^https:\/\//i.test(API_BASE_URL)) {
  console.error(`API_BASE_URL is not https in a production build: ${API_BASE_URL}`);
}







// -----------------------------------------------------------
// ApiErrorCode
// -----------------------------------------------------------
//
// 'canceled' marks a request the CALLER aborted (an
// AbortSignal fired) — never a real failure, so callers that
// abort must swallow it instead of surfacing an error state.
//
// Used by:
//   - ApiError (below)
//   - screens — mapping 'timeout' / 'network' onto toast i18n keys
// -----------------------------------------------------------

export type ApiErrorCode = 'http' | 'timeout' | 'network' | 'canceled';







// -----------------------------------------------------------
// ApiError
// -----------------------------------------------------------
//
// The single error shape the whole app handles. For 'http'
// the message is the backend's raw error text (debugging
// only — display goes through apiErrorKey) and status/data
// carry the response; serverCode is the backend's stable
// machine slug ('invalid_credentials', …) when the body sent
// one. For 'timeout' and 'network' the message is just the
// code — the display text for every case lives in i18n.
//
// Used by:
//   - request (below)
//   - services/api/errors.ts — apiErrorKey mapping
//   - context/AuthContext.tsx — login/register failure messages
//   - services/socialTransport.ts — the status the social engine's
//     retryable/auth judgements read
// -----------------------------------------------------------

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  data: unknown;
  serverCode?: string;

  constructor(
    message: string,
    status: number,
    code: ApiErrorCode,
    data?: unknown,
    serverCode?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
    this.serverCode = serverCode;
  }
}







// -----------------------------------------------------------
// api
// -----------------------------------------------------------
//
// The axios instance behind every request: 15 s default
// timeout (uploads override it per call), Bearer token
// injected from the persisted session, one response
// interceptor that entity-decodes every string field of every
// successful response, and its rejection half that emits
// sessionInvalid on a dead-session status — see the file
// header.
//
// Used by:
//   - every services/api/* domain module
// -----------------------------------------------------------

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});


// Attach the session token when one is stored (cached in
// services/session — no storage round trip after the first
// read); unreadable storage means an anonymous request, never
// a failed one. An explicitly set Authorization header (the
// detached logout calls pass a captured token) always wins.
api.interceptors.request.use(async (config) => {
  try {
    const token = await getStoredToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
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
// Untouched subtrees keep their ORIGINAL reference — the
// common no-entities payload costs one scan and zero clones.
const decodeDeep = (value: unknown): unknown => {
  if (typeof value === 'string') return decodeHtmlEntities(value);
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const decoded = decodeDeep(entry);
      if (decoded !== entry) changed = true;
      return decoded;
    });
    return changed ? next : value;
  }
  if (value !== null && typeof value === 'object') {
    let changed = false;
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entry]) => {
        const decoded = decodeDeep(entry);
        if (decoded !== entry) changed = true;
        return [key, decoded] as [string, unknown];
      },
    );
    return changed ? Object.fromEntries(entries) : value;
  }
  return value;
};


// The auth endpoints where a 401 means "wrong credentials",
// not "your stored session died" — they never emit
const SESSION_EXEMPT_PATHS = ['/auth/login', '/auth/register', '/auth/validate-code'];

// One emit per burst: a screen firing four parallel requests
// over a dead token must tear the session down once, and the
// teardown's own logout path must never re-trigger it
const SESSION_INVALID_WINDOW_MS = 2_000;
let lastSessionInvalidAt = 0;

// True for the statuses that prove the stored session is dead:
// any 401, plus the account-deactivated 403 (generic 403s stay
// untouched — curators legitimately get them on /admin/*)
const isSessionDeath = (status: number, body: unknown): boolean => {
  if (status === 401) return true;
  if (status !== 403) return false;
  const error = (body as { error?: string } | undefined)?.error;
  return typeof error === 'string' && error.includes('Account deactivated');
};

api.interceptors.response.use(
  (response) => {
    response.data = decodeDeep(response.data);
    return response;
  },
  async (error: unknown) => {
    if (error instanceof AxiosError && error.response) {
      const url = error.config?.url ?? '';
      const carriedToken = error.config?.headers?.Authorization;
      const exempt = SESSION_EXEMPT_PATHS.some((path) => url.includes(path));

      if (
        Boolean(carriedToken) &&
        !exempt &&
        isSessionDeath(error.response.status, error.response.data)
      ) {
        // The rejection proves the token THIS request carried is
        // dead — not whichever session is current. A stale 401
        // landing after a fresh login (or the detached logout
        // calls with their captured token) must not tear it down.
        const current = await getStoredToken().catch(() => null);
        if (current && carriedToken === `Bearer ${current}`) {
          const now = Date.now();
          if (now - lastSessionInvalidAt > SESSION_INVALID_WINDOW_MS) {
            lastSessionInvalidAt = now;
            emitSessionInvalid();
          }
        }
      }
    }
    // Re-throw untouched — request() still normalizes into ApiError
    return Promise.reject(error);
  },
);







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

// Error bodies ship unescaped — the backend's escape-on-output
// middleware only rewrites success responses — so the message
// is kept verbatim (it is debugging text, never displayed;
// screens translate via apiErrorKey). The body's stable "code"
// slug rides along as serverCode.
const normalizeError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err;
  if (err instanceof AxiosError && err.response) {
    const body = err.response.data as { error?: string; code?: string } | undefined;
    const message =
      (typeof body?.error === 'string' && body.error) ||
      err.response.statusText ||
      `HTTP ${err.response.status}`;
    return new ApiError(
      message,
      err.response.status,
      'http',
      err.response.data,
      typeof body?.code === 'string' ? body.code : undefined,
    );
  }
  if (
    err instanceof AxiosError &&
    (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT')
  ) {
    return new ApiError('timeout', 0, 'timeout');
  }
  // An AbortSignal the caller fired — distinct from 'network'
  // so aborting callers can swallow it silently
  if (err instanceof AxiosError && err.code === 'ERR_CANCELED') {
    return new ApiError('canceled', 0, 'canceled');
  }
  return new ApiError('network', 0, 'network', err);
};

export async function request<T>(promise: Promise<AxiosResponse<T>>): Promise<T> {
  try {
    const { data } = await promise;
    return data;
  } catch (err) {
    // Screens swallow most of these on purpose — the log line
    // is the only trace a field failure leaves behind. A
    // caller-aborted request is no failure and stays unlogged.
    const normalized = normalizeError(err);
    if (normalized.code !== 'canceled') {
      logError('api', normalized, err instanceof AxiosError ? err.config?.url : undefined);
    }
    throw normalized;
  }
}







// -----------------------------------------------------------
// getUploadUrl
// -----------------------------------------------------------
//
//   getUploadUrl('/api/uploads/x.jpg')  → http://host/api/uploads/x.jpg
//   getUploadUrl('uploads/x.jpg')       → http://host/api/uploads/x.jpg
//   getUploadUrl('file://…')            → unchanged (picker preview)
//   getUploadUrl('https://evil.tld/x')  → null (foreign host refused)
//
// The backend stores and returns RELATIVE upload paths
// ('/api/uploads/…'); screens resolve them to absolute URLs
// at render time with this — never the other way around
// (persisting an absolute URL bakes the current host into the
// database). Works whether or not API_BASE_URL carries the
// '/api' suffix, and joins with exactly one '/'.
//
// Remote http(s) URLs pass only when their origin is the API
// origin — anything else returns null (callers render their
// placeholder), so a crafted image_url can never beacon a
// reader's IP/UA to an attacker's host. Local picker schemes
// (file:, content:, blob:, data:) always pass — optimistic
// previews route picked URIs through here.
//
// Used by:
//   - components/ui/Avatar.tsx — avatar images
//   - components/news/NewsCard.tsx — resolveCoverUri (feed
//     + article covers)
//   - app/(main)/tabs/id.tsx — avatar upload preview
//   - app/(main)/create-post/index.tsx — attached-image preview
//   - app/(main)/profile/index.tsx — profile header + post images
//   - hooks/chat/useChatComposer.ts — sent-image preview
// -----------------------------------------------------------

export function getUploadUrl(path: string): string | null {
  // Local picker URIs pass through — an optimistic image bubble
  // shows the picked asset before the upload finishes
  if (/^(file:|content:|blob:|data:)/i.test(path)) return path;

  // Origin without the '/api' suffix or trailing slashes, so
  // the join below controls the prefix exactly once
  const origin = API_BASE_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '');

  // Absolute http(s): only the API's own origin is trusted —
  // foreign hosts are refused (null → caller placeholder)
  if (/^https?:\/\//i.test(path)) {
    const lower = path.toLowerCase();
    const trusted = origin.toLowerCase();
    return lower === trusted || lower.startsWith(`${trusted}/`) ? path : null;
  }

  const lead = path.startsWith('/') ? path : `/${path}`;
  const prefixed = lead.startsWith('/api/') ? lead : `/api${lead}`;
  return `${origin}${prefixed}`;
}
