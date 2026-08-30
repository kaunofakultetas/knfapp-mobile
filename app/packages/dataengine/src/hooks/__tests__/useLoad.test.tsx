// -----------------------------------------------------------
//  [*] Tests — @knf/dataengine useLoad
//
//  The behavior contract, bullet by bullet: spinner only on a
//  deps combination's first load; deps change clears data;
//  refresh() silent and data-keeping; out-of-order responses
//  dropped by sequence number; error only when a failure
//  leaves nothing to show; restore refetching silently behind
//  data and with a spinner over nothing. Fetches are gated on
//  hand-resolved promises so every in-flight state is
//  observable.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { manualNetwork } from '../../core/network';
import { DataEngineProvider } from '../../provider';
import { useLoad } from '../useLoad';


interface Gate<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function gate<T>(): Gate<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// One gate per fetch, in call order — tests settle them in any
// order to stage races
function gatedFetcher() {
  const gates: Gate<string>[] = [];
  const fetcher = jest.fn(() => {
    const g = gate<string>();
    gates.push(g);
    return g.promise;
  });
  return { gates, fetcher };
}

const wrapperFor = (net: ReturnType<typeof manualNetwork>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <DataEngineProvider network={net}>{children}</DataEngineProvider>;
  };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });


describe('useLoad', () => {
  it('spins only for the first load; refresh is silent and keeps data visible', async () => {
    const net = manualNetwork(true);
    const { gates, fetcher } = gatedFetcher();
    const h = await renderHook(() => useLoad(fetcher, []), { wrapper: wrapperFor(net) });


    // Mount: first load in flight — spinner, nothing shown
    expect(h.result.current.loading).toBe(true);
    expect(h.result.current.data).toBeNull();
    expect(h.result.current.error).toBe(false);

    await act(async () => {
      gates[0].resolve('one');
    });
    await flush();
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.data).toBe('one');


    // refresh(): a second fetch runs, but no spinner and the
    // current data stays on screen the whole time
    await act(async () => {
      void h.result.current.refresh();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.data).toBe('one');

    await act(async () => {
      gates[1].resolve('two');
    });
    await flush();
    expect(h.result.current.data).toBe('two');
    expect(h.result.current.loading).toBe(false);

    await h.unmount();
  });


  it('deps change clears data, spins again, and the overtaken response never lands', async () => {
    const net = manualNetwork(true);
    const gates = new Map<string, Gate<string>>();
    const fetchFor = (id: string) => {
      const g = gate<string>();
      gates.set(id, g);
      return g.promise;
    };
    const h = await renderHook(({ id }: { id: string }) => useLoad(() => fetchFor(id), [id]), {
      wrapper: wrapperFor(net),
      initialProps: { id: 'a' },
    });


    // Deps change while 'a' is still in flight: the screen
    // clears immediately and spins for 'b'
    await h.rerender({ id: 'b' });
    expect(h.result.current.data).toBeNull();
    expect(h.result.current.loading).toBe(true);

    await act(async () => {
      gates.get('b')!.resolve('Beta');
    });
    await flush();
    expect(h.result.current.data).toBe('Beta');
    expect(h.result.current.loading).toBe(false);


    // The stale 'a' answer arrives last — dropped by its
    // sequence number, 'Beta' stays
    await act(async () => {
      gates.get('a')!.resolve('Alpha');
    });
    await flush();
    expect(h.result.current.data).toBe('Beta');
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.error).toBe(false);


    // A completed entity is cleared the same way on the next
    // deps change — the previous one never flashes
    await h.rerender({ id: 'c' });
    expect(h.result.current.data).toBeNull();
    expect(h.result.current.loading).toBe(true);

    await act(async () => {
      gates.get('c')!.resolve('Gamma');
    });
    await flush();
    expect(h.result.current.data).toBe('Gamma');

    await h.unmount();
  });


  it('two overlapping refreshes resolved in reverse: only the newest response wins', async () => {
    const net = manualNetwork(true);
    const { gates, fetcher } = gatedFetcher();
    const h = await renderHook(() => useLoad(fetcher, []), { wrapper: wrapperFor(net) });

    await act(async () => {
      gates[0].resolve('v1');
    });
    await flush();
    expect(h.result.current.data).toBe('v1');


    await act(async () => {
      void h.result.current.refresh();
      void h.result.current.refresh();
    });
    expect(fetcher).toHaveBeenCalledTimes(3);


    // Newest first: it lands…
    await act(async () => {
      gates[2].resolve('v3');
    });
    await flush();
    expect(h.result.current.data).toBe('v3');


    // …then the superseded one, which must be dropped
    await act(async () => {
      gates[1].resolve('v2');
    });
    await flush();
    expect(h.result.current.data).toBe('v3');
    expect(h.result.current.loading).toBe(false);

    await h.unmount();
  });


  it('error only when a failure leaves nothing to show; retry spins, a failed refresh keeps data', async () => {
    const net = manualNetwork(true);
    const { gates, fetcher } = gatedFetcher();
    const h = await renderHook(() => useLoad(fetcher, []), { wrapper: wrapperFor(net) });


    // First load fails with nothing shown → ErrorState
    await act(async () => {
      gates[0].reject(new Error('down'));
    });
    await flush();
    expect(h.result.current.error).toBe(true);
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.data).toBeNull();


    // retry(): a full reload — spinner back, error cleared
    await act(async () => {
      h.result.current.retry();
    });
    expect(h.result.current.loading).toBe(true);
    expect(h.result.current.error).toBe(false);

    await act(async () => {
      gates[1].resolve('v1');
    });
    await flush();
    expect(h.result.current.data).toBe('v1');
    expect(h.result.current.error).toBe(false);


    // A failed silent refresh keeps the data on screen instead
    // of swapping it for an error
    await act(async () => {
      void h.result.current.refresh();
    });
    await act(async () => {
      gates[2].reject(new Error('down'));
    });
    await flush();
    expect(h.result.current.data).toBe('v1');
    expect(h.result.current.error).toBe(false);
    expect(h.result.current.loading).toBe(false);

    await h.unmount();
  });


  it('a silent refresh failing during the pending first load never flags an error', async () => {
    const net = manualNetwork(true);
    const { gates, fetcher } = gatedFetcher();
    const h = await renderHook(() => useLoad(fetcher, []), { wrapper: wrapperFor(net) });


    // First (spinner) load still in flight when a refresh
    // starts and fails fast — no error may surface
    await act(async () => {
      void h.result.current.refresh();
    });
    await act(async () => {
      gates[1].reject(new Error('down'));
    });
    await flush();
    expect(h.result.current.error).toBe(false);


    // The slow first answer was superseded by the refresh —
    // dropped, still no error
    await act(async () => {
      gates[0].resolve('v1');
    });
    await flush();
    expect(h.result.current.data).toBeNull();
    expect(h.result.current.error).toBe(false);

    await h.unmount();
  });


  it('restore refetches silently behind shown data', async () => {
    const net = manualNetwork(true);
    const { gates, fetcher } = gatedFetcher();
    const h = await renderHook(() => useLoad(fetcher, []), { wrapper: wrapperFor(net) });

    await act(async () => {
      gates[0].resolve('v1');
    });
    await flush();
    expect(h.result.current.data).toBe('v1');


    // Outage and back: a refetch starts, but the shown data
    // stays and no spinner appears
    await act(async () => {
      net.set(false);
      net.set(true);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.data).toBe('v1');

    await act(async () => {
      gates[1].resolve('v2');
    });
    await flush();
    expect(h.result.current.data).toBe('v2');

    await h.unmount();
  });


  it('restore over nothing runs a full spinner load', async () => {
    const net = manualNetwork(true);
    const { gates, fetcher } = gatedFetcher();
    const h = await renderHook(() => useLoad(fetcher, []), { wrapper: wrapperFor(net) });


    // The outage killed the first load — nothing to show
    await act(async () => {
      gates[0].reject(new Error('offline'));
    });
    await flush();
    expect(h.result.current.error).toBe(true);
    expect(h.result.current.data).toBeNull();


    // Connectivity returns: full spinner, error cleared
    await act(async () => {
      net.set(false);
      net.set(true);
    });
    expect(h.result.current.loading).toBe(true);
    expect(h.result.current.error).toBe(false);

    await act(async () => {
      gates[1].resolve('fresh');
    });
    await flush();
    expect(h.result.current.data).toBe('fresh');
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.error).toBe(false);

    await h.unmount();
  });
});
