// -----------------------------------------------------------
//  [*] Tests — wayfinduikit capture HUD
//
//  The overlay's promises, snapshot-free: dots land where
//  projectToScreen puts them under the pose-as-camera, targets
//  behind the lens or past the viewport are HIDDEN (never
//  clamped), the current target is the ring — anchored in
//  view, pinned at the edge with the lean arrow once off it —
//  and fills success-coloured only when aligned AND stable;
//  the reticle sits dead centre, the roll hint appears exactly
//  past ±8°, the progress line and the spoken name come from
//  the catalog, and the HUD's three keys keep LT/EN parity.
//
//  Geometry: a 400 × 300 viewport at fov 90 — the focal length
//  is 200 px, so a target 45° right of the pose sits on the
//  right edge and one 30° right at x = 200 + 200·tan 30°.
// -----------------------------------------------------------

import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { projectToScreen } from '../../pano/projection';
import { WayfindUiKitProvider } from '../../provider';
import { defaultLabels } from '../../provider/labels';
import { defaultTheme } from '../../provider/theme';
import CaptureHud, { type CaptureHudProps } from '../CaptureHud';


const en = defaultLabels.en;
const { colors } = defaultTheme;

const wrap = (ui: ReactElement) => render(<WayfindUiKitProvider locale="en">{ui}</WayfindUiKitProvider>);

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style) as Record<string, unknown>;


const WIDTH = 400;
const HEIGHT = 300;

// The ring's and dot's footprints, as the component draws them
const RING = 56;
const RING_MARGIN = RING / 2 + 8;
const DOT = 10;

const target = (id: string, yawDeg: number, pitchDeg = 0, done = false) => ({ id, yawDeg, pitchDeg, done });

const hud = (over: Partial<CaptureHudProps> = {}) =>
  wrap(
    <CaptureHud
      targets={over.targets ?? [target('r0-0', 0), target('r0-1', 30)]}
      currentId={over.currentId !== undefined ? over.currentId : 'r0-0'}
      pose={over.pose ?? { yawDeg: 0, pitchDeg: 0, rollDeg: 0 }}
      fovDeg={over.fovDeg ?? 90}
      aligned={over.aligned ?? false}
      stable={over.stable ?? false}
      shotsDone={over.shotsDone ?? 0}
      shotsTotal={over.shotsTotal ?? 44}
      width={WIDTH}
      height={HEIGHT}
    />,
  );

const camera = (pose: { yawDeg: number; pitchDeg: number }, fovDeg = 90) => ({ yaw: pose.yawDeg, pitch: pose.pitchDeg, fovDeg, width: WIDTH, height: HEIGHT });




describe('CaptureHud dots', () => {

  it('places a pending dot exactly where projectToScreen puts its target', async () => {
    const pose = { yawDeg: 10, pitchDeg: 5, rollDeg: 0 };
    const r = await hud({ pose, targets: [target('r0-0', 0), target('r40-2', 30, 20)] });


    const expected = projectToScreen({ yaw: 30, pitch: 20 }, camera(pose));
    expect(expected.visible).toBe(true);
    const dot = flat(r.getByTestId('wayfinduikit-hud-target-r40-2'));
    expect(dot.left).toBeCloseTo((expected.x as number) - DOT / 2, 6);
    expect(dot.top).toBeCloseTo((expected.y as number) - DOT / 2, 6);
    expect(dot.backgroundColor).toBe(colors.stageInk);
  });


  it('never draws the current target as a dot — it is the ring', async () => {
    const r = await hud();

    expect(r.queryByTestId('wayfinduikit-hud-target-r0-0')).toBeNull();
    expect(r.getByTestId('wayfinduikit-hud-ring')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-hud-target-r0-1')).toBeTruthy();
  });


  it('hides a target behind the camera instead of clamping it', async () => {
    const r = await hud({ targets: [target('r0-0', 0), target('r0-6', 180)] });

    expect(r.queryByTestId('wayfinduikit-hud-target-r0-6')).toBeNull();
  });


  it('hides a target in front but past the viewport', async () => {
    // 70° up at fov 90 projects hundreds of pixels above the
    // viewport — in front of the lens, but not in the picture
    const r = await hud({ targets: [target('r0-0', 0), target('r70-0', 0, 70), target('r0-2', 60)] });

    expect(projectToScreen({ yaw: 0, pitch: 70 }, camera({ yawDeg: 0, pitchDeg: 0 })).visible).toBe(true);
    expect(r.queryByTestId('wayfinduikit-hud-target-r70-0')).toBeNull();
    // 60° right at fov 90 lands past the right edge too
    expect(r.queryByTestId('wayfinduikit-hud-target-r0-2')).toBeNull();
  });


  it('keeps a done target faintly, in the success ink', async () => {
    const r = await hud({ targets: [target('r0-0', 0), target('r0-1', 30, 0, true)] });

    const dot = flat(r.getByTestId('wayfinduikit-hud-target-r0-1'));
    expect(dot.opacity).toBe(0.35);
    expect(dot.backgroundColor).toBe(colors.success);
  });
});




describe('CaptureHud ring', () => {

  it('anchors on the current target in view, with no lean arrow', async () => {
    const pose = { yawDeg: 350, pitchDeg: 0, rollDeg: 0 };
    const r = await hud({ pose });


    const expected = projectToScreen({ yaw: 0, pitch: 0 }, camera(pose));
    const ring = flat(r.getByTestId('wayfinduikit-hud-ring'));
    expect(ring.left).toBeCloseTo((expected.x as number) - RING / 2, 6);
    expect(ring.top).toBeCloseTo((expected.y as number) - RING / 2, 6);
    expect(r.queryByTestId('wayfinduikit-hud-ring-arrow')).toBeNull();
  });


  it('turns success-coloured only when aligned AND stable', async () => {
    const ready = await hud({ aligned: true, stable: true });
    expect(flat(ready.getByTestId('wayfinduikit-hud-ring')).backgroundColor).toBe(colors.success);
    expect(flat(ready.getByTestId('wayfinduikit-hud-ring')).borderColor).toBe(colors.success);


    // Aligned but still settling: the border says almost, the
    // fill waits for the session's shoot condition
    const settling = await hud({ aligned: true, stable: false });
    expect(flat(settling.getByTestId('wayfinduikit-hud-ring')).backgroundColor).toBe('transparent');
    expect(flat(settling.getByTestId('wayfinduikit-hud-ring')).borderColor).toBe(colors.success);

    const hunting = await hud({ aligned: false, stable: true });
    expect(flat(hunting.getByTestId('wayfinduikit-hud-ring')).backgroundColor).toBe('transparent');
    expect(flat(hunting.getByTestId('wayfinduikit-hud-ring')).borderColor).toBe(colors.stageInk);
  });


  it('pins a behind-camera current target at the left edge with the arrow leaning left', async () => {
    const r = await hud({ targets: [target('r0-6', 180)], currentId: 'r0-6' });


    // Straight behind projects to x = cx − reach, y = cy; the
    // clamp pulls it to the left margin at the vertical middle
    const ring = flat(r.getByTestId('wayfinduikit-hud-ring'));
    expect(ring.left).toBe(RING_MARGIN - RING / 2);
    expect(ring.top).toBe(HEIGHT / 2 - RING / 2);
    const arrow = flat(r.getByTestId('wayfinduikit-hud-ring-arrow'));
    expect((arrow.transform as { rotate: string }[])[0].rotate).toBe('-90deg');
  });


  it('pins an in-front but off-view current target at the side it actually sits', async () => {
    // 80° right at fov 90 projects far past the right edge
    const r = await hud({ targets: [target('r0-3', 80)], currentId: 'r0-3' });


    const ring = flat(r.getByTestId('wayfinduikit-hud-ring'));
    expect(ring.left).toBe(WIDTH - RING_MARGIN - RING / 2);
    const arrow = flat(r.getByTestId('wayfinduikit-hud-ring-arrow'));
    expect((arrow.transform as { rotate: string }[])[0].rotate).toBe('90deg');
  });


  it('draws no ring with currentId null or naming no target', async () => {
    expect((await hud({ currentId: null })).queryByTestId('wayfinduikit-hud-ring')).toBeNull();
    expect((await hud({ currentId: 'r40-9' })).queryByTestId('wayfinduikit-hud-ring')).toBeNull();
  });
});




describe('CaptureHud chrome', () => {

  it('holds the reticle dead centre whatever the pose', async () => {
    const r = await hud({ pose: { yawDeg: 123, pitchDeg: -30, rollDeg: 5 } });

    const reticle = flat(r.getByTestId('wayfinduikit-hud-reticle'));
    expect(reticle.left).toBe(WIDTH / 2 - 28 / 2);
    expect(reticle.top).toBe(HEIGHT / 2 - 28 / 2);
  });


  it('shows the roll hint only past ±8°, from the catalog', async () => {
    const level = await hud({ pose: { yawDeg: 0, pitchDeg: 0, rollDeg: 8 } });
    expect(level.queryByTestId('wayfinduikit-hud-roll')).toBeNull();

    const rolled = await hud({ pose: { yawDeg: 0, pitchDeg: 0, rollDeg: 8.5 } });
    expect(rolled.getByTestId('wayfinduikit-hud-roll')).toBeTruthy();
    expect(rolled.getByText(en.hudRollHint)).toBeTruthy();

    const counter = await hud({ pose: { yawDeg: 0, pitchDeg: 0, rollDeg: -20 } });
    expect(counter.getByTestId('wayfinduikit-hud-roll')).toBeTruthy();
  });


  it('counts the shots through the catalog and speaks the whole overlay', async () => {
    const r = await hud({ shotsDone: 3, shotsTotal: 44 });

    expect(r.getByTestId('wayfinduikit-hud-progress')).toBeTruthy();
    expect(r.getByText(en.hudProgress(3, 44))).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-hud').props.accessibilityLabel).toBe(en.hudA11y(3, 44));
  });


  it('survives a pose of NaN before the tracker settles', async () => {
    const r = await hud({ pose: { yawDeg: Number.NaN, pitchDeg: Number.NaN, rollDeg: Number.NaN } });

    // The level default: the ring on the yaw-0 target at centre,
    // no roll hint, nothing NaN-positioned
    expect(flat(r.getByTestId('wayfinduikit-hud-ring')).left).toBe(WIDTH / 2 - RING / 2);
    expect(r.queryByTestId('wayfinduikit-hud-roll')).toBeNull();
  });
});




describe('CaptureHud labels', () => {

  it('carries its three keys in both catalogs with the same shapes', async () => {
    expect(defaultLabels.lt.hudProgress(3, 44)).toBe('3 / 44');
    expect(defaultLabels.en.hudProgress(3, 44)).toBe('3 / 44');
    expect(defaultLabels.lt.hudA11y(3, 44)).toBe('Panoramos fotografavimas: 3 iš 44');
    expect(defaultLabels.en.hudA11y(3, 44)).toBe('Panorama capture: 3 of 44');
    expect(defaultLabels.lt.hudRollHint.length).toBeGreaterThan(0);
    expect(defaultLabels.en.hudRollHint.length).toBeGreaterThan(0);
    expect(defaultLabels.lt.hudA11y.length).toBe(defaultLabels.en.hudA11y.length);
  });
});
