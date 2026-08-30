// -----------------------------------------------------------
//  [*] socialengine — useRelationship
//
//  The connect / accept / decline / disconnect button's
//  engine. A tap patches the userShadows entry to the action's
//  optimistic target instantly; the transport call rides the
//  per-user toggle queue (spam coalesces, a superseded tap
//  aborts silently); and the CONFIRMED state the server
//  answers with replaces the guess — an instant-connect
//  backend answers 'connected' to 'connect', and that word
//  wins over the optimistic 'outgoing'.
//
//  Only the relationship STATE is optimistic; connection
//  COUNTS are deliberately never touched here. A count is an
//  aggregate the server owns, and guessing ±1 across
//  accept/decline/disconnect races is exactly how profiles
//  drift — the next profile fetch reconciles counts for free.
//
//  Failure taxonomy:
//    - AbortError    — a newer tap superseded this one; the
//                      newer one owns the state, do nothing
//    - anything else — revert to the pre-tap intent, notify
//                      'relationship_failed'
//
//  Relationships are optional in the transport: without
//  setRelationship the hook reports canAct false and act() is
//  a no-op ('unsupported' behavior, never a crash).
//
//  Used by:
//    - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

import { useCallback, useSyncExternalStore } from 'react';

import { mergeRelationship } from '../core/shadow';
import { getToggleQueue } from '../core/toggleQueue';
import type { RelationshipAction } from '../core/transport';
import type { RelationshipState } from '../core/types';
import { useSocialEngine } from '../provider';


export interface UseRelationshipResult {
  state: RelationshipState;
  // True while a transport call is in flight (UIs may dim)
  pending: boolean;
  // Signed in, the transport supports relationships, and the
  // merged state is actionable (never 'self', never 'blockedBy')
  canAct: boolean;
  act: (action: RelationshipAction) => void;
}


// What the viewer sees the instant they tap, before the server
// answers. 'connect' guesses the request-style 'outgoing' — an
// instant-connect backend corrects it to 'connected' on settle
const OPTIMISTIC_TARGET: Record<RelationshipAction, RelationshipState> = {
  connect: 'outgoing',
  cancel: 'none',
  accept: 'connected',
  decline: 'none',
  disconnect: 'none',
};







// -----------------------------------------------------------
// useRelationship
// -----------------------------------------------------------
//
//   const { state, pending, canAct, act } =
//     useRelationship(profile.user.id, profile.relationship)
//
// `base` is the server truth from whatever fetched the
// profile; the hook layers the viewer's shadow over it and
// re-renders on every patch of this userId.
//
// Used by:
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export function useRelationship(userId: string, base: RelationshipState): UseRelationshipResult {

  const env = useSocialEngine();


  // The store's get() returns the same object until the next
  // patch replaces it wholesale — a valid snapshot as-is
  const subscribe = useCallback(
    (onChange: () => void) => env.userShadows.subscribe(userId, onChange),
    [env.userShadows, userId],
  );
  const shadow = useSyncExternalStore(subscribe, () => env.userShadows.get(userId));


  const state = mergeRelationship(base, shadow);
  const canAct =
    env.currentUser !== null &&
    typeof env.transport.setRelationship === 'function' &&
    state !== 'self' &&
    state !== 'blockedBy';


  const act = (action: RelationshipAction) => {
    // Guests get the login flow, never a transport call
    if (!env.currentUser) {
      env.requireAuth();
      return;
    }


    // A backend without relationships: canAct already said no,
    // and a stray call must not crash
    const setRelationship = env.transport.setRelationship?.bind(env.transport);
    if (!setRelationship) return;


    // `prev` is the shadow's pre-tap word — undefined means "no
    // opinion", and reverting to undefined clears the field so
    // the base row wins again
    const prev = env.userShadows.get(userId)?.relationship;
    env.userShadows.patch(userId, { relationship: OPTIMISTIC_TARGET[action], pending: true });


    // The queue coalesces on the ACTION (dedup compares desired
    // values with Object.is, and action strings compare cleanly);
    // the value a task settles to is the server's confirmed
    // STATE. ToggleQueue has one type parameter for both, hence
    // the union and the two focused narrowings
    getToggleQueue<RelationshipAction | RelationshipState>(env.transport, `rel:${userId}`)
      .run(action, (a) => setRelationship(userId, a as RelationshipAction))
      .then(
        (confirmed) => {
          env.userShadows.patch(userId, { relationship: confirmed as RelationshipState, pending: false });
        },
        (err: unknown) => {
          if ((err as { name?: string } | null)?.name === 'AbortError') return;
          env.userShadows.patch(userId, { relationship: prev, pending: false });
          env.notify({ level: 'error', code: 'relationship_failed' });
        },
      );
  };


  return {
    state,
    pending: shadow?.pending === true,
    canAct,
    act,
  };
}
