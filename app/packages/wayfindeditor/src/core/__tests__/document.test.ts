// -----------------------------------------------------------
//  [*] Tests — document, edits, history, ops
//
//  The one shape every edit takes, and what it promises:
//  changes apply in order and invert exactly, cascades are
//  spelled out, a gesture is one undo step, and a checkpoint
//  leaves as server ops stamped with the entities' revisions.
// -----------------------------------------------------------

import { applyChanges, buildingFields, getEntity, invert, normaliseDocument } from '../document';
import { addEdge, addNode, addRoom, deleteLevel, deleteNode, deleteRoom, moveNode, setBuilding, updateNode } from '../edits';
import { begin, beginClosing, coalesce, emptyHistory, end, endClosing, record, recordClosing, redo, undo, HISTORY_CAP } from '../history';
import { changesToOps } from '../ops';
import type { Change, GraphLike, NodeLike, Patch } from '../types';


const building = (): GraphLike => ({
  version: 1,
  building: 'test',
  levels: [{ id: 'L1', label: '1', viewBox: [0, 0, 100, 100], metersPerPixel: 0.1, ordinal: 1 }],
  nodes: [
    { id: 'a', level: 'L1', x: 0, y: 0, kind: 'entrance' },
    { id: 'b', level: 'L1', x: 10, y: 0, kind: 'corridor', roomId: 'r1' },
  ],
  edges: [{ a: 'a', b: 'b', kind: 'hallway' }],
  rooms: [{ id: 'r1', name: 'One', level: 'L1', nodeId: 'b' }],
  entranceNodeId: 'a',
});


describe('normaliseDocument / applyChanges / invert', () => {
  it('stamps edge ids once and answers the same object when nothing needed one', () => {
    const doc = normaliseDocument(building());
    expect(doc.edges[0].id).toBe('a--b');
    expect(normaliseDocument(doc)).toBe(doc);
    const twice = normaliseDocument<GraphLike>({ ...building(), edges: [{ a: 'a', b: 'b', kind: 'hallway' }, { a: 'a', b: 'b', kind: 'door' }] });
    expect(twice.edges.map((edge) => edge.id)).toEqual(['a--b', 'a--b-2']);
  });

  it('applies adds, replaces and removes in order, immutably, and inverts back to the start', () => {
    const doc = normaliseDocument(building());
    const changes: Change[] = [
      { kind: 'node', id: 'c', before: null, after: { id: 'c', level: 'L1', x: 5, y: 5, kind: 'corridor' } },
      { kind: 'node', id: 'a', before: doc.nodes[0], after: { ...doc.nodes[0], x: 1 } },
      { kind: 'edge', id: 'a--b', before: doc.edges[0], after: null },
      { kind: 'building', before: buildingFields(doc), after: { entranceNodeId: 'c', northDeg: 12 } },
    ];
    const next = applyChanges(doc, changes);
    expect(next).not.toBe(doc);
    expect(doc.nodes).toHaveLength(2);
    expect(next.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
    expect(getEntity(next, 'node', 'a')?.x).toBe(1);
    expect(next.edges).toEqual([]);
    expect(next.entranceNodeId).toBe('c');
    expect(next.northDeg).toBe(12);
    // The inverse writes the building's fields back explicitly
    expect(applyChanges(next, invert(changes))).toEqual({ ...doc, northDeg: null });
  });

  it('a replace of an unknown entity appends it, a remove of one is a no-op', () => {
    const doc = normaliseDocument(building());
    const ghost: Change = { kind: 'room', id: 'r9', before: { id: 'r9', name: 'x', level: 'L1', nodeId: 'a' }, after: { id: 'r9', name: 'y', level: 'L1', nodeId: 'a' } };
    expect(applyChanges(doc, [ghost]).rooms.map((room) => room.id)).toEqual(['r1', 'r9']);
    expect(applyChanges(doc, [{ kind: 'room', id: 'r9', before: null, after: null }])).toEqual(doc);
  });
});


describe('edits', () => {
  const doc = normaliseDocument(building());

  it('deleting a node takes its edges, is refused while a room points at it, and unlinks the room under force', () => {
    expect(deleteNode(doc, 'b')).toEqual({ changes: [], blocked: { reason: 'node_has_rooms', ids: ['r1'] } });
    const forced = deleteNode(doc, 'b', { force: true });
    expect(forced.changes.map((change) => `${change.kind}:${change.kind === 'building' ? '' : change.id}`)).toEqual(['edge:a--b', 'room:r1', 'node:b']);
    const after = applyChanges(doc, forced.changes);
    expect(after.edges).toEqual([]);
    expect(after.rooms[0].nodeId).toBe('');
    // The entrance forgets a deleted node
    const entrance = deleteNode(doc, 'a');
    expect(entrance.changes[entrance.changes.length - 1]).toEqual({ kind: 'building', before: { entranceNodeId: 'a', northDeg: null }, after: { entranceNodeId: null, northDeg: null } });
  });

  it('links get a stamped id, refuse a self-link and a second link between the same pair', () => {
    const withC = applyChanges(doc, addNode(doc, { id: 'c', level: 'L1', x: 3, y: 3, kind: 'corridor' }).changes);
    expect(addEdge(withC, 'b', 'c', { kind: 'door' }).changes[0]).toMatchObject({ kind: 'edge', id: 'b--c', after: { id: 'b--c', a: 'b', b: 'c', kind: 'door' } });
    expect(addEdge(withC, 'b', 'b', { kind: 'hallway' }).blocked?.reason).toBe('same_node');
    expect(addEdge(withC, 'b', 'a', { kind: 'hallway' }).blocked).toEqual({ reason: 'duplicate_id', ids: ['a--b'] });
    expect(addEdge(withC, 'b', 'zz', { kind: 'hallway' }).blocked).toEqual({ reason: 'missing', ids: ['zz'] });
  });

  it('a level with nodes cannot go; a room going unlinks the node that named it; moves that move nothing are empty', () => {
    expect(deleteLevel(doc, 'L1').blocked).toEqual({ reason: 'level_has_nodes', ids: ['a', 'b'] });
    const gone = applyChanges(doc, deleteRoom(doc, 'r1').changes);
    expect(gone.rooms).toEqual([]);
    expect(getEntity(gone, 'node', 'b')?.roomId).toBeNull();
    expect(moveNode(doc, 'b', 10, 0).changes).toEqual([]);
    expect(updateNode(doc, 'zz', { x: 1 }).blocked?.reason).toBe('missing');
    expect(setBuilding(doc, { entranceNodeId: 'nope' }).blocked?.reason).toBe('missing');
    expect(addRoom(doc, { id: 'r1', name: 'dup', level: 'L1', nodeId: 'a' }).blocked?.reason).toBe('duplicate_id');
  });

  it('drops an id smuggled inside a patch — an update can never re-address an entity', () => {
    const doc = normaliseDocument(building());
    // A JS host (or an `as` cast) can hand a patch carrying an id;
    // the verb must keep the entity at its address
    const patch = { id: 'zz', landmark: 'lobby' } as unknown as Patch<NodeLike>;
    const edit = updateNode(doc, 'b', patch);
    expect(edit.blocked).toBeUndefined();
    const change = edit.changes[0] as Extract<Change, { id: string }>;
    expect(change.id).toBe('b');
    expect((change.after as NodeLike).id).toBe('b');
    expect((change.after as NodeLike).landmark).toBe('lobby');

    // The document keeps 'b', and undo restores it in place — no duplicate
    const applied = applyChanges(doc, edit.changes);
    expect(applied.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    const back = applyChanges(applied, invert(edit.changes));
    expect(back.nodes).toEqual(doc.nodes);
  });
});


describe('history', () => {
  const doc = normaliseDocument(building());
  const move = (x: number): Exclude<Change, { kind: 'building' }> => ({ kind: 'node', id: 'b', before: { ...doc.nodes[1] }, after: { ...doc.nodes[1], x } });

  it('a gesture of many moves is one step from the first position, undone and redone as one', () => {
    let h = begin(emptyHistory(), 'drag');
    h = record(h, [move(11)]);
    h = record(h, [{ ...move(12), before: { ...doc.nodes[1], x: 11 } }]);
    h = record(h, [{ ...move(13), before: { ...doc.nodes[1], x: 12 } }]);
    h = end(h);
    expect(h.past).toHaveLength(1);
    expect(h.past[0].changes).toEqual([{ kind: 'node', id: 'b', before: doc.nodes[1], after: { ...doc.nodes[1], x: 13 } }]);

    const back = undo(h);
    expect(back.changes).toEqual([{ kind: 'node', id: 'b', before: { ...doc.nodes[1], x: 13 }, after: doc.nodes[1] }]);
    expect(back.history.future).toHaveLength(1);
    const again = redo(back.history);
    expect(again.changes).toEqual(h.past[0].changes);
    expect(again.history.future).toEqual([]);
  });

  it('an add then delete inside one gesture cancels to nothing; an empty gesture leaves no step; a new step empties the future', () => {
    const node = { id: 'c', level: 'L1', x: 1, y: 1, kind: 'corridor' };
    const merged = coalesce([{ kind: 'node', id: 'c', before: null, after: node }], [{ kind: 'node', id: 'c', before: node, after: null }]);
    expect(merged).toEqual([]);
    expect(end(begin(emptyHistory(), 'nothing')).past).toEqual([]);

    let h = record(emptyHistory(), [move(11)]);
    h = undo(h).history;
    expect(h.future).toHaveLength(1);
    h = record(h, [move(12)]);
    expect(h.future).toEqual([]);
    expect(undo(emptyHistory()).changes).toEqual([]);
  });

  it('caps the past', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_CAP + 5; i += 1) h = record(h, [move(i)]);
    expect(h.past).toHaveLength(HISTORY_CAP);
  });

  it('the closing variants name the checkpoint they closed — even at the cap, where the past no longer grows', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_CAP; i += 1) h = record(h, [move(i)]);

    // A solo record at the cap: the past stays 200 long, but the
    // wrapped checkpoint is still answered (length-based inference
    // would miss it — the original commit-loss defect)
    const solo = recordClosing(h, [move(500)]);
    expect(solo.history.past).toHaveLength(HISTORY_CAP);
    expect(solo.closed).toBe(solo.history.past[solo.history.past.length - 1]);
    expect(solo.closed?.changes[0]).toMatchObject({ id: 'b', after: { x: 500 } });

    // beginClosing answers what its implicit end closed; opening
    // over nothing, and recording into an open gesture, answer null
    const opened = beginClosing(solo.history, 'drag');
    expect(opened.closed).toBeNull();
    const recorded = recordClosing(opened.history, [move(501)]);
    expect(recorded.closed).toBeNull();
    const stolen = beginClosing(recorded.history, 'next');
    expect(stolen.closed?.label).toBe('drag');

    // endClosing answers the gesture it closed; an empty one is null
    expect(endClosing(stolen.history).closed).toBeNull();
    const ended = endClosing(recordClosing(stolen.history, [move(502)]).history);
    expect(ended.closed?.label).toBe('next');
    expect(ended.history.open).toBeNull();
  });
});


describe('changesToOps', () => {
  it('sends upserts without the id inside the data, deletes, building patches, stamps known revisions, and marks new entities fresh', () => {
    const doc = normaliseDocument(building());
    let n = 0;
    const ops = changesToOps(
      [
        { kind: 'node', id: 'b', before: doc.nodes[1], after: { ...doc.nodes[1], x: 3 } },
        { kind: 'node', id: 'c', before: null, after: { id: 'c', level: 'L1', x: 1, y: 1, kind: 'corridor' } },
        { kind: 'edge', id: 'a--b', before: doc.edges[0], after: null },
        { kind: 'building', before: buildingFields(doc), after: { entranceNodeId: 'b', northDeg: null } },
      ],
      { 'node:b': 7, 'edge:a--b': 3 },
      () => `op${++n}`,
    );
    expect(ops).toEqual([
      { id: 'op1', type: 'upsert', kind: 'node', entityId: 'b', data: { level: 'L1', x: 3, y: 0, kind: 'corridor', roomId: 'r1' }, baseRevision: 7 },
      { id: 'op2', type: 'upsert', kind: 'node', entityId: 'c', data: { level: 'L1', x: 1, y: 1, kind: 'corridor' }, fresh: true },
      { id: 'op3', type: 'delete', kind: 'edge', entityId: 'a--b', baseRevision: 3 },
      { id: 'op4', type: 'building', data: { entranceNodeId: 'b', northDeg: null } },
    ]);
  });

  it('an added entity the revisions map already knows is not fresh — it exists on the server', () => {
    let n = 0;
    const node = { id: 'd', level: 'L1', x: 2, y: 2, kind: 'corridor' };
    const ops = changesToOps([{ kind: 'node', id: 'd', before: null, after: node }], { 'node:d': 5 }, () => `op${++n}`);
    expect(ops).toEqual([{ id: 'op1', type: 'upsert', kind: 'node', entityId: 'd', data: { level: 'L1', x: 2, y: 2, kind: 'corridor' }, baseRevision: 5 }]);
  });
});
