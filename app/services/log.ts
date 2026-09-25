// -----------------------------------------------------------
//  [*] Log — the app's one error sink
//
//  Most failures in this app are deliberately swallowed —
//  a failed cache write or a lost socket must never take a
//  screen down — but swallowed silently they are also
//  undiagnosable. Every catch that eats a real failure calls
//  logError() instead of nothing: in dev the error lands on
//  the console, and in every build it is kept in a small
//  in-memory ring buffer so the crash screen can attach the
//  recent failure trail to a support report.
//
//  No network, no storage — the buffer lives and dies with
//  the JS process, and logging itself can never throw.
//
//  Two severities. logError is a real fault (a 5xx, a dead
//  network, a crash) and mirrors to console.error in dev.
//  logExpected is an outcome the UI already handles — a wrong
//  password's 401, a validation 400, a 403/404/409/429 the
//  screen translates — and mirrors to console.info: on
//  console.error the dev build's LogBox popped a red error
//  toast over every mistyped password. Both land in the
//  trail; expected ones are marked so a report reader can
//  tell them from the faults.
//
//  Split into:
//
//    record      — the shared sink behind both severities
//    logError    — record one failure (console.error in dev)
//    logExpected — record one handled outcome (console.info)
//    getErrorLog — the buffered trail, oldest first
// -----------------------------------------------------------

// The trail stays small — enough context for a report without
// ever growing over a long session
const MAX_ENTRIES = 50;

// The ring buffer itself — append at the end, shift from the
// front once MAX_ENTRIES is exceeded
const entries: string[] = [];


// logError lines stay on the dev console but must not summon
// LogBox's floating error pill: these are EXPECTED failures
// (a dead backend, a lost socket), and with the backend down
// the pill would sit broken and blank over the tab bar on
// every screen. The [scope] prefix is logError's signature,
// so genuine unexpected errors still pop the pill.
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native').LogBox.ignoreLogs([/^\[[\w-]+\]/]);
}







// -----------------------------------------------------------
// record
// -----------------------------------------------------------
//
// Appends one line to the ring buffer (oldest entry dropped
// past MAX_ENTRIES) and mirrors it to the dev console at the
// severity's level — a fault as console.error with the whole
// error object, an expected outcome as a one-line
// console.info. Never throws — the logger must not become a
// failure of its own inside the catch blocks that call it.
//
// Used by:
//   - logError, logExpected (below)
// -----------------------------------------------------------

function record(expected: boolean, scope: string, err: unknown, extra?: string): void {
  try {
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    entries.push(
      `${new Date().toISOString()} [${scope}]${expected ? ' (expected)' : ''} ${message}${extra ? ` — ${extra}` : ''}`,
    );
    if (entries.length > MAX_ENTRIES) entries.shift();
    if (!__DEV__) return;
    if (expected) console.info(`[${scope}] ${message}`, extra ?? '');
    else console.error(`[${scope}]`, err, extra ?? '');
  } catch {
    // Nothing left to do — see the banner
  }
}







// -----------------------------------------------------------
// logError
// -----------------------------------------------------------
//
//   logError('api', err)                — scope + error
//   logError('api', err, '/news/7')     — with extra context
//
// A real fault — something went wrong that the user did not
// cause and the screen can only apologise for.
//
// Used by:
//   - services/api/client.ts — 5xx, network, timeout and any
//     non-HTTP request failure
//   - services/socket.ts — socket connect_error
//   - services/notifyEngine.ts, components/notify/
//     NotifyEngineHost.tsx — the push engine's failures
//   - app/_layout.tsx — the root ErrorBoundary's onError
//   - app/(main)/tabs/map.tsx, app/(main)/map-editor — plan
//     loads
// -----------------------------------------------------------

export function logError(scope: string, err: unknown, extra?: string): void {
  record(false, scope, err, extra);
}







// -----------------------------------------------------------
// logExpected
// -----------------------------------------------------------
//
//   logExpected('api', err, '/auth/login')  — a handled 4xx
//
// An outcome the UI answers on its own (see the file header)
// — kept in the trail for context, never a red dev toast.
//
// Used by:
//   - services/api/client.ts — every normalized 4xx
// -----------------------------------------------------------

export function logExpected(scope: string, err: unknown, extra?: string): void {
  record(true, scope, err, extra);
}







// -----------------------------------------------------------
// getErrorLog
// -----------------------------------------------------------
//
// A copy of the buffered trail, oldest first — callers may
// slice it freely without disturbing the buffer.
//
// Used by:
//   - components/ErrorFallback.tsx — the crash-report mail body
// -----------------------------------------------------------

export function getErrorLog(): string[] {
  return [...entries];
}
