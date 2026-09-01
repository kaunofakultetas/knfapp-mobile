// -----------------------------------------------------------
//  [*] Tests — useNow: the half-minute clock
//
//  Monday-first day mapping and the tick, on fake timers.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';

import { useNow } from '../useNow';

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads the clock as Monday-first day + minutes', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:30:00Z')); // a Monday, TZ=UTC
    const { result } = await renderHook(() => useNow());
    expect(result.current).toEqual({ day: 0, minutes: 630 });
  });

  it('Sunday maps to 6, never 0', async () => {
    jest.setSystemTime(new Date('2026-03-29T08:00:00Z'));
    const { result } = await renderHook(() => useNow());
    expect(result.current).toEqual({ day: 6, minutes: 480 });
  });

  it('ticks on the interval and stops on unmount', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:30:00Z'));
    const { result, unmount } = await renderHook(() => useNow({ intervalMs: 30_000 }));

    await act(async () => {
      jest.setSystemTime(new Date('2026-03-23T10:31:05Z'));
      jest.advanceTimersByTime(30_000);
    });
    expect(result.current.minutes).toBe(631);

    await unmount();
    // The interval is gone: the clock moves on, the hook does not
    jest.setSystemTime(new Date('2026-03-23T11:00:00Z'));
    jest.advanceTimersByTime(120_000);
    expect(result.current.minutes).toBe(631);
  });

  it('enabled: false runs NO interval — the host brought its own clock', async () => {
    jest.setSystemTime(new Date('2026-03-23T10:30:00Z'));
    const { result } = await renderHook(() => useNow({ intervalMs: 30_000, enabled: false }));
    await act(async () => {
      jest.setSystemTime(new Date('2026-03-23T11:15:00Z'));
      jest.advanceTimersByTime(300_000);
    });
    expect(result.current.minutes).toBe(630);
  });

  it('a tick inside the same minute keeps the SAME state object — nothing re-renders', async () => {
    // advanceTimersByTime moves the mocked clock too: 10:30:01
    // +30s is still minute 630, +60s crosses into 631
    jest.setSystemTime(new Date('2026-03-23T10:30:01Z'));
    const { result } = await renderHook(() => useNow({ intervalMs: 30_000 }));
    const before = result.current;
    await act(async () => {
      jest.advanceTimersByTime(30_000); // 10:30:31 — same displayed minute
    });
    expect(result.current).toBe(before);
    await act(async () => {
      jest.advanceTimersByTime(30_000); // 10:31:01 — the minute turned
    });
    expect(result.current).not.toBe(before);
    expect(result.current.minutes).toBe(631);
  });
});
