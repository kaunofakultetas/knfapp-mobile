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
//  Split into:
//
//    logError    — record one failure (console in dev)
//    getErrorLog — the buffered trail, oldest first
// -----------------------------------------------------------


// The trail stays small — enough context for a report without
// ever growing over a long session
const MAX_ENTRIES = 50;

const entries: string[] = [];







// -----------------------------------------------------------
// logError
// -----------------------------------------------------------
//
//   logError('api', err)                — scope + error
//   logError('api', err, '/news/7')     — with extra context
//
// Appends one line to the ring buffer (oldest entry dropped
// past MAX_ENTRIES) and mirrors it to the console in dev.
// Never throws — the logger must not become a failure of its
// own inside the catch blocks that call it.
//
// Used by:
//   - services/api/client.ts — every normalized request failure
//   - services/socket.ts — socket connect_error
//   - app/_layout.tsx — the root ErrorBoundary's onError
// -----------------------------------------------------------

export function logError(scope: string, err: unknown, extra?: string): void {
  try {
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    entries.push(
      `${new Date().toISOString()} [${scope}] ${message}${extra ? ` — ${extra}` : ''}`,
    );
    if (entries.length > MAX_ENTRIES) entries.shift();
    if (__DEV__) console.error(`[${scope}]`, err, extra ?? '');
  } catch {
    // Nothing left to do — see the banner
  }
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
