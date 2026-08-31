// -----------------------------------------------------------
//  [*] socialengine — shadow
//
//  Optimistic state, layered OVER immutable list data instead
//  of written into it. Feed rows arrive from whatever fetching
//  layer the host uses and are treated as server truth; the
//  viewer's in-flight intents (a like tapped, a request sent)
//  live in a shadow store keyed by id, and views render
//  merge(base, shadow).
//
//  The merge is a DIFF, not an overwrite: the shadow remembers
//  what the viewer wants ("liked: true"), and the count shown
//  is base.likeCount adjusted only by the DISAGREEMENT between
//  shadow and base. When a refetch later returns rows that
//  already include the viewer's like, the disagreement — and
//  the adjustment — become zero on their own. A stale shadow
//  is therefore harmless, which is why nothing ever has to
//  race to clean one up.
//
//  Every copy of a post updates at once: a like toggled in the
//  feed is instantly right in search results and on the
//  profile wall, because all three subscribe to the same id.
//
//  Used by:
//    - provider/index.tsx — one post store + one user store,
//      wiped when the signed-in account changes
//    - hooks/useLikeToggle.ts, hooks/useRelationship.ts
// -----------------------------------------------------------

import type { RelationshipState } from './types';


// The viewer's standing intents on one post. `pending` is true
// while a transport call is in flight (UIs may dim), `deleted`
// tombstones a row the viewer removed
export interface PostShadow {
  liked?: boolean;
  pending?: boolean;
  deleted?: boolean;
  // The last server-CONFIRMED flag this session — the anchor a
  // failed later toggle reverts to (never rendered directly;
  // mergePostShadow ignores it)
  confirmedLiked?: boolean;
}

// The viewer's standing with one user
export interface UserShadow {
  relationship?: RelationshipState;
  pending?: boolean;
  // The last server-CONFIRMED standing this session — the revert
  // anchor (mergeRelationship ignores it)
  confirmedRelationship?: RelationshipState;
}

export interface ShadowStore<S> {
  get(id: string): S | undefined;
  // Shallow-merges the patch and fires that id's listeners
  // (undefined values clear their field)
  patch(id: string, patch: Partial<S>): void;
  clear(id: string): void;
  clearAll(): void;
  // The number of clearAll wipes so far. A settle handler for a
  // call that was in flight when the account changed captures
  // the epoch at tap time and skips its patch when it moved —
  // the departing viewer's intent must not re-seed the fresh
  // store
  epoch(): number;
  // Listener fires after every patch/clear of that id; returns
  // the unsubscribe
  subscribe(id: string, listener: () => void): () => void;
}







// -----------------------------------------------------------
// createShadowStore
// -----------------------------------------------------------
//
// Used by:
//   - provider/index.tsx — the two per-provider stores
// -----------------------------------------------------------

export function createShadowStore<S extends object>(): ShadowStore<S> {

  const values = new Map<string, S>();
  const listeners = new Map<string, Set<() => void>>();
  let epoch = 0;


  const fire = (id: string) => {
    listeners.get(id)?.forEach((fn) => fn());
  };


  return {
    get: (id) => values.get(id),

    patch(id, patch) {
      const next = { ...(values.get(id) ?? ({} as S)) };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete (next as Record<string, unknown>)[key];
        else (next as Record<string, unknown>)[key] = value;
      }
      values.set(id, next);
      fire(id);
    },

    clear(id) {
      if (!values.delete(id)) return;
      fire(id);
    },

    clearAll() {
      epoch += 1;
      const ids = [...values.keys()];
      values.clear();
      ids.forEach(fire);
    },

    epoch: () => epoch,

    subscribe(id, listener) {
      let set = listeners.get(id);
      if (!set) {
        set = new Set();
        listeners.set(id, set);
      }
      set.add(listener);
      // Idempotent: a double unsubscribe must not evict a set a
      // LATER subscriber has since re-created under the same id
      return () => {
        set.delete(listener);
        if (set.size === 0 && listeners.get(id) === set) listeners.delete(id);
      };
    },
  };
}







// -----------------------------------------------------------
// mergePostShadow
// -----------------------------------------------------------
//
// The diff-merge. The count moves only where shadow and base
// DISAGREE, so a base that has caught up (the refetch already
// counted the viewer's like) adds zero — never a double count:
//
//   base likedByMe  shadow.liked   shown count
//   false           true           base + 1
//   true            false          base − 1
//   equal / unset   —              base
//
// Used by:
//   - hooks/useLikeToggle.ts — the merged view it returns
//   - hosts merging whole lists before render
// -----------------------------------------------------------

export function mergePostShadow<T extends { likedByMe: boolean; likeCount: number; deleted?: boolean }>(
  post: T,
  shadow: PostShadow | undefined,
): T {
  if (!shadow) return post;


  const liked = shadow.liked ?? post.likedByMe;
  const bump = liked && !post.likedByMe ? 1 : !liked && post.likedByMe ? -1 : 0;
  if (liked === post.likedByMe && bump === 0 && !shadow.deleted) return post;


  return {
    ...post,
    likedByMe: liked,
    likeCount: Math.max(0, post.likeCount + bump),
    ...(shadow.deleted ? { deleted: true } : {}),
  };
}







// -----------------------------------------------------------
// mergeRelationship
// -----------------------------------------------------------
//
// Same idea for a user: the shadow's word wins while it exists.
// Relationships are a plain override (there is no count to
// diff) — the shadow is cleared-by-irrelevance when the base
// catches up, because override === base then anyway.
//
// Used by:
//   - hooks/useRelationship.ts
// -----------------------------------------------------------

export function mergeRelationship(base: RelationshipState, shadow: UserShadow | undefined): RelationshipState {
  return shadow?.relationship ?? base;
}
