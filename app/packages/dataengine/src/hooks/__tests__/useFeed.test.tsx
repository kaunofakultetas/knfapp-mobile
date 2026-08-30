// -----------------------------------------------------------
//  [*] Tests — @knf/dataengine useFeed
//
//  The deepest suite in the package: the page-1 pipeline, the
//  load-more dedupe and hasMore gate, replace vs merge refresh
//  (the reader-keeps-place semantics precisely), the offline
//  fallback, the wipe fence on the deferred cache write, the
//  mutation fence against stale silent refreshes, and the
//  abort-on-supersede transport contract.
// -----------------------------------------------------------

import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createCache } from '../../core/cache';
import { manualNetwork } from '../../core/network';
import { memoryStorage } from '../../core/storage';
import { DataEngineProvider, useDataEngine } from '../../provider';
import { useFeed, type FeedPage } from '../useFeed';


type Row = { id: string; likes: number };

// Rows compare by value everywhere except the merge test,
// which also pins reference identity for untouched deep rows
const row = (id: string, likes = 0): Row => ({ id, likes });


// Deferred fetchPage: every call parks its resolvers so tests
// can land responses out of order, the way real races do
function deferredFetch() {
  const calls: {
    page: number;
    signal?: AbortSignal;
    resolve: (page: FeedPage<Row>) => void;
    reject: (err: unknown) => void;
  }[] = [];
  const fetchPage = jest.fn(
    (page: number, signal?: AbortSignal) =>
      new Promise<FeedPage<Row>>((resolve, reject) => calls.push({ page, signal, resolve, reject })),
  );
  return { calls, fetchPage };
}


// Every hook mounts inside a provider over a dump()-able memory
// storage, so the offline copy is assertable from the outside
function harness() {
  const storage = memoryStorage();
  const network = manualNetwork();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DataEngineProvider storage={storage} network={network}>
      {children}
    </DataEngineProvider>
  );
  return { storage, network, wrapper };
}


// Settle pending microtask chains inside act — deep enough for
// the fetch → state → effect cascades under test
const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });


// The offline-copy write is deferred behind InteractionManager,
// whose batch runs on a real setImmediate — hop one macrotask
// turn, then settle the storage write behind it
const flushInteractions = () =>
  act(async () => {
    await new Promise<void>((resolveTurn) => setImmediate(() => resolveTurn()));
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });


describe('useFeed', () => {
  it('loads page 1 behind the full spinner and hands fetchPage an abort signal', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { wrapper } = harness();
    const h = await renderHook(() => useFeed(fetchPage), { wrapper });

    expect(h.result.current.loading).toBe(true);
    expect(calls[0].page).toBe(1);
    expect(calls[0].signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      calls[0].resolve({ items: [row('a'), row('b')], hasMore: true });
    });
    await flush();
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.error).toBe(false);
    expect(h.result.current.cachedAt).toBeNull();
    expect(h.result.current.items).toEqual([row('a'), row('b')]);
  });

  it('appends pages with the getId dedupe and stops at hasMore', async () => {
    type KeyRow = { key: string };
    const pages: Record<number, FeedPage<KeyRow>> = {
      1: { items: [{ key: 'a' }, { key: 'b' }], hasMore: true },
      // The offset window slid between requests: 'b' comes back
      // on page 2 and must not become a duplicate list key
      2: { items: [{ key: 'b' }, { key: 'c' }], hasMore: false },
    };
    const fetchPage = jest.fn(async (page: number) => pages[page]);
    const { wrapper } = harness();
    const h = await renderHook(() => useFeed(fetchPage, { getId: (item) => item.key }), { wrapper });
    await waitFor(() => expect(h.result.current.loading).toBe(false));

    await act(async () => {
      h.result.current.loadMore();
    });
    await waitFor(() => expect(h.result.current.loadingMore).toBe(false));
    expect(h.result.current.items.map((item) => item.key)).toEqual(['a', 'b', 'c']);

    // Page 2 said "the end": another loadMore never fetches
    await act(async () => {
      h.result.current.loadMore();
    });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('refresh() replaces the list and resets the paging cursor', async () => {
    const pages: Record<number, FeedPage<Row>> = {
      1: { items: [row('a'), row('b')], hasMore: true },
      2: { items: [row('c'), row('d')], hasMore: true },
    };
    const fetchPage = jest.fn(async (page: number) => pages[page]);
    const { wrapper } = harness();
    const h = await renderHook(() => useFeed(fetchPage), { wrapper });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => {
      h.result.current.loadMore();
    });
    await waitFor(() => expect(h.result.current.items).toHaveLength(4));

    pages[1] = { items: [row('n'), row('a')], hasMore: true };
    await act(async () => {
      await h.result.current.refresh();
    });
    expect(h.result.current.items.map((item) => item.id)).toEqual(['n', 'a']);

    // The cursor went back to 1: the next loadMore refetches page 2
    pages[2] = { items: [row('x')], hasMore: false };
    await act(async () => {
      h.result.current.loadMore();
    });
    await waitFor(() => expect(h.result.current.items.map((item) => item.id)).toEqual(['n', 'a', 'x']));
  });

  it("refresh('merge') folds page 1 in while the reader keeps their place", async () => {
    const pages: Record<number, FeedPage<Row>> = {
      1: { items: [row('a'), row('b'), row('c')], hasMore: true },
      2: { items: [row('d'), row('e')], hasMore: false },
    };
    const fetchPage = jest.fn(async (page: number) => pages[page]);
    const { wrapper } = harness();
    const h = await renderHook(() => useFeed(fetchPage), { wrapper });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => {
      h.result.current.loadMore();
    });
    await waitFor(() => expect(h.result.current.items).toHaveLength(5));
    const deepRow = h.result.current.items[3]; // 'd', the first page-2 row

    // Page 1 moved on while the reader was away: a new post on
    // top, 'a' picked up likes, 'b' was deleted server-side
    pages[1] = { items: [row('n'), row('a', 5), row('c')], hasMore: true };
    await act(async () => {
      await h.result.current.refresh('merge');
    });

    // Prepended, updated in place, the vanished row dropped, and
    // page 2 untouched behind it — nothing shrank, nothing moved
    expect(h.result.current.items.map((item) => item.id)).toEqual(['n', 'a', 'c', 'd', 'e']);
    expect(h.result.current.items[1]).toEqual(row('a', 5));
    // Deeper rows keep their exact object identity — a memoized
    // row component behind page 1 never re-renders for a merge
    expect(h.result.current.items[3]).toBe(deepRow);

    // The cursor was NOT reset: page 2 had said "the end", so
    // loadMore stays a no-op instead of refetching page 2
    const callCount = fetchPage.mock.calls.length;
    await act(async () => {
      h.result.current.loadMore();
    });
    expect(fetchPage.mock.calls.length).toBe(callCount);
  });

  it('serves the offline copy only when page 1 fails with nothing live', async () => {
    const { storage, wrapper } = harness();
    // Seed through a second cache handle over the same storage —
    // same prefix, so the provider's own instance reads it back
    await createCache(storage).set('feed', [row('cached')]);

    let down = true;
    const fetchPage = jest.fn(async (): Promise<FeedPage<Row>> => {
      if (down) throw new Error('down');
      return { items: [row('live')], hasMore: true };
    });
    const h = await renderHook(() => useFeed(fetchPage, { cacheKey: 'feed' }), { wrapper });
    await waitFor(() => expect(h.result.current.loading).toBe(false));

    expect(h.result.current.items).toEqual([row('cached')]);
    expect(h.result.current.cachedAt).toEqual(expect.any(Number));
    expect(h.result.current.error).toBe(false);

    // A cached list has no live continuation: hasMore is forced
    // off, so loadMore never fires
    await act(async () => {
      h.result.current.loadMore();
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);

    // A real page 1 replaces the copy and restores pagination
    down = false;
    await act(async () => {
      await h.result.current.refresh();
    });
    expect(h.result.current.items).toEqual([row('live')]);
    expect(h.result.current.cachedAt).toBeNull();
    await act(async () => {
      h.result.current.loadMore();
    });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('a cache wipe fences out the in-flight page-1 write', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { storage, wrapper } = harness();
    const h = await renderHook(
      () => ({ feed: useFeed(fetchPage, { cacheKey: 'feed' }), env: useDataEngine() }),
      { wrapper },
    );

    // Logout wipes the cache while page 1 is still in flight —
    // the response must land on screen but never back in storage
    await act(async () => {
      await h.result.current.env.cache.clearAll();
    });
    await act(async () => {
      calls[0].resolve({ items: [row('a')], hasMore: false });
    });
    await flushInteractions();
    expect(h.result.current.feed.items).toEqual([row('a')]);
    expect(storage.dump()).toEqual({});

    // Control: a page-1 load begun AFTER the wipe writes freely
    await act(async () => {
      void h.result.current.feed.refresh();
    });
    await act(async () => {
      calls[1].resolve({ items: [row('b')], hasMore: false });
    });
    await flushInteractions();
    expect(Object.keys(storage.dump())).toEqual(['cache:feed']);
    const written = await createCache(storage).get<Row[]>('feed');
    expect(written?.data).toEqual([row('b')]);
  });

  it('an optimistic setItems survives a stale silent refresh', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { wrapper } = harness();
    const h = await renderHook(() => useFeed(fetchPage), { wrapper });
    await act(async () => {
      calls[0].resolve({ items: [row('a')], hasMore: false });
    });
    await flush();

    // A silent refresh takes off — behind the shown list, never
    // behind the full spinner
    await act(async () => {
      void h.result.current.refresh();
    });
    expect(h.result.current.refreshing).toBe(true);
    expect(h.result.current.loading).toBe(false);

    // ...and the user likes the post while it is in flight
    await act(async () => {
      h.result.current.setItems((items) => items.map((item) => ({ ...item, likes: 1 })));
    });

    // The refresh lands with rows generated BEFORE the like —
    // it drops itself instead of undoing the mutation
    await act(async () => {
      calls[1].resolve({ items: [row('a', 0)], hasMore: false });
    });
    await flush();
    expect(h.result.current.items).toEqual([row('a', 1)]);
    expect(h.result.current.refreshing).toBe(false);

    // A refresh started after the mutation lands normally
    await act(async () => {
      void h.result.current.refresh();
    });
    await act(async () => {
      calls[2].resolve({ items: [row('a', 7)], hasMore: false });
    });
    await flush();
    expect(h.result.current.items).toEqual([row('a', 7)]);
  });

  it('a superseding page-1 load aborts the transport and drops stale answers', async () => {
    const { calls, fetchPage } = deferredFetch();
    const { wrapper } = harness();
    const h = await renderHook(() => useFeed(fetchPage), { wrapper });

    // A refresh supersedes the mount load: its transport is
    // cancelled outright, not just ignored on landing
    await act(async () => {
      void h.result.current.refresh();
    });
    expect(calls[0].signal?.aborted).toBe(true);
    expect(calls[1].signal?.aborted).toBe(false);

    await act(async () => {
      calls[1].resolve({ items: [row('a')], hasMore: true });
    });
    await flush();

    // A load-more runs under the page-1 controller...
    await act(async () => {
      h.result.current.loadMore();
    });
    expect(calls[2].page).toBe(2);

    // ...so the next page-1 load aborts it too — page 1
    // invalidates load-more, never the other way around
    await act(async () => {
      void h.result.current.refresh();
    });
    expect(calls[2].signal?.aborted).toBe(true);
    await act(async () => {
      calls[3].resolve({ items: [row('r')], hasMore: true });
    });
    await flush();

    // The doomed answers land late and change nothing — but the
    // load-more flags still unlock for the next page
    await act(async () => {
      calls[0].resolve({ items: [row('stale-initial')], hasMore: true });
      calls[2].resolve({ items: [row('stale-more')], hasMore: true });
    });
    await flush();
    expect(h.result.current.items).toEqual([row('r')]);
    expect(h.result.current.loadingMore).toBe(false);

    // Unmount cancels whatever is still in flight
    await act(async () => {
      h.result.current.loadMore();
    });
    await h.unmount();
    expect(calls[4].signal?.aborted).toBe(true);
  });
});
