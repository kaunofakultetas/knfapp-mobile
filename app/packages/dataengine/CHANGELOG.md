# Changelog

## Unreleased

- `useFeed` returns `patchItems(updater)`: the in-place write for live
  server truth (socket echoes). Unlike `setItems` it does not move the
  optimistic-mutation fence, so a refresh in flight is no longer voided
  by an echo that overlaps it. Additive — `setItems` is unchanged.
- `loadMore` splices a hole-filling page under the gap marker's ROW, not
  only its captured index, so a same-batch optimistic delete above the
  marker can no longer land the page inside the old section.
- `DataEngineProvider` builds its env in a lazy state initializer and
  `useFeedFreshness` resets its count during render — same behaviour,
  no refs read during render, no effect-time state reset.

## 1.0.0 — 2026-08-30

First cut, extracted from the KNF app's `hooks/useLoad.ts`,
`hooks/useFeed.ts` and `hooks/useNetworkRestore.ts`:

- `KeyValueStorage` and `NetworkSource` — the two injected seams
  (AsyncStorage-shaped storage, a transitions-only connectivity
  signal), with working zero-dependency defaults (`memoryStorage`,
  `alwaysOnline`) and a hand-driven `manualNetwork` for tests and
  demos.
- `createCache` — the TTL cache behind the offline copies: versioned
  envelopes, corrupt/expired/wrong-schema entries read as misses,
  `sweepPrefix` for write-mostly keys, and `clearAll` with the epoch
  fence so a request in flight across a logout can never write the
  wiped account's data back.
- `DataEngineProvider` / `useDataEngine` — the sources, the shared
  cache instance, and the restore bus: offline→online transitions
  become restore events, and `signalRestore()` lets the host add its
  own reasons (a realtime socket reconnecting).
- Hooks: `useLoad` (single resource: first-load spinner, silent
  refresh, supersede protection, error-only-when-nothing-shown),
  `useFeed` (paginated feed: offline first page with `cachedAt`, the
  merge refresh that keeps the reader's place, load-more dedupe, the
  mutation fence, abort-on-supersede), `useNetworkRestore` (run the
  latest callback on every restore).
- `example/ExampleOfflineScreen.tsx` — the offline board over a fake
  in-file server (offline mount, the toggle-driven restore refetch,
  paging, the pull-to-refresh merge), with its own mount test.
- Specs live inside the package (`src/**/__tests__/`,
  `example/**/__tests__/`) with their own `npm test` (jest-expo + the
  package's babel config); `__tests__` is excluded from `files`.
