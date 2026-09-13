// -----------------------------------------------------------
//  [*] wayfindcapture — useCaptureSession
//
//  A capture session inside a component: the session is the
//  external store (its snapshot is identity-stable between
//  changes, its subscribe fires on every one), so the screen
//  re-renders exactly when the session moves — every fed
//  sensor frame included, which is what a live HUD wants. The
//  hook only OBSERVES: feeding sensors and answering shoots
//  stay on the session object the host already holds. Hand in
//  null (session not built yet, camera permission pending) and
//  the state is the inert empty snapshot.
//
//  The snapshot's fields map straight onto CaptureHud's props:
//  targets carry done flags, currentId names the ring's
//  target, aim carries aligned/stable, shotsDone/shotsTotal
//  are the progress line.
//
//  Used by:
//    - src/index.ts — public surface; the capture screen
// -----------------------------------------------------------

import { useMemo, useSyncExternalStore } from 'react';

import type { CaptureSession, CaptureSnapshot } from '../core/session';







// -----------------------------------------------------------
// UseCaptureSessionResult
// -----------------------------------------------------------
//
// The hook answers the session's own snapshot unchanged — an
// alias, so the two never drift.
//
// Used by:
//   - useCaptureSession (below) — the return type
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type UseCaptureSessionResult = CaptureSnapshot;

// What a missing session looks like — one frozen object, so
// re-renders with no session never tear or loop
const EMPTY_SNAPSHOT: CaptureSnapshot = Object.freeze({
  phase: 'idle' as const,
  targets: [],
  currentId: null,
  aim: null,
  shots: [],
  shotsDone: 0,
  shotsTotal: 0,
});







// -----------------------------------------------------------
// noSubscription
// -----------------------------------------------------------
//
// Without a session there is nothing to subscribe to.
//
// Used by:
//   - useCaptureSession (below) — useSyncExternalStore's
//     subscribe while session is null
// -----------------------------------------------------------

const noSubscription = () => () => {};







// -----------------------------------------------------------
// useCaptureSession
// -----------------------------------------------------------
//
//   const state = useCaptureSession(session)
//   state.phase                  — 'idle' | 'capturing' | 'done'
//   state.currentId / state.aim  — what the HUD rings and how far
//   state.shotsDone / shotsTotal — the progress line
//
// Used by:
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function useCaptureSession(session: CaptureSession | null): UseCaptureSessionResult {

  // A new session object is a new store — the subscribe identity
  // change makes useSyncExternalStore re-read from it
  const subscribe = useMemo(() => (session ? session.subscribe : noSubscription), [session]);


  return useSyncExternalStore(subscribe, () => (session ? session.snapshot() : EMPTY_SNAPSHOT));
}
