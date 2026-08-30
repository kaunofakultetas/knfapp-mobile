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
//  Failure taxonomy, exactly:
//    - AbortError     — a newer toggle superseded this one; the
//                       newer one owns the state, do nothing
//    - auth (401/403) — revert to the pre-tap intent, route to
//                       requireAuth()
//    - anything else  — revert, notify 'like_failed'
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
import { isAuthError } from '../core/transport';
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
    // so back-to-back taps alternate even before a re-render.
    // `prev` is the shadow's pre-tap word — undefined means "no
    // opinion", and reverting to undefined clears the field so
    // the base row wins again
    const current = env.postShadows.get(post.id);
    const prev = current?.liked;
    const desired = !mergePostShadow(post, current).likedByMe;
    env.postShadows.patch(post.id, { liked: desired, pending: true });


    // The queue's desired value is the bare boolean (its dedup
    // rule compares with Object.is), so the transport's answer
    // is narrowed to the confirmed flag here. The count in that
    // answer is deliberately dropped: the next base refetch is
    // the count's only source of truth
    getToggleQueue<boolean>(env.transport, `like:${targetType}:${post.id}`)
      .run(desired, (d) => env.transport.setLiked({ type: targetType, id: post.id }, d).then((result) => result.liked))
      .then(
        (confirmed) => {
          env.postShadows.patch(post.id, { liked: confirmed, pending: false });
        },
        (err: unknown) => {
          if ((err as { name?: string } | null)?.name === 'AbortError') return;
          env.postShadows.patch(post.id, { liked: prev, pending: false });
          if (isAuthError(err)) env.requireAuth();
          else env.notify({ level: 'error', code: 'like_failed' });
        },
      );
  };


  return {
    liked: merged.likedByMe,
    likeCount: merged.likeCount,
    pending: shadow?.pending === true,
    canLike: env.currentUser !== null,
    toggle,
  };
}
