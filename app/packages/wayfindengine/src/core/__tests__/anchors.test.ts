// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine anchors
//
//  The QR payload table (valid node / room, another scheme,
//  an unknown kind, empty ids, whitespace at the ends versus
//  inside, a host scheme), formatAnchor round-tripping through
//  parseAnchor, nearestNode staying on its level and honouring
//  the kinds filter, and nodeForRoom refusing a room whose
//  node is missing.
// -----------------------------------------------------------

import { formatAnchor, nearestNode, nodeForRoom, parseAnchor, type Anchor } from '../anchors';
import { indexGraph } from '../graph';
import type { BuildingGraph } from '../types';


// L1: a corridor at the origin, a door 10 right, stairs 10
// down, a second corridor as far as the first (a tie). L2: a
// corridor a single pixel away in plan space — the trap.
const graph: BuildingGraph = {
  version: 1,
  building: 'test',
  levels: [
    { id: 'L1', label: '1', viewBox: [0, 0, 100, 100], metersPerPixel: 0.1, ordinal: 1 },
    { id: 'L2', label: '2', viewBox: [0, 0, 100, 100], metersPerPixel: 0.1, ordinal: 2 },
  ],
  nodes: [
    { id: 'a', level: 'L1', x: 0, y: 0, kind: 'corridor' },
    { id: 'b', level: 'L1', x: 10, y: 0, kind: 'door', roomId: 'R1' },
    { id: 'c', level: 'L1', x: 0, y: 10, kind: 'stairs' },
    { id: 'a2', level: 'L1', x: 0, y: -1, kind: 'corridor' },
    { id: 'z', level: 'L2', x: 1, y: 1, kind: 'corridor' },
  ],
  edges: [
    { a: 'a', b: 'b', kind: 'hallway' },
    { a: 'a', b: 'c', kind: 'hallway' },
    { a: 'a', b: 'a2', kind: 'hallway' },
    { a: 'c', b: 'z', kind: 'stairs', lengthM: 5 },
  ],
  rooms: [
    { id: 'R1', name: 'Room 1', level: 'L1', nodeId: 'b' },
    { id: 'R-lost', name: 'Lost', level: 'L1', nodeId: 'ghost' },
  ],
};

const index = indexGraph(graph);


describe('parseAnchor', () => {
  it.each<[string, Anchor | null]>([
    ['knf://node/n12', { kind: 'node', nodeId: 'n12' }],
    ['knf://room/301', { kind: 'room', roomId: '301' }],
    // Ids keep their case and their punctuation
    ['knf://room/R-12b', { kind: 'room', roomId: 'R-12b' }],
    ['knf://node/Aula.Magna', { kind: 'node', nodeId: 'Aula.Magna' }],
    // Scanner newlines and padding at the ends are trimmed
    ['  knf://node/n1\n', { kind: 'node', nodeId: 'n1' }],
    ['\tknf://room/301 ', { kind: 'room', roomId: '301' }],
    // Whitespace INSIDE an id is not ours
    ['knf://node/n 1', null],
    ['knf://room/3\t01', null],
    // Other schemes, wrong case, no scheme
    ['https://knf.vu.lt/node/n1', null],
    ['KNF://node/n1', null],
    ['node/n1', null],
    // Unknown or misspelt kinds
    ['knf://door/n1', null],
    ['knf://Node/n1', null],
    ['knf://nodes/n1', null],
    // Empty ids and truncated payloads
    ['knf://node/', null],
    ['knf://node', null],
    ['knf://room/', null],
    ['knf://', null],
    ['knf:/', null],
    ['', null],
    ['   ', null],
  ])('parseAnchor(%j) → %j', (payload, expected) => {
    expect(parseAnchor(payload)).toEqual(expected);
  });

  it('honours a host scheme and refuses the default under it', () => {
    expect(parseAnchor('vu://node/n1', 'vu://')).toEqual({ kind: 'node', nodeId: 'n1' });
    expect(parseAnchor('vu://room/301', 'vu://')).toEqual({ kind: 'room', roomId: '301' });
    expect(parseAnchor('knf://node/n1', 'vu://')).toBeNull();
    // An empty scheme would accept 'node/…' from anywhere
    expect(parseAnchor('node/n1', '')).toBeNull();
  });

  it('treats a non-string payload from a scanner as no code', () => {
    expect(parseAnchor(null as unknown as string)).toBeNull();
    expect(parseAnchor(undefined as unknown as string)).toBeNull();
  });
});


describe('formatAnchor', () => {
  it('prints the payload parseAnchor reads', () => {
    expect(formatAnchor({ kind: 'node', nodeId: 'n12' })).toBe('knf://node/n12');
    expect(formatAnchor({ kind: 'room', roomId: '301' })).toBe('knf://room/301');
    expect(formatAnchor({ kind: 'node', nodeId: 'n12' }, 'vu://')).toBe('vu://node/n12');
  });

  it.each<Anchor>([
    { kind: 'node', nodeId: 'n12' },
    { kind: 'room', roomId: 'R-12b' },
    { kind: 'node', nodeId: 'Aula.Magna' },
  ])('round-trips %j', (anchor) => {
    expect(parseAnchor(formatAnchor(anchor))).toEqual(anchor);
    expect(parseAnchor(formatAnchor(anchor, 'vu://'), 'vu://')).toEqual(anchor);
  });
});


describe('nearestNode', () => {
  it('stays on the requested level even when another floor is closer in plan space', () => {
    // z on L2 is at (1,1); a on L1 at (0,0) is farther from (2,2)
    expect(nearestNode(index, { level: 'L1', x: 2, y: 2 })?.id).toBe('a');
    expect(nearestNode(index, { level: 'L2', x: 2, y: 2 })?.id).toBe('z');
  });

  it('picks by euclidean distance', () => {
    expect(nearestNode(index, { level: 'L1', x: 8, y: 1 })?.id).toBe('b');
    expect(nearestNode(index, { level: 'L1', x: 1, y: 8 })?.id).toBe('c');
  });

  it('keeps the first of two equidistant nodes', () => {
    // a (0,0) and a2 (0,-1) are both half a pixel from (0,-0.5)
    expect(nearestNode(index, { level: 'L1', x: 0, y: -0.5 })?.id).toBe('a');
  });

  it('narrows to the given kinds and treats an empty list as no filter', () => {
    expect(nearestNode(index, { level: 'L1', x: 0, y: 0 }, { kinds: ['door'] })?.id).toBe('b');
    expect(nearestNode(index, { level: 'L1', x: 0, y: 0 }, { kinds: ['stairs', 'door'] })?.id).toBe('b');
    expect(nearestNode(index, { level: 'L1', x: 0, y: 0 }, { kinds: ['elevator'] })).toBeNull();
    expect(nearestNode(index, { level: 'L1', x: 0, y: 0 }, { kinds: [] })?.id).toBe('a');
  });

  it('answers null for a level with no candidates', () => {
    expect(nearestNode(index, { level: 'L9', x: 0, y: 0 })).toBeNull();
  });
});


describe('nodeForRoom', () => {
  it('answers the room node', () => {
    expect(nodeForRoom(index, 'R1')).toBe('b');
  });

  it('answers null for an unknown room and for a room whose node is missing', () => {
    expect(nodeForRoom(index, 'R9')).toBeNull();
    expect(nodeForRoom(index, 'R-lost')).toBeNull();
  });
});
