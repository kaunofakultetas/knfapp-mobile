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
//  survive optimally) — plus a coordinate that is not a finite
//  number (KNF-024: NaN lengths and a 'no_path' on a connected
//  map) and a point drawn off its level's viewBox (KNF-176: a
//  moved layer). Every code has a case that fires and a
//  neighbour that must not.
// -----------------------------------------------------------

import { indexGraph, validateGraph } from '../graph';
import { findRoute } from '../route';
import type { BuildingGraph, GraphEdge, GraphNode, NodeKind } from '../types';


// The chain every spec starts from: a ─ b ─ s1 on L1, the
// s1 / s2 stairwell at 6 m, s2 ─ c on L2
const chain: GraphEdge[] = [
  { a: 'a', b: 'b', kind: 'hallway' },
  { a: 'b', b: 's1', kind: 'hallway' },
  { a: 's1', b: 's2', kind: 'stairs', lengthM: 6 },
  { a: 's2', b: 'c', kind: 'hallway' },
];







// -----------------------------------------------------------
// node
// -----------------------------------------------------------
//
// One graph node, a corridor unless told.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

function node(id: string, level: string, x: number, y: number, kind: NodeKind = 'corridor'): GraphNode {
  return { id, level, x, y, kind };
}







// -----------------------------------------------------------
// building
// -----------------------------------------------------------
//
// Two levels at 1 m/px; a chain a ─ b ─ s1 on L1, s1/s2 a stairwell, s2 ─ c on L2
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

function building(edges: GraphEdge[], nodes: GraphNode[] = []): BuildingGraph {
  return {
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
  };
}







// -----------------------------------------------------------
// codesFor
// -----------------------------------------------------------
//
// The issues one ref drew, as 'severity:code'.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

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


describe('validateGraph — panorama facts', () => {
  it('warns on a geometry the stage cannot draw and passes a sane one', () => {
    const bad = building(chain, [{ ...node('p', 'L1', 5, 5), pano: 'p.jpg', panoGeometry: { hfovDeg: 400, vfovDeg: 90 } }, { ...node('q', 'L1', 6, 6), pano: 'q.jpg', panoGeometry: { hfovDeg: 360, vfovDeg: 106 } }]);
    const codes = validateGraph(bad).filter((i) => i.code === 'bad_pano_geometry');
    expect(codes).toEqual([expect.objectContaining({ severity: 'warning', ref: 'p' })]);
  });

  it('never throws on panoLinks that are not a list of objects', () => {
    const graph = building(chain, [
      { ...node('p', 'L1', 5, 5), panoLinks: 5 as unknown as [] },
      { ...node('q', 'L1', 6, 6), panoLinks: ['x', null, { yaw: 3 }] as unknown as [] },
    ]);
    expect(() => validateGraph(graph)).not.toThrow();
    // A link object with no target is still a link to nowhere
    expect(codesFor(graph, 'q')).toContain('warning:pano_link_unknown');
    expect(codesFor(graph, 'p')).not.toContain('warning:pano_link_unknown');
  });

  it('warns on a panorama link to a missing node or to itself', () => {
    const graph = building(chain, [{ ...node('p', 'L1', 5, 5), panoLinks: [{ targetNodeId: 'a', yaw: 10 }, { targetNodeId: 'nowhere', yaw: 20 }, { targetNodeId: 'p', yaw: 30 }] }]);
    const refs = validateGraph(graph).filter((i) => i.code === 'pano_link_unknown');
    expect(refs).toHaveLength(2);
    expect(refs.every((i) => i.ref === 'p' && i.severity === 'warning')).toBe(true);
  });
});


describe('validateGraph — bad_coordinate', () => {
  it("a node whose x / y is a string, null or NaN is an error — the router would answer no_path on a connected map", () => {
    // Hand-written JSON: the types say number, the wire says otherwise
    const graph = building(chain, [
      { ...node('p', 'L1', 0, 0), x: 'not-a-number' as unknown as number },
      { ...node('q', 'L1', 0, 0), y: null as unknown as number },
      { ...node('r', 'L1', Number.NaN, 1) },
    ]);
    for (const ref of ['p', 'q', 'r']) expect(codesFor(graph, ref)).toContain('error:bad_coordinate');

    // The failure it names: the router cannot price the node's
    // edges, so a connected pair answers no_path
    const broken = building([{ a: 'a', b: 'p', kind: 'hallway' }, { a: 'p', b: 'b', kind: 'hallway' }], [{ ...node('p', 'L1', 0, 0), x: 'x' as unknown as number }]);
    expect(findRoute(indexGraph(broken), 'a', 'b').reason).toBe('no_path');
  });

  it('a finite coordinate, zero and negatives included, is clean', () => {
    const graph = building(chain, [node('z', 'L1', 0, 0)]);
    expect(codesFor(graph, 'z').filter((code) => code.endsWith('bad_coordinate'))).toEqual([]);
  });
});


describe('validateGraph — outside_plan', () => {
  it("a node or a room corner off its level's viewBox is a warning, once per room", () => {
    const graph: BuildingGraph = {
      ...building(chain, [node('far', 'L1', 500, 100)]),
      rooms: [
        { id: 'moved', name: 'Moved', level: 'L1', nodeId: 'a', polygon: [[180, -20], [240, -20], [240, 20], [180, 20]] },
        { id: 'fine', name: 'Fine', level: 'L1', nodeId: 'b', polygon: [[0, 0], [100, 0], [100, 100], [0, 100]] },
      ],
    };
    expect(codesFor(graph, 'far')).toContain('warning:outside_plan');
    expect(codesFor(graph, 'moved')).toEqual(['warning:outside_plan']);
    // The drawing's own edges count as on it
    expect(codesFor(graph, 'fine')).toEqual([]);
    expect(codesFor(graph, 'a')).toEqual([]);
  });

  it('never throws on an outline that is not a list of pairs', () => {
    const graph: BuildingGraph = {
      ...building(chain),
      rooms: [
        { id: 'str', name: 'S', level: 'L1', nodeId: 'a', polygon: 'broken' as unknown as [number, number][] },
        { id: 'mix', name: 'M', level: 'L1', nodeId: 'a', polygon: [[1, 2], 'x', [500, 1]] as unknown as [number, number][] },
      ],
    };
    expect(() => validateGraph(graph)).not.toThrow();
    expect(codesFor(graph, 'str')).toEqual([]);
    expect(codesFor(graph, 'mix')).toEqual(['warning:outside_plan']);
  });
});
