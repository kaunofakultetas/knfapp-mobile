// -----------------------------------------------------------
//  [*] Tests — hooks/useFeed
//
//  Pagination, the offline cache fallback and the "error only
//  when nothing to show" rule every list screen builds on.
// -----------------------------------------------------------

jest.mock('@/hooks/useNetworkRestore', () => ({ useNetworkRestore: () => {} }));

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock('@/services/cache', () => ({ cacheGet: (...a: unknown[]) => mockCacheGet(...a), cacheSet: (...a: unknown[]) => mockCacheSet(...a) }));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useFeed } from '@/hooks/useFeed';


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
    expect(fetchPage).toHaveBeenLastCalledWith(2);
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
});
