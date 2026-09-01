// -----------------------------------------------------------
//  [*] Tests — wayfinduikit sphere stage
//
//  The GL peers are stand-ins: a surface that hands the stage
//  a fake context right after mount (or, when told, a while
//  later and regardless of unmount, as the native one may), a
//  renderer and a loader that record what the stage does with
//  them, and a bare 3D module of counting classes. Proved: the
//  sphere mounts and draws a frame, the texture lands on the
//  material and the mesh joins the scene, the sphere's turn
//  and the camera's put the photo's centre column at yaw 0
//  exactly where projectToScreen puts a target at that yaw
//  (modelled from the geometry's own parametrisation), the
//  route marker follows a drag and a sensor sample through the
//  projection, hotspots are placed and hidden by the same
//  maths, the yaw report holds still under 3°, a fling keeps
//  turning after the finger lifts, a failed context / texture
//  / render falls back to the flat stage under 'auto' only and
//  stays remembered across a host re-render with a fresh
//  { uri } of the same photo, 'flat' never touches GL, the
//  oversize warning fires once, and unmount releases
//  everything — a texture landing late, and a context landing
//  late, included.
//
//  Geometry: a 400-wide layout at a 300 height with the
//  default 75° fov — one pixel of drag is 0.1875°.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Animated, StyleSheet } from 'react-native';

import type { KitHotspot } from '../../core/types';
import { WayfindUiKitProvider } from '../../provider';
import { defaultLabels } from '../../provider/labels';
import { MARKER_SIZE } from '../DirectionMarker';
import PanoramaStage from '../PanoramaStage';
import { projectToScreen } from '../projection';


interface FakeTexture {
  dispose: jest.Mock;
  image: { width: number; height: number };
  colorSpace?: string;
}

interface FakeRenderer {
  render: jest.Mock;
  setSize: jest.Mock;
  dispose: jest.Mock;
}

interface FakeCamera {
  fov: number;
  aspect: number;
  rotation: { x: number; y: number; order: string };
  updateProjectionMatrix: jest.Mock;
}

interface FakeGeometry {
  args: number[];
  scale: jest.Mock;
  dispose: jest.Mock;
}

interface FakeMaterial {
  map: FakeTexture | null;
  needsUpdate: boolean;
  dispose: jest.Mock;
}

interface FakeMesh {
  rotation: { x: number; y: number; z: number };
  geometry: FakeGeometry;
  material: FakeMaterial;
}


const mockGl = { endFrameEXP: jest.fn(), drawingBufferWidth: 800, drawingBufferHeight: 600 };

// Per-test knobs the stand-ins read when the stage drives them
const mockControl = {
  rendererThrows: false,
  glViewThrows: false,
  loadFails: false,
  textureWidth: 4096,
  // A held load resolves only when the test says so
  holdLoad: false,
  releaseLoad: null as null | (() => void),
  // A context handed over this long after mount — and handed
  // over regardless, the surface not knowing it was unmounted
  lateContextMs: 0,
  glViewRenders: jest.fn(),
};

const mockSpies = {
  renderers: [] as FakeRenderer[],
  cameras: [] as FakeCamera[],
  scenes: [] as { add: jest.Mock }[],
  geometries: [] as FakeGeometry[],
  materials: [] as FakeMaterial[],
  meshes: [] as FakeMesh[],
  textures: [] as FakeTexture[],
};


jest.mock('expo-gl', () => {
  // A mock factory has no imports of its own
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    GLView: (props: { onContextCreate: (gl: unknown) => void; testID?: string }) => {
      if (mockControl.glViewThrows) throw new Error('no surface on this device');
      mockControl.glViewRenders();
      const createRef = React.useRef(props.onContextCreate);
      createRef.current = props.onContextCreate;
      React.useEffect(() => {
        if (mockControl.lateContextMs > 0) {
          setTimeout(() => createRef.current(mockGl), mockControl.lateContextMs);
          return;
        }
        createRef.current(mockGl);
      }, []);
      return React.createElement(View, { testID: props.testID });
    },
  };
});

jest.mock('expo-three', () => ({
  Renderer: class {
    render = jest.fn();
    setSize = jest.fn();
    dispose = jest.fn();
    constructor() {
      if (mockControl.rendererThrows) throw new Error('context lost');
      mockSpies.renderers.push(this);
    }
  },
  loadAsync: jest.fn(async () => {
    if (mockControl.holdLoad) await new Promise<void>((resolve) => (mockControl.releaseLoad = resolve));
    if (mockControl.loadFails) throw new Error('texture failed to decode');
    const texture: FakeTexture = { dispose: jest.fn(), image: { width: mockControl.textureWidth, height: mockControl.textureWidth / 2 } };
    mockSpies.textures.push(texture);
    return texture;
  }),
}));

jest.mock('three', () => ({
  PerspectiveCamera: class {
    fov: number;
    aspect: number;
    rotation = { x: 0, y: 0, order: 'XYZ' };
    updateProjectionMatrix = jest.fn();
    constructor(fov: number, aspect: number) {
      this.fov = fov;
      this.aspect = aspect;
      mockSpies.cameras.push(this);
    }
  },
  Scene: class {
    add = jest.fn();
    constructor() {
      mockSpies.scenes.push(this);
    }
  },
  SphereGeometry: class {
    args: number[];
    scale = jest.fn();
    dispose = jest.fn();
    constructor(...args: number[]) {
      this.args = args;
      mockSpies.geometries.push(this);
    }
  },
  MeshBasicMaterial: class {
    map: FakeTexture | null = null;
    needsUpdate = false;
    dispose = jest.fn();
    constructor() {
      mockSpies.materials.push(this);
    }
  },
  Mesh: class {
    rotation = { x: 0, y: 0, z: 0 };
    geometry: FakeGeometry;
    material: FakeMaterial;
    constructor(geometry: FakeGeometry, material: FakeMaterial) {
      this.geometry = geometry;
      this.material = material;
      mockSpies.meshes.push(this);
    }
  },
  MathUtils: { degToRad: (degrees: number) => (degrees * Math.PI) / 180 },
  SRGBColorSpace: 'srgb',
}));

const { loadAsync: mockLoadAsync } = jest.requireMock('expo-three') as { loadAsync: jest.Mock };


const en = defaultLabels.en;

const STAGE_WIDTH = 400;
const HEIGHT = 300;
const FOV = 75;
const DEG_PER_PX = FOV / STAGE_WIDTH;

const SOURCE = { uri: 'https://x/pano.jpg' };

const wrap = (ui: ReactElement) => render(<WayfindUiKitProvider locale="en">{ui}</WayfindUiKitProvider>);

type Rendered = Awaited<ReturnType<typeof wrap>>;

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style) as Record<string, unknown>;


// Microtasks (the texture promise) and then a few frames (the
// GL loop and the inertia both ride requestAnimationFrame,
// which the test environment runs on zero timeouts)
const settle = async (ms = 30) => {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const layOut = async (r: Rendered) => {
  await fireEvent(r.getByTestId('wayfinduikit-stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: STAGE_WIDTH, height: HEIGHT } } });
};

const mount = async (ui: ReactElement) => {
  const r = await wrap(ui);
  await layOut(r);
  await settle();
  return r;
};


// Where the stage should put a point, by the same projection
const camera = (viewYaw: number, viewPitch = 0) => ({ yaw: viewYaw, pitch: viewPitch, fovDeg: FOV, width: STAGE_WIDTH, height: HEIGHT });

const expectedMarkerLeft = (viewYaw: number, targetYaw = 0) => projectToScreen({ yaw: targetYaw }, camera(viewYaw)).x - MARKER_SIZE / 2;

const markerLeft = (r: Rendered) => flat(r.getByTestId('wayfinduikit-stage-marker')).left as number;
const markerTop = (r: Rendered) => flat(r.getByTestId('wayfinduikit-stage-marker')).top as number;
const markerLabel = (r: Rendered) => r.getByTestId('wayfinduikit-marker').props.accessibilityLabel as string;
const markerPinned = (r: Rendered) => flat(r.getByTestId('wayfinduikit-marker-disc').parent as { props: { style?: unknown } }).backgroundColor === 'transparent';


// A single-finger event as the responder system hands it over:
// where the finger is now and where it was on the previous event
interface Finger {
  x: number;
  y: number;
}

const touch = (now: Finger | null, before: Finger | null, t: number) => ({
  nativeEvent: { touches: now ? [{ pageX: now.x, pageY: now.y }] : [], timestamp: t },
  touchHistory: {
    numberActiveTouches: now ? 1 : 0,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: t,
    touchBank: now
      ? [
          {
            touchActive: true,
            currentPageX: now.x,
            currentPageY: now.y,
            currentTimeStamp: t,
            previousPageX: (before ?? now).x,
            previousPageY: (before ?? now).y,
            previousTimeStamp: t - 16,
            startPageX: (before ?? now).x,
            startPageY: (before ?? now).y,
            startTimeStamp: t - 16,
          },
        ]
      : [],
  },
});

type Handlers = { props: Record<string, (event: unknown) => unknown> };

const stageOf = (r: Rendered) => r.getByTestId('wayfinduikit-stage') as unknown as Handlers;

const press = async (r: Rendered, at: Finger, t: number) => {
  await act(async () => {
    stageOf(r).props.onResponderGrant(touch(at, at, t));
  });
};

const drag = async (r: Rendered, from: Finger, to: Finger, t: number) => {
  await act(async () => {
    stageOf(r).props.onResponderMove(touch(to, from, t));
  });
};

const lift = async (r: Rendered, t: number) => {
  await act(async () => {
    stageOf(r).props.onResponderRelease(touch(null, null, t));
  });
};

// A slow drag: seconds between events, so the release carries
// no fling and the view stays exactly where the finger left it
const dragBy = async (r: Rendered, dx: number, dy = 0) => {
  const from = { x: 300, y: 150 };
  await press(r, from, 1000);
  await drag(r, from, { x: from.x + dx, y: from.y + dy }, 2000);
  await drag(r, { x: from.x + dx, y: from.y + dy }, { x: from.x + dx, y: from.y + dy }, 3000);
  await lift(r, 3000);
};


beforeEach(() => {
  mockControl.rendererThrows = false;
  mockControl.glViewThrows = false;
  mockControl.loadFails = false;
  mockControl.holdLoad = false;
  mockControl.releaseLoad = null;
  mockControl.lateContextMs = 0;
  mockControl.textureWidth = 4096;
  mockControl.glViewRenders.mockClear();
  mockGl.endFrameEXP.mockClear();
  mockLoadAsync.mockClear();
  for (const list of Object.values(mockSpies)) list.length = 0;
});




describe('PanoramaStage sphere', () => {

  it('mounts the sphere, draws a frame and lands the texture on the inside-out mesh', async () => {
    const r = await mount(<PanoramaStage source={SOURCE} targetLabel="Room 114" height={HEIGHT} />);

    expect(r.getByTestId('wayfinduikit-stage-gl')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-flat-stage')).toBeNull();
    expect(mockControl.glViewRenders).toHaveBeenCalled();


    // One renderer on the fake context however often the surface
    // re-rendered around it, one frame presented
    expect(mockSpies.renderers).toHaveLength(1);
    const [renderer] = mockSpies.renderers;
    expect(renderer.render).toHaveBeenCalled();
    expect(mockGl.endFrameEXP).toHaveBeenCalled();


    // The sphere as specified, mirrored, turned so the photo's
    // centre column faces yaw 0, and the camera turning yaw first
    const [geometry] = mockSpies.geometries;
    expect(geometry.args).toEqual([10, 64, 32]);
    expect(geometry.scale).toHaveBeenCalledWith(-1, 1, 1);
    const [mesh] = mockSpies.meshes;
    expect(mesh.rotation.y).toBeCloseTo(-Math.PI / 2);
    const [cam] = mockSpies.cameras;
    expect(cam.rotation.order).toBe('YXZ');
    // The camera's vertical fov derived from the 75° horizontal
    // at the buffer's 4:3 aspect
    const vertical = (2 * Math.atan(Math.tan((FOV / 2) * (Math.PI / 180)) * (600 / 800)) * 180) / Math.PI;
    expect(cam.fov).toBeCloseTo(vertical, 5);
    expect(cam.updateProjectionMatrix).toHaveBeenCalled();


    // The texture went on the material, the mesh into the scene
    expect(mockLoadAsync).toHaveBeenCalledWith('https://x/pano.jpg');
    const [texture] = mockSpies.textures;
    const [material] = mockSpies.materials;
    expect(material.map).toBe(texture);
    expect(material.needsUpdate).toBe(true);
    expect(texture.colorSpace).toBe('srgb');
    expect(mockSpies.scenes[0].add).toHaveBeenCalledWith(mesh);


    expect(r.getByTestId('wayfinduikit-stage-surface').props.accessibilityLabel).toBe(en.stageA11y('Room 114'));
    expect(r.getByText(en.stageHint360)).toBeTruthy();
  });


  it('resolves a stored reference through the env and passes a bundled asset as it is', async () => {
    const r = await render(
      <WayfindUiKitProvider locale="en" env={{ resolveImageUrl: (url) => `https://cdn.example${url}` }}>
        <PanoramaStage source="/panos/step-1.jpg" height={HEIGHT} showHint={false} />
      </WayfindUiKitProvider>,
    );
    await settle();
    expect(mockLoadAsync).toHaveBeenLastCalledWith('https://cdn.example/panos/step-1.jpg');
    expect(r.queryByTestId('wayfinduikit-stage-hint')).toBeNull();


    await mount(<PanoramaStage source={7} height={HEIGHT} />);
    expect(mockLoadAsync).toHaveBeenLastCalledWith(7);
  });
});




describe('PanoramaStage frame', () => {

  type Vec = [number, number, number];

  // Turns about the vertical and the horizontal axis, as the
  // scene applies them (a positive angle about y carries +z
  // towards +x; about x carries +y towards +z)
  const rotY = ([x, y, z]: Vec, a: number): Vec => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
  const rotX = ([x, y, z]: Vec, a: number): Vec => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];

  // Where a photo feature ends up in the world: the sphere's
  // parametrisation puts texture column u at longitude u × 360°
  // from the negative x axis towards positive z and a row at
  // its latitude, the photo's top up; the stage then mirrors x
  // by the geometry scale it asked for and turns the mesh by
  // the yaw it set. The centre column is u = ½, so a feature at
  // photo yaw Y sits at u = ½ + Y / 360
  const featureDirection = (photoYaw: number, pitchDeg: number): Vec => {
    const [mirror] = mockSpies.geometries[0].scale.mock.calls[0] as [number, number, number];
    const lon = (0.5 + photoYaw / 360) * 2 * Math.PI;
    const lat = (pitchDeg * Math.PI) / 180;
    const raw: Vec = [-Math.cos(lon) * Math.cos(lat) * mirror, Math.sin(lat), Math.sin(lon) * Math.cos(lat)];
    return rotY(raw, mockSpies.meshes[0].rotation.y);
  };

  // What the camera drew that direction at: yaw then pitch
  // undone (the camera's own order), the pinhole looking down
  // negative z with the focal length that fills the width
  const drawnAt = (d: Vec) => {
    const cam = mockSpies.cameras[0].rotation;
    const [x, y, z] = rotX(rotY(d, -cam.y), -cam.x);
    const focal = STAGE_WIDTH / 2 / Math.tan((FOV / 2) * (Math.PI / 180));
    return { x: STAGE_WIDTH / 2 + (focal * x) / -z, y: HEIGHT / 2 - (focal * y) / -z, inFront: -z > 0 };
  };


  it('draws the photo\'s centre column straight ahead at yaw 0, growing to the right', async () => {
    await mount(<PanoramaStage source={SOURCE} height={HEIGHT} />);


    const centre = featureDirection(0, 0);
    expect(centre[0]).toBeCloseTo(0, 9);
    expect(centre[2]).toBeCloseTo(-1, 9);
    expect(mockSpies.cameras[0].rotation.y).toBeCloseTo(0, 9);
    expect(drawnAt(centre).x).toBeCloseTo(STAGE_WIDTH / 2, 6);
    // 90° into the photo's right half is the camera's right
    expect(featureDirection(90, 0)[0]).toBeCloseTo(1, 9);
    // The photo's edges meet straight behind
    expect(featureDirection(180, 0)[2]).toBeCloseTo(1, 9);
    expect(featureDirection(-180, 0)[2]).toBeCloseTo(1, 9);
  });


  it('lands the marker and a hotspot on the very texture feature the camera drew there', async () => {
    const hotspots: KitHotspot[] = [{ id: 'sign', yaw: -20, pitch: 15, kind: 'info' }];
    const r = await mount(<PanoramaStage source={SOURCE} targetYaw={30} hotspots={hotspots} height={HEIGHT} />);


    // The view turned 18.75° right and 7.5° up; the camera wrote
    // the same angles the overlay projects with, opposite sign
    // about the vertical
    await dragBy(r, -100, 40);
    await settle();
    const cam = mockSpies.cameras[0].rotation;
    expect(cam.y).toBeCloseTo((-18.75 * Math.PI) / 180, 9);
    expect(cam.x).toBeCloseTo((7.5 * Math.PI) / 180, 9);


    const target = drawnAt(featureDirection(30, 0));
    expect(target.inFront).toBe(true);
    expect(markerLeft(r)).toBeCloseTo(target.x - MARKER_SIZE / 2, 6);
    expect(markerTop(r)).toBeCloseTo(target.y - MARKER_SIZE / 2, 6);
    expect(target.x).toBeCloseTo(projectToScreen({ yaw: 30 }, camera(18.75, 7.5)).x, 6);
    expect(target.x).toBeGreaterThan(STAGE_WIDTH / 2);

    const sign = drawnAt(featureDirection(-20, 15));
    expect(flat(r.getByTestId('wayfinduikit-hotspot-sign')).left).toBeCloseTo(sign.x - 18, 6);
    expect(flat(r.getByTestId('wayfinduikit-hotspot-sign')).top).toBeCloseTo(sign.y - 18, 6);
    expect(sign.x).toBeLessThan(STAGE_WIDTH / 2);
    expect(sign.y).toBeLessThan(HEIGHT / 2);
  });
});




describe('PanoramaStage marker', () => {

  it('anchors the marker on the target and moves it with a drag through the projection', async () => {
    const r = await mount(<PanoramaStage source={SOURCE} targetYaw={0} targetLabel="Room 114" height={HEIGHT} />);

    expect(markerLeft(r)).toBe(STAGE_WIDTH / 2 - MARKER_SIZE / 2);
    expect(markerLabel(r)).toBe(en.markerAligned);
    expect(markerPinned(r)).toBe(false);
    expect(r.getByText('Room 114')).toBeTruthy();


    // A finger going 100 px left looks 18.75° to the right, so
    // the target now sits that far to the LEFT of centre
    await dragBy(r, -100);
    expect(markerLeft(r)).toBeCloseTo(expectedMarkerLeft(100 * DEG_PER_PX), 6);
    expect(markerLabel(r)).toBe(en.markerA11y(-19));
    expect(markerPinned(r)).toBe(false);


    // Far enough round that the target is behind: pinned at the
    // left inset, halo gone, the true angle kept
    await dragBy(r, -800);
    expect(markerLeft(r)).toBe(8);
    expect(markerPinned(r)).toBe(true);
    expect(markerLabel(r)).toBe(en.markerA11y(-169));


    // A still release does not fling
    await settle();
    expect(markerLeft(r)).toBe(8);
  });


  it('takes the first sensor sample as an offset and eases the later ones', async () => {
    const stage = (orientation: { alpha: number; beta: number; gamma: number } | null) => (
      <WayfindUiKitProvider locale="en">
        <PanoramaStage source={SOURCE} targetYaw={0} height={HEIGHT} orientation={orientation} />
      </WayfindUiKitProvider>
    );
    // Rendered without the wrap helper: rerender must hand back
    // the same tree shape, or the stage would remount
    const r = await render(stage(null));
    await layOut(r);
    await settle();
    expect(markerLeft(r)).toBe(STAGE_WIDTH / 2 - MARKER_SIZE / 2);


    // Switching the gyro on with the device already turned must
    // not move the view
    await r.rerender(stage({ alpha: 10, beta: 90, gamma: 0 }));
    expect(markerLeft(r)).toBe(STAGE_WIDTH / 2 - MARKER_SIZE / 2);
    expect(markerLabel(r)).toBe(en.markerAligned);


    // A 30° clockwise turn of the device is a real turn: applied
    // whole, the view now faces 30 and the target sits 30 left
    await r.rerender(stage({ alpha: -20, beta: 90, gamma: 0 }));
    expect(markerLeft(r)).toBeCloseTo(expectedMarkerLeft(30), 6);
    expect(markerLabel(r)).toBe(en.markerA11y(-30));


    // A 1° wobble crawls: the view moves towards 31 but lands
    // well short of it on this sample
    await r.rerender(stage({ alpha: -21, beta: 90, gamma: 0 }));
    const wobbled = markerLeft(r);
    expect(wobbled).toBeLessThan(expectedMarkerLeft(30));
    expect(wobbled).toBeGreaterThan(expectedMarkerLeft(31));
    expect(wobbled - expectedMarkerLeft(30)).toBeGreaterThan((expectedMarkerLeft(31) - expectedMarkerLeft(30)) / 2);


    // Tipping the top back 10° looks up (a real move, applied
    // whole along with the remaining yaw), and the target drops
    // below centre by the projection's own reckoning
    await r.rerender(stage({ alpha: -21, beta: 100, gamma: 0 }));
    const tilted = projectToScreen({ yaw: 0 }, camera(31, 10));
    expect(markerTop(r)).toBeCloseTo(tilted.y - MARKER_SIZE / 2, 6);
    expect(markerLeft(r)).toBeCloseTo(tilted.x - MARKER_SIZE / 2, 6);
    expect(tilted.y).toBeGreaterThan(HEIGHT / 2);


    // Off and on again: a fresh first sample, no jump
    await r.rerender(stage(null));
    await r.rerender(stage({ alpha: 200, beta: 40, gamma: 0 }));
    expect(markerLeft(r)).toBeCloseTo(tilted.x - MARKER_SIZE / 2, 6);
    expect(markerTop(r)).toBeCloseTo(tilted.y - MARKER_SIZE / 2, 6);
  });


  it('draws no marker without a target yaw', async () => {
    const r = await mount(<PanoramaStage source={SOURCE} height={HEIGHT} />);
    expect(r.queryByTestId('wayfinduikit-marker')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-stage-marker')).toBeNull();
  });
});




describe('PanoramaStage hotspots', () => {

  const hotspots: KitHotspot[] = [
    { id: 'h1', yaw: 30, kind: 'link', label: 'Corridor' },
    { id: 'h2', yaw: 180, kind: 'info' },
    { id: 'up', yaw: 0, pitch: 20, kind: 'route' },
  ];


  it('places hotspots by the projection, hides the ones off the viewport, and taps through', async () => {
    const onPressHotspot = jest.fn();
    const r = await mount(<PanoramaStage source={SOURCE} hotspots={hotspots} onPressHotspot={onPressHotspot} height={HEIGHT} />);


    // Facing 0: h1 is 30° right and inside the 75° window, h2
    // is behind, the pitched one sits above centre
    expect(r.getByText('Corridor')).toBeTruthy();
    expect(flat(r.getByTestId('wayfinduikit-hotspot-h1')).left).toBeCloseTo(projectToScreen({ yaw: 30 }, camera(0)).x - 18, 6);
    expect(r.queryByTestId('wayfinduikit-hotspot-h2')).toBeNull();
    expect(flat(r.getByTestId('wayfinduikit-hotspot-up')).top).toBeCloseTo(projectToScreen({ yaw: 0, pitch: 20 }, camera(0)).y - 18, 6);
    expect((flat(r.getByTestId('wayfinduikit-hotspot-up')).top as number) < HEIGHT / 2 - 18).toBe(true);

    await fireEvent.press(r.getByTestId('wayfinduikit-hotspot-h1'));
    expect(onPressHotspot).toHaveBeenCalledTimes(1);
    expect(onPressHotspot).toHaveBeenCalledWith(hotspots[0]);


    // Facing -30 (a finger going right): h1 is now 60° right,
    // past the window's edge, and gone
    await dragBy(r, 160);
    expect(r.queryByTestId('wayfinduikit-hotspot-h1')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-hotspot-h2')).toBeNull();
    expect(r.getByTestId('wayfinduikit-hotspot-up')).toBeTruthy();
  });
});




describe('PanoramaStage yaw report', () => {

  it('reports whole degrees only once the view moved 3° or more', async () => {
    const onYawChange = jest.fn();
    const r = await mount(<PanoramaStage source={SOURCE} onYawChange={onYawChange} height={HEIGHT} />);
    expect(onYawChange.mock.calls).toEqual([[0]]);


    // 1 px is 0.1875°: 10 px stays quiet, 16 px is exactly 3°
    // and speaks, 20 px is under the step from there
    const from = { x: 300, y: 150 };
    await press(r, from, 1000);
    await drag(r, from, { x: 290, y: 150 }, 2000);
    await drag(r, { x: 290, y: 150 }, { x: 284, y: 150 }, 3000);
    await drag(r, { x: 284, y: 150 }, { x: 280, y: 150 }, 4000);
    expect(onYawChange.mock.calls).toEqual([[0], [3]]);
  });


  it('honours initialYaw and measures the short way across the seam', async () => {
    const onYawChange = jest.fn();
    const r = await mount(<PanoramaStage source={SOURCE} initialYaw={359} targetYaw={0} onYawChange={onYawChange} height={HEIGHT} />);
    expect(onYawChange.mock.calls).toEqual([[359]]);
    expect(markerLabel(r)).toBe(en.markerAligned);


    // 359 → 1 is two degrees (quiet); 359 → 2 is three
    await dragBy(r, -2 / DEG_PER_PX);
    expect(onYawChange).toHaveBeenCalledTimes(1);
    await dragBy(r, -1 / DEG_PER_PX);
    expect(onYawChange.mock.calls).toEqual([[359], [2]]);
  });


  it('keeps turning briefly after a fling, then stops', async () => {
    const onYawChange = jest.fn();
    const r = await mount(<PanoramaStage source={SOURCE} onYawChange={onYawChange} height={HEIGHT} />);


    // Two quick moves give the release a velocity of 2.5 px/ms
    const from = { x: 300, y: 150 };
    await press(r, from, 1000);
    await drag(r, from, { x: 290, y: 150 }, 1100);
    await drag(r, { x: 290, y: 150 }, { x: 250, y: 150 }, 1116);
    await lift(r, 1116);
    const atRelease = onYawChange.mock.calls.length;
    expect(onYawChange).toHaveBeenLastCalledWith(9);


    // Let the inertia run down: settle until a round adds nothing
    let calls = -1;
    for (let round = 0; round < 20 && calls !== onYawChange.mock.calls.length; round++) {
      calls = onYawChange.mock.calls.length;
      await settle(60);
    }
    expect(onYawChange.mock.calls.length).toBeGreaterThan(atRelease);
    const [finalYaw] = onYawChange.mock.calls[onYawChange.mock.calls.length - 1] as [number];
    expect(finalYaw).toBeGreaterThan(40);
    expect(finalYaw).toBeLessThan(180);
  });
});




describe('PanoramaStage fallbacks', () => {

  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });


  it('falls back to the flat stage when the context fails to create, under auto only', async () => {
    mockControl.rendererThrows = true;

    const auto = await wrap(<PanoramaStage source={SOURCE} targetYaw={0} height={HEIGHT} />);
    await settle();
    expect(auto.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
    expect(auto.queryByTestId('wayfinduikit-stage')).toBeNull();
    expect(mockGl.endFrameEXP).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sphere context failed'), expect.anything());
    await auto.unmount();


    const sphere = await wrap(<PanoramaStage source={SOURCE} targetYaw={0} height={HEIGHT} renderer="sphere" />);
    await settle();
    expect(sphere.getByTestId('wayfinduikit-stage')).toBeTruthy();
    expect(sphere.queryByTestId('wayfinduikit-flat-stage')).toBeNull();
    // The marker still points, photo or no photo
    expect(sphere.getByTestId('wayfinduikit-marker')).toBeTruthy();
  });


  it('falls back when the texture fails to load', async () => {
    mockControl.loadFails = true;
    const r = await wrap(<PanoramaStage source={SOURCE} height={HEIGHT} />);
    await settle();

    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-stage')).toBeNull();
    // The failed surface was released on the way out
    expect(mockSpies.renderers[0].dispose).toHaveBeenCalled();
  });


  it('falls back when the GL view crashes in render', async () => {
    mockControl.glViewThrows = true;
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const r = await wrap(<PanoramaStage source={SOURCE} height={HEIGHT} />);
    await settle();
    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-stage')).toBeNull();

    error.mockRestore();
  });


  it('tries the sphere again for the next photo', async () => {
    mockControl.loadFails = true;
    const stage = (uri: string) => (
      <WayfindUiKitProvider locale="en">
        <PanoramaStage source={{ uri }} height={HEIGHT} />
      </WayfindUiKitProvider>
    );
    const r = await render(stage('https://x/broken.jpg'));
    await settle();
    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();


    mockControl.loadFails = false;
    await r.rerender(stage('https://x/fine.jpg'));
    await settle();
    expect(r.getByTestId('wayfinduikit-stage')).toBeTruthy();
    expect(mockLoadAsync).toHaveBeenLastCalledWith('https://x/fine.jpg');
  });


  it('keeps a remembered failure when the host re-renders with a fresh { uri } of the same photo', async () => {
    mockControl.loadFails = true;
    const stage = (uri: string) => (
      <WayfindUiKitProvider locale="en">
        <PanoramaStage source={{ uri }} height={HEIGHT} />
      </WayfindUiKitProvider>
    );
    const r = await render(stage('https://x/broken.jpg'));
    await settle();
    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
    expect(mockLoadAsync).toHaveBeenCalledTimes(1);
    const surfaces = mockControl.glViewRenders.mock.calls.length;


    // Two host renders of the same photo: still flat, no new
    // surface, no new renderer, no new load
    await r.rerender(stage('https://x/broken.jpg'));
    await settle();
    await r.rerender(stage('https://x/broken.jpg'));
    await settle();
    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-stage')).toBeNull();
    expect(mockLoadAsync).toHaveBeenCalledTimes(1);
    expect(mockSpies.renderers).toHaveLength(1);
    expect(mockControl.glViewRenders.mock.calls.length).toBe(surfaces);
    expect(warn).toHaveBeenCalledTimes(1);
  });


  it("'flat' faces initialYaw too, reporting it once", async () => {
    const onYawChange = jest.fn();
    const r = await wrap(<PanoramaStage source={SOURCE} renderer="flat" initialYaw={90} targetYaw={90} onYawChange={onYawChange} height={HEIGHT} />);
    await fireEvent(r.getByTestId('wayfinduikit-flat-stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: STAGE_WIDTH, height: HEIGHT } } });

    expect(onYawChange.mock.calls).toEqual([[90]]);
    expect(markerLabel(r)).toBe(en.markerAligned);
  });


  it("'flat' never touches GL", async () => {
    const r = await wrap(<PanoramaStage source={SOURCE} targetYaw={0} height={HEIGHT} renderer="flat" />);
    await settle();

    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
    expect(mockControl.glViewRenders).not.toHaveBeenCalled();
    expect(mockLoadAsync).not.toHaveBeenCalled();
    expect(mockSpies.renderers).toHaveLength(0);
  });


  it('warns once in development about a texture wider than 4096 px and still renders it', async () => {
    mockControl.textureWidth = 8192;
    const huge = { uri: 'https://x/huge.jpg' };

    const first = await mount(<PanoramaStage source={huge} height={HEIGHT} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('8192'));
    expect(mockSpies.materials[0].map).toBe(mockSpies.textures[0]);
    expect(first.getByTestId('wayfinduikit-stage')).toBeTruthy();
    await first.unmount();


    await mount(<PanoramaStage source={huge} height={HEIGHT} />);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});




describe('PanoramaStage photo identity', () => {

  const stage = (uri: string) => (
    <WayfindUiKitProvider locale="en">
      <PanoramaStage source={{ uri }} height={HEIGHT} />
    </WayfindUiKitProvider>
  );


  it('keeps the hint and the texture across a host re-render with a fresh { uri } of the same photo', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const r = await render(stage('https://x/one.jpg'));
    await layOut(r);
    await settle();
    expect(mockSpies.textures).toHaveLength(1);
    const hintsShown = timing.mock.calls.length;


    await r.rerender(stage('https://x/one.jpg'));
    await settle();
    expect(timing.mock.calls.length).toBe(hintsShown);
    expect(mockLoadAsync).toHaveBeenCalledTimes(1);
    expect(mockSpies.textures).toHaveLength(1);


    // A different uri is a new photo: a fresh hint, a new texture
    await r.rerender(stage('https://x/two.jpg'));
    await settle();
    expect(timing.mock.calls.length).toBe(hintsShown + 1);
    expect(mockSpies.textures).toHaveLength(2);
    timing.mockRestore();
  });
});




describe('PanoramaStage teardown', () => {

  it('releases the renderer, geometry, material, texture and the frame loop on unmount', async () => {
    const r = await mount(<PanoramaStage source={SOURCE} height={HEIGHT} />);
    const [renderer] = mockSpies.renderers;
    const [geometry] = mockSpies.geometries;
    const [material] = mockSpies.materials;
    const [texture] = mockSpies.textures;
    const cancel = jest.spyOn(global, 'cancelAnimationFrame');


    await r.unmount();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
    expect(texture.dispose).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalled();


    // No frame after the last one
    const frames = mockGl.endFrameEXP.mock.calls.length;
    await settle();
    expect(mockGl.endFrameEXP.mock.calls.length).toBe(frames);
    cancel.mockRestore();
  });


  it('releases a context that arrives after the stage has gone and starts no frame loop', async () => {
    mockControl.lateContextMs = 20;
    const r = await wrap(<PanoramaStage source={SOURCE} height={HEIGHT} renderer="sphere" />);
    await r.unmount();
    expect(mockSpies.renderers).toHaveLength(0);


    // The surface delivers regardless: the scene is built, then
    // released on the spot — never drawn, never looped, and the
    // texture never asked for
    await settle(40);
    expect(mockSpies.renderers).toHaveLength(1);
    const [renderer] = mockSpies.renderers;
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(mockSpies.geometries[0].dispose).toHaveBeenCalledTimes(1);
    expect(mockSpies.materials[0].dispose).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(mockGl.endFrameEXP).not.toHaveBeenCalled();
    expect(mockLoadAsync).not.toHaveBeenCalled();

    await settle(40);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(mockGl.endFrameEXP).not.toHaveBeenCalled();
  });


  it('releases a texture that lands after the stage has gone', async () => {
    mockControl.holdLoad = true;
    const r = await mount(<PanoramaStage source={SOURCE} height={HEIGHT} />);
    expect(mockSpies.textures).toHaveLength(0);
    await r.unmount();


    await act(async () => {
      mockControl.releaseLoad?.();
    });
    await settle();
    expect(mockSpies.textures).toHaveLength(1);
    expect(mockSpies.textures[0].dispose).toHaveBeenCalledTimes(1);
    expect(mockSpies.scenes[0].add).not.toHaveBeenCalled();
    expect(mockSpies.materials[0].map).toBeNull();
  });


  it('swaps the texture for a new photo on the same surface and releases the old one', async () => {
    const stage = (uri: string) => (
      <WayfindUiKitProvider locale="en">
        <PanoramaStage source={{ uri }} height={HEIGHT} />
      </WayfindUiKitProvider>
    );
    const r = await render(stage('https://x/one.jpg'));
    await settle();
    const [first] = mockSpies.textures;


    await r.rerender(stage('https://x/two.jpg'));
    await settle();
    expect(mockSpies.renderers).toHaveLength(1);
    expect(mockSpies.textures).toHaveLength(2);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(mockSpies.materials[0].map).toBe(mockSpies.textures[1]);
    expect(mockSpies.scenes[0].add).toHaveBeenCalledTimes(1);
  });
});
