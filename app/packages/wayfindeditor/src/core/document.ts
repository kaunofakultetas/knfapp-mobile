// -----------------------------------------------------------
//  [*] wayfindeditor — document
//
//  The immutable document and the one way it changes: a list
//  of Changes applied in order, each replacing (or removing,
//  or adding) one entity by kind and id, or the building's
//  fields. Nothing else in the package touches a graph
//  directly — edits produce Changes, history stores them,
//  undo inverts them, sync sends them.
//
//  Edges have no id in the engine's contract; the editor needs
//  one to address an edge, so normaliseDocument stamps
//  "<a>--<b>" (suffixed when taken) on any edge without one.
//  The stamped id travels out with the document — the engine
//  ignores fields it never reads.
//
//  Used by:
//    - core/edits.ts — reads entities to build cascades
//    - core/history.ts — invert
//    - hooks/useEditor.ts — apply on every action
// -----------------------------------------------------------

import type { BuildingFields, Change, Entity, EntityKind, EntityOf, GraphLike } from './types';


// The array an entity kind lives in
const COLLECTION: Record<EntityKind, 'levels' | 'nodes' | 'edges' | 'rooms'> = { level: 'levels', node: 'nodes', edge: 'edges', room: 'rooms' };







// -----------------------------------------------------------
// normaliseDocument
// -----------------------------------------------------------
//
// Every edge with an id, the document otherwise untouched (and
// returned as is when nothing needed stamping, so identity
// still means "unchanged").
//
// Used by:
//   - hooks/useEditor.ts — on load and on a remote replace
// -----------------------------------------------------------

export function normaliseDocument<G extends GraphLike>(doc: G): G {

  const taken = new Set(doc.edges.map((edge) => edge.id).filter((id): id is string => typeof id === 'string' && id.length > 0));
  let changed = false;
  const edges = doc.edges.map((edge) => {
    if (typeof edge.id === 'string' && edge.id.length > 0) return edge;
    let candidate = `${edge.a}--${edge.b}`;
    let n = 2;
    while (taken.has(candidate)) candidate = `${edge.a}--${edge.b}-${n++}`;
    taken.add(candidate);
    changed = true;
    return { ...edge, id: candidate };
  });
  return changed ? { ...doc, edges } : doc;
}







// -----------------------------------------------------------
// getEntity / buildingFields / entityId
// -----------------------------------------------------------
//
// Lookups by kind and id (an edge by its stamped id), and the
// building's editable fields as one object.
//
// Used by:
//   - core/edits.ts, hooks/useEditor.ts
// -----------------------------------------------------------

export function entityId(entity: Entity): string {
  return (entity as { id?: string | null }).id ?? '';
}


export function getEntity<G extends GraphLike, K extends EntityKind>(doc: G, kind: K, id: string): EntityOf<K> | null {
  const list = doc[COLLECTION[kind]] as Entity[];
  return (list.find((entity) => entityId(entity) === id) as EntityOf<K> | undefined) ?? null;
}


export function buildingFields(doc: GraphLike): BuildingFields {
  return { entranceNodeId: doc.entranceNodeId ?? null, northDeg: doc.northDeg ?? null };
}







// -----------------------------------------------------------
// applyChanges
// -----------------------------------------------------------
//
// A new document with every change applied in order. An
// `after` of null removes the entity, a `before` of null adds
// it (appended — the document keeps authoring order), anything
// else replaces it in place. Unknown ids on a replace are
// appended rather than lost: a remote change to an entity the
// phone never saw is still a change.
//
// Used by:
//   - hooks/useEditor.ts — every action, undo and redo
//   - the host's sync — applying the server's deltas
// -----------------------------------------------------------

export function applyChanges<G extends GraphLike>(doc: G, changes: readonly Change[]): G {

  let next: G = doc;
  for (const change of changes) {
    if (change.kind === 'building') {
      next = { ...next, entranceNodeId: change.after.entranceNodeId, northDeg: change.after.northDeg };
      continue;
    }
    const key = COLLECTION[change.kind];
    const list = next[key] as Entity[];
    const at = list.findIndex((entity) => entityId(entity) === change.id);
    let replaced: Entity[];
    if (change.after === null) {
      if (at < 0) continue;
      replaced = list.filter((_, index) => index !== at);
    } else if (at < 0) {
      replaced = [...list, change.after];
    } else {
      replaced = list.map((entity, index) => (index === at ? (change.after as Entity) : entity));
    }
    next = { ...next, [key]: replaced };
  }
  return next;
}







// -----------------------------------------------------------
// invert
// -----------------------------------------------------------
//
// The changes that undo a list: each swapped, the list
// reversed, so a cascade unwinds in the opposite order it
// happened.
//
// Used by:
//   - core/history.ts — undo and redo
// -----------------------------------------------------------

export function invert(changes: readonly Change[]): Change[] {
  return [...changes].reverse().map((change) =>
    change.kind === 'building' ? { kind: 'building', before: change.after, after: change.before } : { ...change, before: change.after, after: change.before },
  );
}
