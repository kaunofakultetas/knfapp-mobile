// -----------------------------------------------------------
//  [*] wayfindeditor — types
//
//  The editor's vocabulary, structural on purpose: a building
//  graph is anything with levels / nodes / edges / rooms that
//  carry the few fields an editor must read (ids, a node's
//  level and position, an edge's ends, a room's node), so the
//  routing engine's own BuildingGraph satisfies it without the
//  packages importing each other — every function is generic
//  in the graph type and hands the same type back. Everything
//  else on an entity travels through untouched.
//
//  A Change is one entity before and after (null = absent), or
//  the building's own fields before and after; a checkpoint is
//  a list of them and undo is the list inverted. That one
//  shape carries every edit, every cascade and every undo.
//
//  Used by:
//    - everything in the package
// -----------------------------------------------------------







// -----------------------------------------------------------
// EntityKind
// -----------------------------------------------------------
//
// The four entity families every change and selection names.
//
// Used by:
//   - Change / Selection (below), core/ops.ts, core/document.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type EntityKind = 'level' | 'node' | 'edge' | 'room';







// -----------------------------------------------------------
// LevelLike
// -----------------------------------------------------------
//
// The few level fields an editor must read — everything
// else travels through untouched.
//
// Used by:
//   - GraphLike (below), core/edits.ts, hooks/useEditor.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface LevelLike {
  id: string;
  label: string;
  viewBox: [number, number, number, number];
  metersPerPixel: number;
  ordinal: number;
  plan?: string | null;
  northDeg?: number | null;
}







// -----------------------------------------------------------
// NodeLike
// -----------------------------------------------------------
//
// The node fields the editor reads — id, level, position,
// kind, and the optional facts the screens show.
//
// Used by:
//   - GraphLike (below), core/edits.ts, hooks/useEditor.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface NodeLike {
  id: string;
  level: string;
  x: number;
  y: number;
  kind: string;
  roomId?: string | null;
  pano?: string | null;
  panoYaw?: number | null;
  qr?: string | null;
  landmark?: string | null;
}







// -----------------------------------------------------------
// EdgeLike
// -----------------------------------------------------------
//
// The edge fields the editor reads; the id contract rides
// on the field comment.
//
// Used by:
//   - GraphLike (below), core/edits.ts, hooks/useEditor.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface EdgeLike {
  // Optional on the wire, required inside the editor — a graph
  // without edge ids gets them on load (normaliseDocument)
  id?: string | null;
  a: string;
  b: string;
  kind: string;
  lengthM?: number | null;
  oneWay?: boolean;
}







// -----------------------------------------------------------
// RoomLike
// -----------------------------------------------------------
//
// The room fields the editor reads — the node link is what
// the delete cascade guards.
//
// Used by:
//   - GraphLike (below), core/edits.ts, hooks/useEditor.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface RoomLike {
  id: string;
  name: string;
  level: string;
  nodeId: string;
  nameKey?: string | null;
  category?: string | null;
  polygon?: [number, number][] | null;
  aliases?: string[] | null;
}







// -----------------------------------------------------------
// GraphLike
// -----------------------------------------------------------
//
// Anything with levels / nodes / edges / rooms carrying the
// fields above — the engine's BuildingGraph satisfies it
// without the packages importing each other.
//
// Used by:
//   - every function in the package — the generic bound
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface GraphLike {
  version: 1;
  building: string;
  levels: LevelLike[];
  nodes: NodeLike[];
  edges: EdgeLike[];
  rooms: RoomLike[];
  entranceNodeId?: string | null;
  northDeg?: number | null;
}







// -----------------------------------------------------------
// EntityOf
// -----------------------------------------------------------
//
// The entity type one kind names — the lookup the generic
// verbs narrow by.
//
// Used by:
//   - core/document.ts — getEntity's return type
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type EntityOf<K extends EntityKind> = K extends 'level' ? LevelLike : K extends 'node' ? NodeLike : K extends 'edge' ? EdgeLike : RoomLike;







// -----------------------------------------------------------
// Entity
// -----------------------------------------------------------
//
// Any of the four — what a Change carries before and after.
//
// Used by:
//   - Change (below), core/document.ts, core/edits.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type Entity = LevelLike | NodeLike | EdgeLike | RoomLike;







// -----------------------------------------------------------
// Patch
// -----------------------------------------------------------
//
// A partial update: the fields the editor knows, and any the
// host's own entity type carries beyond them — never the id
// (the explicit `id?: never` beats the index signature, which
// would otherwise re-admit what the Omit excludes; the update
// verbs drop a smuggled one at runtime too).
//
// Used by:
//   - core/edits.ts — every update verb's argument
//   - hooks/useEditor.ts — the update actions
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type Patch<E> = Partial<Omit<E, 'id'>> & { id?: never } & Record<string, unknown>;







// -----------------------------------------------------------
// BuildingFields
// -----------------------------------------------------------
//
// The building row's own editable fields.
//
// Used by:
//   - Change (below), core/document.ts, core/edits.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface BuildingFields {
  entranceNodeId: string | null;
  northDeg: number | null;
}







// -----------------------------------------------------------
// Change
// -----------------------------------------------------------
//
// One entity before and after (null = absent), or the
// building's own fields before and after — the one shape
// every edit, cascade and undo travels as.
//
// Used by:
//   - core/document.ts, core/edits.ts, core/history.ts,
//   -   core/ops.ts, hooks/useEditor.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type Change =
  | { kind: EntityKind; id: string; before: Entity | null; after: Entity | null }
  | { kind: 'building'; before: BuildingFields; after: BuildingFields };







// -----------------------------------------------------------
// Selection
// -----------------------------------------------------------
//
// What the screen has picked — one entity, or nothing.
//
// Used by:
//   - hooks/useEditor.ts — the select action and the state
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface Selection {
  kind: EntityKind;
  id: string;
}







// -----------------------------------------------------------
// EditorIssue
// -----------------------------------------------------------
//
// One validator finding, in the engine's own shape; `id` is
// stable across runs (code + ref) so an ignore survives.
//
// Used by:
//   - hooks/useEditor.ts — the issues state and ignoreIssue
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface EditorIssue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  ref: string;
  message: string;
}







// -----------------------------------------------------------
// Validator
// -----------------------------------------------------------
//
// The host's graph checker — the engine's validateGraph
// satisfies it directly.
//
// Used by:
//   - EditorOptions in hooks/useEditor.ts — the validate option
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type Validator<G extends GraphLike> = (graph: G) => { severity: 'error' | 'warning'; code: string; ref: string; message: string }[];
