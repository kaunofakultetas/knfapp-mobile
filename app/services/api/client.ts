// -----------------------------------------------------------
//  [*] API — client core
//
//  The one axios instance every domain module (auth, news,
//  chat…) sends its requests through, plus the error and URL
//  plumbing they all share. Three things happen here and
//  nowhere else:
//    - the Bearer token from services/session is attached to
//      every request (requests go out anonymous when no
//      session is stored — the app works logged-out);
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
//    api          — the axios instance (token +
//                   session-invalidation emit)
//    request      — unwrap .data, normalize every failure
//    getUploadUrl — relative upload path → absolute URL
//    getUploadThumbUrl — the same, for the small derivative
// -----------------------------------------------------------

// Every normalized failure leaves a diagnosable trace — at the
// severity it deserves
import { logError, logExpected } from '@/services/log';

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
// injected from the persisted session, and one response
// interceptor whose rejection half emits sessionInvalid on a
// dead-session status — see the file header. Successful
// responses pass through UNTOUCHED: the backend sends raw
// JSON (no escaping on output), so a literal '&amp;' a user
// typed is content, and inside a plan SVG it is the only
// legal spelling of '&' — rewriting either would corrupt it.
// Rendering escapes; React Native Text never interprets HTML.
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


// The auth endpoints where a 401 means "wrong credentials",
// not "your stored session died" — they never emit
const SESSION_EXEMPT_PATHS = ['/auth/login', '/auth/register', '/auth/validate-code'];

// One emit per burst: a screen firing four parallel requests
// over a dead token must tear the session down once, and the
// teardown's own logout path must never re-trigger it
const SESSION_INVALID_WINDOW_MS = 2_000;







// -----------------------------------------------------------
// isSessionDeath
// -----------------------------------------------------------
//
// True for the statuses that prove the stored session is dead:
// any 401, plus the account-deactivated 403 — keyed on the
// machine slug the envelope carries (`code:
// 'account_deactivated'`), never on the English prose, which
// the wire contract says clients must not read and which no
// protected route is guaranteed to phrase the same way.
// Generic 403s stay untouched — curators legitimately get
// them on /admin/*.
//
// Used by:
//   - the response interceptor (below) — the emit gate
// -----------------------------------------------------------

const isSessionDeath = (status: number, body: unknown): boolean => {
  if (status === 401) return true;
  if (status !== 403) return false;
  const code = (body as { code?: unknown } | undefined)?.code;
  return code === 'account_deactivated';
};


// When the last sessionInvalid emit fired — the burst window's
// clock (see SESSION_INVALID_WINDOW_MS above)
let lastSessionInvalidAt = 0;

api.interceptors.response.use(
  undefined,
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
// normalizeError
// -----------------------------------------------------------
//
// The error body's message is kept verbatim — it is debugging
// text, never displayed; screens translate via apiErrorKey.
// The body's stable "code" slug rides along as serverCode.
//
// Used by:
//   - request (below) — every failure
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// request
// -----------------------------------------------------------
//
//   request(api.get<Shape>('/path'))         — resolves Shape
//   request(api.post<Shape>('/path', body))  — resolves Shape
//
// Unwraps response.data and converts every failure into an
// ApiError — domain modules stay one-liners and screens catch
// exactly one error type. Every failure is logged on the way
// out: a 4xx as an expected outcome, the rest as a fault.
//
// Used by:
//   - every services/api/* domain module
// -----------------------------------------------------------

export async function request<T>(promise: Promise<AxiosResponse<T>>): Promise<T> {
  try {
    const { data } = await promise;
    return data;
  } catch (err) {
    // Screens swallow most of these on purpose — the log line
    // is the only trace a field failure leaves behind. A 4xx is
    // an outcome the screen answers itself (a wrong password,
    // a validation refusal, a 404/409/429) and logs as such —
    // console.error summoned the dev LogBox's red toast for
    // every one; 5xx and transport failures stay faults. A
    // caller-aborted request is no failure and stays unlogged.
    const normalized = normalizeError(err);
    const url = err instanceof AxiosError ? err.config?.url : undefined;
    if (normalized.code === 'http' && normalized.status >= 400 && normalized.status < 500) {
      logExpected('api', normalized, url);
    } else if (normalized.code !== 'canceled') {
      logError('api', normalized, url);
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







// -----------------------------------------------------------
// getUploadThumbUrl
// -----------------------------------------------------------
//
//   getUploadThumbUrl('/api/uploads/x.jpg') → …/api/uploads/x.jpg?s=thumb
//   getUploadThumbUrl('/api/uploads/x.gif') → …/api/uploads/x.gif
//   getUploadThumbUrl('file://…')           → unchanged
//
// The backend's one derivative size (?s=thumb, a 320 px copy
// made on first request) for small renders — a 40 pt avatar
// disc has no use for the 2048 px original (KNF-136). Only a
// stored still photo (jpg/png) gets the variant: animations,
// picker previews, other same-origin paths and refused
// foreign URLs resolve exactly as getUploadUrl does. A server
// without the variant ignores the query and serves the
// original — safe either way.
//
// Used by:
//   - components/ui/Avatar.tsx — every small portrait
// -----------------------------------------------------------

export function getUploadThumbUrl(path: string): string | null {
  const url = getUploadUrl(path);
  if (!url || !/\/api\/uploads\/[0-9a-f]{32}\.(jpe?g|png)$/i.test(url)) return url;
  return `${url}?s=thumb`;
}
