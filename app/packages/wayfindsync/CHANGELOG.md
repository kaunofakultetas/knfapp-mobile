# Changelog

## 1.0.1 — 2026-09-01

Sync-defect round: the outbox stops losing deletes and conflicting
with the phone's own edits, replays cannot bury a rejection, and the
queues survive a bootstrap enqueue racing `load()`.

- `ServerOp` gains `fresh?: boolean` — set by the editor on an upsert
  that creates an entity the server has never heard of; the server
  ignores it. The delete-cancel is now gated on it: a delete cancels a
  queued upsert only when that upsert is `fresh`; any other queued op
  (an edit of an existing entity, a keep-mine retry, an edit made
  while the creation is on the wire) becomes the delete itself,
  keeping the held op's `baseRevision` or its absence. Previously a
  missing `baseRevision` was read as "new entity" and such deletes
  were silently swallowed.
- Coalescing keeps the first op's `baseRevision` verbatim — including
  its deliberate absence — and its `fresh` mark; a later edit's stale
  stamp can no longer re-attach itself to a keep-mine retry.
- `OpResult` gains `of?: 'applied' | 'rejected'` and `revision?:
  number | null` for duplicates. The drain reads a duplicate by its
  `of`: `'applied'` with a numeric revision joins the applied report
  with that revision, `'rejected'` marks the entry rejected with the
  reason (`current` null) — a replayed batch after a lost answer no
  longer clears a rejection as success. A duplicate without `of` is
  dropped as before.
- `DrainReport.applied` entries are now `{ kind, entityId, opId,
  revision }` with each op's own batch's revision (the top-level
  `revision` stays the last batch's), so a multi-batch drain no longer
  over-stamps batch-1 entities.
- The outbox remembers, per entity and per session, the latest
  revision the answers taught (applied entries and duplicates of
  applied) and lifts any lower numeric `baseRevision` just before its
  batch goes out — consecutive edits of one entity no longer come back
  as conflicts against the phone's own applied change. In-memory only;
  a restart is re-taught by the first answer.
- `resolve('keep-mine')` strips `fresh` along with `baseRevision`.
- Outbox persistence is gated until `load()` has read the stored
  queue, and `load()` now merges the stored entries in front of ops
  enqueued before it resolved (dedup by op id, the session's entry
  objects kept) instead of replacing the list — a seed bootstrap that
  enqueues before load no longer overwrites the previous session's
  ops in storage nor double-posts its own.
- The provider's status counts re-derive on every queue change again:
  the env memo now depends on the subscription tick instead of the
  queues' in-place-mutated arrays, so an enqueue during an in-flight
  drain shows up in `pendingOps` at once.
- The upload retry ladder is honest: `RETRY_DELAYS_MS` is indexed by
  `attempts - 1`, so the first failure retries at once (rung 0) and
  the last rung repeats; the ladder comment says milliseconds, as the
  values always were.

## 1.0.0 — 2026-09-01

First cut.

- Types — the wire, structural: `ServerOp` (the shape
  `@knf/wayfindeditor` produces, declared here without importing it),
  `OpResult` / `OpsAnswer` (applied / duplicate / rejected per op, with
  a reason and the server's `current` on a conflict), `UploadFile` (a
  local file reference), `PanoramaUploadResult` / `PlanUploadResult`,
  `PublishIssue` / `PublishAnswer` (ok with the revision, etag and
  time; invalid with issues; unchanged), `SyncTransport` (`postOps`,
  `publish`, `uploadPanorama`, `uploadPlan`), `SyncStorage` (`getItem`
  / `setItem` / `removeItem`), and the `SyncRejected` error a transport
  throws for an upload not worth retrying (`code`, default
  `'rejected'`).
- `createOutbox` — the persisted op log: ordered; coalescing per queued
  entity (the later op replaces the earlier, the first `baseRevision`
  kept; a delete after an unsent new entity cancels both; building
  patches merge); batches of 500 through a single-flight drain; applied
  and duplicate ops dropped, rejected ones kept with the reason and
  `current`; `resolve` keep-mine (re-sent without the base revision
  under `"<id>-again"`) or drop; a transport throw re-queues the batch
  and answers `offline`; fire-and-forget persistence, `sending`
  re-queued on load; `subscribe`.
- `createUploadQueue` — the persisted upload queue: items referencing
  local files with a kind, fields and an opaque `target`; one at a time;
  the retry ladder `RETRY_DELAYS_MS` (`[0, 1000, 3000, 5000, 15000,
  60000]`, the last rung repeating) on a transport throw, `SyncRejected`
  parked as `failed`; results kept on the item until `acknowledge`;
  `retry`, `remove`, `clear`, `subscribe`; single flight, persisted.
- `WayfindSyncProvider` / `useWayfindSync` — one outbox and one upload
  queue per building under `"<keyPrefix>:ops:<id>"` /
  `"<keyPrefix>:uploads:<id>"`, loaded and drained on mount, drained on
  every enqueue, retry and resolve, on the host's restore signal and on
  demand; `onDrained` with every report, `onUploaded` once per finished
  item; `status` (`loaded`, `pendingOps`, `sendingOps`, `rejectedOps`,
  `uploads`, `lastDrain`, `draining`); `publish` through the transport;
  `clearAll`.
- The single-flight latch on both queues clears in the drain promise's
  `.finally`, so a drain whose body never awaits cannot clear it before
  it is set.
- Specs live inside the package (`src/**/__tests__/`) with their own
  `npm test` (jest-expo + the package's babel config, `TZ=UTC`);
  `__tests__` is excluded from `files`.
