// -----------------------------------------------------------
//  [*] wayfindengine — search
//
//  Finding a room by what a person types, and finding the
//  nearest room of a kind by how far it is to WALK. Both are
//  pure over the index; hooks/useRoomSearch.ts memoises the
//  first, hosts call the second straight from a "nearest WC"
//  button.
//
//  Search folds case and diacritics on BOTH sides — "rysiai"
//  must find "Ryšiai" from a phone keyboard with the language
//  switched off — and requires EVERY query token somewhere in
//  a room's haystack (its name, the host's localised name, its
//  aliases, its id), in any order: "auditorija vega" finds
//  "VeGa Auditorija". A token scores by the best way it hits:
//  the room's own id exactly, the start of a field or of a
//  word inside one, or anywhere inside; the score is the sum
//  over tokens, and ties fall back to floor order then name,
//  so the rank is total even when many rooms score the same.
//  The empty query is the browse list: every room by floor
//  then name, which is what a picker shows before a keystroke.
//
//  A room on a level the index does not know is not listed —
//  a match carries its Level, and validateGraph has already
//  flagged the room.
//
//  Nearest-by-category is a plain shortest-path scan over edge
//  metres from a node, every edge kind allowed. It is
//  deliberately NOT the router: no accessibility, no speeds, no
//  instructions — it answers "which WC is closest" in the time
//  a tap takes, and the host then routes to the one it picks
//  under whatever options apply. Walking distance, not the
//  straight line: a WC through the wall may be the far one by
//  corridor.
//
//  Split into:
//
//    foldForSearch          — the fold applied to both sides
//    searchRooms            — tokens, scoring, ordering
//    nearestRoomByCategory  — the shortest-path scan
// -----------------------------------------------------------

import { edgeLengthM, type GraphIndex } from './graph';
import type { Level, Room, RoomCategory } from './types';


export interface RoomMatch {
  room: Room;
  level: Level;
  // Higher is better; 0 for the browse list
  score: number;
}

export interface SearchRoomsOptions {
  // The host's translation of a room's name (via nameKey) —
  // searched beside the raw name and used as the display name
  // for ordering
  localize?: (room: Room) => string;
  limit?: number;
}


// The three ways a token can hit, best first
const SCORE_EXACT_ID = 3;
const SCORE_PREFIX = 2;
const SCORE_INFIX = 1;







// -----------------------------------------------------------
// foldForSearch
// -----------------------------------------------------------
//
//   foldForSearch('  Ryšiai su  visuomene ') → 'rysiai su visuomene'
//
// NFD splits every accent off its base letter, the range strip
// removes the accents, then case and whitespace runs are
// normalised. Applied to the query AND to every haystack
// field, so the two meet on equal terms.
//
// Used by:
//   - searchRooms (below)
//   - src/index.ts — public surface, for hosts folding their
//     own lists (a lecturer picker) the same way
// -----------------------------------------------------------

export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}







// -----------------------------------------------------------
// searchRooms
// -----------------------------------------------------------
//
//   searchRooms(index, 'aud 101')
//   searchRooms(index, '', { limit: 50 })                — the browse list
//   searchRooms(index, 'skaitykla', { localize: (r) => t(r.nameKey) })
//
// Used by:
//   - hooks/useRoomSearch.ts — memoised per query
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function searchRooms(index: GraphIndex, query: string, options: SearchRoomsOptions = {}): RoomMatch[] {

  const { localize, limit } = options;
  const tokens = foldForSearch(query).split(' ').filter(Boolean);
  const displayName = (room: Room): string => localize?.(room) ?? room.name;


  const matches: RoomMatch[] = [];
  for (const room of index.graph.rooms) {
    const level = index.levels.get(room.level);
    if (!level) continue;


    // The fields stay separate rather than joining into one
    // string, so a token can never straddle two of them and a
    // prefix is a prefix of a real field or word
    const id = foldForSearch(room.id);
    const fields = [foldForSearch(room.name), foldForSearch(displayName(room)), ...(room.aliases ?? []).map(foldForSearch), id];


    let score = 0;
    let every = true;
    for (const token of tokens) {
      const hit = scoreToken(token, id, fields);
      if (hit === 0) {
        every = false;
        break;
      }
      score += hit;
    }
    if (every) matches.push({ room, level, score });
  }


  // Score first, then the browse order — floor, display name,
  // and the id last so two rooms of one name still sort the
  // same way every time
  matches.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.level.ordinal !== b.level.ordinal) return a.level.ordinal - b.level.ordinal;
    const byName = compare(foldForSearch(displayName(a.room)), foldForSearch(displayName(b.room)));
    return byName !== 0 ? byName : compare(a.room.id, b.room.id);
  });


  return limit != null && limit >= 0 ? matches.slice(0, limit) : matches;
}


// The best way one token hits a room: its id exactly, the
// start of a field or of a word inside one, anywhere inside,
// or not at all (0 — the room is out). Every occurrence in a
// field is looked at, not the first alone: 'ka' sits inside
// 'dekanato' before it starts 'kabinetas', and the word start
// is the hit that counts
const scoreToken = (token: string, id: string, fields: string[]): number => {
  if (token === id) return SCORE_EXACT_ID;
  let best = 0;
  for (const field of fields) {
    for (let at = field.indexOf(token); at >= 0; at = field.indexOf(token, at + 1)) {
      if (at === 0 || field[at - 1] === ' ') return SCORE_PREFIX;
      best = SCORE_INFIX;
    }
  }
  return best;
};

// A plain code-point order on already-folded text — locale
// collation would differ between engines, and folded ASCII
// needs none
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);







// -----------------------------------------------------------
// nearestRoomByCategory
// -----------------------------------------------------------
//
//   nearestRoomByCategory(index, 'n12', 'wc')            — every WC, closest first
//   nearestRoomByCategory(index, 'n12', 'exit', { max: 1 })
//
// `max` caps how many rooms come back. A room the walk cannot
// reach from the node (an island, the far side of a one-way
// door) is left out; an unknown node answers nothing. A
// cross-level edge without a length counts 0 m — validateGraph
// reports one as 'connector_without_length', so a graph that
// passed the build has none.
//
// Used by:
//   - src/index.ts — public surface (the "nearest WC / exit"
//     shortcuts on the host's map screen)
// -----------------------------------------------------------

export function nearestRoomByCategory(index: GraphIndex, fromNodeId: string, category: RoomCategory, options: { max?: number } = {}): { room: Room; distanceM: number }[] {

  if (!index.nodes.has(fromNodeId)) return [];
  const max = options.max ?? Infinity;
  if (max <= 0) return [];


  // Several rooms may end at one node (a shared door) — the
  // index's roomByNode keeps only the first, so the wanted
  // rooms are gathered per node here
  const roomsAt = new Map<string, Room[]>();
  let wanted = 0;
  for (const room of index.graph.rooms) {
    if (room.category !== category) continue;
    roomsAt.set(room.nodeId, [...(roomsAt.get(room.nodeId) ?? []), room]);
    wanted++;
  }
  if (wanted === 0) return [];


  // Nodes settle in ascending distance, so the rooms are found
  // closest first and the scan can stop as soon as it has
  // enough — most of a building is never visited for one WC
  const found: { room: Room; distanceM: number }[] = [];
  const best = new Map<string, number>([[fromNodeId, 0]]);
  const settled = new Set<string>();
  const frontier = createFrontier();
  frontier.push(fromNodeId, 0);


  for (let entry = frontier.pop(); entry; entry = frontier.pop()) {
    // A stale entry: the node was reached cheaper after this one
    // was pushed, and the cheaper entry has settled it already
    if (settled.has(entry.nodeId)) continue;
    settled.add(entry.nodeId);


    for (const room of roomsAt.get(entry.nodeId) ?? []) found.push({ room, distanceM: entry.distanceM });
    if (found.length >= max || found.length >= wanted) break;


    for (const { nodeId, edge } of index.adjacency.get(entry.nodeId) ?? []) {
      if (settled.has(nodeId)) continue;
      const distanceM = entry.distanceM + edgeLengthM(index, edge);
      if (distanceM >= (best.get(nodeId) ?? Infinity)) continue;
      best.set(nodeId, distanceM);
      frontier.push(nodeId, distanceM);
    }
  }


  // Two rooms at one distance (a shared door, two equal
  // corridors) come out in name order rather than heap order
  found.sort((a, b) => (a.distanceM !== b.distanceM ? a.distanceM - b.distanceM : compare(foldForSearch(a.room.name), foldForSearch(b.room.name))));
  return found.length > max ? found.slice(0, max) : found;
}


// The scan's frontier: a binary min-heap on distance. Entries
// are never updated in place — a cheaper way to a node pushes
// a fresh entry, and the stale one is skipped on pop
interface FrontierEntry {
  nodeId: string;
  distanceM: number;
}

const createFrontier = () => {
  const heap: FrontierEntry[] = [];

  const push = (nodeId: string, distanceM: number) => {
    heap.push({ nodeId, distanceM });
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].distanceM <= heap[i].distanceM) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };

  const pop = (): FrontierEntry | undefined => {
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop() as FrontierEntry;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left].distanceM < heap[smallest].distanceM) smallest = left;
        if (right < heap.length && heap[right].distanceM < heap[smallest].distanceM) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  };

  return { push, pop };
};
