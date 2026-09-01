// -----------------------------------------------------------
//  [*] wayfindengine — instructions
//
//  Turn-by-turn steps for one route, derived from its points
//  and the edges joining them (edges[i] walks points[i] to
//  points[i + 1]). The list a screen reads out: depart, the
//  corners that matter, doors, one step per stairwell, a word
//  of reassurance on a long empty corridor, arrive.
//
//  Every step is anchored to a node and carries the metres
//  from that node to the NEXT step's node (arrive carries 0),
//  so the steps sum to the route and a navigation state finds
//  "the step whose action comes next" by node alone. Metres
//  are re-derived from the edges through edgeLengthM rather
//  than read off points[].atM, so a hand-built route is
//  measured exactly the way the router's is.
//
//  What becomes a step, by priority when two meet at one node:
//    connector  the first edge of a maximal run of stairs /
//               elevator / ramp edges. The whole run is ONE
//               step — via (the kind the walker meets first),
//               the level before and after, up or down by the
//               levels' ordinals, the run's total length — and
//               the nodes inside it never turn: a stairwell's
//               zig-zag is noise
//    turn       a corner of the walk between two connector
//               runs, found exactly as compressPath keeps one
//               (the heading in is measured from the LAST
//               corner, so a gentle arc of sub-threshold bends
//               still adds up to a turn; 25° against the
//               heading out makes a corner). It names the room
//               whose door the node is, else the node's
//               landmark, else the destination
//    door       a door-kind edge leaves the node, unless the
//               arrival is right behind it
//    continue   the node where a connector run ends (the
//               walker resumes on the new level), or the first
//               node inside a straight stretch over 40 m that
//               would otherwise pass in silence — one per
//               stretch, never inside a connector run, never
//               right behind another continue
//  Node 0 is always 'depart', pointing at the room of the
//  first event ahead, else the destination; a connector run
//  opening there stands right after it (the depart measures
//  0 m), a door there is folded into it. The last node is only
//  ever 'arrive', its side read off the final heading against
//  the room polygon's centroid.
//
//  Used by:
//    - core/route.ts — fills Route.steps for every answered route
//    - src/index.ts — public surface, for hosts building steps
//      over a hand-made route
// -----------------------------------------------------------

import { bearingDeg, compressPath, shortestArcDeg, turnBetween, type PlanPoint } from './geometry';
import { edgeLengthM, type GraphIndex } from './graph';
import type { EdgeKind, GraphEdge, Instruction, Room, RoutePoint, TurnDirection } from './types';


// Under this the heading change is no corner at all
const TURN_MIN_DEG = 25;
// A silent straight stretch past this length gets a 'continue'
const LONG_STRETCH_M = 40;
// The destination counts as "ahead" within this of the heading
const AHEAD_MAX_DEG = 30;

type ConnectorKind = 'stairs' | 'elevator' | 'ramp';

const isConnector = (kind: EdgeKind): kind is ConnectorKind => kind === 'stairs' || kind === 'elevator' || kind === 'ramp';

// A node carries at most one of these beside the fixed depart
// and arrive; the banner gives the priority when two meet
type EventKind = 'connector' | 'turn' | 'door' | 'continue';

type StepKind = 'depart' | EventKind | 'arrive';

const same = (a: PlanPoint, b: PlanPoint): boolean => a.x === b.x && a.y === b.y;







// -----------------------------------------------------------
// buildInstructions
// -----------------------------------------------------------
//
//   buildInstructions(index, route.points, edgesWalked)
//
// edges[i] joins points[i] to points[i + 1] in either
// orientation (a two-way edge is walked b → a as often as
// a → b), so lengths come from edgeLengthM and headings from
// the points. No points is no steps; one point is the arrival
// alone.
//
// Used by:
//   - core/route.ts — assembleRoute
//   - src/index.ts — public surface
// -----------------------------------------------------------

export function buildInstructions(index: GraphIndex, points: RoutePoint[], edges: GraphEdge[]): Instruction[] {

  const n = points.length;
  if (n === 0) return [];
  const last = points[n - 1];
  const destination = index.roomByNode.get(last.nodeId) ?? null;
  if (n === 1) return [{ type: 'arrive', atNodeId: last.nodeId, roomId: destination?.id ?? null, side: null }];


  // A missing edge (a hand-built route short of one) walks as a
  // hallway of no length rather than crashing the whole list
  const kindAt = (i: number): EdgeKind => edges[i]?.kind ?? 'hallway';
  const cumM: number[] = [0];
  for (let i = 0; i < n - 1; i++) cumM.push(cumM[i] + (edges[i] ? edgeLengthM(index, edges[i]) : 0));


  const events: (EventKind | null)[] = new Array(n).fill(null);
  const turns: (TurnDirection | null)[] = new Array(n).fill(null);
  const runs = new Map<number, { via: ConnectorKind; end: number }>();


  // The corners of one walk [s, e] (no connector edge inside).
  // compressPath passes the point objects through, so a corner
  // is found again by identity; the spoken direction is taken
  // against the heading the walker actually leaves on — the
  // next distinct point — not the chord to the next corner,
  // which a gentle arc afterwards would soften
  const markTurns = (s: number, e: number) => {
    if (e - s < 2) return;
    const walk = points.slice(s, e + 1);
    const corners = compressPath(walk, TURN_MIN_DEG);
    for (let k = 1; k < corners.length - 1; k++) {
      const corner = corners[k];
      const i = s + walk.indexOf(corner);
      let j = i + 1;
      while (j < e && same(points[j], corner)) j++;
      events[i] = 'turn';
      turns[i] = turnBetween(bearingDeg(corners[k - 1], corner), bearingDeg(corner, points[j]));
    }
  };


  // Walks and connector runs alternate: a walk ends where a
  // connector edge leaves, the run ends where a non-connector
  // edge leaves (or the route does), and that exit node opens
  // the next walk — resuming on the new level is worth a step
  // of its own, so the connector can measure exactly its run
  let lastWalkStart = 0;
  for (let s = 0; s < n; ) {
    lastWalkStart = s;
    let e = s;
    let via: ConnectorKind | null = null;
    for (; e < n - 1; e++) {
      const kind = kindAt(e);
      if (isConnector(kind)) {
        via = kind;
        break;
      }
    }
    markTurns(s, e);
    if (via === null) break;


    let end = e + 1;
    while (end < n - 1 && isConnector(kindAt(end))) end++;
    events[e] = 'connector';
    runs.set(e, { via, end });
    if (end < n - 1) events[end] = 'continue';
    s = end;
  }


  // A door edge leaving a node that is not already a corner —
  // never at node 0 (the depart covers it) and never straight
  // into the arrival (the arrive covers that one)
  for (let i = 1; i < n - 2; i++) {
    if (kindAt(i) === 'door' && events[i] !== 'turn') events[i] = 'door';
  }


  // The long silent stretch: between two consecutive events with
  // at least one node in between and more than 40 m to walk, the
  // first inner node speaks up. Not behind a connector (its run
  // stays quiet) and not behind a continue (it would only repeat
  // itself)
  const eventIndexes = (): number[] => {
    const list = [0];
    for (let i = 1; i < n - 1; i++) if (events[i] !== null) list.push(i);
    list.push(n - 1);
    return list;
  };
  const marked = eventIndexes();
  for (let k = 0; k + 1 < marked.length; k++) {
    const p = marked[k];
    const q = marked[k + 1];
    const quiet = events[p] !== 'connector' && events[p] !== 'continue';
    if (quiet && q - p >= 2 && cumM[q] - cumM[p] > LONG_STRETCH_M) events[p + 1] = 'continue';
  }


  // Steps in walking order. A connector opening at node 0 stands
  // right after the depart and shares its node
  const marks: { at: number; kind: StepKind }[] = [{ at: 0, kind: 'depart' }];
  for (let i = 0; i < n - 1; i++) {
    const event = events[i];
    if (event) marks.push({ at: i, kind: event });
  }
  marks.push({ at: n - 1, kind: 'arrive' });


  const roomAt = (i: number): Room | null => index.roomByNode.get(points[i].nodeId) ?? null;

  // Where a step points: the room whose door the NEXT step's
  // node is (past any step sharing this node), else the
  // destination room
  const towards = (k: number): string | null => {
    let j = k + 1;
    while (j < marks.length - 1 && marks[j].at === marks[k].at) j++;
    return roomAt(marks[j].at)?.id ?? destination?.id ?? null;
  };


  const steps: Instruction[] = [];
  marks.forEach((mark, k) => {
    const at = mark.at;
    const atNodeId = points[at].nodeId;
    const next = marks[k + 1];
    const distanceM = next ? cumM[next.at] - cumM[at] : 0;


    switch (mark.kind) {
      case 'depart':
        steps.push({ type: 'depart', atNodeId, distanceM, towardsRoomId: towards(k) });
        break;

      case 'connector': {
        const run = runs.get(at) as { via: ConnectorKind; end: number };
        const from = index.levels.get(points[at].level);
        const to = index.levels.get(points[run.end].level);
        steps.push({
          type: 'connector',
          atNodeId,
          via: run.via,
          fromLevel: points[at].level,
          toLevel: points[run.end].level,
          // A same-level stub of steps, or a level the index does
          // not know, has no height to compare — 'up' by convention
          direction: from && to && to.ordinal < from.ordinal ? 'down' : 'up',
          distanceM: cumM[run.end] - cumM[at],
        });
        break;
      }

      case 'turn': {
        const room = roomAt(at);
        const landmark = room ? null : (index.nodes.get(atNodeId)?.landmark ?? null);
        let towardsRoomId: string | null = null;
        if (room) towardsRoomId = room.id;
        else if (!landmark) towardsRoomId = destination?.id ?? null;
        steps.push({ type: 'turn', atNodeId, direction: turns[at] ?? 'straight', distanceM, towardsRoomId, landmark });
        break;
      }

      case 'door':
        steps.push({ type: 'door', atNodeId, distanceM, towardsRoomId: roomAt(at)?.id ?? towards(k) });
        break;

      case 'continue':
        steps.push({ type: 'continue', atNodeId, distanceM, towardsRoomId: towards(k) });
        break;

      case 'arrive':
        steps.push({ type: 'arrive', atNodeId, roomId: destination?.id ?? null, side: arrivalSide(points, lastWalkStart, destination) });
        break;
    }
  });


  return steps;
}







// -----------------------------------------------------------
// arrivalSide
// -----------------------------------------------------------
//
// Which way the walker looks for the room at the end: the
// final heading (into the destination from the last distinct
// point of the closing walk) against the direction from the
// destination node to the room polygon's centroid. Within 30°
// either way is 'ahead'; standing on the centroid itself is
// 'ahead' too — the room is all around. Null when there is
// nothing to compare: no polygon, a polygon drawn on another
// level's plan, or no heading because the route ended on a
// connector.
//
// Used by:
//   - buildInstructions (above)
// -----------------------------------------------------------

function arrivalSide(points: RoutePoint[], walkStart: number, room: Room | null): 'left' | 'right' | 'ahead' | null {

  const last = points[points.length - 1];
  if (!room || !room.polygon || room.polygon.length === 0 || room.level !== last.level) return null;


  let j = points.length - 2;
  while (j > walkStart && same(points[j], last)) j--;
  if (j < walkStart || same(points[j], last)) return null;


  const centre = polygonCentroid(room.polygon);
  if (same(centre, last)) return 'ahead';
  const delta = shortestArcDeg(bearingDeg(points[j], last), bearingDeg(last, centre));
  if (Math.abs(delta) < AHEAD_MAX_DEG) return 'ahead';
  return delta < 0 ? 'left' : 'right';
}


// Area-weighted, so an L-shaped room's centre is where its floor
// is rather than where its corners are; a polygon with no area
// (a line, a single point) falls back to the mean of its vertices
const polygonCentroid = (polygon: [number, number][]): PlanPoint => {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x0, y0] = polygon[i];
    const [x1, y1] = polygon[(i + 1) % polygon.length];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const sumX = polygon.reduce((sum, [x]) => sum + x, 0);
    const sumY = polygon.reduce((sum, [, y]) => sum + y, 0);
    return { x: sumX / polygon.length, y: sumY / polygon.length };
  }
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
};
