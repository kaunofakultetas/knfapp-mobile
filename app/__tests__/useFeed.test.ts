// -----------------------------------------------------------
//  [*] Tests — hooks/useFeed
//
//  Pagination, the offline cache fallback and the "error only
//  when nothing to show" rule every list screen builds on.
// -----------------------------------------------------------

// The restore callback is captured so tests can simulate
// connectivity returning
const mockRestore: { trigger: () => void } = { trigger: () => {} };
jest.mock('@/hooks/useNetworkRestore', () => ({
  useNetworkRestore: (callback: () => void) => {
    mockRestore.trigger = callback;
  },
}));

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock('@/services/cache', () => ({ cacheGet: (...a: unknown[]) => mockCacheGet(...a), cacheSet: (...a: unknown[]) => mockCacheSet(...a) }));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useFeed } from '@/hooks/useFeed';


// Deferred fetchPage: every call parks its resolvers so tests
// can land responses out of order, the way real races do
type Page = { items: unknown[]; hasMore: boolean };
function deferredFetch() {
  const calls: { page: number; resolve: (page: Page) => void; reject: (err: unknown) => void }[] = [];
  const fetchPage = jest.fn(
    (page: number) => new Promise<Page>((resolve, reject) => calls.push({ page, resolve, reject })),
  );
  return { calls, fetchPage };
}


describe('useFeed', () => {
  beforeEach(() => {
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockCacheGet.mockResolvedValue(null);
  });

  it('loads the first page and appends on loadMore', async () => {
    const fetchPage = jest.fn(async (page: number) => ({ items: [page * 10, page * 10 + 1], hasMore: page < 2 }));
    const { result } = await renderHook(() => useFeed(fetchPage));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([10, 11]);
    expect(result.current.error).toBe(false);

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.items).toEqual([10, 11, 20, 21]));
    // Second arg is the AbortSignal useFeed hands every fetchPage
    expect(fetchPage).toHaveBeenLastCalledWith(2, expect.anything());
  });

  it('reports an error only when nothing can be shown', async () => {
    const fetchPage = jest.fn().mockRejectedValue(new Error('down'));
    const { result } = await renderHook(() => useFeed(fetchPage));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it('falls back to the cached first page when offline', async () => {
    mockCacheGet.mockResolvedValue({ data: ['cached'], cachedAt: 123 });
    const fetchPage = jest.fn().mockRejectedValue(new Error('down'));
    const { result } = await renderHook(() => useFeed(fetchPage, { cacheKey: 'k' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual(['cached']);
    expect(result.current.cachedAt).toBe(123);
    expect(result.current.error).toBe(false);
  });

  it('writes the first page to the cache on success', async () => {
    const fetchPage = jest.fn(async () => ({ items: ['live'], hasMore: false }));
    const { result } = await renderHook(() => useFeed(fetchPage, { cacheKey: 'k' }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockCacheSet).toHaveBeenCalledWith('k', ['live']);
  });

  it('refetches page 1 silently when connectivity returns over shown items', async () => {
    const fetchPage = jest.fn(async () => ({ items: ['live'], hasMore: false }));
    const { result } = await renderHook(() => useFeed(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      mockRestore.trigger();
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage).toHaveBeenLastCalledWith(1, expect.anything());
    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual(['live']);
  });

  it('recovers with a full reload when connectivity returns over an error state', async () => {
    const fetchPage = jest.fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ items: ['back'], hasMore: false });
    const { result } = await renderHook(() => useFeed(fetchPage));
    await waitFor(() => expect(result.current.error).toBe(true));

    await act(async () => {
      mockRestore.trigger();
    });
    await waitFor(() => expect(result.current.items).toEqual(['back']));
    expect(result.current.error).toBe(false);
  });

  it('drops a load-more superseded by a deps change and paginates freshly after', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { result, rerender } = await renderHook(
      ({ dep }: { dep: number }) => useFeed(fetchPage, { deps: [dep] }),
      { initialProps: { dep: 1 } },
    );

    calls[0].resolve({ items: ['a1'], hasMore: true });
    await waitFor(() => expect(result.current.items).toEqual(['a1']));

    await act(async () => {
      result.current.loadMore();
    });
    expect(result.current.loadingMore).toBe(true);
    expect(calls[1].page).toBe(2);

    // The deps change starts a fresh page-1 load that supersedes
    // the page 2 still in flight
    await rerender({ dep: 2 });
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2].page).toBe(1);

    // The stale page-2 answer is dropped but must unlock pagination
    await act(async () => {
      calls[1].resolve({ items: ['stale'], hasMore: true });
    });
    expect(result.current.loadingMore).toBe(false);

    await act(async () => {
      calls[2].resolve({ items: ['b1'], hasMore: true });
    });
    await waitFor(() => expect(result.current.items).toEqual(['b1']));

    await act(async () => {
      result.current.loadMore();
    });
    expect(calls[3].page).toBe(2);
    await act(async () => {
      calls[3].resolve({ items: ['b2'], hasMore: false });
    });
    expect(result.current.items).toEqual(['b1', 'b2']);
  });

  it('lets a refresh supersede an in-flight load-more, never the reverse', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { result } = await renderHook(() => useFeed(fetchPage));

    calls[0].resolve({ items: ['a1'], hasMore: true });
    await waitFor(() => expect(result.current.items).toEqual(['a1']));

    await act(async () => {
      result.current.loadMore();       // page 2 in flight...
      void result.current.refresh();   // ...and page 1 refreshes behind it
    });
    expect(calls[1].page).toBe(2);
    expect(calls[2].page).toBe(1);

    await act(async () => {
      calls[2].resolve({ items: ['r1'], hasMore: true });
    });
    await waitFor(() => expect(result.current.items).toEqual(['r1']));

    // The superseded page-2 answer never lands on the fresh list
    await act(async () => {
      calls[1].resolve({ items: ['stale'], hasMore: true });
    });
    expect(result.current.items).toEqual(['r1']);
    expect(result.current.loadingMore).toBe(false);

    await act(async () => {
      result.current.loadMore();
    });
    expect(calls[3].page).toBe(2);
  });
  it("refresh('merge') keeps the pages behind page 1 and folds the fresh page in", async () => {
    const row = (id: string, likes = 0) => ({ id, likes });
    const pages: Record<number, { items: { id: string; likes: number }[]; hasMore: boolean }> = {
      1: { items: [row('a'), row('b'), row('c')], hasMore: true },
      2: { items: [row('d'), row('e')], hasMore: false },
    };
    const fetchPage = jest.fn(async (page: number) => pages[page]);
    const { result } = await renderHook(() => useFeed(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.items.length).toBe(5));

    // Page 1 moved on while the reader was away: a new post on
    // top, 'a' picked up likes, 'b' was deleted
    pages[1] = { items: [row('n'), row('a', 5), row('c')], hasMore: true };
    await act(async () => {
      await result.current.refresh('merge');
    });

    // Prepended, updated in place, the deleted row dropped, and
    // page 2 untouched behind it — nothing shrank, nothing moved
    expect(result.current.items.map((item) => item.id)).toEqual(['n', 'a', 'c', 'd', 'e']);
    expect(result.current.items[1]).toEqual(row('a', 5));

    // The paging cursor was not reset: page 2 had said "the end",
    // so loadMore stays a no-op instead of re-fetching page 2
    const calls = fetchPage.mock.calls.length;
    await act(async () => {
      result.current.loadMore();
    });
    expect(fetchPage.mock.calls.length).toBe(calls);
  });

  it('a plain refresh() still replaces the list with page 1', async () => {
    const row = (id: string) => ({ id });
    const pages: Record<number, { items: { id: string }[]; hasMore: boolean }> = {
      1: { items: [row('a'), row('b')], hasMore: true },
      2: { items: [row('c'), row('d')], hasMore: false },
    };
    const fetchPage = jest.fn(async (page: number) => pages[page]);
    const { result } = await renderHook(() => useFeed(fetchPage));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.items.length).toBe(4));

    pages[1] = { items: [row('n'), row('a')], hasMore: true };
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.items.map((item) => item.id)).toEqual(['n', 'a']);
  });
});
