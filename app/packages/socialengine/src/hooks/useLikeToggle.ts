// -----------------------------------------------------------
//  [*] socialengine — useLikeToggle
//
//  One like button's whole lifecycle. The tap flips the view
//  instantly through a postShadows patch; the transport call
//  rides the per-target toggle queue, so tap spam coalesces to
//  at most the in-flight request plus the final intent; the
//  server's answer settles the flag. Because every surface
//  showing this id subscribes to the same shadow, a like
//  toggled in the feed is instantly right in search results
//  and on the profile wall too.
//
//  The count shown is never arithmetic done here — it is
//  mergePostShadow's diff against the immutable base row, so a
//  refetched base that already includes the viewer's like adds
//  zero and can never be double counted.
//
//  Settle discipline (reconciliation lives INSIDE the queue
//  task, so it runs once per task however many deduped taps
//  share it):
//    - success, newer intent queued — record the confirmed
//      flag, keep the optimistic view and pending standing;
//      the LAST task writes the final word
//    - success, last — the confirmed flag lands, pending drops
//    - failure, newer intent queued — stay quiet; the final
//      attempt tells the truth
//    - failure, last — revert to the last server-CONFIRMED
//      flag (none this session → the field clears and the base
//      row wins), then requireAuth() for 401/403, else one
//      'like_failed' notice
//    - the store epoch moved (account switch) — touch nothing;
//      the departing viewer's intent must not re-seed the
//      fresh store
//
//  Works on comments too: targetType 'comment' changes the
//  queue key and the transport target, nothing else.
//
//  Used by:
//    - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

import { useCallback, useSyncExternalStore } from 'react';

import { mergePostShadow } from '../core/shadow';
import { getToggleQueue } from '../core/toggleQueue';
import { isAuthError, isRetryableError } from '../core/transport';
import { useSocialEngine } from '../provider';


export interface UseLikeToggleResult {
  liked: boolean;
  likeCount: number;
  // True while a transport call is in flight (UIs may dim)
  pending: boolean;
  // False for guests — toggle() then routes to requireAuth()
  canLike: boolean;
  toggle: () => void;
}







// -----------------------------------------------------------
// useLikeToggle
// -----------------------------------------------------------
//
//   const { liked, likeCount, pending, canLike, toggle } =
//     useLikeToggle(post)               — a post's like button
//   useLikeToggle(comment, 'comment')   — a comment row's
//
// `post` is the immutable base row (server truth); the hook
// layers the viewer's shadow over it and re-renders on every
// patch of this id.
//
// Used by:
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export function useLikeToggle(
  post: { id: string; likedByMe: boolean; likeCount: number },
  targetType: 'post' | 'comment' = 'post',
): UseLikeToggleResult {

  const env = useSocialEngine();


  // The store's get() returns the same object until the next
  // patch replaces it wholesale, so it is a valid
  // useSyncExternalStore snapshot as-is
  const subscribe = useCallback(
    (onChange: () => void) => env.postShadows.subscribe(post.id, onChange),
    [env.postShadows, post.id],
  );
  const shadow = useSyncExternalStore(subscribe, () => env.postShadows.get(post.id));


  const merged = mergePostShadow(post, shadow);


  const toggle = () => {
    // Guests get the login flow, never a transport call
    if (!env.currentUser) {
      env.requireAuth();
      return;
    }


    // Desired = the opposite of what the viewer SEES (base with
    // the shadow already layered), read from the store directly
    // so back-to-back taps alternate even before a re-render
    const store = env.postShadows;
    const epoch = store.epoch();
    const desired = !mergePostShadow(post, store.get(post.id)).likedByMe;
    store.patch(post.id, { liked: desired, pending: true });


    // The queue's desired value is the bare boolean (its dedup
    // rule compares with Object.is). The count in the server's
    // answer is deliberately dropped: the next base refetch is
    // the count's only source of truth. A replaced queued task
    // rejects with AbortError and never ran its perform — there
    // is nothing to undo, so the tail catch only defuses the
    // promise
    getToggleQueue<boolean>(env.transport, `like:${targetType}:${post.id}`)
      .run(desired, async (d, ctx) => {
        try {
          const result = await env.transport.setLiked({ type: targetType, id: post.id }, d);
          // The wire answered LIVE — any intent still queued for
          // this target is stale now and must never replay over
          // the fresher server word
          env.taskQueue.remove({ type: 'like', target: { type: targetType, id: post.id }, desired: d, at: '' });
          if (store.epoch() === epoch) {
            if (ctx.willContinue()) store.patch(post.id, { confirmedLiked: result.liked, pending: true });
            else store.patch(post.id, { liked: result.liked, confirmedLiked: result.liked, pending: false });
          }
          return result.liked;
        } catch (err) {
          if (store.epoch() === epoch) {
            if (ctx.willContinue()) {
              store.patch(post.id, { pending: true });
            } else if (isAuthError(err)) {
              store.patch(post.id, { liked: store.get(post.id)?.confirmedLiked, pending: false });
              env.requireAuth();
            } else if (isRetryableError(err)) {
              // Offline (or the server is down): the intent
              // STANDS — the optimistic view stays and the final
              // word joins the task queue, replayed on restore.
              // No notice: a queued like is not a failure
              env.taskQueue.add({ type: 'like', target: { type: targetType, id: post.id }, desired: d, at: new Date().toISOString() });
              store.patch(post.id, { pending: false });
            } else {
              // A dead intent purges its queued twin too
              env.taskQueue.remove({ type: 'like', target: { type: targetType, id: post.id }, desired: d, at: '' });
              store.patch(post.id, { liked: store.get(post.id)?.confirmedLiked, pending: false });
              env.notify({ level: 'error', code: 'like_failed' });
            }
          }
          throw err;
        }
      })
      .catch(() => {});
  };


  return {
    liked: merged.likedByMe,
    likeCount: merged.likeCount,
    pending: shadow?.pending === true,
    canLike: env.currentUser !== null,
    toggle,
  };
}
