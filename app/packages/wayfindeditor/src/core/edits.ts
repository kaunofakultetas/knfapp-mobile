// -----------------------------------------------------------
//  [*] wayfindeditor — edits
//
//  The editing verbs. Each reads the document and answers the
//  Changes that would do the job — never a new document — so
//  the hook can record them into the open checkpoint and apply
//  them in one motion, and a test can read exactly what an
//  edit does. Cascades are spelled out here: a node takes
//  every edge on it; a level cannot go while nodes stand on
//  it; a node that a room points at is refused unless the
//  caller says force (the room is then unlinked, not deleted —
//  a room with no door is an error the validator shows, a
//  room silently gone is a loss). An edit that cannot proceed
//  answers `blocked` naming why, and no changes.
//
//  Used by:
//    - hooks/useEditor.ts — every action
// -----------------------------------------------------------

import { buildingFields, getEntity } from './document';
import type { BuildingFields, Change, EdgeLike, GraphLike, LevelLike, NodeLike, Patch, RoomLike } from './types';


export interface Edit {
  changes: Change[];
  // Why nothing happened, when nothing did
  blocked?: { reason: 'level_has_nodes' | 'node_has_rooms' | 'missing' | 'duplicate_id' | 'same_node'; ids: string[] } | null;
}

const ok = (changes: Change[]): Edit => ({ changes });
const blocked = (reason: NonNullable<Edit['blocked']>['reason'], ids: string[] = []): Edit => ({ changes: [], blocked: { reason, ids } });

// A patch can never re-address an entity: the Patch type
// refuses an id, but a JS host (or an `as` cast) can smuggle
// one past it — dropped here before any update spreads it
const sansId = <E,>(patch: Patch<E>): Patch<E> => {
  if (!('id' in (patch as Record<string, unknown>))) return patch;
  const { id: _dropped, ...fields } = patch as Record<string, unknown>;
  void _dropped;
  return fields as Patch<E>;
};







// -----------------------------------------------------------
// Levels
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useEditor.ts
// -----------------------------------------------------------

export function addLevel(doc: GraphLike, level: LevelLike): Edit {
  if (getEntity(doc, 'level', level.id)) return blocked('duplicate_id', [level.id]);
  return ok([{ kind: 'level', id: level.id, before: null, after: level }]);
}


export function updateLevel(doc: GraphLike, id: string, patch: Patch<LevelLike>): Edit {
  const before = getEntity(doc, 'level', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'level', id, before, after: { ...before, ...sansId(patch) } }]);
}


export function deleteLevel(doc: GraphLike, id: string): Edit {
  const before = getEntity(doc, 'level', id);
  if (!before) return blocked('missing', [id]);
  const standing = doc.nodes.filter((node) => node.level === id).map((node) => node.id);
  if (standing.length > 0) return blocked('level_has_nodes', standing);
  return ok([{ kind: 'level', id, before, after: null }]);
}







// -----------------------------------------------------------
// Nodes
// -----------------------------------------------------------
//
// moveNode is what a drag records many times per second; it
// stays one Change so the checkpoint coalesces it into first
// position → last position.
//
// Used by:
//   - hooks/useEditor.ts
// -----------------------------------------------------------

export function addNode(doc: GraphLike, node: NodeLike): Edit {
  if (getEntity(doc, 'node', node.id)) return blocked('duplicate_id', [node.id]);
  return ok([{ kind: 'node', id: node.id, before: null, after: node }]);
}


export function moveNode(doc: GraphLike, id: string, x: number, y: number): Edit {
  const before = getEntity(doc, 'node', id);
  if (!before) return blocked('missing', [id]);
  if (before.x === x && before.y === y) return ok([]);
  return ok([{ kind: 'node', id, before, after: { ...before, x, y } }]);
}


export function updateNode(doc: GraphLike, id: string, patch: Patch<NodeLike>): Edit {
  const before = getEntity(doc, 'node', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'node', id, before, after: { ...before, ...sansId(patch) } }]);
}


export function deleteNode(doc: GraphLike, id: string, options: { force?: boolean } = {}): Edit {
  const before = getEntity(doc, 'node', id);
  if (!before) return blocked('missing', [id]);
  const rooms = doc.rooms.filter((room) => room.nodeId === id);
  if (rooms.length > 0 && !options.force) return blocked('node_has_rooms', rooms.map((room) => room.id));


  const changes: Change[] = [];
  for (const edge of doc.edges) {
    if (edge.a === id || edge.b === id) changes.push({ kind: 'edge', id: edge.id ?? `${edge.a}--${edge.b}`, before: edge, after: null });
  }
  for (const room of rooms) changes.push({ kind: 'room', id: room.id, before: room, after: { ...room, nodeId: '' } });
  changes.push({ kind: 'node', id, before, after: null });
  if (doc.entranceNodeId === id) {
    const fields = buildingFields(doc);
    changes.push({ kind: 'building', before: fields, after: { ...fields, entranceNodeId: null } });
  }
  return ok(changes);
}







// -----------------------------------------------------------
// Edges
// -----------------------------------------------------------
//
// An edge id is "<a>--<b>" unless taken; linking a node to
// itself or two nodes already joined is refused.
//
// Used by:
//   - hooks/useEditor.ts
// -----------------------------------------------------------

export function addEdge(doc: GraphLike, a: string, b: string, extra: Omit<EdgeLike, 'id' | 'a' | 'b'>): Edit {
  if (a === b) return blocked('same_node', [a]);
  if (!getEntity(doc, 'node', a) || !getEntity(doc, 'node', b)) return blocked('missing', [a, b].filter((id) => !getEntity(doc, 'node', id)));
  const joined = doc.edges.find((edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a));
  if (joined) return blocked('duplicate_id', [joined.id ?? `${joined.a}--${joined.b}`]);
  let id = `${a}--${b}`;
  let n = 2;
  while (getEntity(doc, 'edge', id)) id = `${a}--${b}-${n++}`;
  const edge: EdgeLike = { ...extra, id, a, b };
  return ok([{ kind: 'edge', id, before: null, after: edge }]);
}


export function updateEdge(doc: GraphLike, id: string, patch: Patch<EdgeLike>): Edit {
  const before = getEntity(doc, 'edge', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'edge', id, before, after: { ...before, ...sansId(patch) } }]);
}


export function deleteEdge(doc: GraphLike, id: string): Edit {
  const before = getEntity(doc, 'edge', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'edge', id, before, after: null }]);
}







// -----------------------------------------------------------
// Rooms
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useEditor.ts
// -----------------------------------------------------------

export function addRoom(doc: GraphLike, room: RoomLike): Edit {
  if (getEntity(doc, 'room', room.id)) return blocked('duplicate_id', [room.id]);
  return ok([{ kind: 'room', id: room.id, before: null, after: room }]);
}


export function updateRoom(doc: GraphLike, id: string, patch: Patch<RoomLike>): Edit {
  const before = getEntity(doc, 'room', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'room', id, before, after: { ...before, ...sansId(patch) } }]);
}


export function deleteRoom(doc: GraphLike, id: string): Edit {
  const before = getEntity(doc, 'room', id);
  if (!before) return blocked('missing', [id]);
  const changes: Change[] = [{ kind: 'room', id, before, after: null }];
  // A node that named this room as its own forgets it
  for (const node of doc.nodes) {
    if (node.roomId === id) changes.push({ kind: 'node', id: node.id, before: node, after: { ...node, roomId: null } });
  }
  return ok(changes);
}







// -----------------------------------------------------------
// setBuilding
// -----------------------------------------------------------
//
// The entrance and the north bearing, as one change.
//
// Used by:
//   - hooks/useEditor.ts
// -----------------------------------------------------------

export function setBuilding(doc: GraphLike, patch: Partial<BuildingFields>): Edit {
  const before = buildingFields(doc);
  const after = { ...before, ...patch };
  if (after.entranceNodeId === before.entranceNodeId && after.northDeg === before.northDeg) return ok([]);
  if (after.entranceNodeId && !getEntity(doc, 'node', after.entranceNodeId)) return blocked('missing', [after.entranceNodeId]);
  return ok([{ kind: 'building', before, after }]);
}
