// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine shadow
//
//  The optimistic layer, pinned adversarially: the diff-merge
//  table row by row, object identity whenever shadow and base
//  agree (memo-friendliness), the zero clamp, the deleted
//  tombstone, undefined-clears-a-field patching, and the
//  store's subscription lifecycle. The closing case is the
//  banner's core promise: a stale shadow over a caught-up base
//  adds nothing and allocates nothing.
// -----------------------------------------------------------

import { createShadowStore, mergePostShadow, mergeRelationship, type PostShadow, type UserShadow } from '../shadow';


// Extra fields ride along to prove the merge spreads the whole
// row, not just the fields it understands
const post = (over: Partial<{ likedByMe: boolean; likeCount: number; deleted: boolean }> = {}) => ({
  id: 'p1',
  text: 'labas',
  likedByMe: false,
  likeCount: 3,
  ...over,
});


describe('mergePostShadow — the diff-merge table', () => {
  //   base likedByMe  shadow.liked   shown count
  //   false           true           base + 1
  //   true            false          base − 1
  //   equal / unset   —              base
  it('false + liked:true shows base + 1', () => {
    const merged = mergePostShadow(post({ likedByMe: false, likeCount: 3 }), { liked: true });
    expect(merged.likedByMe).toBe(true);
    expect(merged.likeCount).toBe(4);
    expect(merged.text).toBe('labas');
  });

  it('true + liked:false shows base − 1', () => {
    const merged = mergePostShadow(post({ likedByMe: true, likeCount: 3 }), { liked: false });
    expect(merged.likedByMe).toBe(false);
    expect(merged.likeCount).toBe(2);
  });

  it('equal or unset shows the base count untouched', () => {
    expect(mergePostShadow(post({ likedByMe: true, likeCount: 3 }), { liked: true }).likeCount).toBe(3);
    expect(mergePostShadow(post({ likedByMe: false, likeCount: 3 }), { liked: false }).likeCount).toBe(3);
    expect(mergePostShadow(post({ likedByMe: false, likeCount: 3 }), {}).likeCount).toBe(3);
    expect(mergePostShadow(post({ likedByMe: false, likeCount: 3 }), undefined).likeCount).toBe(3);
  });
});


describe('mergePostShadow — identity and edges', () => {
  it('an identical-state merge returns the SAME object', () => {
    const base = post({ likedByMe: true, likeCount: 3 });
    expect(mergePostShadow(base, undefined)).toBe(base);
    expect(mergePostShadow(base, {})).toBe(base);
    expect(mergePostShadow(base, { liked: true })).toBe(base);
    // pending alone never re-identifies the row either
    expect(mergePostShadow(base, { pending: true })).toBe(base);
  });

  it('the count clamps at zero', () => {
    const merged = mergePostShadow(post({ likedByMe: true, likeCount: 0 }), { liked: false });
    expect(merged.likedByMe).toBe(false);
    expect(merged.likeCount).toBe(0);
  });

  it('a deleted tombstone survives the merge, alone and with a like diff', () => {
    const alone = mergePostShadow(post({ likedByMe: false, likeCount: 3 }), { deleted: true });
    expect(alone.deleted).toBe(true);
    expect(alone.likeCount).toBe(3);

    const combined = mergePostShadow(post({ likedByMe: false, likeCount: 3 }), { deleted: true, liked: true });
    expect(combined.deleted).toBe(true);
    expect(combined.likedByMe).toBe(true);
    expect(combined.likeCount).toBe(4);
  });

  it('a stale shadow is harmless once the base catches up', () => {
    // The refetch already counted the viewer's like — the shadow
    // agrees with the base now, so the diff is zero: no double
    // bump, and no fresh allocation to defeat row memoisation
    const caughtUp = post({ likedByMe: true, likeCount: 5 });
    const merged = mergePostShadow(caughtUp, { liked: true });
    expect(merged).toBe(caughtUp);
    expect(merged.likeCount).toBe(5);
  });
});


describe('mergeRelationship', () => {
  it('the shadow word wins while it exists, the base answers otherwise', () => {
    expect(mergeRelationship('none', { relationship: 'outgoing' })).toBe('outgoing');
    expect(mergeRelationship('connected', undefined)).toBe('connected');
    expect(mergeRelationship('connected', { pending: true })).toBe('connected');
  });
});


describe('createShadowStore', () => {
  it('patch shallow-merges and an explicit undefined clears that field', () => {
    const store = createShadowStore<PostShadow>();
    store.patch('p1', { liked: true, pending: true });
    store.patch('p1', { pending: undefined });
    expect(store.get('p1')).toEqual({ liked: true });
    expect('pending' in store.get('p1')!).toBe(false);
    expect(store.get('unknown')).toBeUndefined();
  });

  it('patch and clear fire that id\'s subscribers — and only that id\'s', () => {
    const store = createShadowStore<PostShadow>();
    const onP1 = jest.fn();
    const onP2 = jest.fn();
    store.subscribe('p1', onP1);
    store.subscribe('p2', onP2);

    store.patch('p1', { liked: true });
    expect(onP1).toHaveBeenCalledTimes(1);
    expect(onP2).not.toHaveBeenCalled();

    store.clear('p1');
    expect(onP1).toHaveBeenCalledTimes(2);
    expect(store.get('p1')).toBeUndefined();

    // Clearing what holds nothing changes nothing — no notify
    store.clear('p1');
    expect(onP1).toHaveBeenCalledTimes(2);
  });

  it('clearAll wipes every id and fires each one\'s subscribers', () => {
    const store = createShadowStore<UserShadow>();
    const onU1 = jest.fn();
    const onU2 = jest.fn();
    store.subscribe('u1', onU1);
    store.subscribe('u2', onU2);
    store.patch('u1', { relationship: 'outgoing' });
    store.patch('u2', { relationship: 'connected' });
    onU1.mockClear();
    onU2.mockClear();

    store.clearAll();
    expect(store.get('u1')).toBeUndefined();
    expect(store.get('u2')).toBeUndefined();
    expect(onU1).toHaveBeenCalledTimes(1);
    expect(onU2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops delivery without touching other listeners', () => {
    const store = createShadowStore<PostShadow>();
    const gone = jest.fn();
    const kept = jest.fn();
    const unsubscribe = store.subscribe('p1', gone);
    store.subscribe('p1', kept);

    unsubscribe();
    store.patch('p1', { liked: true });
    expect(gone).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('clearAll bumps the epoch; patch and clear do not', () => {
    const store = createShadowStore<{ liked?: boolean }>();
    expect(store.epoch()).toBe(0);
    store.patch('p1', { liked: true });
    store.clear('p1');
    expect(store.epoch()).toBe(0);
    store.clearAll();
    expect(store.epoch()).toBe(1);
    store.clearAll();
    expect(store.epoch()).toBe(2);
  });

  it('a double unsubscribe never orphans a later subscriber on the same id', () => {
    const store = createShadowStore<{ liked?: boolean }>();
    const first = jest.fn();
    const unsub = store.subscribe('p1', first);
    unsub();

    const second = jest.fn();
    store.subscribe('p1', second);
    // The stale closure firing again must not evict the fresh set
    unsub();

    store.patch('p1', { liked: true });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
