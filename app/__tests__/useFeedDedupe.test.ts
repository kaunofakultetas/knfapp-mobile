// -----------------------------------------------------------
//  [*] Tests — useFeed load-more dedupe
//
//  The backend pages a live-ranked list by LIMIT/OFFSET, so a
//  row can cross the page boundary between two requests. The
//  merge must drop rows the list already holds — duplicate
//  React keys crashed row recycling before — while custom
//  identities and id-less rows keep working.
// -----------------------------------------------------------

jest.mock('@/hooks/useNetworkRestore', () => ({
  useNetworkRestore: () => {},
}));

const mockCacheGet = jest.fn();
jest.mock('@/services/cache', () => ({
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: jest.fn(),
  cacheEpoch: 0,
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useFeed } from '@/hooks/useFeed';


type Row = { id: string; title?: string };
type Page = { items: Row[]; hasMore: boolean };

function deferredFetch() {
  const calls: { page: number; resolve: (page: Page) => void }[] = [];
  const fetchPage = jest.fn(
    (page: number) => new Promise<Page>((resolve) => calls.push({ page, resolve })),
  );
  return { calls, fetchPage };
}

const ids = (rows: readonly Row[]) => rows.map((r) => r.id);


beforeEach(() => {
  mockCacheGet.mockReset().mockResolvedValue(null);
});


describe('useFeed load-more dedupe', () => {
  it('drops rows the boundary shift re-sent', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { result } = await renderHook(() => useFeed<Row>(fetchPage));

    await act(async () => {
      calls[0].resolve({ items: [{ id: 'a' }, { id: 'b' }], hasMore: true });
    });
    await waitFor(() => expect(ids(result.current.items)).toEqual(['a', 'b']));

    await act(async () => {
      result.current.loadMore();
    });
    // A like moved 'b' down the ranking — page 2 re-sends it
    await act(async () => {
      calls[1].resolve({ items: [{ id: 'b' }, { id: 'c' }], hasMore: true });
    });
    expect(ids(result.current.items)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the FIRST copy when a page duplicates a row wholesale', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { result } = await renderHook(() => useFeed<Row>(fetchPage));

    await act(async () => {
      calls[0].resolve({ items: [{ id: 'a', title: 'original' }], hasMore: true });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      result.current.loadMore();
    });
    await act(async () => {
      calls[1].resolve({ items: [{ id: 'a', title: 'reranked copy' }, { id: 'b' }], hasMore: false });
    });
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    expect(result.current.items[0].title).toBe('original');
  });

  it('honours a custom getId identity', async () => {
    type Keyed = { key: string; id?: string };
    const calls: { resolve: (page: { items: Keyed[]; hasMore: boolean }) => void }[] = [];
    const fetchPage = jest.fn(
      () =>
        new Promise<{ items: Keyed[]; hasMore: boolean }>((resolve) => calls.push({ resolve })),
    );
    const { result } = await renderHook(() =>
      useFeed<Keyed>(fetchPage, { getId: (item) => item.key }),
    );

    await act(async () => {
      calls[0].resolve({ items: [{ key: 'k1' }], hasMore: true });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      result.current.loadMore();
    });
    await act(async () => {
      calls[1].resolve({ items: [{ key: 'k1' }, { key: 'k2' }], hasMore: false });
    });
    expect(result.current.items.map((i) => i.key)).toEqual(['k1', 'k2']);
  });

  it('still appends id-less rows rather than dropping them', async () => {
    type Loose = { id?: string };
    const calls: { resolve: (page: { items: Loose[]; hasMore: boolean }) => void }[] = [];
    const fetchPage = jest.fn(
      () =>
        new Promise<{ items: Loose[]; hasMore: boolean }>((resolve) => calls.push({ resolve })),
    );
    const { result } = await renderHook(() => useFeed<Loose>(fetchPage));

    await act(async () => {
      calls[0].resolve({ items: [{}], hasMore: true });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      result.current.loadMore();
    });
    await act(async () => {
      calls[1].resolve({ items: [{}, {}], hasMore: false });
    });
    expect(result.current.items).toHaveLength(3);
  });

  it('dedupes against a prepended optimistic row', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { result } = await renderHook(() => useFeed<Row>(fetchPage));

    await act(async () => {
      calls[0].resolve({ items: [{ id: 'a' }], hasMore: true });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // The comment-send path prepends the confirmed row itself
    await act(async () => {
      result.current.setItems((prev) => [{ id: 'mine' }, ...prev]);
    });

    await act(async () => {
      result.current.loadMore();
    });
    // The next OFFSET window re-sends the prepended row
    await act(async () => {
      calls[1].resolve({ items: [{ id: 'mine' }, { id: 'b' }], hasMore: false });
    });
    expect(ids(result.current.items)).toEqual(['mine', 'a', 'b']);
  });
});
