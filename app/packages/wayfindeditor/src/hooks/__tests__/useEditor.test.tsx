// -----------------------------------------------------------
//  [*] Tests — useEditor
//
//  The hook over a small building: a gesture commits once as
//  ops, validation runs after the quiet period through the
//  injected validator, undo re-commits the inverse, remote
//  changes bypass history, and acknowledge moves revisions.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';

import { HISTORY_CAP } from '../../core/history';
import type { GraphLike } from '../../core/types';
import { useEditor } from '../useEditor';


const building = (): GraphLike => ({
  version: 1,
  building: 'test',
  levels: [{ id: 'L1', label: '1', viewBox: [0, 0, 100, 100], metersPerPixel: 0.1, ordinal: 1 }],
  nodes: [{ id: 'a', level: 'L1', x: 0, y: 0, kind: 'entrance' }],
  edges: [],
  rooms: [],
  entranceNodeId: 'a',
});

// A validator that flags every node past x = 50
const validate = (graph: GraphLike) => graph.nodes.filter((node) => node.x > 50).map((node) => ({ severity: 'warning' as const, code: 'far', ref: node.id, message: `${node.id} is far` }));


describe('useEditor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('commits a gesture once as ops with the loaded revisions, validates after the quiet period, and undoes as one', async () => {
    const commits: { label: string; ops: unknown[] }[] = [];
    let n = 0;
    const { result } = await renderHook(() =>
      useEditor({ document: building(), revision: 4, revisions: { 'node:a': 4 }, validate, onCommit: (c) => commits.push({ label: c.label, ops: c.ops }), nextOpId: () => `op${++n}` }),
    );

    await act(async () => {
      result.current.actions.begin('drag');
      result.current.actions.moveNode('a', 30, 0);
      result.current.actions.moveNode('a', 60, 0);
      result.current.actions.end();
    });
    expect(result.current.state.document.nodes[0].x).toBe(60);
    expect(result.current.state.canUndo).toBe(true);
    expect(commits).toEqual([{ label: 'drag', ops: [{ id: 'op1', type: 'upsert', kind: 'node', entityId: 'a', data: { level: 'L1', x: 60, y: 0, kind: 'entrance' }, baseRevision: 4 }] }]);

    // Nothing until the quiet period, then the far warning
    expect(result.current.state.issues).toEqual([]);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(result.current.state.issues).toEqual([{ id: 'far:a', severity: 'warning', code: 'far', ref: 'a', message: 'a is far' }]);

    await act(async () => {
      result.current.actions.undo();
    });
    expect(result.current.state.document.nodes[0].x).toBe(0);
    expect(result.current.state.canRedo).toBe(true);
    expect(commits[1].label).toBe('undo');
    expect(commits[1].ops[0]).toMatchObject({ type: 'upsert', entityId: 'a', data: { x: 0 } });
  });

  it('an edit outside a gesture is its own step; a blocked edit answers why and changes nothing', async () => {
    const commits: string[] = [];
    const { result } = await renderHook(() => useEditor({ document: building(), onCommit: (c) => commits.push(c.label) }));

    let answer: ReturnType<typeof result.current.actions.addNode> | undefined;
    await act(async () => {
      answer = result.current.actions.addNode({ id: 'b', level: 'L1', x: 5, y: 5, kind: 'corridor' });
    });
    expect(answer?.blocked).toBeUndefined();
    expect(commits).toEqual(['add node']);
    expect(result.current.state.edits).toBe(1);

    await act(async () => {
      answer = result.current.actions.deleteLevel('L1');
    });
    expect(answer?.blocked).toEqual({ reason: 'level_has_nodes', ids: ['a', 'b'] });
    expect(commits).toEqual(['add node']);
  });

  it('commits every gesture-less edit even once the past sits at HISTORY_CAP', async () => {
    const commits: string[] = [];
    const { result } = await renderHook(() => useEditor({ document: building(), onCommit: (c) => commits.push(c.label) }));

    // Fill the past to the cap, then keep editing — the document
    // takes L201..L203 and each must still reach onCommit
    await act(async () => {
      for (let i = 1; i <= HISTORY_CAP + 3; i += 1) result.current.actions.updateNode('a', { landmark: `L${i}` });
    });
    expect(result.current.state.document.nodes[0].landmark).toBe(`L${HISTORY_CAP + 3}`);
    expect(result.current.state.edits).toBe(HISTORY_CAP);
    expect(commits.length).toBe(HISTORY_CAP + 3);

    // A gesture past the cap commits too, exactly once
    await act(async () => {
      result.current.actions.begin('drag');
      result.current.actions.moveNode('a', 30, 0);
      result.current.actions.end();
    });
    expect(commits.length).toBe(HISTORY_CAP + 4);
  });

  it('begin while a gesture is open commits the earlier gesture before opening the new one', async () => {
    const commits: { label: string; ops: { entityId?: string }[] }[] = [];
    const { result } = await renderHook(() =>
      useEditor({ document: building(), revision: 4, revisions: { 'node:a': 4 }, onCommit: (c) => commits.push({ label: c.label, ops: c.ops as { entityId?: string }[] }) }),
    );

    // A drag whose end() never came (the system stole the touch),
    // then a tap that begins the next gesture
    await act(async () => {
      result.current.actions.begin('move');
      result.current.actions.moveNode('a', 30, 0);
      result.current.actions.begin('add node');
      result.current.actions.addNode({ id: 'b', level: 'L1', x: 5, y: 5, kind: 'corridor' });
      result.current.actions.end();
    });
    expect(result.current.state.document.nodes[0].x).toBe(30);
    expect(result.current.state.edits).toBe(2);
    expect(commits.map((c) => c.label)).toEqual(['move', 'add node']);
    expect(commits[0].ops[0]).toMatchObject({ type: 'upsert', entityId: 'a', baseRevision: 4, data: { x: 30 } });
  });

  it('undo mid-gesture commits the forward ops first, then the inverse — never an inverse of ops the host missed', async () => {
    const commits: { label: string; ops: { type?: string; entityId?: string }[] }[] = [];
    const { result } = await renderHook(() => useEditor({ document: building(), onCommit: (c) => commits.push({ label: c.label, ops: c.ops as { type?: string }[] }) }));

    await act(async () => {
      result.current.actions.begin('add');
      result.current.actions.addNode({ id: 'b', level: 'L1', x: 5, y: 5, kind: 'corridor' });
      result.current.actions.undo();
    });
    expect(result.current.state.document.nodes.map((node) => node.id)).toEqual(['a']);
    expect(commits.map((c) => c.label)).toEqual(['add', 'undo']);
    expect(commits[0].ops[0]).toMatchObject({ type: 'upsert', entityId: 'b' });
    expect(commits[1].ops[0]).toMatchObject({ type: 'delete', entityId: 'b' });
  });

  it('remote changes bypass history, replace resets it, acknowledge moves the revisions the next ops carry', async () => {
    const ops: unknown[][] = [];
    const { result } = await renderHook(() => useEditor({ document: building(), revision: 1, onCommit: (c) => ops.push(c.ops) }));

    await act(async () => {
      result.current.actions.applyRemote([{ kind: 'node', id: 'z', before: null, after: { id: 'z', level: 'L1', x: 9, y: 9, kind: 'corridor' } }], { 'node:z': 8 });
    });
    expect(result.current.state.document.nodes.map((node) => node.id)).toEqual(['a', 'z']);
    expect(result.current.state.canUndo).toBe(false);

    await act(async () => {
      result.current.actions.acknowledge([{ kind: 'node', id: 'a', revision: 9 }]);
      result.current.actions.moveNode('a', 1, 1);
      result.current.actions.updateNode('z', { landmark: 'x' });
    });
    expect(result.current.state.revision).toBe(9);
    expect(ops[0][0]).toMatchObject({ entityId: 'a', baseRevision: 9 });
    expect(ops[1][0]).toMatchObject({ entityId: 'z', baseRevision: 8 });

    await act(async () => {
      result.current.actions.replace({ ...building(), levels: [{ id: 'L2', label: '2', viewBox: [0, 0, 1, 1], metersPerPixel: 1, ordinal: 2 }] }, 12);
    });
    expect(result.current.state.revision).toBe(12);
    expect(result.current.state.shownLevel).toBe('L2');
    expect(result.current.state.canUndo).toBe(false);
  });
});
