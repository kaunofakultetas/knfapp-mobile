// -----------------------------------------------------------
//  [*] wayfinduikit — FloorPlan
//
//  The pinch-zoom floor plan. The host's drawing (an SVG
//  string, a raster) and the kit's overlay — rooms, the route,
//  the pins, the walker's dot, the corridor nodes — travel
//  inside ONE transformed layer, so whatever a finger does to
//  the plan happens to everything drawn on it. The level's
//  viewBox is the coordinate system for all of it: the overlay
//  is an Svg carrying that viewBox, stretched over the drawing,
//  so route points and room polygons need no conversion and
//  the host never learns the screen size. The drawing is sized
//  to fit the viewport's width at scale 1 and the viewport
//  takes the plan's aspect ratio unless the host's style says
//  otherwise; the host's drawing should fill its box.
//
//  The camera is three numbers — a scale about the drawing's
//  centre and a translation — held in a ref and mirrored into
//  Animated values: a gesture writes them directly (no render
//  per frame over a plan full of paths), the focus prop
//  animates them. One PanResponder reads the finger count on
//  every move: one finger pans, two fingers pinch about their
//  midpoint (the plan point under the fingers stays under
//  them) and pan with it. A stretch of gesture re-bases
//  whenever the count changes, so lifting one finger of a
//  pinch carries on as a pan without a jump. Scale is clamped
//  to [minScale, maxScale]; the translation is clamped so the
//  drawing never leaves the viewport — an axis larger than the
//  viewport may not open a gap at its edge, one smaller may not
//  be pushed out of it.
//
//  Taps belong to the shapes: the viewport claims the
//  responder only on movement past a small slop, or the moment
//  a second finger lands — so a tap on a room lands and a drag
//  starting on a room still scrolls. Focus zooms to at least
//  FOCUS_SCALE, because centring a point on a drawing that
//  already fits the viewport would move nothing at all.
//
//  Editing hosts get three more intents, all in PLAN pixels so
//  an editor never learns the screen: a tap on the drawing
//  that no shape took (onPressPlan — "add a node here"; a
//  gesture that ever held two fingers is never a tap, however
//  it ends), and the drag of the SELECTED node (onDragNode per
//  move, onDragNodeEnd with the last point when the drag ends
//  ANY way — a release, a second finger landing, a responder
//  terminate, a level switch — so a host's bookkeeping always
//  closes). A drag that begins within the node's hit radius
//  moves the node instead of the camera, and the grab zone
//  follows the zoom — the disc the overlay draws is the disc a
//  finger can grab; every other node stays a tap target and
//  the plan still pans. The selected node is drawn in the
//  brand ink.
//
//  Points carry their floor: a start, end, youAreHere or focus
//  point may name a level, and one naming a level other than
//  the shown one is neither drawn nor glided to — so a host may
//  hand the plan the walker's position and the route's ends
//  unfiltered while the floors change under them. A point
//  without a level is taken as on the shown level. A new level
//  starts at rest and drops any gesture in progress, so a
//  finger still down re-bases from rest on its next move; the
//  focus glide runs once the viewport is measured and again
//  when the focus or the level changes, never on a later
//  resize — a resize only re-clamps the camera where it stands.
//
//  To a screen reader the host's drawing is ONE image element
//  named per level (renamed while a route is drawn); the
//  viewport itself is not an element, so the overlay's rooms,
//  nodes, route and walker's dot stay reachable beside it.
//
//  Split into (root component last):
//
//    routePath        — segment points → one SVG path string
//    clampScale / clampTranslation — the camera bounds, pure
//    fitToWidth       — the drawing's size at scale 1
//    centreOn         — the translation that centres a plan point
//    onShownLevel     — a point as far as the shown level is concerned
//    readFingers      — a touch event as the camera sees it
//    toPlan           — a viewport point as a plan point
//    Overlay          — the one Svg drawn over the host's plan
//    FloorPlan        — the viewport (default export)
// -----------------------------------------------------------

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, PanResponderGestureState, PanResponderInstance, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Polygon } from 'react-native-svg';

import type { KitLevel, KitRouteSegment } from '../core/types';
import { useKitLabels, useKitTheme } from '../provider';


// A point in plan units; the level it lies on, when named,
// decides whether the shown floor draws it at all
export interface PlanPoint {
  x: number;
  y: number;
  level?: string | null;
}

// A tappable corridor point; the label is what a screen
// reader hears for it (the id otherwise)
export interface PlanNode {
  id: string;
  x: number;
  y: number;
  label?: string | null;
}

export interface PlanRoom {
  id: string;
  polygon: [number, number][];
  label?: string | null;
}

interface Size {
  width: number;
  height: number;
}

// How far the drawing is scaled about its own centre and
// pushed from its at-rest place, in viewport pixels
interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

// One stretch of a gesture with a fixed finger count: the
// camera, the gesture deltas and the finger geometry at the
// moment the count settled, which every move in the stretch is
// measured against
interface Phase {
  touches: number;
  camera: Camera;
  dx: number;
  dy: number;
  mid: PlanPoint;
  dist: number;
  // 'node': the selected node rides the finger instead of the camera
  mode: 'pan' | 'node';
  nodeId: string | null;
  last: PlanPoint;
  at: number;
}

interface Fingers {
  count: number;
  mid: PlanPoint;
  dist: number;
}


const AT_REST: Camera = { scale: 1, tx: 0, ty: 0 };

// Movement past this many pixels turns a touch that landed on
// a room into a drag — a tap may jitter this much and stay a tap
const TAP_SLOP = 6;

const FOCUS_SCALE = 2;
const FOCUS_MS = 320;

// A press and release within this, without movement, is a tap
const TAP_MS = 350;

// Marker weights in SCREEN pixels at scale 1 — the overlay
// converts them to plan units, so a drawing of any resolution
// shows the same weight of line
const ROUTE_PX = 3.5;
const GLOW_PX = 11;
const DOT_PX = 6;
const RING_PX = 3;
const HALO_PX = 16;
const NODE_PX = 4.5;
const NODE_HIT_PX = 14;
const PIN_PX = 8;







// -----------------------------------------------------------
// routePath
// -----------------------------------------------------------
//
// The segment's points as one polyline command string, in plan
// units — nothing is scaled here because the overlay's viewBox
// IS the plan. Fewer than two points draw nothing (a route
// that only touches this level at a connector has no line to
// show), and a segment belonging to another level answers the
// same, so a host may hand the plan whatever segment it holds.
//
// Used by:
//   - FloorPlan (below) — decides the viewport's label too
//   - tests pinning the command format
// -----------------------------------------------------------

export function routePath(route: KitRouteSegment | null | undefined, levelId: string): string {
  if (!route || route.level !== levelId || route.points.length < 2) return '';
  return route.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}







// -----------------------------------------------------------
// clampScale / clampTranslation
// -----------------------------------------------------------
//
// The drawing scales about its centre, so on one axis its near
// edge sits at (1 − s)·len/2 + t. The bound is applied to that
// edge — an axis wider than the viewport keeps the edge past
// the viewport's, one narrower keeps it inside — and handed
// back as a translation. A scale that is not a number (a
// pinch whose start distance vanished) answers the minimum
// rather than poisoning the camera; an infinite one simply
// clamps.
//
// Used by:
//   - FloorPlan (below) — every camera write goes through them
//   - centreOn (below)
//   - tests pinning the bounds
// -----------------------------------------------------------

export function clampScale(scale: number, minScale: number, maxScale: number): number {
  if (Number.isNaN(scale)) return minScale;
  return Math.min(maxScale, Math.max(minScale, scale));
}


const clampAxis = (t: number, scale: number, frameLen: number, contentLen: number): number => {
  const scaled = contentLen * scale;
  const shift = ((1 - scale) * contentLen) / 2;
  const [lo, hi] = scaled >= frameLen ? [frameLen - scaled, 0] : [0, frameLen - scaled];
  return Math.min(hi, Math.max(lo, shift + t)) - shift;
};


export function clampTranslation(tx: number, ty: number, scale: number, frame: Size, content: Size): PlanPoint {
  return {
    x: clampAxis(tx, scale, frame.width, content.width),
    y: clampAxis(ty, scale, frame.height, content.height),
  };
}







// -----------------------------------------------------------
// fitToWidth
// -----------------------------------------------------------
//
// The drawing's box at scale 1: the viewport's width, and the
// height the viewBox's aspect demands. A degenerate viewBox or
// an unmeasured viewport answers an empty box, which the
// viewport reads as "not ready" and draws nothing into.
//
// Used by:
//   - FloorPlan (below)
// -----------------------------------------------------------

function fitToWidth(level: KitLevel, frameWidth: number): Size {
  const [, , vbW, vbH] = level.viewBox;
  if (!(vbW > 0) || !(vbH > 0) || !(frameWidth > 0)) return { width: 0, height: 0 };
  return { width: frameWidth, height: (frameWidth * vbH) / vbW };
}







// -----------------------------------------------------------
// centreOn
// -----------------------------------------------------------
//
// The translation that puts a plan point at the viewport's
// middle at the given scale — screen = centre + s·(p − centre)
// + t, solved for t — then clamped, so a point near the edge
// of the drawing lands as close to the middle as the bounds
// allow.
//
// Used by:
//   - FloorPlan (below) — the focus effect
// -----------------------------------------------------------

function centreOn(point: PlanPoint, level: KitLevel, scale: number, frame: Size, content: Size): PlanPoint {
  const [minX, minY, vbW] = level.viewBox;
  const perUnit = content.width / vbW;
  const px = (point.x - minX) * perUnit;
  const py = (point.y - minY) * perUnit;
  const cx = content.width / 2;
  const cy = content.height / 2;


  return clampTranslation(frame.width / 2 - cx - scale * (px - cx), frame.height / 2 - cy - scale * (py - cy), scale, frame, content);
}







// -----------------------------------------------------------
// onShownLevel
// -----------------------------------------------------------
//
// The point if the shown level may use it, else null: a point
// naming another level belongs to a drawing that is not on
// screen, one naming none is trusted to be on this one. The
// same shape the engine twins carry for the route's ends and
// the walker's position, so a host hands those over as they
// are and the floors sort themselves out.
//
// Used by:
//   - FloorPlan (below) — every point prop passes through it
//   - tests pinning the rule
// -----------------------------------------------------------

export function onShownLevel(point: PlanPoint | null | undefined, levelId: string): PlanPoint | null {
  if (!point) return null;
  return point.level == null || point.level === levelId ? point : null;
}







// -----------------------------------------------------------
// readFingers
// -----------------------------------------------------------
//
// The touches as the camera sees them: how many, their
// midpoint in viewport space (page coordinates less the
// viewport's own origin) and the distance between the first
// two. Anything short of two listed touches is one finger —
// the gesture state's own count is not trusted for a pinch,
// because without the touch list there is no distance to
// pinch by — and its midpoint falls back to the gesture
// state's position on a platform event carrying no list.
//
// Used by:
//   - FloorPlan (below) — the grant and move handlers
// -----------------------------------------------------------

// -----------------------------------------------------------
// toPlan / toContent
// -----------------------------------------------------------
//
// A viewport point → the drawing's own pixels, through the
// camera: the content layer is translated by (tx, ty) and
// scaled about its centre, so the content point is the centre
// plus the offset divided by the scale; the plan point then
// scales the content box to the viewBox.
//
// Used by:
//   - FloorPlan (below) — onPressPlan and the node drag
// -----------------------------------------------------------

function toContent(view: PlanPoint, camera: Camera, content: Size): PlanPoint {
  const cx = content.width / 2;
  const cy = content.height / 2;
  return { x: cx + (view.x - cx - camera.tx) / camera.scale, y: cy + (view.y - cy - camera.ty) / camera.scale };
}

function toPlan(view: PlanPoint, camera: Camera, content: Size, level: KitLevel): PlanPoint {
  const [minX, minY, vbW, vbH] = level.viewBox;
  const point = toContent(view, camera, content);
  return { x: minX + (point.x * vbW) / Math.max(1, content.width), y: minY + (point.y * vbH) / Math.max(1, content.height) };
}

function fromPlan(point: PlanPoint, content: Size, level: KitLevel): PlanPoint {
  const [minX, minY, vbW, vbH] = level.viewBox;
  return { x: ((point.x - minX) * content.width) / Math.max(1, vbW), y: ((point.y - minY) * content.height) / Math.max(1, vbH) };
}







function readFingers(evt: GestureResponderEvent, g: PanResponderGestureState, origin: PlanPoint): Fingers {
  const touches = evt.nativeEvent?.touches ?? [];


  if (touches.length >= 2) {
    const [a, b] = touches;
    return {
      count: 2,
      mid: { x: (a.pageX + b.pageX) / 2 - origin.x, y: (a.pageY + b.pageY) / 2 - origin.y },
      dist: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)),
    };
  }


  const t = touches[0];
  return {
    count: 1,
    mid: t ? { x: t.pageX - origin.x, y: t.pageY - origin.y } : { x: g.moveX - origin.x, y: g.moveY - origin.y },
    dist: 0,
  };
}







// -----------------------------------------------------------
// Overlay
// -----------------------------------------------------------
//
// Everything the kit draws over the host's plan, bottom to
// top: room polygons (a faint brand wash, tappable), the route
// as a glow under a line, the corridor nodes, the start ring,
// the destination pin and the walker's dot — a brand disc in a
// white ring over a soft halo, so it reads on a busy drawing.
// Node markers carry a transparent hit disc well beyond the
// visible dot: a fill that paints nothing still catches the
// finger. Tappable shapes carry a name (the label, else the
// id) but no role — the drawing layer accepts only a label and
// the accessible flag. Weights are given in screen pixels and
// turned into plan units by `u`, plan units per pixel at
// scale 1.
//
// Used by:
//   - FloorPlan (below)
// -----------------------------------------------------------

function Overlay({
  level,
  content,
  d,
  start,
  end,
  youAreHere,
  nodes,
  rooms,
  selectedNodeId,
  onPressNode,
  onPressRoom,
}: {
  level: KitLevel;
  content: Size;
  d: string;
  start: PlanPoint | null;
  end: PlanPoint | null;
  youAreHere: PlanPoint | null;
  nodes: readonly PlanNode[];
  rooms: readonly PlanRoom[];
  selectedNodeId?: string | null;
  onPressNode?: (id: string) => void;
  onPressRoom?: (id: string) => void;
}) {

  const { colors } = useKitTheme();
  const labels = useKitLabels();
  const [minX, minY, vbW, vbH] = level.viewBox;
  const u = vbW / content.width;


  // A teardrop with its tip on the point: two curves rising
  // from the tip to a half circle of radius r
  const pinPath = ({ x, y }: PlanPoint, r: number): string => {
    const cy = y - 2.2 * r;
    return (
      `M${x} ${y} C${x - 0.55 * r} ${y - 1.1 * r} ${x - r} ${cy + 0.5 * r} ${x - r} ${cy} ` +
      `A${r} ${r} 0 1 1 ${x + r} ${cy} C${x + r} ${cy + 0.5 * r} ${x + 0.55 * r} ${y - 1.1 * r} ${x} ${y} Z`
    );
  };


  return (
    <Svg width={content.width} height={content.height} viewBox={`${minX} ${minY} ${vbW} ${vbH}`} style={StyleSheet.absoluteFill}>

      {rooms.map((room) => (
        <Polygon
          key={room.id}
          testID={`wayfinduikit-plan-room-${room.id}`}
          points={room.polygon.map(([x, y]) => `${x},${y}`).join(' ')}
          fill={colors.brand}
          fillOpacity={0.08}
          stroke={colors.brand}
          strokeOpacity={0.35}
          strokeWidth={u}
          onPress={onPressRoom ? () => onPressRoom(room.id) : undefined}
          accessible
          accessibilityLabel={room.label ?? room.id}
        />
      ))}

      {d ? (
        <G accessibilityLabel={labels.routeOnPlanA11y(level.label)}>
          <Path testID="wayfinduikit-plan-route-glow" d={d} stroke={colors.routeGlow} strokeWidth={GLOW_PX * u} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path testID="wayfinduikit-plan-route" d={d} stroke={colors.route} strokeWidth={ROUTE_PX * u} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </G>
      ) : null}

      {nodes.map((node) => (
        <G
          key={node.id}
          testID={`wayfinduikit-plan-node-${node.id}`}
          onPress={onPressNode ? () => onPressNode(node.id) : undefined}
          accessible
          accessibilityLabel={node.label ?? node.id}
        >
          <Circle cx={node.x} cy={node.y} r={NODE_HIT_PX * u} fill="transparent" />
          <Circle
            testID={node.id === selectedNodeId ? 'wayfinduikit-plan-node-selected' : undefined}
            cx={node.x}
            cy={node.y}
            r={(node.id === selectedNodeId ? NODE_PX * 1.6 : NODE_PX) * u}
            fill={node.id === selectedNodeId ? colors.brand : colors.surface}
            stroke={node.id === selectedNodeId ? colors.surface : colors.planInk}
            strokeWidth={1.5 * u}
          />
        </G>
      ))}

      {start ? (
        <Circle testID="wayfinduikit-plan-start" cx={start.x} cy={start.y} r={DOT_PX * u} fill={colors.surface} stroke={colors.route} strokeWidth={RING_PX * u} />
      ) : null}

      {end ? (
        <G testID="wayfinduikit-plan-end">
          <Path d={pinPath(end, PIN_PX * u)} fill={colors.route} stroke={colors.surface} strokeWidth={1.5 * u} strokeLinejoin="round" />
          <Circle cx={end.x} cy={end.y - 2.2 * PIN_PX * u} r={0.38 * PIN_PX * u} fill={colors.surface} />
        </G>
      ) : null}

      {youAreHere ? (
        <G testID="wayfinduikit-plan-here" accessible accessibilityLabel={labels.youAreHereA11y()}>
          <Circle cx={youAreHere.x} cy={youAreHere.y} r={HALO_PX * u} fill={colors.brand} fillOpacity={0.18} />
          <Circle cx={youAreHere.x} cy={youAreHere.y} r={(DOT_PX + RING_PX) * u} fill={colors.surface} />
          <Circle cx={youAreHere.x} cy={youAreHere.y} r={DOT_PX * u} fill={colors.brand} />
        </G>
      ) : null}
    </Svg>
  );
}







// -----------------------------------------------------------
// FloorPlan (default export)
// -----------------------------------------------------------
//
//   <FloorPlan level={level} plan={<SvgXml xml={xml} width="100%" height="100%" />}
//              route={segmentForLevel} start={start} end={end}
//              youAreHere={position} nodes={nodes} rooms={rooms}
//              onPressRoom={(id) => pick(id)} focus={target} />
//
// The drawing's label switches to routeOnPlanA11y while a
// route is drawn, so a screen reader learns there is a route
// on this floor without touching the overlay.
//
// Used by:
//   - the host app's wayfinding screen, beside FloorSwitcher
//     and under the route sheet
// -----------------------------------------------------------

export default function FloorPlan({
  level,
  plan,
  route = null,
  start = null,
  end = null,
  youAreHere = null,
  nodes = [],
  rooms = [],
  onPressNode,
  onPressRoom,
  selectedNodeId = null,
  onPressPlan,
  onDragNode,
  onDragNodeEnd,
  focus = null,
  minScale = 1,
  maxScale = 4,
  style,
}: {
  level: KitLevel;
  plan?: ReactNode;
  route?: KitRouteSegment | null;
  start?: PlanPoint | null;
  end?: PlanPoint | null;
  youAreHere?: PlanPoint | null;
  nodes?: readonly PlanNode[];
  rooms?: readonly PlanRoom[];
  onPressNode?: (id: string) => void;
  onPressRoom?: (id: string) => void;
  // Editing: the node drawn selected and, when onDragNode is
  // given, the one a drag moves
  selectedNodeId?: string | null;
  // A tap on the drawing no shape took, in plan pixels
  onPressPlan?: (point: PlanPoint) => void;
  onDragNode?: (id: string, point: PlanPoint) => void;
  onDragNodeEnd?: (id: string, point: PlanPoint) => void;
  focus?: PlanPoint | null;
  minScale?: number;
  maxScale?: number;
  style?: StyleProp<ViewStyle>;
}) {

  const { colors, radii } = useKitTheme();
  const labels = useKitLabels();
  const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
  const content = fitToWidth(level, frame.width);
  const ready = content.width > 0 && frame.height > 0;
  const d = routePath(route, level.id);
  const shownStart = onShownLevel(start, level.id);
  const shownEnd = onShownLevel(end, level.id);
  const shownHere = onShownLevel(youAreHere, level.id);
  const shownFocus = onShownLevel(focus, level.id);


  // The camera lives in a ref beside the two Animated values it
  // drives; the handlers are created once, so every render-bound
  // fact they need travels through a ref as well
  const camRef = useRef<Camera>({ ...AT_REST });
  const pan = useRef(new Animated.ValueXY()).current;
  const zoom = useRef(new Animated.Value(1)).current;
  const phaseRef = useRef<Phase | null>(null);
  const originRef = useRef<PlanPoint>({ x: 0, y: 0 });
  const viewRef = useRef<View>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const geomRef = useRef({ frame, content, minScale, maxScale });
  geomRef.current = { frame, content, minScale, maxScale };
  const editRef = useRef({ selectedNodeId, nodes, onPressPlan, onDragNode, onDragNodeEnd });
  editRef.current = { selectedNodeId, nodes, onPressPlan, onDragNode, onDragNodeEnd };


  // Whether this gesture EVER held two fingers: a symmetric
  // pinch released one finger at a time keeps the centroid
  // still and re-bases into a fresh one-finger phase, so the
  // release would otherwise read as a bare tap at whichever
  // finger left last. Only a fresh grant clears the memory
  const pinchedRef = useRef(false);

  // The plan point under a viewport point, with the camera as
  // it stands — the tap, the node drag and every torn-off drag
  // closing below convert through it
  const planAt = useCallback((view: PlanPoint): PlanPoint => toPlan(view, camRef.current, geomRef.current.content, levelRef.current), []);

  // A node-mode phase that ends any way but a clean release —
  // a second finger landing, a responder terminate, a level
  // switch — still closes through onDragNodeEnd with its last
  // point, so a host's gesture bookkeeping (an open undo step)
  // is never left hanging on a drag that never releases
  const endNodePhase = useCallback(
    (phase: Phase | null) => {
      if (phase && phase.mode === 'node' && phase.nodeId) editRef.current.onDragNodeEnd?.(phase.nodeId, planAt(phase.last));
    },
    [planAt],
  );


  // The one door to the camera: bounds applied, ref and values
  // written together so a gesture and a focus never disagree
  const setCamera = useCallback(
    (next: Camera) => {
      const geom = geomRef.current;
      const scale = clampScale(next.scale, geom.minScale, geom.maxScale);
      const t = clampTranslation(next.tx, next.ty, scale, geom.frame, geom.content);
      camRef.current = { scale, tx: t.x, ty: t.y };
      pan.setValue(t);
      zoom.setValue(scale);
    },
    [pan, zoom],
  );


  // Where the viewport sits on screen, so page-space touches
  // become viewport-space; measured on layout and again at
  // every grant, because a scrolled parent moves it between
  // gestures. Asynchronous — a first move a frame early uses
  // the previous answer, which is the same viewport
  const measure = useCallback(() => {
    viewRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  }, []);


  const responderRef = useRef<PanResponderInstance | null>(null);
  if (!responderRef.current) {
    const wantsMove = (evt: GestureResponderEvent, g: PanResponderGestureState) =>
      (evt.nativeEvent?.touches?.length ?? 0) >= 2 || Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP;

    const beginPhase = (evt: GestureResponderEvent, g: PanResponderGestureState): Phase => {
      const f = readFingers(evt, g, originRef.current);
      const at = typeof evt.nativeEvent?.timestamp === 'number' ? evt.nativeEvent.timestamp : Date.now();
      return { touches: f.count, camera: { ...camRef.current }, dx: g.dx, dy: g.dy, mid: f.mid, dist: f.dist, mode: 'pan', nodeId: null, last: f.mid, at };
    };

    // A one-finger gesture that began on the selected node moves
    // it. The grab zone follows the zoom — the overlay draws the
    // hit disc at NODE_HIT_PX·scale screen px, so the disc a
    // finger sees is the disc it can grab — with a floor of
    // NODE_HIT_PX + TAP_SLOP screen px, so a tiny node on a
    // zoomed-out plan is still easy to catch
    const grabbedNode = (phase: Phase): string | null => {
      const edit = editRef.current;
      if (phase.touches !== 1 || !edit.selectedNodeId || !edit.onDragNode) return null;
      const node = edit.nodes.find((n) => n.id === edit.selectedNodeId);
      if (!node) return null;
      const { content } = geomRef.current;
      const here = toContent(phase.mid, camRef.current, content);
      const there = fromPlan(node, content, levelRef.current);
      const grip = Math.max(NODE_HIT_PX * camRef.current.scale, NODE_HIT_PX + TAP_SLOP);
      return Math.hypot(here.x - there.x, here.y - there.y) * camRef.current.scale <= grip ? node.id : null;
    };

    responderRef.current = PanResponder.create({
      // A touch on bare plan is ours at once; one on a room is
      // the room's until it moves — but a second finger is ours
      // wherever it lands
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: (evt) => (evt.nativeEvent?.touches?.length ?? 0) >= 2,
      onMoveShouldSetPanResponder: wantsMove,
      onMoveShouldSetPanResponderCapture: wantsMove,
      // A scrolling parent does not get the plan back mid-drag
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (evt, g) => {
        measure();
        // A focus animation still running yields to the finger,
        // and the camera takes the values where they stopped
        pan.stopAnimation((v) => {
          camRef.current = { ...camRef.current, tx: v.x, ty: v.y };
        });
        zoom.stopAnimation((s) => {
          camRef.current = { ...camRef.current, scale: s };
        });
        const phase = beginPhase(evt, g);
        pinchedRef.current = phase.touches >= 2;
        const grabbed = grabbedNode(phase);
        if (grabbed) {
          phase.mode = 'node';
          phase.nodeId = grabbed;
        }
        phaseRef.current = phase;
      },

      onPanResponderMove: (evt, g) => {
        const f = readFingers(evt, g, originRef.current);
        if (f.count >= 2) pinchedRef.current = true;
        let phase = phaseRef.current;
        if (!phase || phase.touches !== f.count) {
          // A second finger landing tears a node drag off — it
          // still closes before the phase re-bases into a pan
          endNodePhase(phase);
          phase = beginPhase(evt, g);
          phaseRef.current = phase;
        }
        phase.last = f.mid;


        if (phase.mode === 'node' && phase.nodeId) {
          editRef.current.onDragNode?.(phase.nodeId, planAt(f.mid));
          return;
        }
        const base = phase.camera;


        if (phase.touches >= 2 && phase.dist > 0) {
          const { content: box, minScale: lo, maxScale: hi } = geomRef.current;
          const scale = clampScale(base.scale * (f.dist / phase.dist), lo, hi);
          // The drawing point that sat under the first midpoint,
          // relative to the drawing's centre — kept under the
          // current midpoint at the new scale
          const cx = box.width / 2;
          const cy = box.height / 2;
          const ax = (phase.mid.x - cx - base.tx) / base.scale;
          const ay = (phase.mid.y - cy - base.ty) / base.scale;
          setCamera({ scale, tx: f.mid.x - cx - scale * ax, ty: f.mid.y - cy - scale * ay });
          return;
        }


        setCamera({ scale: base.scale, tx: base.tx + (g.dx - phase.dx), ty: base.ty + (g.dy - phase.dy) });
      },

      onPanResponderRelease: (evt, g) => {
        const phase = phaseRef.current;
        phaseRef.current = null;
        if (!phase) return;
        if (phase.mode === 'node' && phase.nodeId) {
          editRef.current.onDragNodeEnd?.(phase.nodeId, planAt(phase.last));
          return;
        }
        // A tap: one finger — and never more at any point, so a
        // pinch shed one finger at a time cannot land as one —
        // no movement, released quickly. The shapes had their
        // chance first, so this is bare drawing
        const at = typeof evt.nativeEvent?.timestamp === 'number' ? evt.nativeEvent.timestamp : Date.now();
        if (phase.touches === 1 && !pinchedRef.current && Math.abs(g.dx) <= TAP_SLOP && Math.abs(g.dy) <= TAP_SLOP && at - phase.at <= TAP_MS) {
          editRef.current.onPressPlan?.(planAt(phase.mid));
        }
      },
      onPanResponderTerminate: () => {
        const phase = phaseRef.current;
        phaseRef.current = null;
        // The system taking the responder is not a clean
        // release, but a node drag still closes
        endNodePhase(phase);
      },
    });
  }


  // A new drawing starts at rest — the old floor's zoom means
  // nothing on it, and neither does a gesture begun on it: a
  // finger still down re-bases from rest on its next move. A
  // node drag the switch cuts short closes first, before the
  // camera it converted through is reset
  useEffect(() => {
    const phase = phaseRef.current;
    phaseRef.current = null;
    endNodePhase(phase);
    setCamera({ ...AT_REST });
  }, [level.id, setCamera, endNodePhase]);


  // The viewport changing size (rotation, a sheet resizing it)
  // re-clamps the camera where it stands
  useEffect(() => {
    setCamera({ ...camRef.current });
  }, [frame.width, frame.height, setCamera]);


  // Focus glides the point to the middle; the ref takes the
  // destination at once, so a gesture landing mid-flight (which
  // stops the animation and reads the live values) and a
  // completed flight agree on where the camera is. Keyed on
  // readiness rather than the frame's size, so the first
  // measurement starts the glide and a later resize does not
  // replay it over a camera the user has moved
  const focusX = shownFocus?.x;
  const focusY = shownFocus?.y;
  useEffect(() => {
    if (focusX == null || focusY == null) return;
    const geom = geomRef.current;
    if (!(geom.content.width > 0 && geom.frame.height > 0)) return;


    const scale = clampScale(Math.max(camRef.current.scale, FOCUS_SCALE), geom.minScale, geom.maxScale);
    const t = centreOn({ x: focusX, y: focusY }, levelRef.current, scale, geom.frame, geom.content);
    camRef.current = { scale, tx: t.x, ty: t.y };
    Animated.parallel([
      Animated.timing(pan, { toValue: t, duration: FOCUS_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(zoom, { toValue: scale, duration: FOCUS_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, [focusX, focusY, level.id, ready, pan, zoom]);


  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setFrame((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      measure();
    },
    [measure],
  );


  const [, , vbW, vbH] = level.viewBox;
  const aspectRatio = vbW > 0 && vbH > 0 ? vbW / vbH : undefined;


  return (
    <View
      ref={viewRef}
      testID="wayfinduikit-plan"
      onLayout={onLayout}
      style={[{ width: '100%', aspectRatio, overflow: 'hidden', borderRadius: radii.card, backgroundColor: colors.plan }, style]}
      {...responderRef.current.panHandlers}
    >
      {ready ? (
        <Animated.View
          testID="wayfinduikit-plan-content"
          style={{ width: content.width, height: content.height, transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }] }}
        >
          {/* The host's drawing never competes with the overlay
              for a finger — rooms and nodes sit above it — and
              it is the one image element a screen reader hears:
              named here, not on the viewport, which would swallow
              the overlay's rooms and nodes into itself */}
          <View
            testID="wayfinduikit-plan-drawing"
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            accessible
            accessibilityRole="image"
            accessibilityLabel={d ? labels.routeOnPlanA11y(level.label) : labels.planA11y(level.label)}
          >
            {plan}
          </View>
          <Overlay
            level={level}
            content={content}
            d={d}
            start={shownStart}
            end={shownEnd}
            youAreHere={shownHere}
            nodes={nodes}
            rooms={rooms}
            selectedNodeId={selectedNodeId}
            onPressNode={onPressNode}
            onPressRoom={onPressRoom}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
