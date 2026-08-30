// -----------------------------------------------------------
//  [*] API — error → i18n key mapping
//
//  The one function screens use to turn ANY caught error into
//  a translation key, so no raw (English) backend text is ever
//  rendered. Resolution order:
//
//    1. errors.codes.<serverCode> — when the backend sent a
//       stable machine code AND the catalogs know it
//    2. overrides[status]         — the caller's screen-
//       specific keys (e.g. { 409: 'register.usernameTaken' })
//    3. errors.http.<status>      — generic per-status copy
//       for 400/401/403/404/409/413/429/500
//    4. errors.timeout / errors.network for transport failures
//    5. errors.generic            — the last resort
//
//  Screens render t(apiErrorKey(err, {...})) — never
//  err.message. The errors.* catalog entries live in
//  i18n/lt.json + en.json.
//
//  Split into:
//
//    HTTP_KEY_STATUSES — statuses with generic catalog copy
//    apiErrorKey       — error → i18n key
// -----------------------------------------------------------

// The catalogs — needed to check whether a serverCode key exists
import i18n from '@/i18n';

// The normalized error shape every request() failure has
import { ApiError } from './client';


// Statuses errors.http.<status> copy exists for — anything
// else falls through to errors.generic
const HTTP_KEY_STATUSES = [400, 401, 403, 404, 409, 413, 429, 500];







// -----------------------------------------------------------
// apiErrorKey
// -----------------------------------------------------------
//
//   t(apiErrorKey(err))                                — generic
//   t(apiErrorKey(err, { 409: 'register.usernameTaken' })) — per-screen
//
// Used by:
//   - screens/hooks rendering request() failures
//     (login, register, create-post, chat, settings, …)
// -----------------------------------------------------------

export function apiErrorKey(
  err: unknown,
  overrides?: Record<number, string>,
): string {
  if (err instanceof ApiError) {
    if (err.serverCode && i18n.exists(`errors.codes.${err.serverCode}`)) {
      return `errors.codes.${err.serverCode}`;
    }
    if (overrides && overrides[err.status]) return overrides[err.status];
    if (err.code === 'http' && HTTP_KEY_STATUSES.includes(err.status)) {
      return `errors.http.${err.status}`;
    }
    if (err.code === 'timeout') return 'errors.timeout';
    if (err.code === 'network') return 'errors.network';
  }
  return 'errors.generic';
}
