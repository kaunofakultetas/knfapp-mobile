// -----------------------------------------------------------
//  [*] Tests — hooks/useLoad
//
//  The single-resource loader's supersede rules: only the
//  newest request may write, a failed silent refresh keeps
//  the data on screen, error means "nothing to show", and a
//  network restore refetches behind shown data.
// -----------------------------------------------------------

// The restore callback is captured so tests can simulate
// connectivity returning
const mockRestore: { trigger: () => void } = { trigger: () => {} };
jest.mock('@/hooks/useNetworkRestore', () => ({
  useNetworkRestore: (callback: () => void) => {
    mockRestore.trigger = callback;
  },
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useLoad } from '@/hooks/useLoad';


// Deferred fetcher: every call parks its resolvers so tests
// can land responses out of order, the way real races do
function deferredFetch() {
  const calls: { resolve: (value: string) => void; reject: (err: unknown) => void }[] = [];
  const fetcher = jest.fn(
    () => new Promise<string>((resolve, reject) => calls.push({ resolve, reject })),
  );
  return { calls, fetcher };
}


describe('useLoad', () => {

  it('loads and serves the data with the spinner only while pending', async () => {
    const { calls, fetcher } = deferredFetch();
    const { result } = await renderHook(() => useLoad(fetcher, []));

    expect(result.current.loading).toBe(true);
    await act(async () => {
      calls[0].resolve('v1');
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('v1');
    expect(result.current.error).toBe(false);
  });

  it('drops a superseded response after a deps change', async () => {
    const { calls, fetcher } = deferredFetch();
    const { result, rerender } = await renderHook(
      ({ dep }: { dep: string }) => useLoad(fetcher, [dep]),
      { initialProps: { dep: 'A' } },
    );

    await rerender({ dep: 'B' });
    await waitFor(() => expect(calls).toHaveLength(2));

    await act(async () => {
      calls[1].resolve('fresh');
    });
    await waitFor(() => expect(result.current.data).toBe('fresh'));

    // The stale answer from the old deps lands late and is dropped
    await act(async () => {
      calls[0].resolve('stale');
    });
    expect(result.current.data).toBe('fresh');
  });

  it('keeps shown data through a failed silent refresh', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce('v1')
      .mockRejectedValueOnce(new Error('down'));
    const { result } = await renderHook(() => useLoad(fetcher, []));
    await waitFor(() => expect(result.current.data).toBe('v1'));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.data).toBe('v1');
    expect(result.current.error).toBe(false);
  });

  it('errors only over nothing and retries with the spinner', async () => {
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce('v2');
    const { result } = await renderHook(() => useLoad(fetcher, []));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();

    await act(async () => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.data).toBe('v2'));
    expect(result.current.error).toBe(false);
  });

  it('refetches silently when connectivity returns over shown data', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');
    const { result } = await renderHook(() => useLoad(fetcher, []));
    await waitFor(() => expect(result.current.data).toBe('v1'));

    await act(async () => {
      mockRestore.trigger();
    });
    await waitFor(() => expect(result.current.data).toBe('v2'));
    expect(result.current.loading).toBe(false);
  });

});
