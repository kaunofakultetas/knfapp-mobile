// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine svgToGraph
//
//  Two small inline plans: the ground floor exercises every
//  attribute the tool reads and every issue it reports but one
//  (a loose line end, a line on one node, a curved outline, a
//  non-numeric centre, a data-node that is not there), the
//  first floor is the plain case with a <rect> room. Merged
//  with a stairs and an elevator connector they make a graph
//  validateGraph accepts and the router crosses levels on;
//  merged with a connector to nowhere they do not. Smaller
//  drawings cover the rest: a shape drawn twice (the one
//  issue the ground floor lacks, 'duplicate_id', on a level
//  and folded from validateGraph across two), and attribute
//  values written with entities — the '&' every editor
//  escapes — reaching the graph decoded.
// -----------------------------------------------------------

import { indexGraph, validateGraph } from '../../core/graph';
import { findRoute } from '../../core/route';
import { mergeLevels, svgToGraph, type SvgToGraphResult } from '../svgToGraph';


const GROUND = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <!-- <circle id="n-ghost" cx="0" cy="0" r="4"/> -->
  <g id="walls"><rect x="0" y="0" width="400" height="300" fill="none" stroke="#000"/></g>
  <text x="10" y="20">Ground floor</text>
  <circle id="n-ent" cx="40" cy="260" r="4" data-kind="entrance" data-qr="knf://node/n-ent" data-pano="pano-ent" data-yaw="0"/>
  <circle id="n-a" cx="40" cy="200" r="4" />
  <circle id='n-b' cx='200' cy='200' r='4' data-landmark='library'/>
  <circle id="n-d101" cx="200" cy="160" r="4" data-kind="door" data-room="101"/>
  <circle id="n-st1" cx="300" cy="200" r="4" data-kind="stairs" data-qr="knf://node/n-st1"/>
  <circle id="n-el1" cx="360" cy="200" r="4" data-kind="elevator"></circle>
  <circle id="n-bogus" cx="oops" cy="10" r="4"/>
  <circle id="decor" cx="10" cy="10" r="2"/>
  <line id="e-ent-a" x1="40" y1="260" x2="40" y2="200"/>
  <line id="e-a-b" x1="40" y1="200" x2="200" y2="200"/>
  <line id="e-b-d101" x1="200" y1="200" x2="203" y2="164" data-kind="door"/>
  <line id="e-b-st1" x1="200" y1="200" x2="300" y2="200" data-length="5.5"/>
  <line id="e-st1-el1" x1="300" y1="200" x2="360" y2="200" data-oneway="true"/>
  <line id="e-loose" x1="300" y1="200" x2="330" y2="120"/>
  <line id="e-stub" x1="360" y1="200" x2="362" y2="201"/>
  <path id="r-101" d="M150,80 L250,80 L250,160 L150,160 Z" data-name="101 auditorija" data-category="lecture"/>
  <path id="r-store" d="M 300 80 h 80 v 60 h -80 z" data-node="n-st1" data-category="service" data-name-key="rooms.store"/>
  <path id="r-curvy" d="M 10 10 C 20 20 30 30 40 40 Z" data-name="Rotunda"/>
  <path id="r-lost" d="M 340 230 H 400 V 290 H 340 Z" data-node="n-nowhere"/>
</svg>`;

const FIRST = `
<svg viewBox="0 0 400 300">
  <circle id="n-st2" cx="300" cy="200" r="4" data-kind="stairs"/>
  <circle id="n-el2" cx="360" cy="200" r="4" data-kind="elevator"/>
  <circle id="n-k" cx="200" cy="200" r="4"/>
  <circle id="n-d201" cx="200" cy="160" r="4" data-kind="door" data-room="201"/>
  <line id="e-1" x1="300" y1="200" x2="200" y2="200"/>
  <line id="e-2" x1="360" y1="200" x2="300" y2="200"/>
  <line id="e-3" x1="200" y1="200" x2="200" y2="160" data-kind="door"/>
  <rect id="r-201" x="150" y="80" width="100" height="80" data-name="201 auditorija" data-category="lecture"/>
</svg>`;


const ground = (): SvgToGraphResult => svgToGraph(GROUND, { levelId: 'L1', ordinal: 1, label: '1 aukštas', metersPerPixel: 0.05 });
const first = (): SvgToGraphResult => svgToGraph(FIRST, { levelId: 'L2', ordinal: 2, label: '2 aukštas', metersPerPixel: 0.05, plan: 'plans/first.svg' });

const codes = (result: SvgToGraphResult) => result.issues.map((issue) => `${issue.code}:${issue.ref}`);


describe('svgToGraph — the level', () => {
  it('takes the viewBox and the options, and the plan reference when given', () => {
    expect(ground().level).toEqual({ id: 'L1', label: '1 aukštas', plan: null, viewBox: [0, 0, 400, 300], metersPerPixel: 0.05, ordinal: 1 });
    expect(first().level.plan).toBe('plans/first.svg');
  });

  it('falls back to width/height, then to the box around the shapes with a word about it', () => {
    const sized = svgToGraph('<svg width="640" height="480"><circle id="n-x" cx="1" cy="1"/></svg>', { levelId: 'L', ordinal: 0, label: 'L', metersPerPixel: 1 });
    expect(sized.level.viewBox).toEqual([0, 0, 640, 480]);
    expect(sized.issues).toEqual([]);

    const bare = svgToGraph('<svg><circle id="n-x" cx="10" cy="20"/><circle id="n-y" cx="110" cy="70"/></svg>', { levelId: 'L', ordinal: 0, label: 'L', metersPerPixel: 1 });
    expect(bare.level.viewBox).toEqual([10, 20, 100, 50]);
    expect(codes(bare)).toEqual(['missing_viewbox:L']);
    expect(bare.issues[0].severity).toBe('warning');
  });
});


describe('svgToGraph — nodes', () => {
  it('reads every n- circle with its attributes, in document order, and nothing else', () => {
    const { nodes } = ground();
    expect(nodes.map((node) => node.id)).toEqual(['n-ent', 'n-a', 'n-b', 'n-d101', 'n-st1', 'n-el1']);
    expect(nodes[0]).toEqual({ id: 'n-ent', level: 'L1', x: 40, y: 260, kind: 'entrance', qr: 'knf://node/n-ent', pano: 'pano-ent', panoYaw: 0 });
    expect(nodes[1]).toEqual({ id: 'n-a', level: 'L1', x: 40, y: 200, kind: 'corridor' });
    expect(nodes[2]).toEqual({ id: 'n-b', level: 'L1', x: 200, y: 200, kind: 'corridor', landmark: 'library' });
    expect(nodes[3]).toEqual({ id: 'n-d101', level: 'L1', x: 200, y: 160, kind: 'door', roomId: '101' });
    expect(nodes[5].kind).toBe('elevator');
  });

  it('reports a circle whose centre is not a number and keeps going', () => {
    expect(codes(ground())).toContain('bad_attribute:n-bogus');
    expect(ground().issues.find((issue) => issue.ref === 'n-bogus')?.message).toMatch('cx="oops"');
  });

  it('keeps an unknown kind as corridor with a warning, drops a non-numeric yaw with one', () => {
    const odd = svgToGraph('<svg viewBox="0 0 1 1"><circle id="n-x" cx="1" cy="1" data-kind="portal" data-yaw="north"/></svg>', { levelId: 'L', ordinal: 0, label: 'L', metersPerPixel: 1 });
    expect(odd.nodes[0]).toEqual({ id: 'n-x', level: 'L', x: 1, y: 1, kind: 'corridor' });
    expect(odd.issues.map((issue) => issue.severity)).toEqual(['warning', 'warning']);
    expect(codes(odd)).toEqual(['bad_attribute:n-x', 'bad_attribute:n-x']);
  });
});


describe('svgToGraph — edges', () => {
  it('snaps both ends to the nearest node within the tolerance and reads kind, length and direction', () => {
    const { edges } = ground();
    expect(edges).toEqual([
      { a: 'n-ent', b: 'n-a', kind: 'hallway' },
      { a: 'n-a', b: 'n-b', kind: 'hallway' },
      { a: 'n-b', b: 'n-d101', kind: 'door' },
      { a: 'n-b', b: 'n-st1', kind: 'hallway', lengthM: 5.5 },
      { a: 'n-st1', b: 'n-el1', kind: 'hallway', oneWay: true },
    ]);
  });

  it('reports a line whose end snaps to nothing, and one whose ends land on the same node', () => {
    const issues = ground().issues;
    const loose = issues.find((issue) => issue.ref === 'e-loose');
    expect(loose).toMatchObject({ severity: 'error', code: 'unsnapped_edge' });
    expect(loose?.message).toMatch('(330, 120), more than 6px from any node');
    expect(issues.find((issue) => issue.ref === 'e-stub')).toMatchObject({ severity: 'error', code: 'self_edge', message: "edge 'e-stub' has both ends on node 'n-el1'" });
  });

  it('honours a wider tolerance', () => {
    const wide = svgToGraph(GROUND, { levelId: 'L1', ordinal: 1, label: '1', metersPerPixel: 0.05, snapTolerancePx: 100 });
    expect(codes(wide)).not.toContain('unsnapped_edge:e-loose');
    expect(wide.edges.some((edge) => edge.a === 'n-st1' && edge.b === 'n-st1')).toBe(false);
  });
});


describe('svgToGraph — rooms', () => {
  it('reads a path outline in absolute and relative commands, strips the r- prefix, picks the node', () => {
    const { rooms } = ground();
    expect(rooms.map((room) => room.id)).toEqual(['101', 'store', 'lost']);
    expect(rooms[0]).toEqual({
      id: '101',
      name: '101 auditorija',
      level: 'L1',
      nodeId: 'n-d101',
      polygon: [[150, 80], [250, 80], [250, 160], [150, 160]],
      category: 'lecture',
    });
    // The explicit node is taken; the name falls back to the id
    expect(rooms[1]).toEqual({
      id: 'store',
      name: 'store',
      level: 'L1',
      nodeId: 'n-st1',
      polygon: [[300, 80], [380, 80], [380, 140], [300, 140]],
      category: 'service',
      nameKey: 'rooms.store',
    });
  });

  it('reports a curved outline and drops the room', () => {
    const curvy = ground().issues.find((issue) => issue.ref === 'r-curvy');
    expect(curvy).toMatchObject({ severity: 'error', code: 'unsupported_path' });
    expect(curvy?.message).toMatch("path command 'C' is not supported");
  });

  it('reports a data-node that is not a node and falls back to the nearest one', () => {
    const { rooms, issues } = ground();
    expect(issues.find((issue) => issue.ref === 'r-lost')).toMatchObject({ severity: 'error', code: 'unknown_node_ref' });
    expect(rooms[2].nodeId).toBe('n-el1');
  });

  it('prefers a node inside the outline over a nearer one outside, the one nearest the centre among several', () => {
    const svg = `<svg viewBox="0 0 100 100">
      <circle id="n-out" cx="52" cy="10" r="1"/>
      <circle id="n-door" cx="30" cy="20" r="1"/>
      <circle id="n-in" cx="40" cy="40" r="1"/>
      <polygon id="r-x" points="20,20 60,20 60,60 20,60"/>
    </svg>`;
    const { rooms } = svgToGraph(svg, { levelId: 'L', ordinal: 0, label: 'L', metersPerPixel: 1 });
    expect(rooms[0].nodeId).toBe('n-in');
    expect(rooms[0].polygon).toEqual([[20, 20], [60, 20], [60, 60], [20, 60]]);
  });

  it('reads a <rect> room and reports a level with no node to end at', () => {
    const { rooms, issues } = first();
    expect(rooms).toEqual([{ id: '201', name: '201 auditorija', level: 'L2', nodeId: 'n-d201', polygon: [[150, 80], [250, 80], [250, 160], [150, 160]], category: 'lecture' }]);
    expect(issues).toEqual([]);

    const empty = svgToGraph('<svg viewBox="0 0 9 9"><rect id="r-void" x="1" y="1" width="2" height="2"/></svg>', { levelId: 'L', ordinal: 0, label: 'L', metersPerPixel: 1 });
    expect(codes(empty)).toEqual(['room_without_node:r-void']);
    expect(empty.rooms[0].nodeId).toBe('');
  });

  it('decodes entities in every attribute: names, landmarks, keys, categories and ids', () => {
    const svg = `<svg viewBox="0 0 100 100">
      <circle id="n-a&amp;b" cx="5" cy="5" r="1" data-landmark="Bufetas &#x26; &quot;Kava&quot;"/>
      <path id="r-cafe" d="M 0 0 L 10 0 L 10 10 L 0 10 Z" data-name="Kavin&#279; &amp; baras" data-name-key="rooms.o&apos;hara" data-category="caf&lt;e&gt;"/>
      <rect id="r-odd" x="20" y="20" width="5" height="5" data-name="&nbsp;kept as written"/>
    </svg>`;
    const { nodes, rooms, issues } = svgToGraph(svg, { levelId: 'L', ordinal: 0, label: 'L', metersPerPixel: 1 });
    expect(issues).toEqual([]);
    expect(nodes[0]).toMatchObject({ id: 'n-a&b', landmark: 'Bufetas & "Kava"' });
    expect(rooms[0]).toMatchObject({ id: 'cafe', name: 'Kavinė & baras', nameKey: "rooms.o'hara", category: 'caf<e>', nodeId: 'n-a&b' });
    // An entity the tool does not know is not guessed at
    expect(rooms[1].name).toBe('&nbsp;kept as written');
  });

  it('refuses a second ring, a stray number and a two-vertex outline', () => {
    const cases: [string, string][] = [
      ['M 0 0 L 9 0 L 9 9 Z M 1 1 L 2 2 L 3 1 Z', 'drawing continues after Z'],
      ['5 5 L 9 9', 'starts with a number'],
      ['M 0 0 L 9 9 Z', 'has 2 vertices'],
      ['M 0 0 L 9', 'missing its second number'],
    ];
    for (const [d, reason] of cases) {
      const result = svgToGraph(`<svg viewBox="0 0 9 9"><path id="r-q" d="${d}"/></svg>`, { levelId: 'L', ordinal: 0, label: 'L', metersPerPixel: 1 });
      expect(result.rooms).toEqual([]);
      expect(result.issues[0].code).toBe('unsupported_path');
      expect(result.issues[0].message).toMatch(reason);
    }
  });
});


describe('svgToGraph — a shape drawn twice', () => {
  it('reports the second circle and the second room as duplicate_id and keeps the first', () => {
    const svg = `<svg viewBox="0 0 100 100">
      <circle id="n-a" cx="5" cy="5" r="1"/>
      <circle id="n-a" cx="50" cy="50" r="1"/>
      <rect id="r-x" x="0" y="0" width="10" height="10" data-name="first"/>
      <rect id="r-x" x="40" y="40" width="10" height="10" data-name="second"/>
    </svg>`;
    const { nodes, rooms, issues } = svgToGraph(svg, { levelId: 'L', ordinal: 0, label: 'L', metersPerPixel: 1 });
    expect(issues).toEqual([
      { severity: 'error', code: 'duplicate_id', message: "node 'n-a' is drawn twice", ref: 'n-a' },
      { severity: 'error', code: 'duplicate_id', message: "room 'x' is drawn twice", ref: 'r-x' },
    ]);
    expect(nodes.map((node) => [node.id, node.x])).toEqual([['n-a', 5]]);
    expect(rooms.map((room) => room.name)).toEqual(['first']);
  });
});


describe('mergeLevels', () => {
  const connectors = [
    { a: 'n-st1', b: 'n-st2', kind: 'stairs' as const, lengthM: 6 },
    { a: 'n-el1', b: 'n-el2', kind: 'elevator' as const, lengthM: 4 },
  ];

  it('joins the parts with the connectors into a graph validateGraph accepts, carrying the parts\' issues', () => {
    const { graph, issues } = mergeLevels([ground(), first()], { building: 'test', entranceNodeId: 'n-ent', connectors });
    expect(graph.levels.map((level) => level.id)).toEqual(['L1', 'L2']);
    expect(graph.nodes).toHaveLength(10);
    expect(graph.rooms.map((room) => room.id)).toEqual(['101', 'store', 'lost', '201']);
    expect(graph.edges.slice(-2)).toEqual([
      { a: 'n-st1', b: 'n-st2', kind: 'stairs', lengthM: 6 },
      { a: 'n-el1', b: 'n-el2', kind: 'elevator', lengthM: 4 },
    ]);
    expect(graph.entranceNodeId).toBe('n-ent');
    expect(validateGraph(graph)).toEqual([]);
    // The ground floor's five issues travel with the graph, nothing more
    expect(issues.map((issue) => issue.ref).sort()).toEqual(['e-loose', 'e-stub', 'n-bogus', 'r-curvy', 'r-lost']);
  });

  it('routes across the levels on the merged graph', () => {
    const { graph } = mergeLevels([ground(), first()], { building: 'test', entranceNodeId: 'n-ent', connectors });
    const { route } = findRoute(indexGraph(graph), 'n-ent', 'n-d201');
    expect(route?.points.map((point) => point.nodeId)).toEqual(['n-ent', 'n-a', 'n-b', 'n-st1', 'n-st2', 'n-k', 'n-d201']);
    expect(route?.levels).toEqual(['L1', 'L2']);
    expect(route?.floors[1].enteredBy).toBe('stairs');
  });

  it('folds validateGraph\'s issues in: a connector to nowhere, a bad length, an unreachable floor', () => {
    const { issues } = mergeLevels([ground(), first()], {
      building: 'test',
      entranceNodeId: 'n-ent',
      connectors: [{ a: 'n-st1', b: 'n-stairs-3', kind: 'stairs', lengthM: 0 }],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'bad_attribute', ref: 'n-st1-n-stairs-3', severity: 'error' }),
        expect.objectContaining({ code: 'dangling_edge', ref: 'n-st1-n-stairs-3' }),
        expect.objectContaining({ code: 'unreachable_node', ref: 'n-d201' }),
      ]),
    );
  });

  it('folds validateGraph\'s duplicate_id in when two levels draw one node id', () => {
    const third = svgToGraph('<svg viewBox="0 0 9 9"><circle id="n-k" cx="1" cy="1" r="1"/></svg>', { levelId: 'L3', ordinal: 3, label: '3', metersPerPixel: 1 });
    const { graph, issues } = mergeLevels([first(), third], { building: 'test', connectors: [] });
    expect(graph.nodes.filter((node) => node.id === 'n-k')).toHaveLength(2);
    expect(issues).toEqual(expect.arrayContaining([{ severity: 'error', code: 'duplicate_id', message: "node 'n-k' is defined twice", ref: 'n-k' }]));
  });

  it('a missing entrance is left null, not invented', () => {
    const { graph } = mergeLevels([first()], { building: 'test', connectors: [] });
    expect(graph.entranceNodeId).toBeNull();
  });
});
