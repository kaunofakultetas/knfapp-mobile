// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine graph
//
//  The authoring checks a hand-written JSON graph can defeat
//  and the index's heuristic scale, pinned on the four slips
//  the type system never sees: a connector between floors with
//  no length (a free teleport), an edge or node kind outside
//  the vocabulary (a NaN cost), a length that is negative, NaN
//  or infinite (a route walked backwards), and a same-level
//  length under its plan chord (a mis-measure the router must
//  survive optimally). Every code has a case that fires and a
//  neighbour that must not.
// -----------------------------------------------------------

import { indexGraph, validateGraph } from '../graph';
import type { BuildingGraph, GraphEdge, GraphNode, NodeKind } from '../types';


const node = (id: string, level: string, x: number, y: number, kind: NodeKind = 'corridor'): GraphNode => ({ id, level, x, y, kind });

// Two levels at 1 m/px; a chain a ─ b ─ s1 on L1, s1/s2 a stairwell, s2 ─ c on L2
const building = (edges: GraphEdge[], nodes: GraphNode[] = []): BuildingGraph => ({
  version: 1,
  building: 'test',
  levels: [
    { id: 'L1', label: '1', viewBox: [0, 0, 100, 100], metersPerPixel: 1, ordinal: 1 },
    { id: 'L2', label: '2', viewBox: [0, 0, 100, 100], metersPerPixel: 1, ordinal: 2 },
  ],
  nodes: [node('a', 'L1', 0, 0), node('b', 'L1', 10, 0), node('s1', 'L1', 20, 0, 'stairs'), node('s2', 'L2', 20, 0, 'stairs'), node('c', 'L2', 30, 0), ...nodes],
  edges,
  rooms: [],
  entranceNodeId: 'a',
});

const chain: GraphEdge[] = [
  { a: 'a', b: 'b', kind: 'hallway' },
  { a: 'b', b: 's1', kind: 'hallway' },
  { a: 's1', b: 's2', kind: 'stairs', lengthM: 6 },
  { a: 's2', b: 'c', kind: 'hallway' },
];

const codesFor = (graph: BuildingGraph, ref: string) => validateGraph(graph).filter((issue) => issue.ref === ref).map((issue) => `${issue.severity}:${issue.code}`);


describe('validateGraph — connector_without_length', () => {
  it('a stairs / elevator / ramp edge between floors with no lengthM is an error', () => {
    for (const kind of ['stairs', 'elevator', 'ramp'] as const) {
      const graph = building([chain[0], chain[1], { a: 's1', b: 's2', kind }, chain[3]]);
      expect(codesFor(graph, 's1-s2')).toEqual(['error:connector_without_length']);
    }
    const nulled = building([chain[0], chain[1], { a: 's1', b: 's2', kind: 'stairs', lengthM: null }, chain[3]]);
    expect(codesFor(nulled, 's1-s2')).toEqual(['error:connector_without_length']);
  });

  it('the same connector with a length, and a length-less edge on one level, are clean', () => {
    expect(validateGraph(building(chain))).toEqual([]);
  });

  it('a hallway between floors is the kind slip, not the length slip', () => {
    const graph = building([chain[0], chain[1], { a: 's1', b: 's2', kind: 'hallway' }, chain[3]]);
    expect(codesFor(graph, 's1-s2')).toEqual(['error:cross_level_hallway']);
  });
});


describe('validateGraph — unknown_kind', () => {
  it("the node word 'corridor' on an edge is an error — the router has no speed for it", () => {
    const graph = building([{ a: 'a', b: 'b', kind: 'corridor' as 'hallway' }, ...chain.slice(1)]);
    expect(codesFor(graph, 'a-b')).toEqual(['error:unknown_kind']);
  });

  it('an unknown node kind is only a warning — it never reaches the arithmetic', () => {
    const graph = building(chain, [node('x', 'L1', 0, 10, 'portal' as NodeKind)]);
    const issues = validateGraph(graph).filter((issue) => issue.ref === 'x');
    expect(issues.map((issue) => `${issue.severity}:${issue.code}`)).toEqual(['warning:unknown_kind', 'warning:unreachable_node']);
  });

  it('every kind in the vocabulary is accepted', () => {
    const kinds = ['hallway', 'door', 'stairs', 'elevator', 'ramp'] as const;
    const graph = building(kinds.map((kind) => ({ a: 'a', b: 'b', kind })), [node('e', 'L1', 5, 5, 'entrance'), node('r', 'L1', 6, 6, 'room'), node('rp', 'L1', 7, 7, 'ramp')]);
    expect(validateGraph(graph).filter((issue) => issue.code === 'unknown_kind')).toEqual([]);
  });
});


describe('validateGraph — bad_length', () => {
  it.each([-8, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('lengthM %p is an error', (lengthM) => {
    const graph = building([{ a: 'a', b: 'b', kind: 'hallway', lengthM }, ...chain.slice(1)]);
    expect(codesFor(graph, 'a-b')).toContain('error:bad_length');
  });

  it('zero and a positive length are not bad lengths; an explicit zero at one point stays the zero_length warning', () => {
    const fine = building([{ a: 'a', b: 'b', kind: 'hallway', lengthM: 10 }, ...chain.slice(1)]);
    expect(validateGraph(fine)).toEqual([]);

    const coincident = building([{ a: 'a', b: 'z', kind: 'hallway', lengthM: 0 }, ...chain], [node('z', 'L1', 0, 0)]);
    expect(codesFor(coincident, 'a-z')).toEqual(['warning:zero_length_edge']);
  });
});


describe('validateGraph — length_under_chord', () => {
  it('a same-level length more than half a percent under the plan chord is a warning', () => {
    const graph = building([{ a: 'a', b: 'b', kind: 'hallway', lengthM: 9.9 }, ...chain.slice(1)]);
    expect(codesFor(graph, 'a-b')).toEqual(['warning:length_under_chord']);
    expect(validateGraph(graph)[0].message).toMatch(/9\.9 below its plan chord of 10\.00 m/);
  });

  it('within the tolerance, exactly the chord, or above it: clean', () => {
    for (const lengthM of [9.96, 10, 14]) {
      const graph = building([{ a: 'a', b: 'b', kind: 'hallway', lengthM }, ...chain.slice(1)]);
      expect(validateGraph(graph)).toEqual([]);
    }
  });

  it('the chord is measured at the level\'s own scale', () => {
    const graph = building([{ a: 'a', b: 'b', kind: 'hallway', lengthM: 5 }, ...chain.slice(1)]);
    graph.levels[0].metersPerPixel = 0.5;
    expect(validateGraph(graph)).toEqual([]);
    graph.levels[0].metersPerPixel = 0.5 + 0.01;
    expect(codesFor(graph, 'a-b')).toEqual(['warning:length_under_chord']);
  });

  it('a cross-level connector has no chord, and a bad length is not measured against one', () => {
    const short = building([chain[0], chain[1], { a: 's1', b: 's2', kind: 'stairs', lengthM: 0.1 }, chain[3]]);
    expect(validateGraph(short)).toEqual([]);

    const negative = building([{ a: 'a', b: 'b', kind: 'hallway', lengthM: -8 }, ...chain.slice(1)]);
    expect(codesFor(negative, 'a-b')).toEqual(['error:bad_length']);
  });
});


describe('indexGraph — heuristicScale', () => {
  it('is 1 when no same-level edge carries an explicit length', () => {
    expect(indexGraph(building(chain)).heuristicScale).toBe(1);
  });

  it('is the smallest length-to-chord ratio over the measured same-level edges, capped at 1', () => {
    const under = building([{ a: 'a', b: 'b', kind: 'hallway', lengthM: 2.5 }, { a: 'b', b: 's1', kind: 'hallway', lengthM: 5 }, ...chain.slice(2)]);
    expect(indexGraph(under).heuristicScale).toBeCloseTo(0.25, 9);

    const over = building([{ a: 'a', b: 'b', kind: 'hallway', lengthM: 30 }, ...chain.slice(1)]);
    expect(indexGraph(over).heuristicScale).toBe(1);
  });

  it('ignores connectors, bad lengths and coincident pairs', () => {
    const graph = building(
      [
        { a: 'a', b: 'b', kind: 'hallway', lengthM: -8 },
        { a: 'b', b: 's1', kind: 'hallway', lengthM: Number.NaN },
        { a: 'a', b: 'z', kind: 'hallway', lengthM: 0 },
        { a: 's1', b: 's2', kind: 'stairs', lengthM: 0.1 },
        chain[3],
      ],
      [node('z', 'L1', 0, 0)],
    );
    expect(indexGraph(graph).heuristicScale).toBe(1);
  });
});
