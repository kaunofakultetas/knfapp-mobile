// -----------------------------------------------------------
//  [*] Tests — wayfinduikit FloorPlan / FloorSwitcher
//
//  The plan viewer's promises: the route path is the segment's
//  points verbatim in plan units (and nothing for another
//  level's segment), pins and the walker's dot appear only
//  when given and only on their own floor (a point naming no
//  level is on the shown one), room and node taps answer with
//  their ids, the host's drawing is the one named image
//  element and the viewport is none, the viewport carries a
//  full responder and a synthetic pinch / pan drives the
//  camera — anchored under the fingers, clamped to the scale
//  bounds and to the viewport's edges, dropped with the old
//  floor under a held finger — and focus glides the point to
//  the middle once measured and on a level change, never on a
//  resize. The editing intents: a tap that was ever a pinch is
//  no tap, the selected node's grab zone follows the zoom, and
//  a node drag ending ANY way — release, second finger,
//  terminate, level switch — closes through onDragNodeEnd.
//  Gestures are driven straight through the responder
//  handlers with hand-built touch histories, the way the
//  responder system itself would feed them. The switcher:
//  ordinal-descending pills, the current one selected,
//  route-disabled ones inert, taps reporting ids.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { KitLevel, KitRouteSegment } from '../../core/types';
import { WayfindUiKitProvider } from '../../provider';
import FloorPlan, { clampScale, clampTranslation, onShownLevel, routePath } from '../FloorPlan';
import FloorSwitcher from '../FloorSwitcher';


// A 400×200 drawing laid out in a 400×200 viewport: one plan
// unit is one pixel at scale 1, so every expected camera value
// below can be worked out by hand
const level: KitLevel = { id: 'l1', label: '1', viewBox: [0, 0, 400, 200], ordinal: 1 };
const FRAME = { width: 400, height: 200 };

const segment: KitRouteSegment = { level: 'l1', points: [[10, 20], [50, 20], [50, 80]] };

const wrap = (ui: ReactElement) => render(<WayfindUiKitProvider locale="en">{ui}</WayfindUiKitProvider>);

// A queried instance's props are a loose record, so the
// handler is narrowed at the call
type Instance = { props: Record<string, unknown> };
type Handler = (e: unknown) => unknown;

const layout = async (vp: Instance, frame = FRAME) => {
  await act(async () => {
    (vp.props.onLayout as Handler)({ nativeEvent: { layout: { x: 0, y: 0, ...frame } } });
  });
};

const mount = async (ui: ReactElement) => {
  const r = await wrap(ui);
  await layout(r.getByTestId('wayfinduikit-plan'));
  return r;
};

const transformOf = (r: { getByTestId: (id: string) => { props: { style?: unknown } } }) => {
  const flat = StyleSheet.flatten(r.getByTestId('wayfinduikit-plan-content').props.style) as { transform: Record<string, number>[] };
  return Object.assign({}, ...flat.transform) as { translateX: number; translateY: number; scale: number };
};


// A touch event as the responder system hands it over: the
// touch list on nativeEvent, and the touch history the gesture
// state is computed from — where each finger is now and where
// it was on the previous event
interface Finger {
  x: number;
  y: number;
}

const gesture = (now: Finger[], before: Finger[], t: number) => ({
  nativeEvent: { touches: now.map((f) => ({ pageX: f.x, pageY: f.y })), timestamp: t },
  touchHistory: {
    numberActiveTouches: now.length,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: t,
    touchBank: now.map((f, i) => ({
      touchActive: true,
      currentPageX: f.x,
      currentPageY: f.y,
      currentTimeStamp: t,
      previousPageX: before[i].x,
      previousPageY: before[i].y,
      previousTimeStamp: t - 16,
      startPageX: before[i].x,
      startPageY: before[i].y,
      startTimeStamp: t - 16,
    })),
  },
});

type Viewport = { props: Record<string, Handler> };

const press = async (vp: Viewport, fingers: Finger[], t: number) => {
  await act(async () => {
    vp.props.onStartShouldSetResponderCapture(gesture(fingers, fingers, t));
    vp.props.onResponderGrant(gesture(fingers, fingers, t));
  });
};

const drag = async (vp: Viewport, from: Finger[], to: Finger[], t: number) => {
  await act(async () => {
    vp.props.onResponderMove(gesture(to, from, t));
  });
};

const lift = async (vp: Viewport, t: number) => {
  await act(async () => {
    vp.props.onResponderRelease(gesture([], [], t));
  });
};


// Every host ancestor of a node that would swallow it into one
// screen-reader element, named by testID / label so a failure
// says who
type Node = { type?: unknown; parent: Node | null; props: Record<string, unknown> };

const accessibleAncestorsOf = (node: Node): string[] => {
  const found: string[] = [];
  for (let up = node.parent; up; up = up.parent) {
    if (typeof up.type === 'string' && up.props.accessible === true) found.push(String(up.props.testID ?? up.props.accessibilityLabel ?? up.type));
  }
  return found;
};




describe('routePath', () => {

  it('joins the segment points as move-then-line commands in plan units', async () => {
    expect(routePath(segment, 'l1')).toBe('M10 20 L50 20 L50 80');
    expect(routePath({ level: 'l1', points: [[0.5, 1.25], [3, 4]] }, 'l1')).toBe('M0.5 1.25 L3 4');
  });


  it("draws nothing for another level's segment, a single point, or no segment", async () => {
    expect(routePath(segment, 'l2')).toBe('');
    expect(routePath({ level: 'l1', points: [[10, 20]] }, 'l1')).toBe('');
    expect(routePath(null, 'l1')).toBe('');
    expect(routePath(undefined, 'l1')).toBe('');
  });
});




describe('camera bounds', () => {

  it('clamps the scale and answers the minimum for one that is not a number', async () => {
    expect(clampScale(2, 1, 4)).toBe(2);
    expect(clampScale(0.2, 1, 4)).toBe(1);
    expect(clampScale(9, 1, 4)).toBe(4);
    expect(clampScale(Number.NaN, 1, 4)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY, 1, 4)).toBe(4);
  });


  it('keeps a drawing larger than the viewport covering it, and a smaller one inside it', async () => {
    // At scale 2 the 400-wide drawing is 800 wide: its edges may
    // sit anywhere from −400 to 0, which is a translation of
    // −200 … 200 about the centre
    expect(clampTranslation(500, 0, 2, FRAME, FRAME)).toEqual({ x: 200, y: 0 });
    expect(clampTranslation(-500, 0, 2, FRAME, FRAME)).toEqual({ x: -200, y: 0 });
    expect(clampTranslation(120, -90, 2, FRAME, FRAME)).toEqual({ x: 120, y: -90 });

    // At rest in an exact fit nothing may move at all
    expect(clampTranslation(30, -30, 1, FRAME, FRAME)).toEqual({ x: 0, y: 0 });

    // A drawing shorter than a tall viewport may slide down only
    // as far as the viewport's bottom edge
    expect(clampTranslation(0, 500, 1, { width: 400, height: 300 }, FRAME)).toEqual({ x: 0, y: 100 });
    expect(clampTranslation(0, -50, 1, { width: 400, height: 300 }, FRAME)).toEqual({ x: 0, y: 0 });
  });
});




describe('FloorPlan drawing', () => {

  it('draws the route as a glow under a line, with the path built from the segment', async () => {
    const r = await mount(<FloorPlan level={level} route={segment} />);

    const route = r.getByTestId('wayfinduikit-plan-route');
    const glow = r.getByTestId('wayfinduikit-plan-route-glow');
    expect(route.props.d).toBe('M10 20 L50 20 L50 80');
    expect(glow.props.d).toBe('M10 20 L50 20 L50 80');
    // One plan unit is one pixel here, so the weights read as
    // set — and the glow is the wider of the two
    expect(route.props.strokeWidth).toBe(3.5);
    expect(glow.props.strokeWidth).toBe(11);
    // The overlay speaks the level's own coordinates
    const svg = r.getByTestId('wayfinduikit-plan-content').children[1] as unknown as { props: { vbWidth: number; vbHeight: number } };
    expect(svg.props.vbWidth).toBe(400);
    expect(svg.props.vbHeight).toBe(200);
  });


  it('draws no route for a segment from another level and none before layout', async () => {
    const other = await mount(<FloorPlan level={level} route={{ level: 'l2', points: [[1, 1], [2, 2]] }} />);
    expect(other.queryByTestId('wayfinduikit-plan-route')).toBeNull();

    const unmeasured = await wrap(<FloorPlan level={level} route={segment} />);
    expect(unmeasured.queryByTestId('wayfinduikit-plan-content')).toBeNull();
    expect(unmeasured.queryByTestId('wayfinduikit-plan-route')).toBeNull();
  });


  it('shows the pins and the walker only when given', async () => {
    const bare = await mount(<FloorPlan level={level} />);
    expect(bare.queryByTestId('wayfinduikit-plan-start')).toBeNull();
    expect(bare.queryByTestId('wayfinduikit-plan-end')).toBeNull();
    expect(bare.queryByTestId('wayfinduikit-plan-here')).toBeNull();

    const full = await mount(<FloorPlan level={level} start={{ x: 10, y: 20 }} end={{ x: 50, y: 80 }} youAreHere={{ x: 30, y: 20 }} />);
    expect(full.getByTestId('wayfinduikit-plan-start').props.cx).toBe(10);
    expect(full.getByTestId('wayfinduikit-plan-end')).toBeTruthy();
    expect(full.getByTestId('wayfinduikit-plan-here')).toBeTruthy();
    expect(full.getByLabelText('You are here')).toBeTruthy();
  });


  it("draws a point on its own floor or on none, and nothing for another floor's", async () => {
    expect(onShownLevel({ x: 1, y: 2 }, 'l1')).toEqual({ x: 1, y: 2 });
    expect(onShownLevel({ x: 1, y: 2, level: 'l1' }, 'l1')).toEqual({ x: 1, y: 2, level: 'l1' });
    expect(onShownLevel({ x: 1, y: 2, level: null }, 'l1')).toEqual({ x: 1, y: 2, level: null });
    expect(onShownLevel({ x: 1, y: 2, level: 'l2' }, 'l1')).toBeNull();
    expect(onShownLevel(null, 'l1')).toBeNull();
    expect(onShownLevel(undefined, 'l1')).toBeNull();


    // The engine twins' shape, handed over unfiltered: the dot
    // and the pins from the other floor stay off this drawing
    const elsewhere = { level: 'l2', x: 30, y: 20 };
    const r = await mount(<FloorPlan level={level} start={elsewhere} end={elsewhere} youAreHere={elsewhere} />);
    expect(r.queryByTestId('wayfinduikit-plan-start')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-plan-end')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-plan-here')).toBeNull();
    expect(r.queryByLabelText('You are here')).toBeNull();

    const here = await mount(<FloorPlan level={level} start={{ level: 'l1', x: 10, y: 20 }} youAreHere={{ level: 'l1', x: 30, y: 20 }} />);
    expect(here.getByTestId('wayfinduikit-plan-start').props.cx).toBe(10);
    expect(here.getByTestId('wayfinduikit-plan-here')).toBeTruthy();
  });


  it('renders the host drawing under the overlay inside the same transform', async () => {
    const r = await mount(<FloorPlan level={level} plan={<View testID="host-drawing" />} />);
    const content = r.getByTestId('wayfinduikit-plan-content');
    expect(r.getByTestId('host-drawing')).toBeTruthy();

    // Drawing wrapper first, overlay Svg second — same parent,
    // so one transform moves both
    expect(content.children).toHaveLength(2);
    expect((content.children[0] as unknown as { props: { pointerEvents: string } }).props.pointerEvents).toBe('none');
    expect((content.children[1] as unknown as { type: string }).type).toBe('RNSVGSvgView');
  });


  it('reports room and node taps by id', async () => {
    const onPressRoom = jest.fn();
    const onPressNode = jest.fn();
    const r = await mount(
      <FloorPlan
        level={level}
        rooms={[{ id: 'r114', polygon: [[0, 0], [40, 0], [40, 30]], label: '114' }, { id: 'r115', polygon: [[50, 0], [90, 0], [90, 30]] }]}
        nodes={[{ id: 'n1', x: 20, y: 60, label: 'Corridor' }, { id: 'n2', x: 70, y: 60 }]}
        onPressRoom={onPressRoom}
        onPressNode={onPressNode}
      />,
    );

    await fireEvent.press(r.getByTestId('wayfinduikit-plan-room-r115'));
    await fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n1'));

    expect(onPressRoom).toHaveBeenCalledTimes(1);
    expect(onPressRoom).toHaveBeenCalledWith('r115');
    expect(onPressNode).toHaveBeenCalledTimes(1);
    expect(onPressNode).toHaveBeenCalledWith('n1');
    // Labels fall back to the id, so every shape has a name
    expect(r.getByLabelText('114')).toBeTruthy();
    expect(r.getByLabelText('r115')).toBeTruthy();
    expect(r.getByLabelText('Corridor')).toBeTruthy();
    expect(r.getByLabelText('n2')).toBeTruthy();
  });


  it('names the host drawing for the plan, and for the route while one is drawn', async () => {
    const plain = await mount(<FloorPlan level={level} />);
    const drawing = plain.getByTestId('wayfinduikit-plan-drawing');
    expect(drawing.props.accessible).toBe(true);
    expect(drawing.props.accessibilityRole).toBe('image');
    expect(drawing.props.accessibilityLabel).toBe('Floor plan: 1');
    expect(plain.getByRole('image').props.testID).toBe('wayfinduikit-plan-drawing');

    const routed = await mount(<FloorPlan level={level} route={segment} />);
    expect(routed.getByTestId('wayfinduikit-plan-drawing').props.accessibilityLabel).toBe('Route on the floor plan: 1');
  });


  it('leaves the rooms, nodes, route and dot reachable: no element of the kit groups them', async () => {
    const r = await mount(
      <FloorPlan
        level={level}
        route={segment}
        youAreHere={{ x: 30, y: 20 }}
        rooms={[{ id: 'r114', polygon: [[0, 0], [40, 0], [40, 30]], label: '114' }, { id: 'r115', polygon: [[50, 0], [90, 0], [90, 30]] }]}
        nodes={[{ id: 'n1', x: 20, y: 60, label: 'Corridor' }, { id: 'n2', x: 70, y: 60 }]}
      />,
    );

    // A viewport marked accessible would fold every shape drawn
    // inside it into one stop for a screen reader
    const viewport = r.getByTestId('wayfinduikit-plan');
    expect(viewport.props.accessible).toBeUndefined();
    expect(viewport.props.accessibilityRole).toBeUndefined();
    expect(viewport.props.accessibilityLabel).toBeUndefined();

    // The route's group and the drawing share a name while a
    // route is up, so every bearer of each name is walked
    for (const name of ['114', 'r115', 'Corridor', 'n2', 'You are here', 'Route on the floor plan: 1']) {
      for (const bearer of r.getAllByLabelText(name)) {
        expect(accessibleAncestorsOf(bearer as unknown as Node)).toEqual([]);
      }
    }
  });
});




describe('FloorPlan gestures', () => {

  it('carries the full responder on the viewport and claims a move only past the slop or with two fingers', async () => {
    const r = await mount(<FloorPlan level={level} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    for (const handler of ['onStartShouldSetResponder', 'onMoveShouldSetResponder', 'onResponderGrant', 'onResponderMove', 'onResponderRelease', 'onResponderTerminate']) {
      expect(typeof vp.props[handler]).toBe('function');
    }


    const one = [{ x: 100, y: 100 }];
    expect(vp.props.onStartShouldSetResponder(gesture(one, one, 1))).toBe(true);
    // A single finger landing on a room is the room's first
    expect(vp.props.onStartShouldSetResponderCapture(gesture(one, one, 1))).toBe(false);
    expect(vp.props.onStartShouldSetResponderCapture(gesture([{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 100, y: 100 }, { x: 200, y: 100 }], 1))).toBe(true);

    // The capture-phase handler runs first and accumulates the
    // gesture's delta; the bubble-phase one reads the same state
    // (a 3px wobble is a tap, 30px is a drag)
    await press(vp, one, 10);
    const wobble = gesture([{ x: 103, y: 100 }], one, 26);
    expect(vp.props.onMoveShouldSetResponderCapture(wobble)).toBe(false);
    expect(vp.props.onMoveShouldSetResponder(wobble)).toBe(false);
    const pull = gesture([{ x: 130, y: 100 }], [{ x: 103, y: 100 }], 42);
    expect(vp.props.onMoveShouldSetResponderCapture(pull)).toBe(true);
    expect(vp.props.onMoveShouldSetResponder(pull)).toBe(true);
    await lift(vp, 58);
  });


  it('pinches about the fingers: the plan point under the midpoint stays under it', async () => {
    const r = await mount(<FloorPlan level={level} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });


    const before = [{ x: 100, y: 50 }, { x: 200, y: 50 }];
    const after = [{ x: 50, y: 50 }, { x: 250, y: 50 }];
    await press(vp, before, 100);
    await drag(vp, before, after, 116);

    // Distance 100 → 200 doubles the scale; the midpoint (150, 50)
    // held still means the drawing point that was there — 50 left
    // and 50 up of the centre — now sits 100 left and 100 up of
    // it, so the translation is +50 on both axes
    expect(transformOf(r)).toEqual({ translateX: 50, translateY: 50, scale: 2 });
    await lift(vp, 132);
  });


  it('clamps the pinch to the scale bounds', async () => {
    const r = await mount(<FloorPlan level={level} minScale={1} maxScale={3} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    const start = [{ x: 150, y: 100 }, { x: 250, y: 100 }];
    await press(vp, start, 100);
    await drag(vp, start, [{ x: 0, y: 100 }, { x: 400, y: 100 }], 116);
    expect(transformOf(r).scale).toBe(3);


    // Pinching in past the minimum lands on it, and at scale 1 an
    // exact fit has nowhere to go
    await drag(vp, [{ x: 0, y: 100 }, { x: 400, y: 100 }], [{ x: 190, y: 100 }, { x: 210, y: 100 }], 132);
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    await lift(vp, 148);
  });


  it('pans with one finger from where the last stretch ended, clamped at the edges', async () => {
    const r = await mount(<FloorPlan level={level} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    const before = [{ x: 100, y: 50 }, { x: 200, y: 50 }];
    const after = [{ x: 50, y: 50 }, { x: 250, y: 50 }];
    await press(vp, before, 100);
    await drag(vp, before, after, 116);
    await lift(vp, 132);
    expect(transformOf(r)).toEqual({ translateX: 50, translateY: 50, scale: 2 });


    // A fresh finger: +60 / −30 lands inside the bounds
    await press(vp, [{ x: 100, y: 100 }], 200);
    await drag(vp, [{ x: 100, y: 100 }], [{ x: 160, y: 70 }], 216);
    expect(transformOf(r)).toEqual({ translateX: 110, translateY: 20, scale: 2 });

    // Dragging far past the edge stops at it: at scale 2 the
    // translation may not pass ±200 on x, ±100 on y
    await drag(vp, [{ x: 160, y: 70 }], [{ x: 900, y: 500 }], 232);
    expect(transformOf(r)).toEqual({ translateX: 200, translateY: 100, scale: 2 });
    await drag(vp, [{ x: 900, y: 500 }], [{ x: -900, y: -500 }], 248);
    expect(transformOf(r)).toEqual({ translateX: -200, translateY: -100, scale: 2 });
    await lift(vp, 264);
  });


  it('lifting one finger of a pinch carries on as a pan without a jump', async () => {
    const r = await mount(<FloorPlan level={level} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    const before = [{ x: 100, y: 50 }, { x: 200, y: 50 }];
    const after = [{ x: 50, y: 50 }, { x: 250, y: 50 }];
    await press(vp, before, 100);
    await drag(vp, before, after, 116);
    expect(transformOf(r)).toEqual({ translateX: 50, translateY: 50, scale: 2 });


    // The count drops to one — the first move re-bases, the
    // next one pans by its own delta
    await drag(vp, [{ x: 50, y: 50 }], [{ x: 50, y: 50 }], 132);
    expect(transformOf(r)).toEqual({ translateX: 50, translateY: 50, scale: 2 });
    await drag(vp, [{ x: 50, y: 50 }], [{ x: 30, y: 60 }], 148);
    expect(transformOf(r)).toEqual({ translateX: 30, translateY: 60, scale: 2 });
    await lift(vp, 164);
  });


  it('starts a new level at rest', async () => {
    const r = await mount(<FloorPlan level={level} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    const before = [{ x: 100, y: 50 }, { x: 200, y: 50 }];
    await press(vp, before, 100);
    await drag(vp, before, [{ x: 50, y: 50 }, { x: 250, y: 50 }], 116);
    await lift(vp, 132);
    expect(transformOf(r).scale).toBe(2);


    await r.rerender(
      <WayfindUiKitProvider locale="en">
        <FloorPlan level={{ ...level, id: 'l2', label: '2' }} />
      </WayfindUiKitProvider>,
    );
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    expect(r.getByTestId('wayfinduikit-plan-drawing').props.accessibilityLabel).toBe('Floor plan: 2');
  });


  it('a level switch under a held finger drops the old floor camera with it', async () => {
    const r = await mount(<FloorPlan level={level} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    const before = [{ x: 100, y: 50 }, { x: 200, y: 50 }];
    const after = [{ x: 50, y: 50 }, { x: 250, y: 50 }];
    await press(vp, before, 100);
    await drag(vp, before, after, 116);
    expect(transformOf(r)).toEqual({ translateX: 50, translateY: 50, scale: 2 });
    // One finger stays down
    await drag(vp, [{ x: 50, y: 50 }], [{ x: 50, y: 50 }], 132);
    expect(transformOf(r)).toEqual({ translateX: 50, translateY: 50, scale: 2 });


    // The walker crosses to another floor while the finger is
    // still on the glass: the new drawing is at rest, and the
    // next nudge re-bases from rest instead of restoring the old
    // floor's zoom and offset onto it
    await r.rerender(
      <WayfindUiKitProvider locale="en">
        <FloorPlan level={{ ...level, id: 'l2', label: '2' }} />
      </WayfindUiKitProvider>,
    );
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    await drag(vp, [{ x: 50, y: 50 }], [{ x: 51, y: 50 }], 148);
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    await lift(vp, 164);
  });
});




describe('FloorPlan focus', () => {

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });


  it('glides the focused point to the middle at the focus scale, and follows a new focus', async () => {
    const r = await mount(<FloorPlan level={level} focus={{ x: 300, y: 150 }} />);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    // At scale 2 the point (300, 150) — 100 right and 50 down of
    // the centre — is pulled to the middle by twice that
    expect(transformOf(r)).toEqual({ translateX: -200, translateY: -100, scale: 2 });


    await r.rerender(
      <WayfindUiKitProvider locale="en">
        <FloorPlan level={level} focus={{ x: 100, y: 50 }} />
      </WayfindUiKitProvider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(transformOf(r)).toEqual({ translateX: 200, translateY: 100, scale: 2 });
  });


  it('keeps a deeper zoom, and the bounds still win over an edge point', async () => {
    const r = await mount(<FloorPlan level={level} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    // Pinch to 4× first
    const start = [{ x: 150, y: 100 }, { x: 250, y: 100 }];
    await press(vp, start, 100);
    await drag(vp, start, [{ x: 0, y: 100 }, { x: 400, y: 100 }], 116);
    await lift(vp, 132);
    expect(transformOf(r).scale).toBe(4);


    // The corner cannot reach the middle: the drawing's edge stops
    // at the viewport's — at scale 4 that is ±600 / ±300
    await r.rerender(
      <WayfindUiKitProvider locale="en">
        <FloorPlan level={level} focus={{ x: 0, y: 0 }} />
      </WayfindUiKitProvider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(transformOf(r)).toEqual({ translateX: 600, translateY: 300, scale: 4 });
  });


  it('a finger landing mid-flight stops the glide where it is', async () => {
    const r = await mount(<FloorPlan level={level} focus={{ x: 300, y: 150 }} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    const midway = transformOf(r);
    expect(midway.scale).toBeGreaterThan(1);
    expect(midway.scale).toBeLessThan(2);


    await press(vp, [{ x: 100, y: 100 }], 500);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(transformOf(r)).toEqual(midway);
    await lift(vp, 516);
  });


  it('a resize re-clamps the camera where the user left it and does not replay the glide', async () => {
    const r = await mount(<FloorPlan level={level} focus={{ x: 300, y: 150 }} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(transformOf(r)).toEqual({ translateX: -200, translateY: -100, scale: 2 });


    // The user pans away from the focus point
    await press(vp, [{ x: 100, y: 100 }], 700);
    await drag(vp, [{ x: 100, y: 100 }], [{ x: 300, y: 200 }], 716);
    await lift(vp, 732);
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 2 });


    // The viewport grows a pixel (a rotation, a sheet resizing
    // it): the camera stays put — the focus is still set, but a
    // resize is not a reason to glide back to it
    await layout(r.getByTestId('wayfinduikit-plan'), { width: 400, height: 201 });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 2 });
  });


  it("a focus on another floor does not zoom, and switching to its floor then glides", async () => {
    const dot = { level: 'l2', x: 300, y: 150 };
    const r = await mount(<FloorPlan level={level} focus={dot} youAreHere={dot} />);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    expect(r.queryByTestId('wayfinduikit-plan-here')).toBeNull();


    // The same unfiltered dot once its floor is shown
    await r.rerender(
      <WayfindUiKitProvider locale="en">
        <FloorPlan level={{ ...level, id: 'l2', label: '2' }} focus={dot} youAreHere={dot} />
      </WayfindUiKitProvider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(transformOf(r)).toEqual({ translateX: -200, translateY: -100, scale: 2 });
    expect(r.getByTestId('wayfinduikit-plan-here')).toBeTruthy();


    // And back on the first floor the dot's zoom is gone with it
    await r.rerender(
      <WayfindUiKitProvider locale="en">
        <FloorPlan level={level} focus={dot} youAreHere={dot} />
      </WayfindUiKitProvider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    expect(r.queryByTestId('wayfinduikit-plan-here')).toBeNull();
  });
});




describe('FloorSwitcher', () => {

  const levels: KitLevel[] = [
    { id: 'l0', label: '0', viewBox: [0, 0, 1, 1], ordinal: 0 },
    { id: 'l2', label: '2', viewBox: [0, 0, 1, 1], ordinal: 2 },
    { id: 'l1', label: '1', viewBox: [0, 0, 1, 1], ordinal: 1 },
  ];


  it('stacks the pills top floor first, the current one selected and named', async () => {
    const r = await wrap(<FloorSwitcher levels={levels} current="l1" onSelect={() => {}} />);

    expect(r.getAllByRole('tab').map((pill) => pill.props.testID)).toEqual(['wayfinduikit-floor-l2', 'wayfinduikit-floor-l1', 'wayfinduikit-floor-l0']);
    expect(r.getByTestId('wayfinduikit-floor-l1').props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(r.getByTestId('wayfinduikit-floor-l2').props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(r.getByLabelText('1, selected')).toBeTruthy();
    expect(r.getByLabelText('2')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-floor-switcher').props.accessibilityLabel).toBe('Floor switcher, showing 1');


    // The current pill wears the brand, the rest do not
    const flat = (id: string) => StyleSheet.flatten(r.getByTestId(id).props.style) as { backgroundColor: string; opacity: number };
    expect(flat('wayfinduikit-floor-l1').backgroundColor).toBe('#7B003F');
    expect(flat('wayfinduikit-floor-l2').backgroundColor).toBe('transparent');
  });


  it('reports a tap by id and leaves route-disabled pills inert', async () => {
    const onSelect = jest.fn();
    const r = await wrap(<FloorSwitcher levels={levels} current="l1" enabled={['l1', 'l2']} onSelect={onSelect} />);

    const off = r.getByTestId('wayfinduikit-floor-l0');
    expect(off.props.accessibilityState).toEqual({ selected: false, disabled: true });
    expect((StyleSheet.flatten(off.props.style) as { opacity: number }).opacity).toBe(0.4);
    await fireEvent.press(off);
    expect(onSelect).not.toHaveBeenCalled();


    await fireEvent.press(r.getByTestId('wayfinduikit-floor-l2'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('l2');
    expect(r.getByTestId('wayfinduikit-floor-l2').props.accessibilityState.disabled).toBe(false);
  });


  it('lays the pills out in a column by default and a row when asked', async () => {
    const column = await wrap(<FloorSwitcher levels={levels} current="l1" onSelect={() => {}} />);
    expect((StyleSheet.flatten(column.getByTestId('wayfinduikit-floor-switcher').props.style) as { flexDirection: string }).flexDirection).toBe('column');

    const row = await wrap(<FloorSwitcher levels={levels} current="l1" onSelect={() => {}} vertical={false} />);
    expect((StyleSheet.flatten(row.getByTestId('wayfinduikit-floor-switcher').props.style) as { flexDirection: string }).flexDirection).toBe('row');
  });
});


describe('FloorPlan editing intents', () => {

  it('reports a bare tap on the drawing in plan pixels, through the camera', async () => {
    const onPressPlan = jest.fn();
    const r = await mount(<FloorPlan level={level} onPressPlan={onPressPlan} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    // At rest the 400 × 200 frame IS the 400 × 200 viewBox
    await press(vp, [{ x: 100, y: 60 }], 1000);
    await lift(vp, 1100);
    expect(onPressPlan).toHaveBeenLastCalledWith({ x: 100, y: 60 });

    // A slow press is not a tap; a pan is not a tap
    await press(vp, [{ x: 100, y: 60 }], 2000);
    await lift(vp, 2600);
    await press(vp, [{ x: 100, y: 60 }], 3000);
    await drag(vp, [{ x: 100, y: 60 }], [{ x: 140, y: 60 }], 3050);
    await lift(vp, 3100);
    expect(onPressPlan).toHaveBeenCalledTimes(1);

    // Zoomed 2× about the centre: a screen point 50 px right of
    // the centre is 25 plan px right of it
    await press(vp, [{ x: 100, y: 100 }, { x: 300, y: 100 }], 4000);
    await drag(vp, [{ x: 100, y: 100 }, { x: 300, y: 100 }], [{ x: 0, y: 100 }, { x: 400, y: 100 }], 4050);
    await lift(vp, 4100);
    expect(transformOf(r).scale).toBeCloseTo(2, 6);
    await press(vp, [{ x: 250, y: 100 }], 5000);
    await lift(vp, 5100);
    expect(onPressPlan).toHaveBeenLastCalledWith({ x: 225, y: 100 });
  });


  it('drags only the selected node, in plan pixels, and leaves the camera alone', async () => {
    const onDragNode = jest.fn();
    const onDragNodeEnd = jest.fn();
    const nodes = [{ id: 'n1', x: 100, y: 100 }, { id: 'n2', x: 300, y: 100 }];
    const r = await mount(<FloorPlan level={level} nodes={nodes} selectedNodeId="n1" onDragNode={onDragNode} onDragNodeEnd={onDragNodeEnd} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;
    expect(r.getByTestId('wayfinduikit-plan-node-selected')).toBeTruthy();

    // A grab within the hit radius of the selected node
    await press(vp, [{ x: 108, y: 104 }], 1000);
    await drag(vp, [{ x: 108, y: 104 }], [{ x: 150, y: 120 }], 1050);
    await drag(vp, [{ x: 150, y: 120 }], [{ x: 160, y: 130 }], 1100);
    await lift(vp, 1150);
    expect(onDragNode).toHaveBeenNthCalledWith(1, 'n1', { x: 150, y: 120 });
    expect(onDragNode).toHaveBeenNthCalledWith(2, 'n1', { x: 160, y: 130 });
    expect(onDragNodeEnd).toHaveBeenCalledWith('n1', { x: 160, y: 130 });
    expect(transformOf(r)).toMatchObject({ translateX: 0, translateY: 0, scale: 1 });

    // A drag that starts on the OTHER node is a pan, not a move
    // (the drawing fits the frame here, so the pan clamps to rest)
    await press(vp, [{ x: 300, y: 100 }], 2000);
    await drag(vp, [{ x: 300, y: 100 }], [{ x: 280, y: 100 }], 2050);
    await lift(vp, 2100);
    expect(onDragNode).toHaveBeenCalledTimes(2);
    expect(onDragNodeEnd).toHaveBeenCalledTimes(1);
  });


  it('a gesture that ever held two fingers never reports a tap, however it sheds them', async () => {
    const onPressPlan = jest.fn();
    const r = await mount(<FloorPlan level={level} onPressPlan={onPressPlan} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    // A symmetric pinch keeps the centroid still (the gesture's
    // cumulative dx/dy stay under the slop); one finger lifts,
    // the other jitters a pixel and releases quickly — the old
    // phase-only test read this as a one-finger tap
    const two = [{ x: 150, y: 100 }, { x: 250, y: 100 }];
    await press(vp, two, 1000);
    await drag(vp, two, [{ x: 100, y: 100 }, { x: 300, y: 100 }], 1050);
    await drag(vp, [{ x: 100, y: 100 }], [{ x: 100, y: 101 }], 1080);
    await lift(vp, 1150);
    expect(onPressPlan).not.toHaveBeenCalled();

    // The memory is the gesture's, not the viewport's: a plain
    // tap right after still lands (at scale 2 about the centre,
    // the centre point is its own plan point)
    await press(vp, [{ x: 200, y: 100 }], 2000);
    await lift(vp, 2050);
    expect(onPressPlan).toHaveBeenCalledTimes(1);
    expect(onPressPlan).toHaveBeenCalledWith({ x: 200, y: 100 });
  });


  it('the grab zone follows the zoom: a drag on the drawn disc at scale 6 moves the node, past it pans', async () => {
    const onDragNode = jest.fn();
    const onDragNodeEnd = jest.fn();
    const r = await mount(<FloorPlan level={level} nodes={[{ id: 'n1', x: 200, y: 100 }]} selectedNodeId="n1" onDragNode={onDragNode} onDragNodeEnd={onDragNodeEnd} maxScale={6} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    // Pinch to 6× about the centre: the camera stays centred
    const before = [{ x: 150, y: 100 }, { x: 250, y: 100 }];
    await press(vp, before, 100);
    await drag(vp, before, [{ x: -100, y: 100 }, { x: 500, y: 100 }], 116);
    await lift(vp, 132);
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 6 });

    // 30 screen px from the node's centre — visibly ON the drawn
    // selected dot (43.2 px) and inside the 84 px hit disc the
    // overlay paints — must grab the node, not pan the camera
    await press(vp, [{ x: 230, y: 100 }], 1000);
    await drag(vp, [{ x: 230, y: 100 }], [{ x: 260, y: 100 }], 1050);
    await lift(vp, 1100);
    expect(onDragNode).toHaveBeenCalledWith('n1', { x: 210, y: 100 });
    expect(onDragNodeEnd).toHaveBeenCalledWith('n1', { x: 210, y: 100 });
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 6 });

    // 130 screen px out is past the 84 px disc: that drag pans
    await press(vp, [{ x: 330, y: 100 }], 2000);
    await drag(vp, [{ x: 330, y: 100 }], [{ x: 300, y: 100 }], 2050);
    await lift(vp, 2100);
    expect(onDragNode).toHaveBeenCalledTimes(1);
    expect(transformOf(r)).toEqual({ translateX: -30, translateY: 0, scale: 6 });
  });


  it('a node drag torn off by a second finger or a terminate still closes through onDragNodeEnd', async () => {
    const onDragNode = jest.fn();
    const onDragNodeEnd = jest.fn();
    const r = await mount(<FloorPlan level={level} nodes={[{ id: 'n1', x: 100, y: 100 }]} selectedNodeId="n1" onDragNode={onDragNode} onDragNodeEnd={onDragNodeEnd} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    // A second finger lands mid-drag: the drag ends with its
    // last point BEFORE the phase re-bases into a pan, and the
    // release of the now two-finger gesture does not end it again
    await press(vp, [{ x: 100, y: 100 }], 1000);
    await drag(vp, [{ x: 100, y: 100 }], [{ x: 150, y: 120 }], 1050);
    expect(onDragNode).toHaveBeenCalledWith('n1', { x: 150, y: 120 });
    await drag(vp, [{ x: 150, y: 120 }, { x: 250, y: 120 }], [{ x: 150, y: 120 }, { x: 250, y: 120 }], 1100);
    expect(onDragNodeEnd).toHaveBeenCalledTimes(1);
    expect(onDragNodeEnd).toHaveBeenCalledWith('n1', { x: 150, y: 120 });
    await lift(vp, 1150);
    expect(onDragNodeEnd).toHaveBeenCalledTimes(1);
    expect(onDragNode).toHaveBeenCalledTimes(1);

    // The system tearing the responder away closes the drag too
    await press(vp, [{ x: 100, y: 100 }], 2000);
    await drag(vp, [{ x: 100, y: 100 }], [{ x: 130, y: 110 }], 2050);
    await act(async () => {
      vp.props.onResponderTerminate(gesture([], [], 2100));
    });
    expect(onDragNodeEnd).toHaveBeenCalledTimes(2);
    expect(onDragNodeEnd).toHaveBeenLastCalledWith('n1', { x: 130, y: 110 });
  });


  it('a level switch mid node-drag closes the drag before the camera resets', async () => {
    const onDragNode = jest.fn();
    const onDragNodeEnd = jest.fn();
    const nodes = [{ id: 'n1', x: 100, y: 100 }];
    const r = await mount(<FloorPlan level={level} nodes={nodes} selectedNodeId="n1" onDragNode={onDragNode} onDragNodeEnd={onDragNodeEnd} />);
    const vp = r.getByTestId('wayfinduikit-plan') as unknown as Viewport;

    await press(vp, [{ x: 100, y: 100 }], 1000);
    await drag(vp, [{ x: 100, y: 100 }], [{ x: 150, y: 120 }], 1050);
    await r.rerender(
      <WayfindUiKitProvider locale="en">
        <FloorPlan level={{ ...level, id: 'l2', label: '2' }} nodes={nodes} selectedNodeId="n1" onDragNode={onDragNode} onDragNodeEnd={onDragNodeEnd} />
      </WayfindUiKitProvider>,
    );
    expect(onDragNodeEnd).toHaveBeenCalledWith('n1', { x: 150, y: 120 });
    expect(transformOf(r)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
  });
});
