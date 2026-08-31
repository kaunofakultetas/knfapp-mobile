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
//  Settle discipline (reconciliation lives INSIDE the queue
//  task — once per task, however many deduped taps share it):
//    - success, newer intent queued — record the confirmed
//      standing, keep the optimistic view and pending up
//    - success, last — the confirmed standing lands
//    - failure, newer intent queued — stay quiet; the final
//      attempt tells the truth
//    - failure, last — revert to the last server-CONFIRMED
//      standing (none this session → the field clears and the
//      base wins), then requireAuth() for 401/403, else one
//      'relationship_failed' notice
//    - a replaced queued task (AbortError) never ran — nothing
//      to undo; a settle from before an account switch (the
//      store epoch moved) touches nothing
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
import { isAuthError, isRetryableError, type RelationshipAction } from '../core/transport';
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


    const store = env.userShadows;
    const epoch = store.epoch();
    store.patch(userId, { relationship: OPTIMISTIC_TARGET[action], pending: true });


    // The queue coalesces on the ACTION (dedup compares desired
    // values with Object.is, and action strings compare cleanly),
    // so a double-tap maps onto ONE task — and reconciliation
    // lives inside the task, so it reverts once and notifies
    // once however many taps shared it. The revert anchor is the
    // last server-CONFIRMED standing (none this session → the
    // field clears and the base wins); intermediate settles with
    // a newer intent queued stay quiet and keep pending up; a
    // settle from before an account switch touches nothing.
    // ToggleQueue has one type parameter for the desired action
    // and the confirmed state alike, hence the union
    getToggleQueue<RelationshipAction | RelationshipState>(env.transport, `rel:${userId}`)
      .run(action, async (a, ctx) => {
        try {
          const confirmed = await setRelationship(userId, a as RelationshipAction);
          // A live answer outdates any queued intent for this user
          env.taskQueue.remove({ type: 'relationship', userId, action: a as RelationshipAction, at: '' });
          if (store.epoch() === epoch) {
            if (ctx.willContinue()) store.patch(userId, { confirmedRelationship: confirmed, pending: true });
            else store.patch(userId, { relationship: confirmed, confirmedRelationship: confirmed, pending: false });
          }
          return confirmed;
        } catch (err) {
          if (store.epoch() === epoch) {
            if (ctx.willContinue()) {
              store.patch(userId, { pending: true });
            } else if (isAuthError(err)) {
              store.patch(userId, { relationship: store.get(userId)?.confirmedRelationship, pending: false });
              env.requireAuth();
            } else if (isRetryableError(err)) {
              // Offline: the intent stands and replays on restore
              env.taskQueue.add({ type: 'relationship', userId, action: a as RelationshipAction, at: new Date().toISOString() });
              store.patch(userId, { pending: false });
            } else {
              env.taskQueue.remove({ type: 'relationship', userId, action: a as RelationshipAction, at: '' });
              store.patch(userId, { relationship: store.get(userId)?.confirmedRelationship, pending: false });
              env.notify({ level: 'error', code: 'relationship_failed' });
            }
          }
          throw err;
        }
      })
      .catch(() => {});
  };


  return {
    state,
    pending: shadow?.pending === true,
    canAct,
    act,
  };
}
