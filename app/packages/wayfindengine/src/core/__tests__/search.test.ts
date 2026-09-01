// -----------------------------------------------------------
//  [*] Tests — @knf/wayfindengine search
//
//  The fold (Lithuanian diacritics, case, whitespace runs),
//  every-token-in-any-order matching across name, localised
//  name, aliases and id, the three-tier rank (exact id, then
//  a field or word start, then anywhere inside), the browse
//  order of the empty query, the limit, and a room on an
//  unknown level staying out. Then the nearest-by-category
//  scan: WALKING distance, not the straight line — a WC five
//  pixels away through a wall loses to one fifteen along the
//  corridor — the cap, the unreachable island, a level change
//  priced by its explicit length, and one-way edges holding.
//
//  The plan (1 m per pixel on both levels):
//
//    L1   s ── w2 ── k          w1 sits 5 px below s with no
//         │        │            edge between them — the wall;
//         wA       k2 ─── w1    it is reached round via k
//                               (65 m). w2 is 15 m. wA is a
//         st1 ─ (stairs 6 m) ─ st2 ─ w3 on L2, 21 m in all
//         island: no edges at all
// -----------------------------------------------------------

import { indexGraph } from '../graph';
import { foldForSearch, nearestRoomByCategory, searchRooms } from '../search';
import type { BuildingGraph, GraphEdge, GraphNode, NodeKind, Room } from '../types';


const node = (id: string, level: string, x: number, y: number, kind: NodeKind = 'corridor'): GraphNode => ({ id, level, x, y, kind });
const hallway = (a: string, b: string): GraphEdge => ({ a, b, kind: 'hallway' });

const building = (rooms: Room[]): BuildingGraph => ({
  version: 1,
  building: 'test',
  levels: [
    { id: 'L2', label: '2', viewBox: [0, 0, 100, 100], metersPerPixel: 1, ordinal: 2 },
    { id: 'L1', label: '1', viewBox: [0, 0, 100, 100], metersPerPixel: 1, ordinal: 1 },
  ],
  nodes: [
    node('s', 'L1', 0, 0),
    node('w2', 'L1', 15, 0, 'door'),
    node('k', 'L1', 30, 0),
    node('k2', 'L1', 30, 5),
    node('w1', 'L1', 0, 5, 'door'),
    node('wA', 'L1', 0, 10, 'door'),
    node('st1', 'L1', 0, -10, 'stairs'),
    node('st2', 'L2', 0, -10, 'stairs'),
    node('w3', 'L2', 5, -10, 'door'),
    node('island', 'L1', 90, 90),
    node('gate', 'L1', -10, 0, 'door'),
  ],
  edges: [
    hallway('s', 'w2'),
    hallway('w2', 'k'),
    hallway('k', 'k2'),
    hallway('k2', 'w1'),
    hallway('s', 'wA'),
    hallway('s', 'st1'),
    { a: 'st1', b: 'st2', kind: 'stairs', lengthM: 6 },
    hallway('st2', 'w3'),
    // Exit-only: walkable gate → s, never s → gate
    { a: 'gate', b: 's', kind: 'door', oneWay: true },
  ],
  rooms,
  entranceNodeId: 's',
});


// The search fixture: names with diacritics, an alias, a
// localised name, three rooms sharing '101' three different
// ways, and a room on a level nobody defined
const ROOMS: Room[] = [
  { id: '101', name: 'Auditorija 101', level: 'L1', nodeId: 'k', aliases: ['Didžioji auditorija'] },
  { id: '1010', name: 'Kabinetas 1010', level: 'L1', nodeId: 'k2' },
  { id: 's-3101', name: 'Sandėlis 3101', level: 'L1', nodeId: 'k2' },
  { id: 'rys', name: 'Ryšiai su visuomene', level: 'L1', nodeId: 'w2', category: 'office' },
  { id: 'wc-a', name: 'WC A', level: 'L1', nodeId: 'w1', category: 'wc' },
  { id: 'wc-b', name: 'WC B', level: 'L1', nodeId: 'w2', category: 'wc' },
  { id: 'lib', name: 'Biblioteka', nameKey: 'rooms.lib', level: 'L2', nodeId: 'w3', aliases: ['library'] },
  { id: '201', name: 'Auditorija 201', level: 'L2', nodeId: 'w3' },
  { id: 'ghost', name: 'Auditorija 999', level: 'L9', nodeId: 'k' },
];

const index = indexGraph(building(ROOMS));

const ids = (matches: { room: Room }[]): string[] => matches.map((m) => m.room.id);


describe('foldForSearch', () => {
  it('strips Lithuanian diacritics and case', () => {
    expect(foldForSearch('Ryšiai')).toBe('rysiai');
    expect(foldForSearch('Ąžuolų Ėglė Įš Ųū Čč')).toBe('azuolu egle is uu cc');
  });

  it('collapses whitespace runs and trims the ends', () => {
    expect(foldForSearch('  Ryšiai   su\tvisuomene \n')).toBe('rysiai su visuomene');
    expect(foldForSearch('   ')).toBe('');
  });
});


describe('searchRooms — matching', () => {
  it("'rysiai' finds 'Ryšiai' from an unaccented keyboard", () => {
    expect(ids(searchRooms(index, 'rysiai'))).toEqual(['rys']);
    expect(ids(searchRooms(index, 'RYŠIAI'))).toEqual(['rys']);
  });

  it('requires every token, in any order', () => {
    expect(ids(searchRooms(index, 'visuomene rysiai'))).toEqual(['rys']);
    expect(ids(searchRooms(index, 'su   rysiai'))).toEqual(['rys']);
    expect(ids(searchRooms(index, 'rysiai zzz'))).toEqual([]);
  });

  it('matches through an alias', () => {
    expect(ids(searchRooms(index, 'library'))).toEqual(['lib']);
    expect(ids(searchRooms(index, 'didzioji'))).toEqual(['101']);
  });

  it('matches through the id', () => {
    expect(ids(searchRooms(index, 'wc-a'))).toEqual(['wc-a']);
    expect(ids(searchRooms(index, 'S-3101'))).toEqual(['s-3101']);
  });

  it("matches through the host's localised name", () => {
    const localize = (room: Room) => (room.id === 'lib' ? 'Skaitykla' : room.name);
    expect(ids(searchRooms(index, 'skaitykla'))).toEqual([]);
    expect(ids(searchRooms(index, 'skaitykla', { localize }))).toEqual(['lib']);
    // The raw name still counts beside the localised one
    expect(ids(searchRooms(index, 'biblioteka', { localize }))).toEqual(['lib']);
  });

  it('carries the level object on every match', () => {
    const [match] = searchRooms(index, 'library');
    expect(match.level).toBe(index.levels.get('L2'));
  });

  it('leaves out a room on a level the graph does not define', () => {
    expect(ids(searchRooms(index, '999'))).toEqual([]);
    expect(ids(searchRooms(index, ''))).not.toContain('ghost');
  });
});


describe('searchRooms — ranking', () => {
  it('exact id, then a prefix, then an infix', () => {
    const matches = searchRooms(index, '101');
    expect(ids(matches)).toEqual(['101', '1010', 's-3101']);
    expect(matches.map((m) => m.score)).toEqual([3, 2, 1]);
  });

  it('a word start inside a field ranks as a prefix', () => {
    // 'Auditorija 101' and 'Kabinetas 1010' both hit at a word
    // start; 'Sandėlis 3101' only inside a word
    const matches = searchRooms(index, '10');
    expect(ids(matches)).toEqual(['101', '1010', 's-3101']);
    expect(matches.map((m) => m.score)).toEqual([2, 2, 1]);
  });

  it('scores a token by its best hit, not its first: a word start after an in-word hit is a prefix', () => {
    // 'ka' sits inside 'dekanato' before it starts 'kabinetas',
    // so the room ranks with 'Kavinė' (a field start) and above
    // 'Aula skaitykla', where 'ka' only ever sits inside a word
    const rooms: Room[] = [
      { id: 'dek', name: 'Dekanato kabinetas', level: 'L1', nodeId: 'k' },
      { id: 'kav', name: 'Kavinė', level: 'L1', nodeId: 'k' },
      { id: 'aula', name: 'Aula skaitykla', level: 'L1', nodeId: 'k' },
    ];
    const matches = searchRooms(indexGraph(building(rooms)), 'ka');
    expect(matches.map((m) => [m.room.id, m.score])).toEqual([
      ['dek', 2],
      ['kav', 2],
      ['aula', 1],
    ]);
  });

  it('sums the tokens and breaks ties by floor then name', () => {
    // 'aud' is a word start for both auditoriums; L1 first
    expect(ids(searchRooms(index, 'aud'))).toEqual(['101', '201']);
    // '201' is an exact id AND 'aud' a prefix — 5 beats 2
    const matches = searchRooms(index, 'aud 201');
    expect(ids(matches)).toEqual(['201']);
    expect(matches[0].score).toBe(5);
  });
});


describe('searchRooms — the browse list', () => {
  it('lists every room by floor then folded name for the empty query', () => {
    const matches = searchRooms(index, '');
    expect(ids(matches)).toEqual(['101', '1010', 'rys', 's-3101', 'wc-a', 'wc-b', '201', 'lib']);
    expect(matches.every((m) => m.score === 0)).toBe(true);
  });

  it('a blank query is the empty query', () => {
    expect(ids(searchRooms(index, '   '))).toEqual(ids(searchRooms(index, '')));
  });

  it('orders by the localised name when a localizer is given', () => {
    // 'Archyvas' sorts before 'Auditorija 201'; 'Biblioteka' after
    const localize = (room: Room) => (room.id === 'lib' ? 'Archyvas' : room.name);
    expect(ids(searchRooms(index, '', { localize })).slice(-2)).toEqual(['lib', '201']);
  });

  it('caps the list at limit', () => {
    expect(ids(searchRooms(index, '', { limit: 3 }))).toEqual(['101', '1010', 'rys']);
    expect(ids(searchRooms(index, '', { limit: 0 }))).toEqual([]);
    expect(ids(searchRooms(index, 'aud', { limit: 1 }))).toEqual(['101']);
  });
});


describe('nearestRoomByCategory', () => {
  it('ranks by walking distance, not the straight line', () => {
    // wA is 10 m straight and 10 m by corridor; w1 is 5 m straight
    // but 65 m round the wall; w2 is 15 m either way
    const rooms: Room[] = [
      { id: 'wc-a', name: 'WC A', level: 'L1', nodeId: 'w1', category: 'wc' },
      { id: 'wc-b', name: 'WC B', level: 'L1', nodeId: 'w2', category: 'wc' },
    ];
    const near = nearestRoomByCategory(indexGraph(building(rooms)), 's', 'wc');
    expect(near.map((n) => [n.room.id, n.distanceM])).toEqual([
      ['wc-b', 15],
      ['wc-a', 65],
    ]);
  });

  it('caps at max, closest first', () => {
    expect(nearestRoomByCategory(index, 's', 'wc', { max: 1 }).map((n) => n.room.id)).toEqual(['wc-b']);
    expect(nearestRoomByCategory(index, 's', 'wc', { max: 0 })).toEqual([]);
  });

  it('prices a level change by its explicit length', () => {
    const rooms: Room[] = [
      { id: 'wc-up', name: 'WC up', level: 'L2', nodeId: 'w3', category: 'wc' },
      { id: 'wc-a', name: 'WC A', level: 'L1', nodeId: 'w1', category: 'wc' },
    ];
    const near = nearestRoomByCategory(indexGraph(building(rooms)), 's', 'wc');
    expect(near.map((n) => [n.room.id, n.distanceM])).toEqual([
      ['wc-up', 21],
      ['wc-a', 65],
    ]);
  });

  it('measures from where the walker stands', () => {
    const near = nearestRoomByCategory(index, 'k2', 'wc');
    expect(near.map((n) => [n.room.id, n.distanceM])).toEqual([
      ['wc-b', 20],
      ['wc-a', 30],
    ]);
  });

  it('leaves out a room the walk cannot reach', () => {
    const rooms: Room[] = [
      { id: 'wc-far', name: 'WC far', level: 'L1', nodeId: 'island', category: 'wc' },
      { id: 'wc-b', name: 'WC B', level: 'L1', nodeId: 'w2', category: 'wc' },
    ];
    expect(nearestRoomByCategory(indexGraph(building(rooms)), 's', 'wc').map((n) => n.room.id)).toEqual(['wc-b']);
  });

  it('honours one-way edges from the start node', () => {
    const rooms: Room[] = [{ id: 'exit', name: 'Exit', level: 'L1', nodeId: 'gate', category: 'exit' }];
    const idx = indexGraph(building(rooms));
    // gate → s is the only direction, so s never reaches gate
    expect(nearestRoomByCategory(idx, 's', 'exit')).toEqual([]);
    expect(nearestRoomByCategory(idx, 'gate', 'exit').map((n) => n.distanceM)).toEqual([0]);
  });

  it('answers nothing for an unknown node or an absent category', () => {
    expect(nearestRoomByCategory(index, 'nope', 'wc')).toEqual([]);
    expect(nearestRoomByCategory(index, 's', 'food')).toEqual([]);
  });

  it('lists every room at one shared door, in name order', () => {
    const rooms: Room[] = [
      { id: 'wc-z', name: 'WC Z', level: 'L1', nodeId: 'w2', category: 'wc' },
      { id: 'wc-m', name: 'WC M', level: 'L1', nodeId: 'w2', category: 'wc' },
    ];
    expect(nearestRoomByCategory(indexGraph(building(rooms)), 's', 'wc').map((n) => n.room.id)).toEqual(['wc-m', 'wc-z']);
  });
});
