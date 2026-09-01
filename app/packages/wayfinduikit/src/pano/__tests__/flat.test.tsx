// -----------------------------------------------------------
//  [*] Tests — wayfinduikit flat stage
//
//  The marker's two faces (green and straight inside the
//  tolerance, brand and leaning outside, the lean pinned at
//  ±60°), then the stage around it: the marker anchored by the
//  scroll offset and clamped at the edges, hotspots placed by
//  the same math and hidden off-stage, a hotspot tap reaching
//  the host, the yaw report holding still under 3° of drift,
//  the seam teleport leaving the view where it was, the
//  measured aspect widening the tile under the same yaw, the
//  hint pill's presence and its opt-out, the strip facing the
//  photo's centre column (or initialYaw, once) on mount, and
//  the photo told by its uri rather than its object.
//
//  Geometry: the test hands the stage a 400-wide layout at a
//  300 height; at the 2:1 default aspect one tile is 600 px,
//  so 1 px is 0.6° and the strip is wider than the view. Yaw
//  0 is a tile's middle column, 300 px in from its left edge.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Animated, StyleSheet } from 'react-native';

import type { KitHotspot } from '../../core/types';
import { WayfindUiKitProvider } from '../../provider';
import { defaultLabels } from '../../provider/labels';
import { defaultTheme } from '../../provider/theme';
import DirectionMarker, { MARKER_SIZE } from '../DirectionMarker';
import FlatPanorama from '../FlatPanorama';


const en = defaultLabels.en;
const { colors } = defaultTheme;

const wrap = (ui: ReactElement) => render(<WayfindUiKitProvider locale="en">{ui}</WayfindUiKitProvider>);

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style) as Record<string, unknown>;


const STAGE_WIDTH = 400;
const HEIGHT = 300;
const TILE = HEIGHT * 2;

type Rendered = Awaited<ReturnType<typeof wrap>>;

const layOut = async (r: Rendered, width = STAGE_WIDTH) => {
  await fireEvent(r.getByTestId('wayfinduikit-flat-stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: HEIGHT } } });
};

const scrollTo = async (r: Rendered, x: number) => {
  await fireEvent.scroll(r.getByTestId('wayfinduikit-flat-stage-scroll'), { nativeEvent: { contentOffset: { x, y: 0 } } });
};

// The offset that puts yaw `deg` at the view centre, inside
// the middle tile of the strip: its middle column is yaw 0
const offsetForYaw = (deg: number, tile = TILE) => tile * 2 + tile / 2 - STAGE_WIDTH / 2 + (deg / 360) * tile;

const marker = (r: Rendered) => r.getByTestId('wayfinduikit-marker');
const disc = (r: Rendered) => r.getByTestId('wayfinduikit-marker-disc');
const chevronRotate = (r: Rendered) => (flat(r.getByTestId('wayfinduikit-marker-chevron')).transform as { rotate: string }[])[0].rotate;




describe('DirectionMarker', () => {

  it('stands straight and green inside the tolerance, with the aligned label', async () => {
    const r = await wrap(<DirectionMarker deltaDeg={5} />);

    expect(marker(r).props.accessibilityLabel).toBe(en.markerAligned);
    expect(flat(disc(r)).backgroundColor).toBe(colors.success);
    expect(chevronRotate(r)).toBe('5deg');
  });


  it('leans towards the target in brand once outside, pinned at ±60°', async () => {
    const right = await wrap(<DirectionMarker deltaDeg={100} />);
    expect(right.getByTestId('wayfinduikit-marker').props.accessibilityLabel).toBe(en.markerA11y(100));
    expect(flat(disc(right)).backgroundColor).toBe(colors.brand);
    expect(chevronRotate(right)).toBe('60deg');


    const left = await wrap(<DirectionMarker deltaDeg={-30.4} />);
    expect(left.getByTestId('wayfinduikit-marker').props.accessibilityLabel).toBe('Route 30° to the left');
    expect(chevronRotate(left)).toBe('-30.4deg');
  });


  it('shows the caption when given one and drops the halo when clamped', async () => {
    const r = await wrap(<DirectionMarker deltaDeg={20} label="Room 114" clamped />);

    expect(r.getByText('Room 114')).toBeTruthy();
    expect(flat(disc(r).parent as { props: { style?: unknown } }).backgroundColor).toBe('transparent');
  });
});




describe('FlatPanorama marker', () => {

  it('anchors the marker on the target column, aligned when the view faces it', async () => {
    const r = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} targetYaw={0} height={HEIGHT} />);
    await layOut(r);


    await scrollTo(r, offsetForYaw(0));
    expect(marker(r).props.accessibilityLabel).toBe(en.markerAligned);
    expect(flat(r.getByTestId('wayfinduikit-flat-marker')).left).toBe(STAGE_WIDTH / 2 - MARKER_SIZE / 2);


    // Facing 270: the target is 90° to the right — a quarter
    // tile (150 px) right of centre, still inside the stage
    await scrollTo(r, offsetForYaw(270));
    expect(marker(r).props.accessibilityLabel).toBe(en.markerA11y(90));
    expect(chevronRotate(r)).toBe('60deg');
    expect(flat(r.getByTestId('wayfinduikit-flat-marker')).left).toBe(STAGE_WIDTH / 2 + 150 - MARKER_SIZE / 2);
  });


  it('clamps the marker to the edge when the target is off-stage, keeping the true angle', async () => {
    const r = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} targetYaw={0} height={HEIGHT} />);
    await layOut(r);


    // Facing 180: the target is straight behind (-180), half a
    // tile off to the left — pinned at the left inset
    await scrollTo(r, offsetForYaw(180));
    expect(marker(r).props.accessibilityLabel).toBe(en.markerA11y(-180));
    expect(chevronRotate(r)).toBe('-60deg');
    expect(flat(r.getByTestId('wayfinduikit-flat-marker')).left).toBe(8);
    expect(flat(disc(r).parent as { props: { style?: unknown } }).backgroundColor).toBe('transparent');
  });


  it('draws no marker without a target yaw', async () => {
    const r = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} height={HEIGHT} />);
    await layOut(r);

    expect(r.queryByTestId('wayfinduikit-marker')).toBeNull();
    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
  });
});




describe('FlatPanorama hotspots', () => {

  const hotspots: KitHotspot[] = [
    { id: 'h1', yaw: 90, kind: 'link', label: 'Corridor' },
    { id: 'h2', yaw: 180, kind: 'info' },
  ];


  it('places hotspots by the same math, hides the off-stage one, and taps through', async () => {
    const onPressHotspot = jest.fn();
    const r = await wrap(
      <FlatPanorama source={{ uri: 'https://x/pano.jpg' }} hotspots={hotspots} onPressHotspot={onPressHotspot} height={HEIGHT} />,
    );
    await layOut(r);


    // Facing 0: h1 sits 90° right (a quarter tile), h2 is behind
    await scrollTo(r, offsetForYaw(0));
    expect(r.getByText('Corridor')).toBeTruthy();
    expect(flat(r.getByTestId('wayfinduikit-hotspot-h1')).left).toBe(STAGE_WIDTH / 2 + 150 - 18);
    expect(r.queryByTestId('wayfinduikit-hotspot-h2')).toBeNull();

    await fireEvent.press(r.getByTestId('wayfinduikit-hotspot-h1'));
    expect(onPressHotspot).toHaveBeenCalledTimes(1);
    expect(onPressHotspot).toHaveBeenCalledWith(hotspots[0]);


    // Facing 180: h2 is dead centre, h1 a quarter tile LEFT
    await scrollTo(r, offsetForYaw(180));
    expect(flat(r.getByTestId('wayfinduikit-hotspot-h2')).left).toBe(STAGE_WIDTH / 2 - 18);
    expect(flat(r.getByTestId('wayfinduikit-hotspot-h1')).left).toBe(STAGE_WIDTH / 2 - 150 - 18);
  });


  it('lifts a pitched hotspot above the horizon', async () => {
    const r = await wrap(
      <FlatPanorama source={{ uri: 'https://x/pano.jpg' }} hotspots={[{ id: 'up', yaw: 0, pitch: 30, kind: 'info' }]} height={HEIGHT} />,
    );
    await layOut(r);
    await scrollTo(r, offsetForYaw(0));

    // 30° of the ±90° span is a sixth of the height above centre
    expect(flat(r.getByTestId('wayfinduikit-hotspot-up')).top).toBe(HEIGHT / 2 - HEIGHT / 6 - 18);
  });
});




describe('FlatPanorama yaw report', () => {

  it('reports whole degrees only once the view moved 3° or more', async () => {
    const onYawChange = jest.fn();
    const r = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} onYawChange={onYawChange} height={HEIGHT} />);
    await layOut(r);
    // The mount faces the photo's centre column, reported once
    expect(onYawChange.mock.calls).toEqual([[0]]);


    // 1 px is 0.6°: 30 → 32.4° stays quiet, 33° speaks, 33.6° is
    // under the step again
    await scrollTo(r, offsetForYaw(30));
    await scrollTo(r, offsetForYaw(30) + 4);
    await scrollTo(r, offsetForYaw(30) + 2);
    await scrollTo(r, offsetForYaw(30) + 5);
    await scrollTo(r, offsetForYaw(30) + 6);

    expect(onYawChange.mock.calls).toEqual([[0], [30], [33]]);
  });


  it('measures the short way across the seam', async () => {
    const onYawChange = jest.fn();
    const r = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} onYawChange={onYawChange} height={HEIGHT} />);
    await layOut(r);


    // Round the far side first: 359 is only one degree from the
    // mount's 0 and would stay quiet on its own
    await scrollTo(r, offsetForYaw(350));
    await scrollTo(r, offsetForYaw(359));
    expect(onYawChange).toHaveBeenLastCalledWith(359);
    onYawChange.mockClear();
    // 359 → 1 is two degrees, not 358
    await scrollTo(r, offsetForYaw(1));
    expect(onYawChange).not.toHaveBeenCalled();
    // 359 → 2 is three
    await scrollTo(r, offsetForYaw(2));
    expect(onYawChange.mock.calls).toEqual([[2]]);
  });


  it('teleports on momentum end without moving the view', async () => {
    const onYawChange = jest.fn();
    const r = await wrap(
      <FlatPanorama source={{ uri: 'https://x/pano.jpg' }} targetYaw={0} onYawChange={onYawChange} height={HEIGHT} />,
    );
    await layOut(r);
    await scrollTo(r, offsetForYaw(0));
    onYawChange.mockClear();


    // The fling ended a whole tile to the right: folded back
    // into the middle tile, the same yaw faces the same target
    await fireEvent(r.getByTestId('wayfinduikit-flat-stage-scroll'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: offsetForYaw(0) + TILE, y: 0 } },
    });
    expect(onYawChange).not.toHaveBeenCalled();
    expect(marker(r).props.accessibilityLabel).toBe(en.markerAligned);

    // A drag that stopped dead recentres too; one still carrying
    // momentum waits for it
    await fireEvent(r.getByTestId('wayfinduikit-flat-stage-scroll'), 'scrollEndDrag', {
      nativeEvent: { contentOffset: { x: offsetForYaw(0) - TILE, y: 0 }, velocity: { x: 0, y: 0 } },
    });
    await fireEvent(r.getByTestId('wayfinduikit-flat-stage-scroll'), 'scrollEndDrag', {
      nativeEvent: { contentOffset: { x: offsetForYaw(0) + TILE, y: 0 }, velocity: { x: 2, y: 0 } },
    });
    expect(onYawChange).not.toHaveBeenCalled();
    expect(marker(r).props.accessibilityLabel).toBe(en.markerAligned);
  });
});




describe('FlatPanorama tile and hint', () => {

  it('widens the tile to the decoded aspect under the yaw the view had', async () => {
    const onYawChange = jest.fn();
    const r = await wrap(
      <FlatPanorama source={{ uri: 'https://x/pano.jpg' }} hotspots={[{ id: 'h', yaw: 90, kind: 'route' }]} onYawChange={onYawChange} height={HEIGHT} />,
    );
    await layOut(r);
    await scrollTo(r, offsetForYaw(45));
    expect(onYawChange).toHaveBeenLastCalledWith(45);
    onYawChange.mockClear();


    // A 4:1 photo: the tile grows to 1200 px, so 90° is now 300
    // px right of centre — past the 400-wide stage. The image
    // component unwraps nativeEvent itself, so the event is
    // fired in the synthetic shape it expects from the bridge
    await fireEvent(r.getByTestId('wayfinduikit-flat-tile'), 'load', {
      nativeEvent: {
        cacheType: 'none',
        source: { url: 'https://x/pano.jpg', width: 4000, height: 1000, mediaType: 'image/jpeg' },
      },
    });
    // The strip was re-laid at the wider tile, still facing 45:
    // nothing to report, and the hotspot 45° right now sits 150
    // px right of centre at the new scale
    expect(onYawChange).not.toHaveBeenCalled();
    expect(flat(r.getByTestId('wayfinduikit-hotspot-h')).left).toBe(STAGE_WIDTH / 2 + 150 - 18);

    await scrollTo(r, offsetForYaw(0, 1200));
    expect(r.queryByTestId('wayfinduikit-hotspot-h')).toBeNull();
  });


  it('shows the hint pill by default and none when opted out', async () => {
    const shown = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} height={HEIGHT} />);
    expect(shown.getByText(en.stageHint360)).toBeTruthy();
    expect(shown.getByTestId('wayfinduikit-flat-hint')).toBeTruthy();


    const hidden = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} showHint={false} height={HEIGHT} />);
    expect(hidden.queryByTestId('wayfinduikit-flat-hint')).toBeNull();
  });


  it('names the stage after the target and resolves a stored reference through the env', async () => {
    const r = await render(
      <WayfindUiKitProvider locale="en" env={{ resolveImageUrl: (url) => `https://cdn.example${url}` }}>
        <FlatPanorama source="/panos/step-1.jpg" targetYaw={0} targetLabel="Room 114" height={HEIGHT} />
      </WayfindUiKitProvider>,
    );

    expect(r.getByTestId('wayfinduikit-flat-stage-scroll').props.accessibilityLabel).toBe(en.stageA11y('Room 114'));
    expect(r.getByTestId('wayfinduikit-flat-tile').props.source).toEqual([{ uri: 'https://cdn.example/panos/step-1.jpg' }]);
    expect(r.getByText('Room 114')).toBeTruthy();
  });
});




describe('FlatPanorama frame and seed', () => {

  it('faces the photo\'s centre column on mount, with the edges the half-turn away', async () => {
    const onYawChange = jest.fn();
    const r = await wrap(
      <FlatPanorama
        source={{ uri: 'https://x/pano.jpg' }}
        targetYaw={180}
        hotspots={[{ id: 'mid', yaw: 0, kind: 'info' }]}
        onYawChange={onYawChange}
        height={HEIGHT}
      />,
    );
    await layOut(r);


    // One report, before and after the layout pass alike: the
    // window-width guess and the measured width both face 0
    expect(onYawChange.mock.calls).toEqual([[0]]);
    expect(flat(r.getByTestId('wayfinduikit-hotspot-mid')).left).toBe(STAGE_WIDTH / 2 - 18);
    // A target on the photo's edge is straight behind — the
    // marker pinned at the left inset, leaning left
    expect(marker(r).props.accessibilityLabel).toBe(en.markerA11y(-180));
    expect(flat(r.getByTestId('wayfinduikit-flat-marker')).left).toBe(8);
  });


  it('seeds the strip with initialYaw once and ignores later changes to it', async () => {
    const onYawChange = jest.fn();
    const stage = (initialYaw: number) => (
      <WayfindUiKitProvider locale="en">
        <FlatPanorama source={{ uri: 'https://x/pano.jpg' }} initialYaw={initialYaw} targetYaw={90} onYawChange={onYawChange} height={HEIGHT} />
      </WayfindUiKitProvider>
    );
    const r = await render(stage(90));
    await layOut(r);

    expect(onYawChange.mock.calls).toEqual([[90]]);
    expect(marker(r).props.accessibilityLabel).toBe(en.markerAligned);
    expect(flat(r.getByTestId('wayfinduikit-flat-marker')).left).toBe(STAGE_WIDTH / 2 - MARKER_SIZE / 2);


    // Once mounted the view is the walker's
    await r.rerender(stage(200));
    expect(onYawChange.mock.calls).toEqual([[90]]);
    expect(marker(r).props.accessibilityLabel).toBe(en.markerAligned);
  });


  it('keeps the yaw when the stage lays out at another width', async () => {
    const onYawChange = jest.fn();
    const r = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} targetYaw={0} onYawChange={onYawChange} height={HEIGHT} />);
    await layOut(r);
    await scrollTo(r, offsetForYaw(60));
    expect(onYawChange).toHaveBeenLastCalledWith(60);
    onYawChange.mockClear();


    // A rotation: the same yaw at the view centre, the target
    // 60° left now 100 px left of the wider stage's centre
    await layOut(r, 600);
    expect(onYawChange).not.toHaveBeenCalled();
    expect(marker(r).props.accessibilityLabel).toBe(en.markerA11y(-60));
    expect(flat(r.getByTestId('wayfinduikit-flat-marker')).left).toBe(300 - 100 - MARKER_SIZE / 2);
  });
});




describe('FlatPanorama photo identity', () => {

  const stage = (uri: string, onYawChange: (yaw: number) => void) => (
    <WayfindUiKitProvider locale="en">
      <FlatPanorama source={{ uri }} targetYaw={0} onYawChange={onYawChange} height={HEIGHT} />
    </WayfindUiKitProvider>
  );


  it('holds the view and the hint when the host re-renders with a fresh { uri } of the same photo', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const onYawChange = jest.fn();
    const r = await render(stage('https://x/pano.jpg', onYawChange));
    await layOut(r);
    await scrollTo(r, offsetForYaw(90));
    expect(marker(r).props.accessibilityLabel).toBe(en.markerA11y(-90));
    const hintsShown = timing.mock.calls.length;
    onYawChange.mockClear();


    // The very shape a host keeping the heading in state
    // produces on each report: a new object, the same photo
    await r.rerender(stage('https://x/pano.jpg', onYawChange));
    await r.rerender(stage('https://x/pano.jpg', onYawChange));
    expect(onYawChange).not.toHaveBeenCalled();
    expect(marker(r).props.accessibilityLabel).toBe(en.markerA11y(-90));
    expect(timing.mock.calls.length).toBe(hintsShown);


    // A different uri is a new photo: the strip faces its centre
    // column again and the hint starts over
    await r.rerender(stage('https://x/next.jpg', onYawChange));
    expect(onYawChange.mock.calls).toEqual([[0]]);
    expect(marker(r).props.accessibilityLabel).toBe(en.markerAligned);
    expect(timing.mock.calls.length).toBe(hintsShown + 1);
    timing.mockRestore();
  });
});


describe('FlatPanorama partial photo', () => {

  it('lays one tile, reports yaws inside the coverage and never teleports', async () => {
    const reports: number[] = [];
    const r = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} geometry={{ hfovDeg: 90, vfovDeg: 60 }} targetYaw={45} height={HEIGHT} onYawChange={(yaw) => reports.push(yaw)} />);
    await layOut(r);

    // A 2:1 photo at 300 high is one 600 px tile — no copies, no padding
    expect(flat(r.getByTestId('wayfinduikit-flat-strip')).width).toBe(TILE);
    expect(reports).toEqual([0]);

    await scrollTo(r, 0);
    expect(reports).toEqual([0, 345]);
    // 45° lies 60° right of the view: at 600 px per 90° that is
    // 400 px past the centre, so the marker pins at the edge
    expect(flat(r.getByTestId('wayfinduikit-flat-marker')).left as number).toBeGreaterThan(STAGE_WIDTH / 2);
    expect(flat(disc(r).parent as { props: { style?: unknown } }).backgroundColor).toBe('transparent');

    await scrollTo(r, 200);
    expect(reports).toEqual([0, 345, 15]);

    // Ending a drag near the strip's end folds nothing back — a
    // looping strip would have jumped a whole tile here
    await act(async () => {
      fireEvent(r.getByTestId('wayfinduikit-flat-stage-scroll'), 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 590, y: 0 }, velocity: { x: 0, y: 0 } } });
    });
    expect(reports).toEqual([0, 345, 15]);
  });


  it('centres a tile narrower than the stage with padding', async () => {
    const r = await wrap(<FlatPanorama source={{ uri: 'https://x/pano.jpg' }} geometry={{ hfovDeg: 60, vfovDeg: 40 }} height={100} />);
    await layOut(r);

    // A 200 px tile in a 400 px stage sits behind 100 px of pad
    const strip = flat(r.getByTestId('wayfinduikit-flat-strip'));
    expect(strip.width).toBe(STAGE_WIDTH);
    expect(strip.paddingHorizontal).toBe(100);
  });
});
