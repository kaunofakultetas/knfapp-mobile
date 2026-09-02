// -----------------------------------------------------------
//  [*] Tests — useStoreValue: one store into one React state
//
//  A hand-rolled stub store (get + subscribe that fires the
//  listener immediately with the current value — the engine
//  store contract the hook's banner leans on) proves the full
//  lifecycle: first-render value, live emission, unmount
//  unsubscribe, and re-subscription when the host swaps the
//  store instance.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';

import type { PermissionLike, StoreLike } from '../../core/types';
import { useStoreValue } from '../useStoreValue';


// -----------------------------------------------------------
// Stub store
//
// Satisfies StoreLike<T> structurally and exposes the two
// levers the scenarios need: emit() to push a new value and
// listenerCount to prove subscription bookkeeping exactly.
// -----------------------------------------------------------

interface StubStore<T> extends StoreLike<T> {
  emit(next: T): void;
  readonly listenerCount: number;
}

function createStubStore<T>(initial: T): StubStore<T> {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(value); // engine stores fire immediately on subscribe
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (next) => {
      value = next;
      for (const listener of [...listeners]) listener(next);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

const granted: PermissionLike = { status: 'granted', canAskAgain: true, canDeliver: true };
const deniedForever: PermissionLike = { status: 'denied', canAskAgain: false, canDeliver: false };
const provisional: PermissionLike = { status: 'provisional', canAskAgain: true, canDeliver: true };


describe('useStoreValue', () => {
  it('returns the store\'s current value on first render', async () => {
    const store = createStubStore<PermissionLike>(granted);
    const { result } = await renderHook(() => useStoreValue(store));

    expect(result.current).toEqual({ status: 'granted', canAskAgain: true, canDeliver: true });
    // Exactly one live subscription backs the hook
    expect(store.listenerCount).toBe(1);
  });

  it('a store emission updates the hook value', async () => {
    const store = createStubStore<PermissionLike>(granted);
    const { result } = await renderHook(() => useStoreValue(store));

    await act(async () => {
      store.emit(deniedForever);
    });

    expect(result.current).toEqual({ status: 'denied', canAskAgain: false, canDeliver: false });
    expect(store.listenerCount).toBe(1); // still the same single subscription
  });

  it('unmount unsubscribes — a later emission reaches nobody and moves nothing', async () => {
    const store = createStubStore<PermissionLike>(granted);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = await renderHook(() => useStoreValue(store));
    expect(store.listenerCount).toBe(1);

    await unmount();
    expect(store.listenerCount).toBe(0); // the cleanup ran

    // Emitting into the void: no listener, no state write, no warning
    store.emit(deniedForever);
    expect(result.current).toEqual({ status: 'granted', canAskAgain: true, canDeliver: true });
    expect(errorSpy).toHaveBeenCalledTimes(0);

    errorSpy.mockRestore();
  });

  it('swapping the store prop re-subscribes and reflects the NEW store\'s value', async () => {
    const first = createStubStore<PermissionLike>(granted);
    const second = createStubStore<PermissionLike>(deniedForever);

    const { result, rerender } = await renderHook(
      ({ store }: { store: StoreLike<PermissionLike> }) => useStoreValue(store),
      { initialProps: { store: first as StoreLike<PermissionLike> } },
    );
    expect(result.current).toEqual({ status: 'granted', canAskAgain: true, canDeliver: true });

    await rerender({ store: second });

    // The old subscription is gone, the new one is live, and the
    // immediate-fire on subscribe pulled the new store's value in
    expect(first.listenerCount).toBe(0);
    expect(second.listenerCount).toBe(1);
    expect(result.current).toEqual({ status: 'denied', canAskAgain: false, canDeliver: false });

    // Emissions now route ONLY through the new store
    await act(async () => {
      first.emit(provisional);
    });
    expect(result.current).toEqual({ status: 'denied', canAskAgain: false, canDeliver: false });

    await act(async () => {
      second.emit(provisional);
    });
    expect(result.current).toEqual({ status: 'provisional', canAskAgain: true, canDeliver: true });
  });
});

describe('useStoreValue with a change-only store', () => {
  it('still starts current — the explicit re-read covers a store that never fires on subscribe', async () => {
    // A structurally valid store that does NOT invoke the
    // listener immediately — only on future changes
    let value = 'later-truth';
    const listeners = new Set<(v: string) => void>();
    const changeOnly = {
      get: () => value,
      subscribe: (listener: (v: string) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    type ChangeOnlyStore = { get(): string; subscribe(listener: (v: string) => void): () => void };
    const { result, rerender } = await renderHook<string, { store: ChangeOnlyStore }>(
      ({ store }) => useStoreValue(store),
      { initialProps: { store: changeOnly } },
    );
    expect(result.current).toBe('later-truth');

    // Swapping to ANOTHER change-only store also lands on its
    // current value without waiting for an emission
    let other = 'other-truth';
    const otherStore = {
      get: () => other,
      subscribe: (listener: (v: string) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    await rerender({ store: otherStore });
    expect(result.current).toBe('other-truth');
    other = 'unused';
    value = 'unused';
  });
});
