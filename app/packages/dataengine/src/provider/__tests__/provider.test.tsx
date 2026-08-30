// -----------------------------------------------------------
//  [*] Tests — @knf/dataengine provider
//
//  A bare provider is fully functional on its memory defaults;
//  the restore bus fires exactly once per offline→online
//  transition (never on re-announced state), signalRestore
//  fans out, unsubscribes hold, unmount detaches from the
//  network source, and the hook refuses to run bare.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { manualNetwork, type NetworkSource } from '../../core/network';
import { DataEngineProvider, useDataEngine } from '..';


// A source that re-announces state without a transition — the
// provider, not the source, must dedupe those
const chattySource = (initial: boolean): NetworkSource & { push(online: boolean): void } => {
  const listeners = new Set<(online: boolean) => void>();
  let online = initial;
  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push(next) {
      online = next;
      listeners.forEach((fn) => fn(next));
    },
  };
};

describe('DataEngineProvider', () => {
  it('works bare: memory storage, permanently online, a live cache', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <DataEngineProvider>{children}</DataEngineProvider>;
    const h = await renderHook(() => useDataEngine(), { wrapper });


    expect(h.result.current.network.isOnline()).toBe(true);
    expect(h.result.current.cache.epoch()).toBe(0);


    await act(async () => {
      await h.result.current.cache.set('k', { n: 1 });
    });
    expect((await h.result.current.cache.get<{ n: number }>('k'))?.data).toEqual({ n: 1 });
    // The cache persists through the env's own storage instance
    expect(await h.result.current.storage.getItem('cache:k')).not.toBeNull();
    await h.unmount();
  });


  it('turns each offline→online transition into exactly one restore', async () => {
    const net = manualNetwork(true);
    const wrapper = ({ children }: { children: ReactNode }) => <DataEngineProvider network={net}>{children}</DataEngineProvider>;
    const h = await renderHook(() => useDataEngine(), { wrapper });


    let restores = 0;
    h.result.current.onRestore(() => {
      restores += 1;
    });


    // Mounting online is not a transition; going offline is not
    // a restore
    expect(restores).toBe(0);
    await act(async () => net.set(false));
    expect(restores).toBe(0);


    await act(async () => net.set(true));
    expect(restores).toBe(1);
    await act(async () => {
      net.set(false);
      net.set(true);
    });
    expect(restores).toBe(2);
    await h.unmount();
  });


  it('ignores a source that re-announces online while already online', async () => {
    const net = chattySource(true);
    const wrapper = ({ children }: { children: ReactNode }) => <DataEngineProvider network={net}>{children}</DataEngineProvider>;
    const h = await renderHook(() => useDataEngine(), { wrapper });


    let restores = 0;
    h.result.current.onRestore(() => {
      restores += 1;
    });


    await act(async () => {
      net.push(true);
      net.push(true);
    });
    expect(restores).toBe(0);


    await act(async () => {
      net.push(false);
      net.push(false);
      net.push(true);
    });
    expect(restores).toBe(1);
    await h.unmount();
  });


  it('restores when a subtree mounted offline comes online', async () => {
    const net = chattySource(false);
    const wrapper = ({ children }: { children: ReactNode }) => <DataEngineProvider network={net}>{children}</DataEngineProvider>;
    const h = await renderHook(() => useDataEngine(), { wrapper });


    let restores = 0;
    h.result.current.onRestore(() => {
      restores += 1;
    });


    await act(async () => net.push(true));
    expect(restores).toBe(1);
    await h.unmount();
  });


  it('signalRestore fans out to every listener and unsubscribes hold', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <DataEngineProvider>{children}</DataEngineProvider>;
    const h = await renderHook(() => useDataEngine(), { wrapper });


    let first = 0;
    let second = 0;
    const offFirst = h.result.current.onRestore(() => {
      first += 1;
    });
    h.result.current.onRestore(() => {
      second += 1;
    });


    h.result.current.signalRestore();
    expect(first).toBe(1);
    expect(second).toBe(1);


    offFirst();
    offFirst();
    h.result.current.signalRestore();
    expect(first).toBe(1);
    expect(second).toBe(2);
    await h.unmount();
  });


  it('detaches from the network source on unmount — no zombie restores', async () => {
    const net = manualNetwork(true);
    const wrapper = ({ children }: { children: ReactNode }) => <DataEngineProvider network={net}>{children}</DataEngineProvider>;
    const h = await renderHook(() => useDataEngine(), { wrapper });


    let restores = 0;
    h.result.current.onRestore(() => {
      restores += 1;
    });
    const env = h.result.current;
    await h.unmount();


    net.set(false);
    net.set(true);
    expect(restores).toBe(0);


    // The bus object outlives the tree, but only explicit
    // signals reach it now
    env.signalRestore();
    expect(restores).toBe(1);
  });
});




describe('useDataEngine', () => {
  it('throws a named error outside its provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useDataEngine())).rejects.toThrow(/DataEngineProvider/);
    spy.mockRestore();
  });
});
