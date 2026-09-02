// -----------------------------------------------------------
//  [*] Tests — the state store, pinned edge by edge
//
//  Every machine's snapshot flows through createStore, so its
//  contracts are pinned exactly: subscribe fires IMMEDIATELY
//  with the current value, unsubscribe is total, emissions are
//  edge-deduped by shallow equality one nested record deep, a
//  throwing listener is isolated, and get() tracks the latest
//  accepted snapshot.
// -----------------------------------------------------------

import { createStore } from '../store';

type FlatSnap = { status: string; token: string | null };
type NestedSnap = { channels: Record<string, boolean>; chatPreview: boolean };


describe('createStore subscription lifecycle', () => {
  it('subscribe fires IMMEDIATELY with the current value — no first-change gap', () => {
    const store = createStore<FlatSnap>({ status: 'idle', token: null });
    const seen: FlatSnap[] = [];

    store.subscribe((v) => seen.push(v));

    expect(seen).toEqual([{ status: 'idle', token: null }]);
  });

  it('unsubscribe stops delivery — later sets reach nothing after the immediate call', () => {
    const store = createStore<FlatSnap>({ status: 'idle', token: null });
    const seen: FlatSnap[] = [];

    const unsubscribe = store.subscribe((v) => seen.push(v));
    unsubscribe();
    store.set({ status: 'registered', token: 'tok-1' });

    // Only the immediate call landed; the post-unsubscribe set did not
    expect(seen).toEqual([{ status: 'idle', token: null }]);
    expect(store.get()).toEqual({ status: 'registered', token: 'tok-1' });
  });

  it('a changed flat value emits exactly once, with the new snapshot', () => {
    const store = createStore<FlatSnap>({ status: 'idle', token: null });
    const seen: FlatSnap[] = [];

    store.subscribe((v) => seen.push(v));
    store.set({ status: 'registered', token: 'tok-1' });

    expect(seen).toEqual([
      { status: 'idle', token: null },
      { status: 'registered', token: 'tok-1' },
    ]);
  });
});


describe('createStore edge-dedup', () => {
  it('a shallowly-equal flat snapshot emits NOTHING and keeps the old reference', () => {
    const initial: FlatSnap = { status: 'idle', token: null };
    const store = createStore<FlatSnap>(initial);
    const seen: FlatSnap[] = [];

    store.subscribe((v) => seen.push(v));
    store.set({ status: 'idle', token: null }); // fresh object, same values

    expect(seen).toEqual([{ status: 'idle', token: null }]);
    expect(seen.length).toBe(1);
    expect(store.get()).toBe(initial); // dedup keeps the accepted reference stable
  });

  it('an equal one-level-nested record ({channels:{...}}) also emits NOTHING', () => {
    const initial: NestedSnap = { channels: { news: true, chat: true }, chatPreview: true };
    const store = createStore<NestedSnap>(initial);
    const seen: NestedSnap[] = [];

    store.subscribe((v) => seen.push(v));
    // Fresh references at BOTH levels, identical leaves
    store.set({ channels: { news: true, chat: true }, chatPreview: true });

    expect(seen).toEqual([{ channels: { news: true, chat: true }, chatPreview: true }]);
    expect(seen.length).toBe(1);
    expect(store.get()).toBe(initial);
  });

  it('a changed NESTED value emits the full new snapshot', () => {
    const store = createStore<NestedSnap>({ channels: { news: true, chat: true }, chatPreview: true });
    const seen: NestedSnap[] = [];

    store.subscribe((v) => seen.push(v));
    const next: NestedSnap = { channels: { news: true, chat: false }, chatPreview: true };
    store.set(next);

    expect(seen).toEqual([
      { channels: { news: true, chat: true }, chatPreview: true },
      { channels: { news: true, chat: false }, chatPreview: true },
    ]);
    expect(store.get()).toBe(next); // the changed snapshot is adopted by reference
  });

  it('a nested record that gains a key is a change — it emits', () => {
    const store = createStore<NestedSnap>({ channels: { news: true }, chatPreview: true });
    const seen: NestedSnap[] = [];

    store.subscribe((v) => seen.push(v));
    store.set({ channels: { news: true, chat: true }, chatPreview: true });

    expect(seen).toEqual([
      { channels: { news: true }, chatPreview: true },
      { channels: { news: true, chat: true }, chatPreview: true },
    ]);
  });
});


describe('createStore listener isolation', () => {
  it('a throwing listener is isolated — the second listener still fires, in full', () => {
    const store = createStore<FlatSnap>({ status: 'idle', token: null });
    const throwerSeen: FlatSnap[] = [];
    const survivorSeen: FlatSnap[] = [];

    store.subscribe((v) => {
      throwerSeen.push(v);
      throw new Error('broken subscriber');
    });
    store.subscribe((v) => survivorSeen.push(v));

    store.set({ status: 'registered', token: 'tok-1' });

    // The immediate call AND the emission both survived the throw
    expect(survivorSeen).toEqual([
      { status: 'idle', token: null },
      { status: 'registered', token: 'tok-1' },
    ]);
    expect(throwerSeen).toEqual([
      { status: 'idle', token: null },
      { status: 'registered', token: 'tok-1' },
    ]);
  });

  it('the NEXT emission still delivers after a throw — the thrower stays subscribed too', () => {
    const store = createStore<FlatSnap>({ status: 'idle', token: null });
    const throwerSeen: FlatSnap[] = [];
    const survivorSeen: FlatSnap[] = [];

    store.subscribe((v) => {
      throwerSeen.push(v);
      throw new Error('always broken');
    });
    store.subscribe((v) => survivorSeen.push(v));

    store.set({ status: 'registered', token: 'tok-1' });
    store.set({ status: 'registered', token: 'tok-2' });

    expect(survivorSeen.length).toBe(3); // immediate + two emissions
    expect(throwerSeen.length).toBe(3);
    expect(survivorSeen[2]).toEqual({ status: 'registered', token: 'tok-2' });
  });

  it('the immediate subscribe call gets the same isolation — an unsubscribe still comes back', () => {
    const store = createStore<FlatSnap>({ status: 'idle', token: null });
    const laterSeen: FlatSnap[] = [];

    const unsubscribe = store.subscribe(() => {
      throw new Error('throws on the immediate call');
    });
    store.subscribe((v) => laterSeen.push(v));

    expect(typeof unsubscribe).toBe('function');
    unsubscribe(); // and it works — the thrower is gone before the next set
    store.set({ status: 'registered', token: 'tok-1' });

    expect(laterSeen).toEqual([
      { status: 'idle', token: null },
      { status: 'registered', token: 'tok-1' },
    ]);
  });
});


describe('createStore get()', () => {
  it('always returns the latest accepted snapshot, with no subscribers at all', () => {
    const store = createStore<FlatSnap>({ status: 'idle', token: null });
    expect(store.get()).toEqual({ status: 'idle', token: null });

    const second: FlatSnap = { status: 'requesting', token: null };
    store.set(second);
    expect(store.get()).toBe(second);

    const third: FlatSnap = { status: 'registered', token: 'tok-9' };
    store.set(third);
    expect(store.get()).toBe(third);

    // A deduped set changes nothing — the latest ACCEPTED value stands
    store.set({ status: 'registered', token: 'tok-9' });
    expect(store.get()).toBe(third);
  });
});
