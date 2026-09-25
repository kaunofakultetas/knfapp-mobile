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







// -----------------------------------------------------------
// Edit
// -----------------------------------------------------------
//
// What every verb answers: the changes that would do the job,
// or a refusal naming why and no changes.
//
// Used by:
//   - every builder below — the return shape
//   - hooks/useEditor.ts — every action's answer
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface Edit {
  changes: Change[];
  // Why nothing happened, when nothing did
  blocked?: { reason: 'level_has_nodes' | 'node_has_rooms' | 'missing' | 'duplicate_id' | 'same_node'; ids: string[] } | null;
}







// -----------------------------------------------------------
// ok
// -----------------------------------------------------------
//
// The succeeding Edit shape every builder below answers with.
//
// Used by:
//   - every builder in this file
// -----------------------------------------------------------

const ok = (changes: Change[]): Edit => ({ changes });







// -----------------------------------------------------------
// blocked
// -----------------------------------------------------------
//
// A refusal carries no changes — only the reason and the ids
// standing in the way.
//
// Used by:
//   - the delete / add builders below — every cascade guard
// -----------------------------------------------------------

const blocked = (reason: NonNullable<Edit['blocked']>['reason'], ids: string[] = []): Edit => ({ changes: [], blocked: { reason, ids } });







// -----------------------------------------------------------
// sansId
// -----------------------------------------------------------
//
// A patch can never re-address an entity: the Patch type
// refuses an id, but a JS host (or an `as` cast) can smuggle
// one past it — dropped here before any update spreads it.
//
// Used by:
//   - the update builders below — every patch on the way in
// -----------------------------------------------------------

const sansId = <E,>(patch: Patch<E>): Patch<E> => {
  if (!('id' in (patch as Record<string, unknown>))) return patch;
  const { id: _dropped, ...fields } = patch as Record<string, unknown>;
  void _dropped;
  return fields as Patch<E>;
};







// -----------------------------------------------------------
// addLevel
// -----------------------------------------------------------
//
// The id is the only gate — a taken one answers blocked
// 'duplicate_id'; everything else about the level is the
// validator's business.
//
// Used by:
//   - hooks/useEditor.ts — actions.addLevel; the map-editor's
//     add-floor button goes through it
// -----------------------------------------------------------

export function addLevel(doc: GraphLike, level: LevelLike): Edit {
  if (getEntity(doc, 'level', level.id)) return blocked('duplicate_id', [level.id]);
  return ok([{ kind: 'level', id: level.id, before: null, after: level }]);
}







// -----------------------------------------------------------
// updateLevel
// -----------------------------------------------------------
//
// Merges the patch over the stored row (a smuggled id is
// dropped); an unknown level answers blocked 'missing'.
//
// Used by:
//   - hooks/useEditor.ts — actions.updateLevel; the map-editor's
//     level sheet fields and plan upload go through it
// -----------------------------------------------------------

export function updateLevel(doc: GraphLike, id: string, patch: Patch<LevelLike>): Edit {
  const before = getEntity(doc, 'level', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'level', id, before, after: { ...before, ...sansId(patch) } }]);
}







// -----------------------------------------------------------
// deleteLevel
// -----------------------------------------------------------
//
// Refused while nodes stand on the level — the blocked answer
// names them.
//
// Used by:
//   - hooks/useEditor.ts — actions.deleteLevel
// -----------------------------------------------------------

export function deleteLevel(doc: GraphLike, id: string): Edit {
  const before = getEntity(doc, 'level', id);
  if (!before) return blocked('missing', [id]);
  const standing = doc.nodes.filter((node) => node.level === id).map((node) => node.id);
  if (standing.length > 0) return blocked('level_has_nodes', standing);
  return ok([{ kind: 'level', id, before, after: null }]);
}







// -----------------------------------------------------------
// addNode
// -----------------------------------------------------------
//
// Only the id is checked — a duplicate answers blocked; a
// node placed on a level that does not exist is the
// validator's finding, not a refusal here.
//
// Used by:
//   - hooks/useEditor.ts — actions.addNode; the map-editor's
//     draw, stairs and room tools go through it
// -----------------------------------------------------------

export function addNode(doc: GraphLike, node: NodeLike): Edit {
  if (getEntity(doc, 'node', node.id)) return blocked('duplicate_id', [node.id]);
  return ok([{ kind: 'node', id: node.id, before: null, after: node }]);
}







// -----------------------------------------------------------
// moveNode
// -----------------------------------------------------------
//
// What a drag records many times per second; it stays one
// Change so the checkpoint coalesces it into first position →
// last position.
//
// Used by:
//   - hooks/useEditor.ts — actions.moveNode; the map-editor's
//     node drags go through it
// -----------------------------------------------------------

export function moveNode(doc: GraphLike, id: string, x: number, y: number): Edit {
  const before = getEntity(doc, 'node', id);
  if (!before) return blocked('missing', [id]);
  if (before.x === x && before.y === y) return ok([]);
  return ok([{ kind: 'node', id, before, after: { ...before, x, y } }]);
}







// -----------------------------------------------------------
// updateNode
// -----------------------------------------------------------
//
// Merges the patch over the stored row with any smuggled id
// dropped; an unknown node answers blocked 'missing'. No
// cascade — a re-pointed roomId or a level move is taken as
// given and left for the validator to judge.
//
// Used by:
//   - hooks/useEditor.ts — actions.updateNode; the map-editor's
//     node sheet (kind, landmark, pano yaw, QR, room link)
// -----------------------------------------------------------

export function updateNode(doc: GraphLike, id: string, patch: Patch<NodeLike>): Edit {
  const before = getEntity(doc, 'node', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'node', id, before, after: { ...before, ...sansId(patch) } }]);
}







// -----------------------------------------------------------
// panoAttachPatch
// -----------------------------------------------------------
//
// The node patch that attaches a stored panorama — the ONE
// place that knows a new photo invalidates the facing. A
// panoYaw is a property of the picture it was measured on,
// so a different url clears it and stamps the heading's
// provenance from what the new photo itself knows (its
// recorded compass heading, else an honest 'auto'); the same
// url keeps the alignment untouched — the server's url is
// content-addressed, so the same bytes answer the same url
// and re-attaching the identical picture changes nothing.
// The geometry rides through as the caller measured it.
//
// Used by:
//   - app/(main)/map-editor/index.tsx — the import upload's
//     landing on the node
//   - app/(main)/map-editor/capture.tsx — the capture's assign;
//     both attach paths go through here so neither can forget
//     the rule
// -----------------------------------------------------------

export interface PanoAttach {
  // The stored coverage, as the caller measured it
  geometry: Record<string, unknown>;
  // The photo's own compass heading, when it recorded one
  headingDeg?: number | null;
}

export function panoAttachPatch(node: { pano?: unknown } | null | undefined, url: string, meta: PanoAttach): Patch<NodeLike> {
  const samePano = node?.pano === url;
  return {
    pano: url,
    panoGeometry: meta.geometry,
    ...(samePano ? {} : { panoYaw: null, panoHeading: meta.headingDeg != null ? { source: 'compass', rawDeg: meta.headingDeg } : { source: 'auto' } }),
  };
}







// -----------------------------------------------------------
// deleteNode
// -----------------------------------------------------------
//
// The node takes every edge on it; a node a room points at is
// refused unless the caller says force — the room is then
// unlinked, not deleted. The building's entrance forgets a
// deleted node too.
//
// Used by:
//   - hooks/useEditor.ts — actions.deleteNode; the map-editor's
//     delete button retries with force on node_has_rooms
// -----------------------------------------------------------

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
// addEdge
// -----------------------------------------------------------
//
// An edge id is "<a>--<b>" unless taken; linking a node to
// itself or two nodes already joined is refused.
//
// Used by:
//   - hooks/useEditor.ts — actions.addEdge; the map-editor's
//     link and stairs tools go through it
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







// -----------------------------------------------------------
// updateEdge
// -----------------------------------------------------------
//
// Merges the patch over the stored row — only the id is
// immutable (even the endpoints may be re-pointed); an
// unknown edge answers blocked 'missing'.
//
// Used by:
//   - hooks/useEditor.ts — actions.updateEdge
// -----------------------------------------------------------

export function updateEdge(doc: GraphLike, id: string, patch: Patch<EdgeLike>): Edit {
  const before = getEntity(doc, 'edge', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'edge', id, before, after: { ...before, ...sansId(patch) } }]);
}







// -----------------------------------------------------------
// deleteEdge
// -----------------------------------------------------------
//
// No cascade — an edge takes nothing with it; an unknown id
// answers blocked 'missing'.
//
// Used by:
//   - hooks/useEditor.ts — actions.deleteEdge; the map-editor's
//     delete-link button in the node sheet
// -----------------------------------------------------------

export function deleteEdge(doc: GraphLike, id: string): Edit {
  const before = getEntity(doc, 'edge', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'edge', id, before, after: null }]);
}







// -----------------------------------------------------------
// addRoom
// -----------------------------------------------------------
//
// Only the room id is checked — a duplicate answers blocked;
// a nodeId pointing at no node is the validator's finding,
// not a refusal here.
//
// Used by:
//   - hooks/useEditor.ts — actions.addRoom; the map-editor's
//     room tool and node sheet go through it
// -----------------------------------------------------------

export function addRoom(doc: GraphLike, room: RoomLike): Edit {
  if (getEntity(doc, 'room', room.id)) return blocked('duplicate_id', [room.id]);
  return ok([{ kind: 'room', id: room.id, before: null, after: room }]);
}







// -----------------------------------------------------------
// updateRoom
// -----------------------------------------------------------
//
// Merges the patch over the stored row with any smuggled id
// dropped; an unknown room answers blocked 'missing'.
//
// Used by:
//   - hooks/useEditor.ts — actions.updateRoom; the map-editor's
//     room-name field goes through it
// -----------------------------------------------------------

export function updateRoom(doc: GraphLike, id: string, patch: Patch<RoomLike>): Edit {
  const before = getEntity(doc, 'room', id);
  if (!before) return blocked('missing', [id]);
  return ok([{ kind: 'room', id, before, after: { ...before, ...sansId(patch) } }]);
}







// -----------------------------------------------------------
// deleteRoom
// -----------------------------------------------------------
//
// Any node that named this room as its own forgets it in the
// same edit.
//
// Used by:
//   - hooks/useEditor.ts — actions.deleteRoom; the map-editor's
//     delete button when the node carries a room
// -----------------------------------------------------------

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
