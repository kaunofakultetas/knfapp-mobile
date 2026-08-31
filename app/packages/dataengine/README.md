# dataengine

Offline-first data loading for React Native / Expo: single-resource loads
(`useLoad`), paginated feeds with an offline first page and a merge refresh
(`useFeed`), a TTL cache with a wipe fence, and automatic refetch when
connectivity returns — behind two injected sources, storage and network.
It owns no backend and no fetch layer: you bring any `async` fetcher, the
hooks own the state machine around it (spinners, silent refreshes,
supersede protection, the offline copy).

```tsx
import { DataEngineProvider, useFeed, useLoad } from '@knf/dataengine';

<DataEngineProvider
  storage={AsyncStorage}         // offline copies; default in-memory
  network={netinfoSource}        // restore-on-reconnect; default always-online
>
  …
</DataEngineProvider>

function NewsScreen() {
  const feed = useFeed((page, signal) => fetchNews(page, signal), {
    cacheKey: 'feed:news',       // page 1 becomes the offline copy
    silentRefreshMode: 'merge',  // restore refetch keeps the reader's place
  });
  // feed.items / loading / refreshing / loadingMore / error
  // feed.cachedAt   — non-null while showing the offline copy
  // feed.refresh('merge') / feed.loadMore() / feed.setItems(updater)
}

function ProfileScreen({ userId }) {
  const { data, loading, error, refresh, retry } = useLoad(() => fetchProfile(userId), [userId]);
}
```

## Examples

- **`example/ExampleOfflineScreen.tsx`** — the engine driving a bare
  React Native board over a fake in-file server: the demo mounts
  OFFLINE and serves a seeded cache under a `cachedAt` banner, a
  network toggle flips `manualNetwork()` and the off→on transition
  triggers the automatic refetch, the list pages through `loadMore`,
  and pull-to-refresh runs `refresh('merge')` against a server that
  gained a post in between. Paste it into a blank Expo project to see
  the engine alone.

## Why offline-first this way

Data libraries that cache for you decide for you — what a key is, when
stale data may show, what an error is. This package keeps those
decisions explicit and small: a screen opts into an offline copy by
naming a `cacheKey`, the copy is served ONLY when a load fails with
nothing live to show (never silently instead of fresh data), and its
age is handed to the screen as `cachedAt` — the banner is the host's,
not the library's. Everything else is the state logic every screen
needs written once: sequence-numbered requests so out-of-order answers
never land, a mutation fence so a stale silent refresh never undoes an
optimistic like, an abort signal handed to the fetcher so a superseded
download actually stops. The injected surfaces are small on purpose:

```ts
interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove?(keys: readonly string[]): Promise<void>;   // used when present
}

interface NetworkSource {
  isOnline(): boolean;                                    // must never throw
  subscribe(listener: (online: boolean) => void): () => void;
}
```

Both have working zero-dependency defaults (`memoryStorage`,
`alwaysOnline`), so a bare `<DataEngineProvider>` is fully functional —
a host upgrades piece by piece.

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `storage.ts` (`KeyValueStorage`, `memoryStorage`), `network.ts` (`NetworkSource`, `alwaysOnline`, `manualNetwork`), `cache.ts` (`createCache` — the TTL cache, sweeps, the wipe fence) |
| `provider/` | `DataEngineProvider` / `useDataEngine` — the injected sources, the shared cache instance, the restore bus with `signalRestore()` |
| `hooks/` | `useLoad` (single resource), `useFeed` (paginated feed with the offline first page), `useNetworkRestore` (run a callback on every restore) |
| `example/` | The offline board over a fake in-file server, with its own test |

## Tests live in the package

`npm test` here runs every spec under `src/**/__tests__/` and
`example/**/__tests__/` with the jest-expo preset and this package's own
`babel.config.js` — no host needed (the host's root jest run picks the
same specs up too). Specs sit beside what they pin; `__tests__` does not
ship (`files` in package.json).

- `src/__tests__/surface.test.ts` — the exact export list, the cache
  handle's method list, the zero-dependency sources.
- `src/core/__tests__/` — the cache (expiry, corrupt and wrong-version
  entries, sweeps, the epoch fence) and the default sources.
- `src/provider/__tests__/provider.test.tsx` — defaults, restore
  derivation, `signalRestore`, the provider guard.
- `src/hooks/__tests__/` — `useLoad` (supersede protection, the pending
  initial guard, error-only-when-nothing-shown), `useFeed` (the page-1
  pipeline, load-more dedupe, replace vs merge, the offline fallback,
  both fences, abort-on-supersede), `useNetworkRestore`.

## What the host supplies

- **`storage`** — anything with the AsyncStorage surface plus
  `getAllKeys` (AsyncStorage as-is); every call may reject — the cache
  treats storage as a convenience and reads failures as misses.
- **`network`** — a connectivity wrapper; the whole implementation:

  ```ts
  import NetInfo from '@react-native-community/netinfo';
  import type { NetworkSource } from '@knf/dataengine';

  let online = true;                    // optimistic until the first answer
  void NetInfo.fetch().then((s) => { online = s.isConnected !== false; });

  export const netinfoSource: NetworkSource = {
    isOnline: () => online,
    subscribe: (listener) =>
      NetInfo.addEventListener((s) => {
        const next = s.isConnected !== false;
        if (next === online) return;    // sources fire on transitions only
        online = next;
        listener(next);
      }),
  };
  ```

- **`signalRestore()`** — on the env (`useDataEngine()`), for restore
  reasons the network layer cannot see: call it when your realtime
  socket reconnects after a server restart and every mounted hook
  refetches, exactly as if connectivity had returned.
- **`cache.clearAll()`** — call it on logout; it wipes every offline
  copy and moves the epoch fence so an in-flight request cannot write
  the departing account's data back (it resolves `false` when the wipe
  itself failed, so a logout flow may retry).
- **Fetchers** — plain `async` functions; `useFeed` hands yours the
  page number and an `AbortSignal` — forward it and a superseded
  download stops instead of finishing for nothing.

## Behaviours worth knowing

- `loading` covers only the FIRST load per deps combination (mount and
  deps changes, which also clear the previous data so nothing stale
  flashes); `refresh()` runs silently behind what is shown, with
  `refreshing` for a `RefreshControl`.
- **`error` means "render the error state"** — it turns true only when
  a load failed AND there is nothing to show. A failed silent refresh
  keeps the data on screen; a silent refresh failing faster than a
  slow first load defers to it instead of flashing an error.
- **The merge refresh** — `refresh('merge')` folds the fresh page 1
  INTO the loaded list: new rows are prepended, overlapping rows are
  updated in place, rows the fresh window covers but no longer lists
  are dropped, and the pages behind page 1 stay exactly where they
  were — a reader 60 posts deep keeps their place. Only for
  newest-first feeds; a ranked list must replace.
  `silentRefreshMode` picks the strategy for the automatic
  network-restore refetch.
- **The offline first page** — on page-1 success with a `cacheKey` the
  items become the offline copy; on page-1 failure with nothing live
  to show, the copy is served and `cachedAt` exposes its age for the
  host's stale banner. A cached page has no live continuation, so
  `hasMore` is forced off until a real page 1 succeeds.
- **The epoch fence** — `clearAll()` bumps a per-cache epoch FIRST;
  every writer captures the epoch before fetching and skips its late
  write when it moved, so a request in flight across a logout can
  never resurrect the wiped account's copy.
- Every page-1 request carries a sequence number: superseded responses
  are dropped, and a page-1 load invalidates (and aborts) any
  load-more in flight — never the other way around.
- `setItems(updater)` mutates the list in place for optimistic updates;
  a silent refresh whose response predates the mutation drops itself
  rather than clobbering it.
- The cache write is deferred past interactions (serializing a page
  mid-fling janks the list) and re-checks both fences on the far side;
  corrupt, expired and wrong-schema entries read as misses, and
  `sweepPrefix` clears the rows a browsing screen wrote but never
  re-read.
- A `loadMore` page that dedupes to nothing new ends paging even when
  the adapter claims `hasMore` — a backend that ignores its offset must
  not be hammered in a loop; any page-1 load re-arms paging.
- An empty page-1 success never overwrites a non-empty offline copy —
  a transient hiccup that answers an empty list must not destroy the
  fallback it exists for.
- `createCache` takes `maxEntries` — an optional entry cap evicting the
  oldest writes first, because TTLs alone never bound COUNT and a full
  storage quota fails silently.
- A merge refresh that shares NOTHING with the held rows marks the hole
  (`gapAfterId`) instead of faking continuity; `loadMore` then fills
  INTO the hole until it reaches the old rows (or the chain exhausts) —
  unless the fresh window was the server's whole memory, which replaces
  the ghosts outright.
- `useFeedFreshness` is the cheap new-posts probe behind a pill: it
  counts peeked ids AHEAD of the feed's newest row, so deletions and
  re-rankings never inflate the count.
