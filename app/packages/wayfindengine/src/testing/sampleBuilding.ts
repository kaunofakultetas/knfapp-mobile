// -----------------------------------------------------------
//  [*] wayfindengine — testing: sampleBuilding
//
//  A believable two-level faculty, small enough to reason
//  about by hand and furnished with every feature the engine
//  has a rule for: an entrance with a printed code, corridors
//  with corners, ten rooms across the categories, a stairwell
//  AND an elevator AND a long ramp between the floors (so the
//  three accessibility modes and the floor-change penalty all
//  have a choice to make), an exit-only door nobody can walk
//  back through, panoramas with a known facing on a few
//  nodes, codes on the stair landings, and polygons on the
//  rooms the arrival side is read from. Every connector
//  carries an explicit length; every same-level edge is
//  measured off the plan.
//
//  Both plans are 1200 × 800 px at 0.05 m/px, so 20 px is one
//  metre and y grows DOWN the drawing:
//
//    L1                                      n-exit (exit only)
//     y=100                                   ▲ one-way door
//     y=200                                  n-c6
//     y=400   n-w1 ─ n-ddek                  n-c5
//     y=560          n-d101   n-st1   n-el1   │
//     y=600  n-lobby ─ n-c1 ─ n-c2 ─ n-c3 ─ n-c4 ─ n-rp1
//     y=640                 n-dwc1  n-dcafe
//     y=700                          n-cafe
//     y=720  n-entrance
//       x:    100     300     500     700     900    1100
//
//    L2
//     y=200                                  n-k6 ─ n-d206
//     y=400                                  n-k5 ─ n-d205
//     y=450  n-lib                            │
//     y=560  n-dlib   n-d201   n-st2   n-el2   │
//     y=600  n-k0 ─── n-k1 ─── n-k2 ─── n-k3 ─ n-k4 ─ n-rp2
//     y=640                   n-dwc2
//
//  The stairs join n-st1 / n-st2 (8 m), the elevator n-el1 /
//  n-el2 (4 m), the ramp n-rp1 / n-rp2 (30 m). A fresh object
//  is built on every call, so a test may mutate its copy and
//  the index cache keys on it alone.
//
//  Used by:
//    - src/__tests__/contract.test.ts — the graph contract's run
//    - src/__tests__/surface.test.ts — a route off the barrel alone
//    - src/testing/__tests__/invariants.test.ts — routes to break
//    - example/ExampleWayfindScreen.tsx — the engine's own example
//    - src/index.ts — public surface, for hosts prototyping a
//      screen before their own plan is drawn
// -----------------------------------------------------------

import type { BuildingGraph, EdgeKind, GraphEdge, GraphNode, NodeKind, Room } from '../core/types';


const METERS_PER_PIXEL = 0.05;

// Coordinates first, the rest optional — the plan above reads
// off these calls line by line
const node = (id: string, level: string, x: number, y: number, kind: NodeKind = 'corridor', over: Partial<GraphNode> = {}): GraphNode => ({
  id,
  level,
  x,
  y,
  kind,
  ...over,
});

const edge = (a: string, b: string, kind: EdgeKind = 'hallway', over: Partial<GraphEdge> = {}): GraphEdge => ({ a, b, kind, ...over });

const room = (id: string, level: string, nodeId: string, name: string, category: Room['category'], over: Partial<Room> = {}): Room => ({
  id,
  name,
  level,
  nodeId,
  category,
  ...over,
});







// -----------------------------------------------------------
// sampleBuilding
// -----------------------------------------------------------
//
// Used by:
//   - src/__tests__/contract.test.ts
//   - src/__tests__/surface.test.ts
//   - src/testing/__tests__/invariants.test.ts
//   - example/ExampleWayfindScreen.tsx
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function sampleBuilding(): BuildingGraph {

  const levels: BuildingGraph['levels'] = [
    { id: 'L1', label: '1 aukštas', plan: null, viewBox: [0, 0, 1200, 800], metersPerPixel: METERS_PER_PIXEL, ordinal: 1 },
    { id: 'L2', label: '2 aukštas', plan: null, viewBox: [0, 0, 1200, 800], metersPerPixel: METERS_PER_PIXEL, ordinal: 2 },
  ];


  const nodes: GraphNode[] = [
    // Level 1 — the way in, the lobby, the office wing
    node('n-entrance', 'L1', 100, 720, 'entrance', { qr: 'knf://node/n-entrance', pano: 'pano-entrance', panoYaw: 0 }),
    node('n-lobby', 'L1', 100, 600, 'corridor', { pano: 'pano-lobby', panoYaw: 90, landmark: 'reception desk' }),
    node('n-w1', 'L1', 100, 400),
    node('n-ddek', 'L1', 160, 400, 'door', { roomId: 'r-dekanatas' }),
    // The main corridor and what opens off it
    node('n-c1', 'L1', 300, 600),
    node('n-d101', 'L1', 300, 560, 'door', { roomId: 'r-101' }),
    node('n-c2', 'L1', 500, 600),
    node('n-dwc1', 'L1', 500, 640, 'door', { roomId: 'r-wc1' }),
    node('n-st1', 'L1', 500, 560, 'stairs', { qr: 'knf://node/n-st1' }),
    node('n-c3', 'L1', 700, 600),
    node('n-dcafe', 'L1', 700, 640, 'door', { roomId: 'r-cafe' }),
    node('n-cafe', 'L1', 700, 700, 'room', { roomId: 'r-cafe' }),
    node('n-el1', 'L1', 700, 560, 'elevator'),
    node('n-c4', 'L1', 900, 600, 'corridor', { pano: 'pano-c4', panoYaw: 0, landmark: 'noticeboard' }),
    node('n-rp1', 'L1', 1100, 600, 'ramp'),
    // The corner up to the emergency exit
    node('n-c5', 'L1', 900, 400),
    node('n-c6', 'L1', 900, 200),
    node('n-exit', 'L1', 900, 100, 'door', { roomId: 'r-exit' }),

    // Level 2 — the connector heads
    node('n-st2', 'L2', 500, 560, 'stairs', { qr: 'knf://node/n-st2' }),
    node('n-el2', 'L2', 700, 560, 'elevator'),
    node('n-rp2', 'L2', 1100, 600, 'ramp'),
    // The upper corridor and the reading room at its west end
    node('n-k0', 'L2', 100, 600),
    node('n-dlib', 'L2', 100, 560, 'door', { roomId: 'r-lib' }),
    node('n-lib', 'L2', 100, 450, 'room', { roomId: 'r-lib' }),
    node('n-k1', 'L2', 300, 600),
    node('n-d201', 'L2', 300, 560, 'door', { roomId: 'r-201' }),
    node('n-k2', 'L2', 500, 600, 'corridor', { pano: 'pano-k2', panoYaw: 270 }),
    node('n-dwc2', 'L2', 500, 640, 'door', { roomId: 'r-wc2' }),
    node('n-k3', 'L2', 700, 600),
    node('n-k4', 'L2', 900, 600),
    // The corner up to the department offices
    node('n-k5', 'L2', 900, 400, 'corridor', { landmark: 'window bay' }),
    node('n-d205', 'L2', 940, 400, 'door', { roomId: 'r-205' }),
    node('n-k6', 'L2', 900, 200),
    node('n-d206', 'L2', 860, 200, 'door', { roomId: 'r-206' }),
  ];


  const edges: GraphEdge[] = [
    // Level 1
    edge('n-entrance', 'n-lobby'),
    edge('n-lobby', 'n-w1'),
    edge('n-w1', 'n-ddek', 'door'),
    edge('n-lobby', 'n-c1'),
    edge('n-c1', 'n-d101', 'door'),
    edge('n-c1', 'n-c2'),
    edge('n-c2', 'n-dwc1', 'door'),
    edge('n-c2', 'n-st1'),
    edge('n-c2', 'n-c3'),
    edge('n-c3', 'n-dcafe'),
    edge('n-dcafe', 'n-cafe', 'door'),
    edge('n-c3', 'n-el1'),
    edge('n-c3', 'n-c4'),
    edge('n-c4', 'n-rp1'),
    edge('n-c4', 'n-c5'),
    edge('n-c5', 'n-c6'),
    // An exit-only door: the alarm bar opens outwards, nobody
    // comes in this way
    edge('n-c6', 'n-exit', 'door', { oneWay: true }),

    // The connectors — the only cross-level edges, each with the
    // length a walker actually covers
    edge('n-st1', 'n-st2', 'stairs', { lengthM: 8 }),
    edge('n-el1', 'n-el2', 'elevator', { lengthM: 4 }),
    edge('n-rp1', 'n-rp2', 'ramp', { lengthM: 30 }),

    // Level 2
    edge('n-st2', 'n-k2'),
    edge('n-el2', 'n-k3'),
    edge('n-rp2', 'n-k4'),
    edge('n-k0', 'n-k1'),
    edge('n-k0', 'n-dlib', 'door'),
    edge('n-dlib', 'n-lib', 'door'),
    edge('n-k1', 'n-d201', 'door'),
    edge('n-k1', 'n-k2'),
    edge('n-k2', 'n-dwc2', 'door'),
    edge('n-k2', 'n-k3'),
    edge('n-k3', 'n-k4'),
    edge('n-k4', 'n-k5'),
    edge('n-k5', 'n-d205', 'door'),
    edge('n-k5', 'n-k6'),
    edge('n-k6', 'n-d206', 'door'),
  ];


  const rooms: Room[] = [
    room('r-101', 'L1', 'n-d101', '101 auditorija', 'lecture', { polygon: [[200, 400], [400, 400], [400, 560], [200, 560]] }),
    room('r-wc1', 'L1', 'n-dwc1', 'Tualetas (1 a.)', 'wc', { nameKey: 'rooms.wc', polygon: [[460, 640], [540, 640], [540, 720], [460, 720]] }),
    room('r-cafe', 'L1', 'n-cafe', 'Kavinė', 'food', { nameKey: 'rooms.cafe', aliases: ['valgykla', 'canteen'], polygon: [[600, 640], [800, 640], [800, 760], [600, 760]] }),
    room('r-exit', 'L1', 'n-exit', 'Atsarginis išėjimas', 'exit', { nameKey: 'rooms.emergencyExit' }),
    room('r-dekanatas', 'L1', 'n-ddek', 'Dekanatas', 'office', { aliases: ['dean', 'dekanas'] }),
    room('r-201', 'L2', 'n-d201', '201 auditorija', 'lecture', { polygon: [[200, 400], [400, 400], [400, 560], [200, 560]] }),
    room('r-wc2', 'L2', 'n-dwc2', 'Tualetas (2 a.)', 'wc', { nameKey: 'rooms.wc' }),
    room('r-205', 'L2', 'n-d205', 'Informatikos katedra', 'office', { aliases: ['katedra'] }),
    room('r-206', 'L2', 'n-d206', '206 auditorija', 'lecture'),
    room('r-lib', 'L2', 'n-lib', 'Skaitykla', 'other', { aliases: ['biblioteka', 'library'], polygon: [[40, 420], [160, 420], [160, 560], [40, 560]] }),
  ];


  return {
    version: 1,
    building: 'sample-faculty',
    levels,
    nodes,
    edges,
    rooms,
    entranceNodeId: 'n-entrance',
  };
}
