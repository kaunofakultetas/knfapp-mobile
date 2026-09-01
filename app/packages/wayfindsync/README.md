# wayfindsync

Offline-first sync for building-graph editing on a phone: a persisted
op outbox that coalesces per entity, drains in one flight and keeps the
server's per-op conflict answers until the host resolves them; a
persisted upload queue for panoramas and plans with a retry ladder and
a final-refusal park; and a publish action. Storage, the network-restore
bus and the transport are injected — the package knows no HTTP client,
no storage library and no server URL — and the ops it carries are the
same `ServerOp` shape `@knf/wayfindeditor` produces, declared on both
sides so neither package imports the other. Pure TypeScript plus one
provider and one hook.

```tsx
import { WayfindSyncProvider, useWayfindSync, SyncRejected } from '@knf/wayfindsync';

<WayfindSyncProvider
  buildingId="faculty"
  storage={storage}                                   // getItem / setItem / removeItem, async
  transport={transport}                               // postOps / publish / uploadPanorama / uploadPlan (see The transport contract)
  onRestore={(listener) => bus.subscribe(listener)}   // optional: the host's network-restore bus; answers the unsubscribe
  onDrained={(report) => …}                           // optional: every drain's report
  onUploaded={(item) => …}                            // optional: each finished upload, once
  keyPrefix="wayfind"                                 // optional: keys are "<prefix>:ops:<building>" and "<prefix>:uploads:<building>"
>
  …
</WayfindSyncProvider>

function Screen() {
  const sync = useWayfindSync();
  sync.enqueueOps(ops);                       // queued, persisted, drained at once
  sync.status.pendingOps;                     // and sendingOps, rejectedOps, uploads, lastDrain, draining, loaded
  sync.resolveConflict(opId, 'keep-mine');    // or 'drop'
  await sync.publish('note');                 // { ok, revision, etag, publishedAt } | { ok: false, reason: 'invalid' | 'unchanged' }
}
```

## The transport contract

`SyncTransport` is four functions the host writes over its own HTTP
client, each taking the building id first:

- **`postOps(buildingId, ops)`** → `OpsAnswer`: the server's `revision`
  after the batch and one `OpResult` per op — `{ id, status, reason?,
  current?, of?, revision? }` with `status` `'applied'`, `'duplicate'`
  (the server already had this op id) or `'rejected'`, a `reason`
  (`'conflict'`, or whatever the server says) and, on a conflict,
  `current` — the entity as the server holds it: `{ data, revision,
  deleted }`. On a duplicate, `of` says what the logged op's answer
  had been (`'applied'` or `'rejected'`) and `revision` the revision
  its row holds (`null` when it had been rejected). An op may carry a
  `fresh: true` mark (a create of an entity the server never heard
  of) — the server ignores it. A refusal of one op is an answer, not a
  throw; **any throw** is read as "the server could not be reached"
  and leaves the whole batch queued.
- **`publish(buildingId, note?)`** → `PublishAnswer`: `{ ok: true,
  revision, etag, publishedAt }`, `{ ok: false, reason: 'invalid',
  issues }` (each issue `severity` / `code` / `ref` / `message`) or
  `{ ok: false, reason: 'unchanged' }`. Passed straight through by the
  provider; the transport decides which server answers become which.
- **`uploadPanorama(buildingId, file, fields)`** →
  `PanoramaUploadResult` (`id`, `url`, `width`, `height`, `bytes`,
  `hfovDeg`, `vfovDeg`) and **`uploadPlan(buildingId, file, fields)`**
  → `PlanUploadResult` (`id`, `url`, `bytes`). `file` is an `UploadFile`
  — `{ uri, name, type }`, a reference to a local file, never its bytes
  — and `fields` the strings that go beside it (a node id, a level id,
  a heading source).

Two ways for an upload to fail, told apart by what the transport
throws: a **`SyncRejected`** (`message`, `code` — default
`'rejected'`) is a final refusal — a bad image, a refused id, anything a
retry will not change — and parks the item as `failed`; **any other
error** is retryable — a dropped connection, a timeout, a rate limit —
and backs the item off along the ladder. The app's transport throws
`SyncRejected` for a 4xx that is not a rate limit and rethrows the rest.
`SyncRejected` has no meaning on `postOps`, where a throw is a throw.

`SyncStorage` is the small async key-value surface every persisted
queue in this family uses: `getItem`, `setItem`, `removeItem`.

## The outbox

`createOutbox(storage, key, now?)` is the persisted op log between the
editor and the server. Ops are appended in the order they were made and
leave in that order.

- **Coalescing.** `enqueue(ops)` looks for a **queued** entry on the
  same entity (`"kind:entityId"`, or `building`; an op with neither
  never coalesces; an entry already `sending` or `rejected` is left
  alone and the new op is appended). Found, the later op **replaces**
  the earlier one — id and type included — keeping the **first
  `baseRevision`** (or its deliberate absence — an overwrite never
  re-acquires a base) and the first op's `fresh` mark, because that is
  the state the phone's copy came from and what the server's conflict
  check must read; a **delete after a fresh create** (an upsert marked
  `fresh: true` — an entity the server has never heard of) removes the
  upsert and drops the delete — both cancel — while a delete after
  **any other** queued upsert becomes the delete itself, keeping the
  held op's `baseRevision` or its absence; **building patches merge**
  their `data`, the later fields winning. A long offline session thus
  sends one op per entity, not one per finger move.
- **Draining.** `drain(transport, buildingId)` posts the queued ops in
  **batches of 500** until none are queued, marking each batch
  `sending` on the way out, and answers a `DrainReport` — `applied`
  (`{ kind, entityId, opId, revision }` per applied op, the `revision`
  being **that batch's** answer), `revision` (the server's last
  answer, null when nothing was posted), `rejected` (the entries now
  marked) and `offline`. The revisions the answers teach are
  remembered per entity for the session, and just before a batch goes
  out every op stamped with a numeric `baseRevision` below its
  entity's learned revision is lifted to it — so the phone cannot
  conflict with its own already-applied edits; the map is in-memory
  only and the first answer after a restart re-teaches it. Per op:
  `applied` leaves the log and joins `applied`; a `duplicate` is read
  by its `of` — `of: 'applied'` with a numeric `revision` joins
  `applied` with that revision, `of: 'rejected'` marks the entry
  rejected with the `reason` (`current` stays null), anything else
  just leaves the log (and an op the answer does not name leaves it
  too); `rejected` stays, marked `rejected` with the server's `reason`
  and `current`, until the host resolves it. A transport throw puts
  the batch back to `queued`, sets `offline: true` and ends the drain;
  nothing is lost.
- **Single flight.** A second `drain` while one runs answers the running
  drain's own promise — the running loop's next round covers whatever
  was enqueued meanwhile.
- **Resolving.** `resolve(opId, 'keep-mine')` re-queues the rejected op
  **without its `baseRevision` and without its `fresh` mark** under a
  new id (`"<id>-again"`) — the server's copy is overwritten on the
  next drain; `resolve(opId, 'drop')` removes it — the host applies
  `current` to its document itself. An id that is not a rejected entry
  does nothing.
- **Persistence** is fire-and-forget after every change — but only once
  `load()` has read the stored queue, so an enqueue that lands earlier
  (the seed bootstrap) cannot clobber the previous session's ops:
  `load()` merges the stored entries **in front of** whatever was
  enqueued before it resolved (dedup by op id, the session's entry
  objects kept so an in-flight drain still recognises them) and
  persists the merged list. The in-memory list is the truth of the
  session, the storage is what survives a kill. `load()` re-queues
  anything left `sending` by a kill mid-drain; unreadable storage
  contributes nothing. `entries()`, `pending()` (queued), `rejected()`,
  `clear()` (the key removed) and `subscribe(listener)` round it out.

## The upload queue

`createUploadQueue(storage, key, now?)` is the persisted queue for
panoramas and plans. An `UploadItem` names a local file (`file`), what
it is (`kind`: `'panorama'` | `'plan'`), the `fields` that go with it
and an optional `target` — an opaque tag the host reads back (a node id,
a level id) — plus the queue's own `status` (`queued` / `sending` /
`done` / `failed`), `attempts`, `notBefore`, `result`, `error` and
`queuedAt`. The file stays where the host put it: the queue holds a
reference, never the bytes.

- `enqueue(item)` — the host's `id`, `kind`, `file`, `fields`,
  `target?`; an id already held is ignored.
- `drain(transport, buildingId)` sends the items **one at a time**, each
  `queued` item whose `notBefore` has passed, and remembers each answer
  on the item (`status: 'done'`, `result`) until the host reads it. A
  transport throw counts an attempt: a **`SyncRejected`** parks the item
  as `failed` with `error` = its `code`; any other error re-queues it
  with `error` = its message and `notBefore` = now plus the rung
  `RETRY_DELAYS_MS[min(attempts - 1, last)]` — the ladder is
  `[0, 1000, 3000, 5000, 15000, 60000]` ms, so the first failure
  retries at once (still inside the same drain), the second waits 1 s,
  then 3, 5, 15, and 60 s for every failure after — and the drain
  moves on. Nothing wakes the queue when a rung elapses: the next drain
  (an enqueue, a restore signal, a call) sends what is ready. Single
  flight like the outbox.
- `acknowledge(id)` removes a **done** item once the host has consumed
  its answer; `retry(id)` puts a **failed** item back to `queued` with
  the wait cleared; `remove(id)` drops any item; `clear()`, `items()`,
  `load()` (a `sending` item comes back `queued`) and `subscribe` as on
  the outbox.

## The provider

`WayfindSyncProvider` holds **one outbox and one upload queue per
building**, keyed `"<keyPrefix>:ops:<buildingId>"` and
`"<keyPrefix>:uploads:<buildingId>"` (`keyPrefix` defaults to
`wayfind`); a new `storage`, prefix or building id is a new pair. On
mount it loads both from storage, sets `status.loaded` and drains; it
drains again on every `enqueueOps`, `enqueueUpload`, `retryUpload` and
`resolveConflict`, on every signal from the host's restore bus
(`onRestore` is given a listener and answers the unsubscribe), and on
demand through `drain()`. One provider drain is the outbox drain then
the upload drain, then the callbacks: **`onUploaded`** once for each
item that reached `done` and was not handed over before, and
**`onDrained`** with every outbox report — an empty one included — which
also lands in `status.lastDrain`. `transport`, `onDrained` and
`onUploaded` are held in refs, so inline values never remount the
queues.

`useWayfindSync()` answers the `SyncEnv` (and throws outside the
provider): `buildingId`; `status` — `loaded`, `pendingOps` (queued),
`sendingOps`, `rejectedOps` (the marked entries, with `reason` and
`current`), `uploads` (every item), `lastDrain`, `draining`;
`enqueueOps`, `enqueueUpload`, `acknowledgeUpload`, `retryUpload`,
`removeUpload`, `resolveConflict(opId, how)`, `drain()` (the report, or
null if the drain itself threw), `publish(note?)` (the transport's
answer, untouched) and `clearAll()` (both queues emptied, the "already
reported" memory too). The counts re-derive on every queue change
through the queues' own subscriptions.

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `types.ts` (the wire: `ServerOp`, `OpResult` / `OpsAnswer`, `UploadFile`, the two upload results, `PublishIssue` / `PublishAnswer`, `SyncTransport`, `SyncStorage`, the `SyncRejected` error), `outbox.ts` (`createOutbox` — coalescing, batches, the single-flight drain, resolve, persistence), `uploads.ts` (`createUploadQueue`, `RETRY_DELAYS_MS`) |
| `provider/` | `WayfindSyncProvider` / `useWayfindSync` — the two queues per building, the drain triggers, the status counts, the callbacks, publish |

`index.ts` is the public surface, pinned by `src/__tests__/surface.test.ts`.

## Tests live in the package

`npm test` here runs every spec under `src/**/__tests__/` with the
jest-expo preset and this package's own `babel.config.js`, `TZ=UTC`
pinned — no host, no server: the transport and the storage are
in-memory doubles. Specs sit beside what they pin; `__tests__` does not
ship (`files` in package.json).

- `src/__tests__/surface.test.ts` — the exact runtime export list.
- `src/core/__tests__/queues.test.ts` — the outbox coalescing per
  entity with the first base revision kept, a fresh create deleted
  again cancelling while a delete of anything else survives as the
  delete (an in-flight creation and a keep-mine retry included),
  building patches merging, persistence across instances and `load()`
  merging the stored queue under pre-load enqueues without clobbering
  storage; two concurrent drains sharing one flight and one post,
  applied ops dropped with per-batch revisions, a plain duplicate
  dropped, a duplicate `of: 'rejected'` surfaced as a rejection and a
  duplicate `of: 'applied'` joining applied with the logged revision,
  the rejected one kept with its reason and `current`, the learned
  revisions lifting a stale stamp before the wire, keep-mine re-sent
  without the base revision (and without `fresh`) under a new id and a
  drop of an unknown id ignored; everything left queued when the
  server cannot be reached, and `sending` ops re-queued on load. The
  upload queue retrying the first failure at once and walking the
  ladder against a clock (too early sends nothing), parking a
  `SyncRejected` as failed, handing a result over with its target,
  acknowledge, retry and remove.
- `src/provider/__tests__/provider.test.tsx` — loads both queues,
  drains on mount, on enqueue and on the restore signal, reports applied
  ops and finished uploads once, exposes the counts — re-derived even
  while a drain is in flight — keeps a stored queue under a child
  effect's pre-load enqueue (each posted once), passes `publish`
  through.

## What the host supplies

- **`storage`** — any async key-value store with `getItem` / `setItem`
  / `removeItem`; the queues write JSON under their two keys.
- **`transport`** — the four calls over the host's HTTP client, throwing
  `SyncRejected` for an upload the server will never take and anything
  else for one worth retrying; on `postOps`, an answer per op and a
  throw only for a server out of reach.
- **`onRestore`** — the host's "back online" signal as a subscribe
  function; without it the queues drain on mount, on every enqueue and
  when asked.
- **`onDrained` / `onUploaded`** — or read `status.lastDrain` and
  `status.uploads` in an effect, as the app's editor does.
- **The resolution UI** — the package keeps a rejected op with the
  server's `current`; showing the two answers and applying `current` to
  the document is the screen's.
- **Op ids and upload ids** — unique across the session and its
  replays; the outbox never mints one (a keep-mine re-send suffixes the
  op's own).

## Behaviours worth knowing

- The outbox coalesces only **queued** entries: an op on an entity whose
  earlier op is already on the wire or rejected is appended after it —
  a `sending` entry is never coalesced into or cancelled.
- Coalescing keeps the **first** `baseRevision` — or its deliberate
  absence — and the **last** data; a delete after a **fresh create**
  (`fresh: true`) cancels both and the server never hears of it, while
  a delete after any other queued upsert goes out as the delete with
  that op's base (or none — an overwrite delete); a building patch
  merges field by field.
- Batches are 500 ops; a drain loops until nothing is queued, so a
  bigger backlog is several posts in one drain — and every op's stale
  `baseRevision` is lifted to its entity's learned revision just
  before its batch goes out, so a phone's consecutive edits of one
  entity never conflict with themselves.
- A replayed batch after a dropped connection is answered `duplicate`
  per op and read by its `of`: an op the server had applied joins the
  applied report with its logged revision, one it had **rejected**
  surfaces as a rejection again — nothing is buried — which is why op
  ids must be stable.
- A rejected op is never re-sent on its own; it waits for
  `resolveConflict`. Keep-mine goes out **without** a `baseRevision`
  and without a `fresh` mark under a new id, so the server overwrites;
  drop leaves the document to the host.
- A transport throw on `postOps` re-queues the whole batch and answers
  `offline: true`; the next drain tries again from the top.
- The upload ladder is indexed by the failure count minus one — the
  first failure retries at once, the last rung repeats; nothing
  schedules a later retry — the next drain sends what is ready.
- Nothing is persisted before `load()` has read the stored queue; an
  enqueue that lands earlier is merged **after** the stored entries
  when `load()` resolves, and both are drained once each.
- `SyncRejected` parks, everything else retries; a parked item is the
  host's to `retryUpload` or `removeUpload`.
- Persistence is fire-and-forget and the in-memory list is the truth;
  a kill mid-drain leaves `sending` entries that load back as `queued`
  (so a batch the server did apply may go out again — and come back
  `duplicate`).
- **The single-flight latch** is cleared in the drain promise's
  `.finally`, not inside the body: a body that never awaits (nothing
  queued, nothing ready) would otherwise clear the latch before it is
  set and leave a settled promise in its place, and every later drain
  would answer that stale promise and send nothing. The queue specs pin
  this — a drain that finds nothing ready is followed by one that sends.
- `onUploaded` fires once per finished item for the life of the
  provider (or until `clearAll`); `onDrained` fires on every drain.
