// -----------------------------------------------------------
//  [*] notifyTransport — the app's NotifyTransport
//
//  @knf/notifyengine's KNF adapter over the app's own HTTP
//  client — the same bridge chatTransport and socialTransport
//  build: request() unwraps .data and normalizes every failure
//  into an ApiError, and that ApiError is handed to the
//  adapter UNTOUCHED, because its {status, code} pair is
//  exactly what the adapter's failure mapping reads (code
//  'network' | 'timeout' → network, 401/403 → auth, a 404 on
//  delete → success). Wrapping or re-throwing here would blind
//  that mapping.
//
//  delete is the one verb with extra plumbing: the token rides
//  in the request BODY (the backend's DELETE contract), the
//  call is time-boxed to 5 s because logout awaits it and must
//  never hang on a dead server, and a caller-supplied bearer
//  overrides the interceptor's stored token — logout fires the
//  detach AFTER the local session wipe, so the captured token
//  is the only credential left.
//
//  Used by:
//    - services/notifyEngine.ts — the engine's transport seam
// -----------------------------------------------------------

import { api, request } from '@/services/api/client';

import { createKnfNotifyTransport, type NotifyHttpClient, type NotifyTransport } from '@knf/notifyengine';


// Logout's detach must not hold the sign-out flow hostage —
// shorter than the client's 15 s default on purpose
const DETACH_TIMEOUT_MS = 5_000;

// The app's HTTP client → the adapter's NotifyHttpClient. An
// explicit Authorization header always wins over the
// interceptor's stored token (see services/api/client.ts),
// which is what lets a detached logout authenticate after the
// wipe
const http: NotifyHttpClient = {
  get: (path) => request(api.get(path)),
  post: (path, body) => request(api.post(path, body)),
  put: (path, body) => request(api.put(path, body)),
  delete: (path, options) =>
    request(
      api.delete(path, {
        data: options?.body,
        timeout: DETACH_TIMEOUT_MS,
        ...(options?.authToken ? { headers: { Authorization: `Bearer ${options.authToken}` } } : {}),
      }),
    ),
};


export const notifyTransport: NotifyTransport = createKnfNotifyTransport({ http });
