// -----------------------------------------------------------
//  [*] wayfindengine — tools: svgToGraph
//
//  The plan-to-graph authoring tool. A floor plan is drawn in
//  any vector editor with three kinds of marked-up shapes on
//  top of the drawing, and this turns one such drawing into
//  one level's nodes, edges and rooms:
//
//    <circle id="n-…" cx cy [data-kind] [data-room] [data-pano]
//            [data-yaw] [data-qr] [data-landmark]>
//        a node at the circle's centre; kind 'corridor' unless
//        said otherwise; the id is kept whole ('n-lobby')
//    <line id="e-…" x1 y1 x2 y2 [data-kind] [data-length]
//          [data-oneway]>
//        an edge whose ends SNAP to the nearest node within
//        snapTolerancePx — a line drawn by hand never lands on
//        a centre exactly; an end that snaps to nothing is
//        reported ('unsnapped_edge') and the edge dropped, as
//        is a line both of whose ends land on one node
//        ('self_edge'). a → b is the line's own direction, so
//        data-oneway reads off the drawing
//    <path id="r-<roomId>" d="M … L … Z" [data-name] [data-node]
//          [data-category] [data-name-key]>
//        a room whose polygon is the path (M L H V and their
//        relative forms, one closed ring; a curve or a second
//        ring is 'unsupported_path' and the room is dropped);
//        the 'r-' prefix is stripped, a room id being the
//        number the world knows it by. A <rect> or <polygon>
//        with the same id shape is a room too. The room's
//        node is data-node, else the node nearest the polygon
//        — a node inside it wins (nearest the centre among
//        several), else the nearest to its boundary
//
//  Everything else in the drawing — the walls, the labels, a
//  circle without an 'n-' id — is ignored, and so is any
//  transform attribute: shapes are read in plan coordinates
//  as written. Parsing is a pair of regexes, not an XML
//  parser: comments are stripped first, attributes are read
//  in either quote style with their entities decoded (the
//  five named ones and numeric references — a name with an
//  '&' is written &amp; by every editor), an unparsable
//  number is reported ('bad_attribute') and the shape
//  skipped. The <svg viewBox>
//  becomes the level's viewBox, falling back to width/height
//  and then to the bounding box of what was parsed
//  ('missing_viewbox').
//
//  Nothing is thrown and no issue stops the parse: an
//  authoring tool shows everything wrong at once, so the
//  result carries the shapes it could read beside the issues
//  it found. mergeLevels then joins the levels with the
//  connectors an author names, runs validateGraph over the
//  whole and folds its issues in with the parts'.
//
//  Used by:
//    - src/index.ts — public surface (a host's build script)
//    - src/tools/__tests__/svgToGraph.test.ts
// -----------------------------------------------------------

import { validateGraph, type GraphIssue } from '../core/graph';
import type { BuildingGraph, EdgeKind, GraphEdge, GraphNode, Level, NodeKind, Room } from '../core/types';


export interface SvgToGraphOptions {
  levelId: string;
  ordinal: number;
  label: string;
  metersPerPixel: number;
  // How far a line's end may miss a node's centre, in plan
  // pixels
  snapTolerancePx?: number;
  // The Level.plan reference the host will load — the tool
  // cannot know it
  plan?: string | null;
}

export type SvgIssueCode =
  | 'missing_viewbox'
  | 'bad_attribute'
  | 'unsnapped_edge'
  | 'self_edge'
  | 'unsupported_path'
  | 'unknown_node_ref'
  | 'room_without_node'
  | 'duplicate_id';

export interface SvgToGraphIssue {
  severity: 'error' | 'warning';
  code: SvgIssueCode | GraphIssue['code'];
  message: string;
  // The SVG id of the shape (or the graph id, for folded
  // validateGraph issues)
  ref: string;
}

export interface SvgToGraphResult {
  level: Level;
  nodes: GraphNode[];
  edges: GraphEdge[];
  rooms: Room[];
  issues: SvgToGraphIssue[];
}


const DEFAULT_SNAP_PX = 6;

const NODE_KINDS: ReadonlySet<string> = new Set<NodeKind>(['corridor', 'door', 'stairs', 'elevator', 'ramp', 'entrance', 'room']);
const EDGE_KINDS: ReadonlySet<string> = new Set<EdgeKind>(['hallway', 'door', 'stairs', 'elevator', 'ramp']);

type Attributes = Record<string, string>;

interface Shape {
  tag: string;
  attrs: Attributes;
}


// Every element of the tags we read, in document order, with
// its attributes. Comments go first so a shape commented out
// stays out; the attribute regex takes either quote style and
// ignores bare words
const shapes = (svg: string): Shape[] => {
  const clean = svg.replace(/<!--[\s\S]*?-->/g, '');
  const out: Shape[] = [];
  const tagRe = /<(circle|line|path|rect|polygon)\b([^>]*?)\/?>/gi;
  for (let m = tagRe.exec(clean); m; m = tagRe.exec(clean)) out.push({ tag: m[1].toLowerCase(), attrs: attributes(m[2]) });
  return out;
};

const attributes = (raw: string): Attributes => {
  const out: Attributes = {};
  const attrRe = /([^\s=\/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let m = attrRe.exec(raw); m; m = attrRe.exec(raw)) out[m[1]] = decodeEntities(m[2] ?? m[3]);
  return out;
};

// Every value is decoded once here, ids and numbers included,
// so the graph carries what the author typed and the round
// trip is uniform. An entity the tool does not know (a
// document-defined one) stays as written rather than vanishing
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeEntities = (value: string): string =>
  value.replace(/&(amp|lt|gt|quot|apos|#[xX][0-9a-fA-F]+|#\d+);/g, (whole, body: string) => {
    const named = NAMED_ENTITIES[body];
    if (named !== undefined) return named;
    const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

const number = (value: string | undefined): number | null => {
  if (value == null || value.trim() === '') return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
};

// data-oneway="true" / "1" / "" all mean yes; only an explicit
// no means no
const flag = (value: string | undefined): boolean => value != null && !['false', '0', 'no'].includes(value.trim().toLowerCase());

const text = (value: string | undefined): string | null => (value != null && value.trim() !== '' ? value.trim() : null);







// -----------------------------------------------------------
// svgToGraph
// -----------------------------------------------------------
//
//   const l1 = svgToGraph(svgText, { levelId: 'L1', ordinal: 1,
//                                    label: '1 aukštas', metersPerPixel: 0.05 })
//   l1.issues                       — show them all
//   mergeLevels([l1, l2], { … })    — then the building
//
// Used by:
//   - src/index.ts — public surface (a host's build script)
// -----------------------------------------------------------

export function svgToGraph(svg: string, options: SvgToGraphOptions): SvgToGraphResult {

  const issues: SvgToGraphIssue[] = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const rooms: Room[] = [];
  const snap = options.snapTolerancePx ?? DEFAULT_SNAP_PX;
  const all = shapes(svg);
  const error = (code: SvgIssueCode, ref: string, message: string) => issues.push({ severity: 'error', code, message, ref });
  const warning = (code: SvgIssueCode, ref: string, message: string) => issues.push({ severity: 'warning', code, message, ref });


  // Nodes first: edges and rooms both resolve against them
  const seenNodes = new Set<string>();
  for (const { tag, attrs } of all) {
    const id = attrs.id ?? '';
    if (tag !== 'circle' || !id.startsWith('n-')) continue;
    const x = number(attrs.cx);
    const y = number(attrs.cy);
    if (x === null || y === null) {
      error('bad_attribute', id, `node '${id}' has no numeric cx/cy (cx="${attrs.cx ?? ''}" cy="${attrs.cy ?? ''}")`);
      continue;
    }
    if (seenNodes.has(id)) {
      error('duplicate_id', id, `node '${id}' is drawn twice`);
      continue;
    }
    seenNodes.add(id);


    let kind: NodeKind = 'corridor';
    const wanted = text(attrs['data-kind']);
    if (wanted !== null) {
      if (NODE_KINDS.has(wanted)) kind = wanted as NodeKind;
      else warning('bad_attribute', id, `node '${id}' has unknown data-kind '${wanted}', kept as 'corridor'`);
    }
    const yaw = attrs['data-yaw'] != null ? number(attrs['data-yaw']) : null;
    if (attrs['data-yaw'] != null && yaw === null) warning('bad_attribute', id, `node '${id}' has a non-numeric data-yaw '${attrs['data-yaw']}', dropped`);


    const node: GraphNode = { id, level: options.levelId, x, y, kind };
    const roomId = text(attrs['data-room']);
    const pano = text(attrs['data-pano']);
    const qr = text(attrs['data-qr']);
    const landmark = text(attrs['data-landmark']);
    if (roomId !== null) node.roomId = roomId;
    if (pano !== null) node.pano = pano;
    if (yaw !== null) node.panoYaw = yaw;
    if (qr !== null) node.qr = qr;
    if (landmark !== null) node.landmark = landmark;
    nodes.push(node);
  }


  for (const { tag, attrs } of all) {
    const id = attrs.id ?? '';
    if (tag !== 'line' || !id.startsWith('e-')) continue;
    const x1 = number(attrs.x1);
    const y1 = number(attrs.y1);
    const x2 = number(attrs.x2);
    const y2 = number(attrs.y2);
    if (x1 === null || y1 === null || x2 === null || y2 === null) {
      error('bad_attribute', id, `edge '${id}' has non-numeric endpoints`);
      continue;
    }


    const a = nearestNode(nodes, x1, y1, snap);
    const b = nearestNode(nodes, x2, y2, snap);
    if (!a || !b) {
      const loose = !a ? `(${x1}, ${y1})` : `(${x2}, ${y2})`;
      error('unsnapped_edge', id, `edge '${id}' ends at ${loose}, more than ${snap}px from any node`);
      continue;
    }
    if (a === b) {
      error('self_edge', id, `edge '${id}' has both ends on node '${a.id}'`);
      continue;
    }


    let kind: EdgeKind = 'hallway';
    const wanted = text(attrs['data-kind']);
    if (wanted !== null) {
      if (EDGE_KINDS.has(wanted)) kind = wanted as EdgeKind;
      else warning('bad_attribute', id, `edge '${id}' has unknown data-kind '${wanted}', kept as 'hallway'`);
    }
    const edge: GraphEdge = { a: a.id, b: b.id, kind };
    if (attrs['data-length'] != null) {
      const lengthM = number(attrs['data-length']);
      if (lengthM !== null && lengthM > 0) edge.lengthM = lengthM;
      else warning('bad_attribute', id, `edge '${id}' has a data-length '${attrs['data-length']}' that is not a positive number, dropped`);
    }
    if (flag(attrs['data-oneway'])) edge.oneWay = true;
    edges.push(edge);
  }


  const seenRooms = new Set<string>();
  for (const { tag, attrs } of all) {
    const svgId = attrs.id ?? '';
    if (!svgId.startsWith('r-') || (tag !== 'path' && tag !== 'rect' && tag !== 'polygon')) continue;
    const id = svgId.slice(2);
    if (id === '') {
      error('bad_attribute', svgId, `room '${svgId}' has nothing after the 'r-' prefix`);
      continue;
    }
    const outline = tag === 'path' ? pathPolygon(attrs.d ?? '') : tag === 'rect' ? rectPolygon(attrs) : pointsPolygon(attrs.points ?? '');
    if ('unsupported' in outline) {
      error('unsupported_path', svgId, `room '${id}': ${outline.unsupported}`);
      continue;
    }
    if (seenRooms.has(id)) {
      error('duplicate_id', svgId, `room '${id}' is drawn twice`);
      continue;
    }
    seenRooms.add(id);


    let nodeId = text(attrs['data-node']);
    if (nodeId !== null && !seenNodes.has(nodeId)) {
      error('unknown_node_ref', svgId, `room '${id}' names data-node '${nodeId}', which is not a node on this level`);
      nodeId = null;
    }
    if (nodeId === null) {
      const picked = roomNode(nodes, outline.polygon);
      if (!picked) error('room_without_node', svgId, `room '${id}' has no node on this level to end a route at`);
      nodeId = picked?.id ?? '';
    }


    const room: Room = { id, name: text(attrs['data-name']) ?? id, level: options.levelId, nodeId, polygon: outline.polygon };
    const nameKey = text(attrs['data-name-key']);
    const category = text(attrs['data-category']);
    if (nameKey !== null) room.nameKey = nameKey;
    if (category !== null) room.category = category;
    rooms.push(room);
  }


  const level: Level = {
    id: options.levelId,
    label: options.label,
    plan: options.plan ?? null,
    viewBox: viewBoxOf(svg, nodes, rooms, (message) => warning('missing_viewbox', options.levelId, message)),
    metersPerPixel: options.metersPerPixel,
    ordinal: options.ordinal,
  };
  return { level, nodes, edges, rooms, issues };
}


// The node within `snap` pixels of a point, nearest first; a
// strict comparison keeps the first drawn of two equidistant
const nearestNode = (nodes: GraphNode[], x: number, y: number, snap: number): GraphNode | null => {
  let best: GraphNode | null = null;
  let bestD = snap * snap;
  for (const node of nodes) {
    const d = (node.x - x) ** 2 + (node.y - y) ** 2;
    if (d <= bestD && (best === null || d < bestD)) {
      best = node;
      bestD = d;
    }
  }
  return best;
};


// The <svg viewBox>, else [0 0 width height], else the box
// around every parsed coordinate (and a word about it)
const viewBoxOf = (svg: string, nodes: GraphNode[], rooms: Room[], missing: (message: string) => void): Level['viewBox'] => {
  const root = /<svg\b([^>]*)>/i.exec(svg);
  const attrs = root ? attributes(root[1]) : {};
  const parts = (attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) return [parts[0], parts[1], parts[2], parts[3]];


  const width = number(attrs.width);
  const height = number(attrs.height);
  if (width !== null && height !== null) return [0, 0, width, height];


  const xs: number[] = [];
  const ys: number[] = [];
  for (const node of nodes) {
    xs.push(node.x);
    ys.push(node.y);
  }
  for (const room of rooms) {
    for (const [x, y] of room.polygon ?? []) {
      xs.push(x);
      ys.push(y);
    }
  }
  missing('the <svg> has no viewBox and no width/height; the level\'s viewBox is the box around the parsed shapes');
  if (xs.length === 0) return [0, 0, 0, 0];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY];
};







// -----------------------------------------------------------
// pathPolygon / rectPolygon / pointsPolygon
// -----------------------------------------------------------
//
// A room outline as a list of vertices. The path walker
// takes M/L/H/V in absolute and relative form, implicit
// line-to pairs after a move, and one Z; the closing vertex
// is dropped when it repeats the first. Anything else — a
// curve, an arc, a second subpath, a stray number — is
// answered as { unsupported } with the reason, because a
// room outline the tool guessed at is worse than a missing
// one.
//
// Used by:
//   - svgToGraph (above)
// -----------------------------------------------------------

type Outline = { polygon: [number, number][] } | { unsupported: string };

function pathPolygon(d: string): Outline {

  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  if (tokens.length === 0) return { unsupported: 'the path has no d attribute' };
  const polygon: [number, number][] = [];
  let x = 0;
  let y = 0;
  let command = '';
  let closed = false;
  let i = 0;


  const next = (): number | null => {
    const token = tokens[i];
    if (token === undefined || /[A-Za-z]/.test(token)) return null;
    i++;
    return Number(token);
  };


  while (i < tokens.length) {
    const token = tokens[i];
    if (/[A-Za-z]/.test(token)) {
      command = token;
      i++;
      if (closed) return { unsupported: `drawing continues after Z with '${command}' — a room outline is one closed ring` };
      if (command === 'Z' || command === 'z') {
        closed = true;
        continue;
      }
      if (!'MmLlHhVv'.includes(command)) return { unsupported: `path command '${command}' is not supported (only M, L, H, V and Z are)` };
      if (polygon.length === 0 && command !== 'M' && command !== 'm') return { unsupported: `the path starts with '${command}', not a move` };
      continue;
    }


    // A coordinate: read under the current command. Pairs after
    // an M continue as L (relative after a relative m), so a
    // "M 0 0 10 0 10 10 Z" outline reads the way an editor wrote it
    if (command === '') return { unsupported: 'the path starts with a number, not a command' };
    const relative = command === command.toLowerCase();
    if (command === 'H' || command === 'h') {
      const v = next();
      if (v === null) return { unsupported: 'a horizontal line is missing its x' };
      x = relative ? x + v : v;
    } else if (command === 'V' || command === 'v') {
      const v = next();
      if (v === null) return { unsupported: 'a vertical line is missing its y' };
      y = relative ? y + v : v;
    } else {
      const px = next();
      const py = next();
      if (px === null || py === null) return { unsupported: 'a coordinate pair is missing its second number' };
      x = relative ? x + px : px;
      y = relative ? y + py : py;
      if (command === 'M') command = 'L';
      else if (command === 'm') command = 'l';
    }
    polygon.push([x, y]);
  }


  return finishPolygon(polygon);
}


function rectPolygon(attrs: Attributes): Outline {
  const x = number(attrs.x) ?? 0;
  const y = number(attrs.y) ?? 0;
  const width = number(attrs.width);
  const height = number(attrs.height);
  if (width === null || height === null) return { unsupported: 'the rect has no numeric width/height' };
  return finishPolygon([[x, y], [x + width, y], [x + width, y + height], [x, y + height]]);
}


function pointsPolygon(points: string): Outline {
  const values = points.trim() === '' ? [] : points.trim().split(/[\s,]+/).map(Number);
  if (values.length % 2 !== 0 || values.some((v) => !Number.isFinite(v))) return { unsupported: 'the polygon points are not a list of numeric x,y pairs' };
  const polygon: [number, number][] = [];
  for (let i = 0; i < values.length; i += 2) polygon.push([values[i], values[i + 1]]);
  return finishPolygon(polygon);
}


// Three distinct vertices make an outline; a closing vertex
// repeating the first is the drawn Z and goes
const finishPolygon = (polygon: [number, number][]): Outline => {
  const first = polygon[0];
  const last = polygon[polygon.length - 1];
  if (polygon.length > 1 && first[0] === last[0] && first[1] === last[1]) polygon.pop();
  if (polygon.length < 3) return { unsupported: `the outline has ${polygon.length} vertices, a room needs three` };
  return { polygon };
};







// -----------------------------------------------------------
// roomNode
// -----------------------------------------------------------
//
// The node a route to this room should end at, when the
// author did not say: a node inside the outline (a room node,
// or a door node drawn on the wall — the boundary counts as
// inside) beats every node outside, the nearest to the
// outline's centre among several; outside, the nearest to
// the boundary wins. Null only when the level has no nodes.
//
// Used by:
//   - svgToGraph (above)
// -----------------------------------------------------------

function roomNode(nodes: GraphNode[], polygon: [number, number][]): GraphNode | null {

  if (nodes.length === 0) return null;
  // The vertex mean is centre enough to rank nodes that are
  // already inside
  const cx = polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length;
  const cy = polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length;


  let best: GraphNode | null = null;
  let bestInside = false;
  let bestScore = Infinity;
  for (const node of nodes) {
    const boundary = distanceToOutline(node.x, node.y, polygon);
    const inside = boundary < 1e-9 || containsPoint(node.x, node.y, polygon);
    const score = inside ? Math.hypot(node.x - cx, node.y - cy) : boundary;
    if (inside && !bestInside) {
      best = node;
      bestInside = true;
      bestScore = score;
    } else if (inside === bestInside && score < bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}


// Ray casting: a horizontal ray to the right crosses the
// outline an odd number of times from inside
const containsPoint = (x: number, y: number, polygon: [number, number][]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
};


// The shortest distance from a point to any side of the outline
const distanceToOutline = (x: number, y: number, polygon: [number, number][]): number => {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j];
    const [bx, by] = polygon[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    // The nearest point along the side, clamped to its ends
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
};







// -----------------------------------------------------------
// mergeLevels
// -----------------------------------------------------------
//
//   const { graph, issues } = mergeLevels([l1, l2], {
//     building: 'faculty',
//     entranceNodeId: 'n-entrance',
//     connectors: [{ a: 'n-st1', b: 'n-st2', kind: 'stairs', lengthM: 8 }],
//   })
//
// The parts' shapes concatenated in the order given, the
// connectors as cross-level edges, and every issue in one
// list: each part's own, a connector whose length is not a
// positive number ('bad_attribute'), then validateGraph's over
// the whole — a connector naming a node that is not there
// shows up as its 'dangling_edge'. A build script fails on any
// 'error' severity and prints the rest.
//
// Used by:
//   - src/index.ts — public surface (a host's build script)
// -----------------------------------------------------------

export interface LevelConnector {
  a: string;
  b: string;
  kind: 'stairs' | 'elevator' | 'ramp';
  lengthM: number;
}

export interface MergeLevelsOptions {
  building: string;
  entranceNodeId?: string | null;
  connectors: LevelConnector[];
}

export interface MergeLevelsResult {
  graph: BuildingGraph;
  issues: SvgToGraphIssue[];
}

export function mergeLevels(parts: SvgToGraphResult[], options: MergeLevelsOptions): MergeLevelsResult {

  const issues: SvgToGraphIssue[] = parts.flatMap((part) => part.issues);
  const edges: GraphEdge[] = parts.flatMap((part) => part.edges);
  for (const { a, b, kind, lengthM } of options.connectors) {
    const ref = `${a}-${b}`;
    if (!(Number.isFinite(lengthM) && lengthM > 0)) {
      issues.push({ severity: 'error', code: 'bad_attribute', message: `connector ${ref} needs a positive lengthM, got ${lengthM}`, ref });
    }
    edges.push({ a, b, kind, lengthM });
  }


  const graph: BuildingGraph = {
    version: 1,
    building: options.building,
    levels: parts.map((part) => part.level),
    nodes: parts.flatMap((part) => part.nodes),
    edges,
    rooms: parts.flatMap((part) => part.rooms),
    entranceNodeId: options.entranceNodeId ?? null,
  };
  issues.push(...validateGraph(graph));
  return { graph, issues };
}
