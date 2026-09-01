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

export type EntityKind = 'level' | 'node' | 'edge' | 'room';

export interface LevelLike {
  id: string;
  label: string;
  viewBox: [number, number, number, number];
  metersPerPixel: number;
  ordinal: number;
  plan?: string | null;
  northDeg?: number | null;
}

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

export type EntityOf<K extends EntityKind> = K extends 'level' ? LevelLike : K extends 'node' ? NodeLike : K extends 'edge' ? EdgeLike : RoomLike;

export type Entity = LevelLike | NodeLike | EdgeLike | RoomLike;

// A partial update: the fields the editor knows, and any the
// host's own entity type carries beyond them — never the id
// (the explicit `id?: never` beats the index signature, which
// would otherwise re-admit what the Omit excludes; the update
// verbs drop a smuggled one at runtime too)
export type Patch<E> = Partial<Omit<E, 'id'>> & { id?: never } & Record<string, unknown>;

// The building row's own editable fields
export interface BuildingFields {
  entranceNodeId: string | null;
  northDeg: number | null;
}

export type Change =
  | { kind: EntityKind; id: string; before: Entity | null; after: Entity | null }
  | { kind: 'building'; before: BuildingFields; after: BuildingFields };

// What the screen has picked — one entity, or nothing
export interface Selection {
  kind: EntityKind;
  id: string;
}

// One validator finding, in the engine's own shape; `id` is
// stable across runs (code + ref) so an ignore survives
export interface EditorIssue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  ref: string;
  message: string;
}

export type Validator<G extends GraphLike> = (graph: G) => { severity: 'error' | 'warning'; code: string; ref: string; message: string }[];
