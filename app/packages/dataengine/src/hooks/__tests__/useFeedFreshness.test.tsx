// -----------------------------------------------------------
//  [*] Tests — the new-posts probe
//
//  Counting ids-ahead-of-baseline: deletions and re-rankings
//  never inflate the pill, a landed refresh zeroes it, a
//  vanished baseline counts the whole peeked window, failures
//  stay silent, and the interval only probes a foregrounded
//  app.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';

import { useFeedFreshness } from '../useFeedFreshness';


const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
};


describe('useFeedFreshness', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts only the ids AHEAD of the baseline — deletions never inflate the pill', async () => {
    let served = ['c', 'b', 'a'];
    const peek = jest.fn(async () => served);
    const h = await renderHook(() => useFeedFreshness('c', peek, { intervalMs: 1000 }));

    await tick(1000);
    expect(h.result.current.newCount).toBe(0);

    // Two new posts land ahead; one OLD post was deleted — the
    // count is exactly the two ahead, nothing else
    served = ['e', 'd', 'c', 'a'];
    await tick(1000);
    expect(h.result.current.newCount).toBe(2);
  });

  it('a baseline missing from the window counts the whole peeked window', async () => {
    const peek = jest.fn(async () => ['z', 'y', 'x']);
    const h = await renderHook(() => useFeedFreshness('long-gone', peek, { intervalMs: 1000 }));
    await tick(1000);
    expect(h.result.current.newCount).toBe(3);
  });

  it('a landed refresh (baseline change) zeroes the count; clear() does too', async () => {
    let served = ['e', 'd', 'c'];
    const peek = jest.fn(async () => served);
    const h = await renderHook(({ newest }: { newest: string }) => useFeedFreshness(newest, peek, { intervalMs: 1000 }), {
      initialProps: { newest: 'c' },
    });
    await tick(1000);
    expect(h.result.current.newCount).toBe(2);

    await h.rerender({ newest: 'e' });
    expect(h.result.current.newCount).toBe(0);

    served = ['f', 'e', 'd', 'c'];
    await tick(1000);
    expect(h.result.current.newCount).toBe(1);
    await act(async () => h.result.current.clear());
    expect(h.result.current.newCount).toBe(0);
  });

  it('a failing peek stays silent and the previous count stands', async () => {
    let fail = false;
    const peek = jest.fn(async () => {
      if (fail) throw new Error('down');
      return ['d', 'c'];
    });
    const h = await renderHook(() => useFeedFreshness('c', peek, { intervalMs: 1000 }));
    await tick(1000);
    expect(h.result.current.newCount).toBe(1);

    fail = true;
    await tick(1000);
    expect(h.result.current.newCount).toBe(1);
  });

  it('enabled: false probes nothing; unmount stops the interval', async () => {
    const peek = jest.fn(async () => ['a']);
    const off = await renderHook(() => useFeedFreshness('a', peek, { intervalMs: 1000, enabled: false }));
    await tick(3000);
    expect(peek).not.toHaveBeenCalled();
    await off.unmount();

    const on = await renderHook(() => useFeedFreshness('a', peek, { intervalMs: 1000 }));
    await tick(1000);
    expect(peek).toHaveBeenCalledTimes(1);
    await on.unmount();
    await tick(5000);
    expect(peek).toHaveBeenCalledTimes(1);
  });
});
