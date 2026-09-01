# Changelog

## 1.0.1 — 2026-09-01

Commit-loss fixes — every closed checkpoint now reaches `onCommit`
exactly once — plus the sync contract's `fresh` mark and per-entry
acknowledge.

- History — new `beginClosing` / `recordClosing` / `endClosing` beside
  `begin` / `record` / `end` (now thin wrappers): each answers
  `{ history, closed }` naming the `Checkpoint` it closed (or null —
  an empty gesture, a record into an open one). `endClosing` answers
  the checkpoint it closed, `recordClosing` the one it wrapped around
  a solo edit, `beginClosing` the one its implicit end closed.
- `useEditor` commits through the closing variants instead of
  inferring closure from the past's length, which silently failed once
  the past sat at `HISTORY_CAP` — the 201st gesture-less edit (and
  every later one) applied and recorded but never reached `onCommit`.
  Fixed; a spec edits past the cap and counts commits.
- `begin` while a gesture is open now commits the gesture it closes —
  a drag whose `end` the system stole no longer loses its move on the
  wire. `undo` (and `redo`) while a gesture is open first closes and
  commits the forward ops, then commits the inverse, so the server
  always receives forward then inverse — never a delete for an entity
  it never saw.
- `acknowledge(entries)` is per entry — `{ kind, id, revision }` — so a
  drain of several batches moves each entity to the revision its own
  batch answered; `state.revision` becomes the max of itself and the
  entries' max. Was `acknowledge(entries, revision)`.
- `ServerOp` gains `fresh?: boolean`; `changesToOps` sets it on an
  upsert whose `before` is null and whose entity the revisions map does
  not know — created here, never seen by the server — so the sync's
  outbox can cancel a fresh upsert and a later delete outright. The
  server ignores unknown op fields.
- `Patch<E>` refuses `id` at compile time (`id?: never` beats the index
  signature that defeated the `Omit`), and the four update verbs drop a
  smuggled `id` at runtime — an update can never re-address an entity,
  so `change.id`, the document and the op's `entityId` always agree
  (before, a patch carrying an id renamed the entity in the document
  while undo duplicated it and the op kept the old address).

## 1.0.0 — 2026-09-01

First cut.

- Types — the structural vocabulary: `GraphLike` (`version: 1`, a
  `building` id, `levels` / `nodes` / `edges` / `rooms`, an optional
  `entranceNodeId` and `northDeg`) over `LevelLike`, `NodeLike`,
  `EdgeLike` and `RoomLike`, each the few fields an editor must read
  with everything else travelling through untouched, so the engine's
  `BuildingGraph` satisfies it without the packages importing each
  other; `Change` (one entity before and after, null for absent, or the
  building's fields before and after); `Patch<E>` (the known fields
  plus any the host's entity carries); `BuildingFields`, `Selection`,
  `EditorIssue`, `Validator<G>`.
- Document — `normaliseDocument` (every edge gets an id, `"<a>--<b>"`
  suffixed when taken; the same object back when nothing needed one),
  `getEntity` / `entityId` / `buildingFields`, `applyChanges` (in order,
  immutable: null `after` removes, null `before` or an unknown id
  appends, else replaces in place; a remove of an unknown id is a
  no-op), `invert` (swapped and reversed).
- Edits — `addLevel` / `updateLevel` / `deleteLevel` (refused with
  `level_has_nodes` while nodes stand on it), `addNode` / `moveNode`
  (no changes for a move to the same spot) / `updateNode` /
  `deleteNode` (takes every edge on it; refused with `node_has_rooms`
  while a room points at it unless `force`, which unlinks the room
  with `nodeId: ''` and keeps it; clears the entrance if it was one),
  `addEdge` (id `"<a>--<b>"`, `same_node` and a second link between a
  pair refused, `missing` ends named) / `updateEdge` / `deleteEdge`,
  `addRoom` / `updateRoom` / `deleteRoom` (the nodes naming it forget
  it), `setBuilding` (`missing` for an entrance that is not a node; no
  changes when nothing changes). Every verb answers an `Edit` —
  `changes`, or `blocked: { reason, ids }` and none.
- History — `emptyHistory`, `begin` / `record` / `end`, `undo` / `redo`
  (answering the changes to apply beside the new history), `coalesce`
  (per entity: the first `before` kept, the newest `after` taken,
  add-then-delete cancelling, new entities appended in cascade order),
  `HISTORY_CAP` (200). A gesture is one step; a `record` outside one is
  its own; a `begin` while one is open closes it first; `end` empties
  the future; undo mid-gesture undoes the gesture so far.
- Ops — `changesToOps` (upsert with the entity's data minus its id,
  delete, building; `baseRevision` from the revisions map, absent for a
  new entity; op ids from the caller), `revisionKey` (`"kind:id"`),
  `ServerOp` — the shape `@knf/wayfindsync` speaks, declared on both
  sides.
- `useEditor` — the document, the history, the selection, the shown
  level and the issues as one hook; the verbs as actions answering
  their `Edit`; `begin` / `end` / `undo` / `redo`; `select`,
  `showLevel`, `ignoreIssue`; `applyRemote` (applied, revisions merged,
  never recorded), `replace` (history emptied, selection cleared, the
  shown level kept if it still exists), `acknowledge` (revisions moved,
  `state.revision` only ever raised). A checkpoint closed by `end` or
  by a verb outside a gesture, and every undo and redo, reaches
  `onCommit` as `{ label, changes, ops }` with the revisions as they
  stand.
  Validation runs through the injected validator after a quiet period
  (`validateDelayMs`, 300 ms; reset by every change), each issue with
  the stable id `issueId` (`"code:ref"`).
- Specs live inside the package (`src/**/__tests__/`) with their own
  `npm test` (jest-expo + the package's babel config, `TZ=UTC`);
  `__tests__` is excluded from `files`.
