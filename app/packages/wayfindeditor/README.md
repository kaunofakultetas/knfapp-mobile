# wayfindeditor

A headless editor for building graphs: an immutable document that
changes only through a list of `Change`s (one entity before and after,
or the building's own fields), the editing verbs with their cascades
spelled out (a node takes its edges; a level cannot go while nodes stand
on it), checkpoint undo that folds a forty-move drag into one step, live
validation through a validator the host injects, and the op list a
server sync sends — each stamped with the revision the phone's copy of
that entity came from. Pure TypeScript plus one React hook; it owns no
plan viewer and no transport: the plan is drawn by whatever the host
renders (`@knf/wayfinduikit` in this repo), the ops travel through
whatever the host sends them with (`@knf/wayfindsync`), and the graph
type is structural, so the routing engine's own `BuildingGraph`
satisfies it without the packages importing each other.

```tsx
import { useEditor } from '@knf/wayfindeditor';
import { validateGraph, type BuildingGraph } from '@knf/wayfindengine';   // any Validator<G> will do

const { state, actions } = useEditor<BuildingGraph>({
  document,                    // a GraphLike — normalised on load, every edge gets an id
  revision, revisions,         // the draft's revision, and per "kind:id" the revision each entity last changed in
  validate: validateGraph,     // optional: runs after a quiet period, issues carry a stable id
  validateDelayMs: 300,        // optional: the quiet period
  onCommit: ({ label, changes, ops }) => sync.enqueueOps(ops),   // every closed checkpoint, as server ops
  nextOpId: () => mint('op'),  // optional: op ids, so a replayed batch applies once
});

actions.begin('move');                       // a gesture: one undo step however many moves
actions.moveNode('n-lobby', 120, 600);
actions.end();                               // closes it and hands its ops to onCommit

const answer = actions.deleteNode('n-d101'); // { changes, blocked?: { reason, ids } }
if (answer.blocked?.reason === 'node_has_rooms') actions.deleteNode('n-d101', { force: true });
```

## The document

The vocabulary is **structural on purpose**. `GraphLike` is anything
with `version: 1`, a `building` id and four arrays — `levels`, `nodes`,
`edges`, `rooms` — whose entities carry the few fields an editor must
read: a level's id, label, `viewBox`, `metersPerPixel` and `ordinal`
(`plan` and `northDeg` optional); a node's id, `level`, `x`, `y` and
`kind` (`roomId`, `pano`, `panoYaw`, `qr`, `landmark` optional); an
edge's `a`, `b` and `kind` (`id`, `lengthM`, `oneWay` optional); a
room's id, `name`, `level` and `nodeId` (`nameKey`, `category`,
`polygon`, `aliases` optional); and on the graph itself an optional
`entranceNodeId` and `northDeg`. Every function is generic in the graph
type and hands the same type back, and everything else on an entity
travels through untouched — the engine's `BuildingGraph` fits as it is,
its `panoGeometry`, `tags`, `hours` and the rest riding along. The
validator is injected for the same reason (`Validator<G>`: a graph in, a
list of `{ severity, code, ref, message }` out — exactly what
`validateGraph` answers), so neither package imports the other.

Edges have no id in the engine's contract; the editor needs one to
address an edge, so `normaliseDocument(doc)` stamps `"<a>--<b>"` on any
edge without one (`"<a>--<b>-2"`, `-3`… when taken) and answers the same
object when nothing needed stamping, so identity still means
"unchanged". The stamped id travels out with the document — the engine
ignores fields it never reads. `getEntity(doc, kind, id)` looks an
entity up (an edge by its stamped id), `entityId(entity)` reads the id
off any entity, and `buildingFields(doc)` answers the building's two
editable fields as one object (`{ entranceNodeId, northDeg }`, null when
absent).

A **`Change`** is one entity before and after (null = absent), or the
building's fields before and after:

```ts
{ kind: 'node', id: 'n-lobby', before: { … }, after: { …, x: 120 } }   // replace
{ kind: 'edge', id: 'n-a--n-b', before: null, after: { … } }           // add
{ kind: 'room', id: 'r-101', before: { … }, after: null }              // remove
{ kind: 'building', before: { entranceNodeId: 'n-1', northDeg: null }, after: { entranceNodeId: null, northDeg: null } }
```

That one shape carries every edit, every cascade and every undo.
`applyChanges(doc, changes)` answers a new document with the list
applied in order: an `after` of null removes the entity, a `before` of
null adds it (appended — the document keeps authoring order), anything
else replaces it in place; a replace of an id the document does not
hold is appended rather than lost (a remote change to an entity the
phone never saw is still a change), a remove of one is a no-op; a
building change writes both fields explicitly. `invert(changes)` is the
list that undoes it — each change swapped, the list reversed, so a
cascade unwinds in the opposite order it happened.

## The editing verbs

Each verb reads the document and answers an `Edit` — the `changes` that
would do the job, never a new document — so the hook can record them
into the open checkpoint and apply them in one motion, and a test can
read exactly what an edit does. A verb that cannot proceed answers no
changes and `blocked: { reason, ids }` naming why:

| Verb | Changes | Blocked |
| --- | --- | --- |
| `addLevel(doc, level)` | the level added | `duplicate_id` |
| `updateLevel(doc, id, patch)` | the level replaced with the patch spread over it | `missing` |
| `deleteLevel(doc, id)` | the level removed | `missing`; `level_has_nodes` (the ids of the nodes standing on it) |
| `addNode(doc, node)` | the node added | `duplicate_id` |
| `moveNode(doc, id, x, y)` | the node at the new position — one change, so a drag coalesces; a move to where it already stands answers no changes at all | `missing` |
| `updateNode(doc, id, patch)` | the node patched | `missing` |
| `deleteNode(doc, id, { force? })` | every edge on it removed, then (under `force`) every room pointing at it unlinked — `nodeId: ''`, the room stays — then the node, then a building change clearing `entranceNodeId` if it was the entrance | `missing`; `node_has_rooms` (the room ids) unless `force` |
| `addEdge(doc, a, b, extra)` | the edge `{ ...extra, id, a, b }` added, id `"<a>--<b>"` (suffixed when taken) | `same_node`; `missing` (the ends not in the graph); `duplicate_id` when the pair is already joined in either direction (the existing edge's id) |
| `updateEdge(doc, id, patch)` / `deleteEdge(doc, id)` | the edge patched / removed | `missing` |
| `addRoom(doc, room)` | the room added | `duplicate_id` |
| `updateRoom(doc, id, patch)` | the room patched | `missing` |
| `deleteRoom(doc, id)` | the room removed, then every node whose `roomId` named it set to `roomId: null` | `missing` |
| `setBuilding(doc, patch)` | one building change with the entrance and the north bearing; a patch that changes neither answers no changes | `missing` (an entrance that is not a node) |

A refused node delete is refused rather than cascaded on purpose: a
room with no door is an error the validator shows, a room silently gone
is a loss — `force` unlinks, it never deletes.

A **`Patch<E>`** is `Partial<Omit<E, 'id'>> & { id?: never } &
Record<string, unknown>`: the fields the editor knows, and any the
host's own entity type carries beyond them (`panoGeometry`,
`panoHeading`, `hours`…) — an update spreads it over the entity, so a
host edits its own fields through the same verb. Never the id: the
`id?: never` refuses one at compile time (the index signature would
otherwise re-admit what the `Omit` excludes), and the update verbs drop
an `id` a JS host smuggles in at runtime — a patch can never re-address
an entity.

## Checkpoint history

`History` is `{ past, future, open }` — closed checkpoints behind, undone
ones ahead, and the gesture in progress, each a `{ label, changes }`.
Pure: every function answers a new History, and undo / redo answer the
changes the document must apply beside it.

- `begin(history, label)` opens a checkpoint; a begin while one is open
  closes the earlier one first, so a missed `end` never swallows the
  next gesture.
- `record(history, changes, label?)` folds changes into the open
  checkpoint; without one it opens and closes one around them — an edit
  outside any gesture is its own step. Empty changes record nothing.
- `end(history)` closes the open checkpoint into `past`, capped at
  `HISTORY_CAP` (200, the oldest dropped), and **empties `future`**; an
  open checkpoint with no changes leaves nothing behind.
- `beginClosing` / `recordClosing` / `endClosing` are the same moves
  answering `{ history, closed }` — the `Checkpoint` the call closed, or
  null. A caller that commits closed checkpoints (the hook) uses these,
  because inferring closure from the history's shape fails at the cap:
  once the past holds 200, its length stops growing. `endClosing`
  answers the checkpoint it closed, `recordClosing` the one it wrapped
  around a solo edit, `beginClosing` the one its implicit end closed.
  `begin` / `record` / `end` are thin wrappers over them.
- `undo(history)` closes any open checkpoint first (an undo mid-gesture
  undoes the gesture so far), moves the newest closed one to the front
  of `future` and answers `invert(its changes)`; nothing to undo answers
  the history unchanged and no changes. `redo` is the mirror, answering
  the checkpoint's own changes and putting it back on `past` (capped).
- `coalesce(existing, incoming)` is how a checkpoint absorbs a change:
  keyed per entity (`kind:id`, or `building`), a change for an entity
  the list already holds **keeps that entry's `before` and takes the new
  `after`** — a drag of forty moves is one change from the first
  position to the last, undone in one — an entity added then deleted in
  one gesture cancels out to nothing, building fields chain the same
  way, and a change for a new entity is appended, so cascade order
  survives.

## What a sync sends

`changesToOps(changes, revisions, nextId)` turns a checkpoint's changes
into `ServerOp`s in the server's vocabulary, one per change, in order:

- an entity with an `after` → `{ type: 'upsert', kind, entityId, data }`
  where `data` is the entity **without its id** (the id is the address,
  not the payload);
- an entity with `after: null` → `{ type: 'delete', kind, entityId }`;
- a building change → `{ type: 'building', data: { entranceNodeId, northDeg } }`.

Entity ops carry `baseRevision` when `revisions` — a map keyed by
`revisionKey(kind, id)`, `"kind:id"` — holds a number for that entity:
the revision the phone's copy came from, which is what the server's
conflict check reads. A brand-new entity has none and carries none —
its upsert is marked **`fresh: true`** instead (an add whose `before`
is null and whose entity the revisions map does not know), which is how
the sync's outbox tells "created here, the server never saw it" from an
overwrite: a delete arriving behind a fresh queued upsert cancels the
pair outright. The server ignores fields it does not know, so `fresh`
costs nothing on the wire.
Every op's `id` comes from `nextId()`, so a replayed batch applies once.
The shape is the same one `@knf/wayfindsync` speaks, declared on both
sides without either importing the other.

## The hook

`useEditor(options)` is the editor as one hook — the document, the
history, the selection, the shown level and the validator's issues,
with actions that record into the open gesture and apply at once. The
document, the history and the revisions live in refs (a drag records
dozens of moves between renders) and are mirrored into `state` once per
action.

**Options** — `document` (normalised on load), `revision` (default 0),
`revisions` (per `"kind:id"`), `validate` (a `Validator<G>` or null),
`validateDelayMs` (300), `onCommit` and `nextOpId` (default
`op-<time>-<counter>`, base 36). `onCommit` and `validate` are held in
refs, so inline arrows are fine.

**State** — `document`, `revision`, `selection` (`{ kind, id }` or
null), `shownLevel` (the first level's id to begin with), `issues`
(`EditorIssue[]`: `id`, `severity`, `code`, `ref`, `message`),
`ignoredIssues` (ids), `canUndo` (a closed checkpoint behind, or an open
one with changes), `canRedo`, and `edits` — the closed checkpoints not
yet undone, the session's edit count (capped like the history).

**Actions** — `begin(label)` / `end()` / `undo()` / `redo()`,
`select(selection | null)`, `showLevel(id)`, `ignoreIssue(id)`, the
fourteen verbs above with the document argument dropped (`addEdge`'s
`extra` defaults to `{ kind: 'hallway' }`), each answering the verb's
`Edit` so a screen can read `blocked`; and three doors for the outside
world — `applyRemote(changes, revisions?)` applies changes and merges the
revisions **without recording** (another admin's change, the server's
conflict answer), `replace(document, revision, revisions?)` swaps in a
whole new document with the history emptied, the selection cleared and
the shown level kept only if it still exists, and
`acknowledge(entries)` — `{ kind, id, revision }` each — moves every
named entity's revision to the one ITS batch was applied at (a drain of
several batches answers several revisions) and raises `state.revision`
to the entries' max (never lowers).

**Commits** — a verb outside a gesture is its own checkpoint and
commits at once; inside one, nothing commits until the gesture closes —
by `end()`, or by the `begin` of the next gesture (a drag whose end the
system stole still commits when the next tap begins). Every closed
checkpoint reaches `onCommit` exactly once, through the history's
closing variants — never inferred from the history's shape, so the
promise holds past `HISTORY_CAP` too. A closed checkpoint arrives as
`{ label, changes, ops }` — the gesture's `begin` label (or the verb's
own: `add node`, `move node`, `link`, `edit building`…), the coalesced
changes, and `changesToOps(changes, revisions, nextOpId)` over the
revisions as they stand then (the ones the draft was loaded with, or
the server's answers since). `undo` and `redo` apply their changes and
commit them too, labelled `undo` / `redo`, so the server follows the
phone step for step; an undo while a gesture is open first closes and
commits the gesture's forward ops, then commits the inverse — the
server always receives forward then inverse, never the inverse of ops
it was never sent (a redo mid-gesture likewise closes and commits the
gesture first; closing empties the redo stack, so nothing is then
redone). A blocked verb changes nothing and commits nothing.

**Validation** runs on the closed document after a quiet period — every
change (a verb, undo, redo, `applyRemote`, `replace`) resets the timer,
and once `validateDelayMs` passes in silence the validator sees the
document as it stands then, never per drag frame. Each finding gets
`id = issueId(issue)` — `"code:ref"`, stable across runs — so an ignored
issue stays ignored while its finding keeps coming back; the hook keeps
`ignoredIssues` beside `issues` and leaves the filtering to the screen.
Without a validator no issue is ever set.

## Pairing with @knf/wayfindsync and @knf/wayfinduikit

The three packages meet only in the host; none imports another. The
app's map editor (`app/(main)/map-editor/index.tsx`) is the reference
wiring, and it goes like this:

- **The editor hands ops to the sync.** `onCommit` enqueues `ops` on
  the sync provider's outbox (`sync.enqueueOps`, read through a ref so
  the hook's callback stays put); the outbox coalesces, persists and
  drains them.
- **The sync's answers come back as revisions.** An effect on
  `sync.status.lastDrain` calls `actions.acknowledge` with the report's
  applied entries — each `{ kind, entityId, revision }`, the revision
  its own batch answered — so the next ops on those entities carry the
  right `baseRevision`. A finished upload
  (`sync.status.uploads`, status `done`, with a `target`) becomes an
  `updateNode` (`pano` and `panoGeometry` from the answer) or an
  `updateLevel` (`plan`), then `sync.acknowledgeUpload`.
- **A conflict has two answers.** Each entry in
  `sync.status.rejectedOps` is a row: *keep mine* is
  `sync.resolveConflict(opId, 'keep-mine')`; *take theirs* applies the
  server's `current` through `actions.applyRemote` (one change,
  `before: null`, `after` the server's data with the id put back — or
  null when it was deleted — and the entity's revision in the map),
  then `sync.resolveConflict(opId, 'drop')`.
- **The kit's plan is the canvas.** `FloorPlan` gets the shown level
  (`state.shownLevel`), the nodes and polygon rooms on it as `PlanNode`
  / `PlanRoom`, `selectedNodeId` from `state.selection`, and the edges
  drawn into its `plan` slot (the viewer knows nothing of edges). Its
  intents become verbs: `onPressPlan` under an add tool is one gesture
  — `begin`, `addNode` at the rounded point (plus `addRoom` and the
  node's `roomId` under the room tool), `end`, `select`; under the
  select tool it clears the selection. `onPressNode` selects, or under
  the link tool remembers the first node and `addEdge`s on the second
  (a cross-level pair gets `{ kind: 'stairs', lengthM: 10 }`, else a
  hallway). `onDragNode` opens a `move` gesture on the first move and
  `moveNode`s on every one; `onDragNodeEnd` moves once more and `end`s —
  so the whole drag is one undo step and one op. `FloorSwitcher` taps
  are `showLevel`.
- **Publish** is `await sync.drain()` then `await sync.publish()`;
  `{ ok: false, reason: 'invalid' }` opens the issues panel.
- **Issues** are `state.issues` minus `state.ignoredIssues`;
  `ignoreIssue` on a warning hides it for the session.

The same in the smallest form:

```tsx
function Editor({ draft }) {
  const sync = useWayfindSync();
  const enqueue = useRef(sync.enqueueOps);
  enqueue.current = sync.enqueueOps;

  const { state, actions } = useEditor<BuildingGraph>({
    document: draft.document, revision: draft.revision, revisions: draft.revisions,
    validate: validateGraph,
    onCommit: ({ ops }) => enqueue.current(ops),
  });

  useEffect(() => {                                   // the server's revisions come back
    const report = sync.status.lastDrain;
    if (!report || report.applied.length === 0) return;
    actions.acknowledge(report.applied.flatMap((a) => (a.kind && a.entityId ? [{ kind: a.kind, id: a.entityId, revision: a.revision }] : [])));
  }, [sync.status.lastDrain]);

  const dragging = useRef(false);
  const level = state.document.levels.find((l) => l.id === state.shownLevel);
  return (
    <FloorPlan
      level={level}
      nodes={state.document.nodes.filter((n) => n.level === level.id)}
      selectedNodeId={state.selection?.kind === 'node' ? state.selection.id : null}
      onPressNode={(id) => actions.select({ kind: 'node', id })}
      onPressPlan={({ x, y }) => actions.addNode({ id: mint('n'), level: level.id, x: Math.round(x), y: Math.round(y), kind: 'corridor' })}
      onDragNode={(id, p) => {
        if (!dragging.current) { dragging.current = true; actions.begin('move'); }
        actions.moveNode(id, Math.round(p.x), Math.round(p.y));
      }}
      onDragNodeEnd={(id, p) => { actions.moveNode(id, Math.round(p.x), Math.round(p.y)); actions.end(); dragging.current = false; }}
    />
  );
}
```

## Layout

| Folder | What lives there |
| --- | --- |
| `core/` | `types.ts` (the structural vocabulary — `GraphLike` and the four `*Like` entities, `Change`, `Patch`, `BuildingFields`, `Selection`, `EditorIssue`, `Validator`), `document.ts` (`normaliseDocument`, `getEntity`, `entityId`, `buildingFields`, `applyChanges`, `invert`), `edits.ts` (the fourteen verbs and the `Edit` answer), `history.ts` (`emptyHistory`, `begin` / `record` / `end` and their closing variants `beginClosing` / `recordClosing` / `endClosing`, `undo` / `redo`, `coalesce`, `HISTORY_CAP`), `ops.ts` (`changesToOps`, `revisionKey`, `ServerOp`) |
| `hooks/` | `useEditor` and `issueId` — the document, the history, the selection, the shown level and the issues as one hook |

`index.ts` is the public surface, pinned by `src/__tests__/surface.test.ts`.

## Tests live in the package

`npm test` here runs every spec under `src/**/__tests__/` with the
jest-expo preset and this package's own `babel.config.js`, `TZ=UTC`
pinned — no host needed. Specs sit beside what they pin; `__tests__`
does not ship (`files` in package.json).

- `src/__tests__/surface.test.ts` — the exact runtime export list.
- `src/core/__tests__/document.test.ts` — edge ids stamped once (and
  the same object back when none was needed), adds / replaces / removes
  applied in order and inverted back to the start, a ghost replace
  appended and a ghost remove ignored; every cascade and every block
  (a node taking its edges, refused under a room and unlinking it under
  `force`, the entrance forgetting a deleted node, the stamped edge id,
  the self-link and the second link refused, a level with nodes, a
  room's node forgetting it, a move that moves nothing), a smuggled
  patch `id` dropped so an update never re-addresses an entity; a
  gesture of three moves as one step from the first position, undone
  and redone as one, add-then-delete cancelling, an empty gesture
  leaving nothing, a new step emptying the future, the cap, the closing
  variants naming what they closed even at the cap; `changesToOps` with
  the id stripped from the data, only known revisions stamped, and
  `fresh` only on a new entity the revisions map does not know.
- `src/hooks/__tests__/useEditor.test.tsx` — a gesture committing once
  as ops with the loaded revisions, nothing validated until the quiet
  period and the finding with its stable id after it, undo re-committing
  the inverse; an edit outside a gesture as its own step and a blocked
  one answering why and committing nothing; every gesture-less edit
  still committing past `HISTORY_CAP`, a begin-while-open committing
  the swallowed gesture, an undo mid-gesture committing forward ops
  before the inverse; `applyRemote` bypassing history, `acknowledge`
  moving each entity to its own answered revision, `replace` resetting
  the revision, the history and the shown level.

## What the host supplies

- **`document`** — any `GraphLike`; the engine's `BuildingGraph` as
  fetched or bundled. Normalised on load, so edges without ids are fine.
- **`revision` and `revisions`** — the draft revision and the per-entity
  map the server sent with it; without them every op goes out without a
  `baseRevision` (the server then has nothing to check a conflict
  against).
- **`validate`** — the engine's `validateGraph`, or any function of the
  same shape; omitted, `issues` stays empty.
- **`onCommit`** — where closed checkpoints go: a sync outbox, a log, a
  host-side draft copy (`changes` is there for that).
- **`nextOpId`** — ids unique across the phone's session and its
  replays; the default is time-plus-counter.
- **A plan viewer and a tool rail** — the hook holds a selection and a
  shown level and answers `blocked` reasons; what a tap means and how a
  refusal is shown is the screen's.

## Behaviours worth knowing

- The document is immutable: every action answers a new object, and
  `normaliseDocument` answers the same one when nothing needed an id,
  so identity means "unchanged".
- A gesture is one undo step whatever it records: a drag of forty moves
  is one change from the first position to the last, and an entity
  added and deleted inside one gesture leaves no trace at all.
- `moveNode` to where the node already stands and `setBuilding` with
  nothing new answer no changes — nothing is recorded and nothing
  committed.
- `deleteNode` refuses while a room points at the node; `force` unlinks
  the room (`nodeId: ''`) and keeps it, so the validator can show the
  room without a door. `deleteRoom` needs no force: the nodes that named
  it just forget it.
- `addEdge` refuses a second link between the same pair in either
  direction and names the existing edge; a different kind between the
  same nodes is still the same pair.
- A new checkpoint empties the redo stack; the past is capped at 200.
  The cap only forgets undo steps — it never loses a commit: the hook
  is told the closed checkpoint by the history's closing variants
  rather than inferring it from the past's length, so every closed
  checkpoint reaches `onCommit` exactly once, at the cap and past it.
- A gesture the screen never `end()`ed is not lost either: the next
  `begin` closes it and commits it, and an `undo` mid-gesture closes
  and commits the forward ops before committing the inverse — the
  server never receives the inverse of ops it was never sent.
- `undo` and `redo` commit their changes to `onCommit` like any edit
  (labelled `undo` / `redo`), so the server sees the same steps the
  phone took.
- `changesToOps` never puts the id inside `data`, stamps `baseRevision`
  only for entities the revisions map knows, marks a brand-new entity's
  upsert `fresh: true` (created here, no revision known), and never
  stamps a building op.
- Validation is debounced on every change, including remote ones and a
  `replace`; issue ids are `code:ref`, so an ignore survives re-runs.
- `applyRemote` bypasses history: a remote change is not undoable, and
  `canUndo` is unmoved by it. `replace` empties history and clears the
  selection but keeps the shown level when the new document still has it.
- `acknowledge` moves each entity to its own answered revision and only
  ever raises `state.revision`.
- A patch can never re-address an entity: `Patch<E>` refuses `id` at
  compile time and the update verbs drop a smuggled one at runtime, so
  `change.id`, the document and the op's `entityId` always agree.
