// -----------------------------------------------------------
//  [*] Tests — useNetworkRestore
//
//  The latest-closure guarantee: the long-lived subscription
//  always runs the CURRENT callback (a stale closure here made
//  feeds refresh with dead state), subscribes once, and
//  detaches on unmount.
// -----------------------------------------------------------

const mockRestore: {
  listeners: (() => void)[];
  unsubscribe: jest.Mock;
  subscribe: jest.Mock;
} = {
  listeners: [],
  unsubscribe: jest.fn(),
  subscribe: jest.fn(),
};
// Identity-stable like the real NetworkContext (it memoizes
// onNetworkRestore) — an unstable one would resubscribe per
// render and hide the once-per-mount guarantee
const mockOnNetworkRestore = (cb: () => void) => {
  mockRestore.subscribe();
  mockRestore.listeners.push(cb);
  return mockRestore.unsubscribe;
};
jest.mock('@/context/NetworkContext', () => ({
  useNetwork: () => ({ onNetworkRestore: mockOnNetworkRestore }),
}));

import { act, renderHook } from '@testing-library/react-native';

import { useNetworkRestore } from '@/hooks/useNetworkRestore';


const fireRestore = () => mockRestore.listeners.forEach((cb) => cb());


beforeEach(() => {
  mockRestore.listeners = [];
  mockRestore.unsubscribe.mockClear();
  mockRestore.subscribe.mockClear();
});


describe('useNetworkRestore', () => {
  it('runs the callback when connectivity returns', async () => {
    const callback = jest.fn();
    await renderHook(() => useNetworkRestore(callback));

    await act(async () => {
      fireRestore();
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('always runs the LATEST callback, not the mount-time closure', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await renderHook(({ cb }: { cb: () => void }) => useNetworkRestore(cb), {
      initialProps: { cb: first },
    });

    await rerender({ cb: second });
    await act(async () => {
      fireRestore();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('subscribes once per mount and detaches on unmount', async () => {
    const { rerender, unmount } = await renderHook(
      ({ cb }: { cb: () => void }) => useNetworkRestore(cb),
      { initialProps: { cb: jest.fn() as () => void } },
    );

    await rerender({ cb: jest.fn() });
    await rerender({ cb: jest.fn() });
    expect(mockRestore.subscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      unmount();
    });
    expect(mockRestore.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
