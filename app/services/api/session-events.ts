// -----------------------------------------------------------
//  [*] Session events — mid-run session invalidation channel
//
//  A tiny subscriber registry that lets the API layer tell
//  AuthContext "the stored session is dead" without importing
//  React. client.ts emits when an authenticated request comes
//  back 401 (or 403 'Account deactivated') outside the auth
//  endpoints — once per burst — and AuthContext, subscribed on
//  mount, clears the session so every screen drops to the
//  guest experience instead of erroring forever. No forced
//  login route: the app works without login by design.
//
//  Split into:
//
//    onSessionInvalid   — subscribe, returns unsubscribe
//    emitSessionInvalid — notify every subscriber
// -----------------------------------------------------------


// Subscriber set — AuthContext in practice, but the channel
// does not care who listens
const listeners = new Set<() => void>();







// -----------------------------------------------------------
// onSessionInvalid
// -----------------------------------------------------------
//
// Used by:
//   - context/AuthContext.tsx — registers clearSession on mount
// -----------------------------------------------------------

export function onSessionInvalid(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}







// -----------------------------------------------------------
// emitSessionInvalid
// -----------------------------------------------------------
//
// A throwing subscriber must not starve the rest — each call
// is isolated. Burst suppression lives in the emitter's caller
// (client.ts), which knows what one "burst" of 401s is.
//
// Used by:
//   - services/api/client.ts — response error interceptor
// -----------------------------------------------------------

export function emitSessionInvalid(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // One bad subscriber must not block session teardown
    }
  });
}
