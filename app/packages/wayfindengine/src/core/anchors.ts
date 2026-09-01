// -----------------------------------------------------------
//  [*] wayfindengine — anchors
//
//  Where the walker IS, from the outside world in: a QR code
//  posted on a wall, a tap on the plan, a room picked from
//  search. Each resolves to a node the router can start from
//  or the navigation can snap to.
//
//  QR payloads are tiny URIs under a host-chosen scheme:
//  '<scheme>node/<id>' and '<scheme>room/<id>'. Parsing is
//  strict on purpose — a scanner hands over whatever it sees,
//  and a payload under another scheme, an unknown kind, an
//  empty id or an id with whitespace inside is somebody
//  else's code, not a damaged one of ours. Ids keep their
//  case (node ids are host-defined); only the payload's ends
//  are trimmed, for scanner newlines. formatAnchor is the
//  exact inverse, so a printed code round-trips.
//
//  nearestNode is same-level only: plan space is per level,
//  so a distance across floors means nothing. nodeForRoom
//  answers null for a room whose node is missing from the
//  graph (validateGraph flags it) — a null here reads as "not
//  routable", never as a dangling id the router then chokes
//  on.
//
//  Used by:
//    - src/index.ts — public surface; the host's scanner
//      handler, plan-tap handler and room picker resolve
//      their intents through these (the UI kit only raises
//      the intents and imports nothing from the engine)
//    - src/testing/invariants.ts — every posted code must
//      round-trip and land on a node
// -----------------------------------------------------------

import type { GraphIndex } from './graph';
import type { GraphNode, NodeKind } from './types';


export type Anchor = { kind: 'node'; nodeId: string } | { kind: 'room'; roomId: string };


// The scheme the faculty's printed codes carry
const DEFAULT_SCHEME = 'knf://';







// -----------------------------------------------------------
// parseAnchor
// -----------------------------------------------------------
//
//   parseAnchor('knf://node/n12')        → { kind: 'node', nodeId: 'n12' }
//   parseAnchor(' knf://room/301\n')     → { kind: 'room', roomId: '301' }
//   parseAnchor('https://…')             → null
//   parseAnchor('vu://node/n1', 'vu://') → the scheme is the host's
//
// Used by:
//   - src/index.ts — public surface (the host's scanner
//     handler feeds raw payloads here)
// -----------------------------------------------------------

export function parseAnchor(payload: string, scheme: string = DEFAULT_SCHEME): Anchor | null {

  // A scanner boundary: whatever the platform hands over that
  // is not text is not a code
  if (typeof payload !== 'string' || scheme.length === 0) return null;
  const text = payload.trim();
  if (!text.startsWith(scheme)) return null;


  const body = text.slice(scheme.length);
  const slash = body.indexOf('/');
  if (slash < 0) return null;
  const kind = body.slice(0, slash);
  const id = body.slice(slash + 1);
  if (id.length === 0 || /\s/.test(id)) return null;


  if (kind === 'node') return { kind: 'node', nodeId: id };
  if (kind === 'room') return { kind: 'room', roomId: id };
  return null;
}







// -----------------------------------------------------------
// formatAnchor
// -----------------------------------------------------------
//
// The inverse of parseAnchor — what goes onto a printed code.
//
// Used by:
//   - src/index.ts — public surface (the host's code printer)
// -----------------------------------------------------------

export function formatAnchor(anchor: Anchor, scheme: string = DEFAULT_SCHEME): string {
  return anchor.kind === 'node' ? `${scheme}node/${anchor.nodeId}` : `${scheme}room/${anchor.roomId}`;
}







// -----------------------------------------------------------
// nearestNode
// -----------------------------------------------------------
//
// The closest node to a plan-space point on ONE level, by
// euclidean distance in pixels; `kinds` narrows the candidates
// (a tap should land on corridors and doors, never on a stair
// node's twin on another floor). An empty kinds list is no
// filter, not an impossible one. Null when the level holds no
// candidate.
//
// Used by:
//   - src/index.ts — public surface (plan taps, "start from
//     where I stand")
// -----------------------------------------------------------

export function nearestNode(
  index: GraphIndex,
  at: { level: string; x: number; y: number },
  options?: { kinds?: NodeKind[] },
): GraphNode | null {

  const kinds = options?.kinds && options.kinds.length > 0 ? new Set<NodeKind>(options.kinds) : null;
  let best: GraphNode | null = null;
  let bestD = Infinity;
  for (const node of index.nodes.values()) {
    if (node.level !== at.level) continue;
    if (kinds && !kinds.has(node.kind)) continue;
    // Squared distance: ordering is all that matters, and a
    // strict comparison keeps the first of two equidistant nodes
    const d = (node.x - at.x) ** 2 + (node.y - at.y) ** 2;
    if (d < bestD) {
      best = node;
      bestD = d;
    }
  }
  return best;
}







// -----------------------------------------------------------
// nodeForRoom
// -----------------------------------------------------------
//
// Used by:
//   - src/index.ts — public surface (a room pick becomes a
//     route endpoint)
// -----------------------------------------------------------

export function nodeForRoom(index: GraphIndex, roomId: string): string | null {
  const room = index.rooms.get(roomId);
  if (!room || !index.nodes.has(room.nodeId)) return null;
  return room.nodeId;
}
