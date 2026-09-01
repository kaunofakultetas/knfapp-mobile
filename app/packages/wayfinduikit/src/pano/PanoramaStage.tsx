// -----------------------------------------------------------
//  [*] wayfinduikit — PanoramaStage
//
//  The true-sphere panorama: the photo wrapped around the
//  inside of a sphere, seen through a pinhole camera at its
//  centre and drawn on a GL surface, so a drag turns the
//  camera instead of sliding a picture — straight lines stay
//  straight, the ceiling is overhead, the seam is nowhere.
//  The three GL peers are OPTIONAL: they are required at
//  render time, never at import time, so a host without them
//  still bundles the kit and simply gets the flat stage from
//  this same component. `renderer` picks the surface —
//  'sphere' insists on GL, 'flat' never touches it, and 'auto'
//  (the default) tries the sphere and falls back to the flat
//  stage when the surface cannot be created, the photo cannot
//  be loaded as a texture, or the GL view crashes in render.
//
//  The view is one pair of angles — yaw around the vertical,
//  pitch above the horizon — in the photo's own frame, the
//  one the flat stage and the routing engine use (yaw 0 is the
//  photo's CENTRE column, growing to the right; the edges are
//  ±180). Three things move it. A drag, at
//  fov / width degrees per pixel so the photo follows the
//  finger, with a short inertia after a fling. A sensor sample
//  through `orientation`: the FIRST sample only records an
//  offset between the sensor and the view as it stands, so
//  switching the gyro on never jumps the picture; later
//  samples move the view towards sensor + offset by a step
//  that shrinks with the delta — a small wobble crawls, a real
//  turn lands at once — and a drag under gyro control shifts
//  the offset along with it instead of fighting the sensor.
//  The GL loop reads the angles once per frame and draws only
//  when they (or the texture) changed since the last frame.
//
//  The chrome — route marker, hotspots, hint — is ordinary
//  views laid over the surface, placed by projectToScreen with
//  the very angles the camera draws with. Hotspots vanish once
//  off the viewport (a pinned hotspot invites a tap on
//  nothing); the route marker is clamped to the edges instead
//  and keeps its true angle, so it always leans the short way
//  round. The yaw goes out through onYawChange under the flat
//  stage's rule: whole degrees, once it moved three of them.
//
//  Textures wider than 4096 px exceed what many mobile GPUs
//  allot to one texture; such a photo is still handed to the
//  renderer (the driver downsamples or rejects it, and a
//  rejection is the flat fallback's cue) with a one-time
//  warning in development, keyed on the source. A photo is
//  told from the next by its key (the flat stage's rule: the
//  uri string, the asset number, or the uri inside a { uri }
//  object), so a host re-rendering with a fresh object of the
//  same uri neither restarts the hint nor forgets a failure.
//
//  Split into (root component last):
//
//    loadGlPeers    — the lazy require of the three peers
//    verticalFovDeg — the camera's fov from the stage's own
//    gyroAngles     — one sensor sample as yaw / pitch
//    gyroStep       — how much of a sensor delta applies
//    useViewAngles  — drag, inertia and gyro → the view
//    SphereSurface  — the GL surface and the scene's lifetime
//    HotspotChip    — one tappable hotspot over the surface
//    HintPill       — the fading "drag to look around" hint
//    StageBoundary  — catches a crash inside the GL view
//    SphereStage    — the sphere with its chrome
//    PanoramaStage  — picks the surface (default export)
//
//  Used by:
//    - the host app, through the root export
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent, PanResponderInstance, StyleProp, ViewStyle } from 'react-native';

import type { KitHotspot } from '../core/types';
import { useKitEnv, useKitLabels, useKitTheme } from '../provider';
import DirectionMarker, { MARKER_SIZE } from './DirectionMarker';
import FlatPanorama, { panoSourceKey, type FlatPanoramaProps, type PanoSourceKey } from './FlatPanorama';
import { clampToEdge, projectToScreen, shortestArcDeg } from './projection';


// One sensor sample in degrees, the usual device triple:
// alpha turns about the vertical (growing counter-clockwise
// seen from above), beta tilts front-to-back, gamma side-to-
// side. Only DIFFERENCES from the first sample ever reach the
// view, so the host may hand in the raw device frame
export interface StageOrientation {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface PanoramaStageProps extends FlatPanoramaProps {
  orientation?: StageOrientation | null;
  // The HORIZONTAL field of view; the vertical one follows the
  // stage's aspect. Sphere only, like `orientation`: the strip
  // has no lens
  fovDeg?: number;
  renderer?: 'sphere' | 'flat' | 'auto';
}

interface ViewAngles {
  yaw: number;
  pitch: number;
}

// The angles as the GL loop reads them: a plain object shared
// by reference, written by the gestures and the sensor on the
// JS side, read once per frame; `dirty` is the loop's cue that
// something changed since it last drew
interface SharedView extends ViewAngles {
  dirty: boolean;
}


// The slices of the three peers this file touches, spelled out
// structurally so the kit type-checks without their typings
// and a test knows exactly what a stand-in must provide
interface StageGl {
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  endFrameEXP: () => void;
}

interface StageRenderer {
  render: (scene: StageScene, camera: StageCamera) => void;
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
  dispose: () => void;
}

interface StageTexture {
  dispose: () => void;
  image?: { width?: number; height?: number } | null;
  colorSpace?: string;
}

interface StageCamera {
  fov: number;
  aspect: number;
  rotation: { x: number; y: number; order: string };
  updateProjectionMatrix: () => void;
}

interface StageGeometry {
  scale: (x: number, y: number, z: number) => unknown;
  dispose: () => void;
}

interface StageMaterial {
  map: StageTexture | null;
  needsUpdate: boolean;
  dispose: () => void;
}

interface StageMesh {
  rotation: { y: number };
}

interface StageScene {
  add: (object: StageMesh) => unknown;
}

interface ThreeLib {
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => StageCamera;
  Scene: new () => StageScene;
  SphereGeometry: new (radius: number, widthSegments: number, heightSegments: number) => StageGeometry;
  MeshBasicMaterial: new () => StageMaterial;
  Mesh: new (geometry: StageGeometry, material: StageMaterial) => StageMesh;
  MathUtils: { degToRad: (degrees: number) => number };
  SRGBColorSpace?: string;
}

interface GlPeers {
  GLView: ComponentType<{ style?: StyleProp<ViewStyle>; testID?: string; onContextCreate: (gl: StageGl) => void }>;
  Renderer: new (options: { gl: StageGl; width?: number; height?: number; clearColor?: string }) => StageRenderer;
  loadAsync: (source: string | number) => Promise<StageTexture>;
  three: ThreeLib;
}


const DEFAULT_FOV_DEG = 75;

// The camera never looks past the poles — straight up or down
// the yaw loses its meaning and the drag would spin the photo
const MAX_PITCH_DEG = 85;

const MAX_TEXTURE_PX = 4096;

// Any radius works from the centre; this one keeps the near
// plane comfortably inside
const SPHERE_RADIUS = 10;

// The host hears the yaw only once it moved this much
const YAW_REPORT_STEP_DEG = 3;

// Breathing room between a clamped marker and the stage edge
const MARKER_EDGE_INSET = 8;

const HOTSPOT_SIZE = 36;

// A press that travelled this far is a drag, even if it began
// on a hotspot
const DRAG_SLOP_PX = 4;

// The frame the fling velocity is expressed per
const FRAME_MS = 16;

// A fling loses this share of its speed each frame and stops
// once it turns less than the stop angle per frame
const INERTIA_DECAY = 0.92;
const INERTIA_STOP_DEG = 0.05;

// No single frame of inertia turns further than this — a wild
// fling should sweep the room, not whip around it
const MAX_FLING_DEG = 10;

// Of a sensor delta, at least the floor applies per sample and
// the whole of it once the delta reaches the full step
const GYRO_STEP_FLOOR = 0.12;
const GYRO_FULL_STEP_DEG = 10;

const HINT_HOLD_MS = 2600;
const HINT_FADE_MS = 600;


const HOTSPOT_GLYPH: Record<KitHotspot['kind'], ComponentProps<typeof Ionicons>['name']> = {
  route: 'navigate',
  link: 'arrow-forward-circle',
  info: 'information-circle',
};


const normaliseYaw = (yaw: number): number => ((yaw % 360) + 360) % 360;

const clampPitch = (pitch: number): number => Math.max(-MAX_PITCH_DEG, Math.min(MAX_PITCH_DEG, pitch));







// -----------------------------------------------------------
// loadGlPeers
// -----------------------------------------------------------
//
// The three optional peers, required on first use and kept —
// a peer that is missing now will not appear later, and one
// that is there need not be resolved per render. A module that
// resolves but lacks the pieces this file needs (a stub, a
// build without the surface) counts as absent too.
//
// Used by:
//   - PanoramaStage (below)
// -----------------------------------------------------------

let peersCache: GlPeers | null | undefined;

function loadGlPeers(): GlPeers | null {

  if (peersCache !== undefined) return peersCache;


  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const surface = require('expo-gl') as { GLView?: GlPeers['GLView'] };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bridge = require('expo-three') as { Renderer?: GlPeers['Renderer']; loadAsync?: GlPeers['loadAsync'] };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const three = require('three') as Partial<ThreeLib>;

    const complete =
      surface.GLView && bridge.Renderer && bridge.loadAsync && three.Scene && three.PerspectiveCamera && three.SphereGeometry && three.MeshBasicMaterial && three.Mesh && three.MathUtils;
    peersCache = complete ? { GLView: surface.GLView!, Renderer: bridge.Renderer!, loadAsync: bridge.loadAsync!, three: three as ThreeLib } : null;
  } catch {
    peersCache = null;
  }


  return peersCache;
}







// -----------------------------------------------------------
// verticalFovDeg
// -----------------------------------------------------------
//
// The GL camera's field of view is the VERTICAL one, while the
// stage's fovDeg (and projectToScreen's) spans the width — the
// two must describe the same pinhole or the marker would drift
// off the thing it points at. Same half-angle tangent, scaled
// by the aspect. A stage with no width yet keeps the square
// answer rather than dividing by zero.
//
// Used by:
//   - SphereSurface (below)
// -----------------------------------------------------------

function verticalFovDeg(horizontalFovDeg: number, width: number, height: number): number {

  if (!(width > 0) || !(height > 0)) return horizontalFovDeg;


  const halfTangent = Math.tan((horizontalFovDeg / 2) * (Math.PI / 180)) * (height / width);
  return (2 * Math.atan(halfTangent) * 180) / Math.PI;
}







// -----------------------------------------------------------
// gyroAngles
// -----------------------------------------------------------
//
// The upright-portrait reading of a sample: a counter-clockwise
// turn of the device (alpha up) is the walker turning LEFT, so
// the yaw is alpha negated; tipping the top back (beta up) is
// looking up. Where the device's zero sits does not matter —
// the first-sample offset absorbs any constant — so beta is
// taken as it comes. gamma is the side tilt, which does not
// move a portrait view.
//
// Used by:
//   - useViewAngles (below)
// -----------------------------------------------------------

function gyroAngles(sample: StageOrientation): ViewAngles {
  return { yaw: -sample.alpha, pitch: sample.beta };
}







// -----------------------------------------------------------
// gyroStep
// -----------------------------------------------------------
//
// The share of a sensor delta applied on one sample: the floor
// for a tiny delta (hand shake, which then crawls towards its
// mean instead of jittering the photo), the whole delta once
// it is a real turn. Linear in between, so the view never lags
// a deliberate movement by more than a sample or two.
//
// Used by:
//   - useViewAngles (below)
// -----------------------------------------------------------

function gyroStep(deltaDeg: number): number {
  return Math.min(1, GYRO_STEP_FLOOR + Math.abs(deltaDeg) / GYRO_FULL_STEP_DEG);
}







// -----------------------------------------------------------
// useViewAngles
// -----------------------------------------------------------
//
// The view's owner. The angles live twice on purpose: in the
// shared object the GL loop reads without a render, and in
// state, so the chrome over the surface re-renders when they
// move. Every write goes through commit, which normalises the
// yaw, clamps the pitch and sets both copies. The responder,
// built once, moves the view by the finger's delta since the
// previous event at the current degrees-per-pixel (read
// through a ref, so a stage that lays out wider mid-drag is
// right from the next event); a release with speed hands the
// remaining motion to a decaying frame loop. The sensor effect
// runs per sample and eases the view towards sensor + offset,
// except while a finger holds the view — then the offset moves
// with the finger and the sensor resumes on release.
//
// Used by:
//   - SphereStage (below)
// -----------------------------------------------------------

function useViewAngles({
  initialYaw,
  orientation,
  degPerPx,
}: {
  initialYaw: number;
  orientation: StageOrientation | null | undefined;
  degPerPx: number;
}): { view: ViewAngles; shared: SharedView; panHandlers: PanResponderInstance['panHandlers'] } {

  const shared = useRef<SharedView>({ yaw: normaliseYaw(initialYaw), pitch: 0, dirty: true }).current;
  const [view, setView] = useState<ViewAngles>({ yaw: shared.yaw, pitch: shared.pitch });


  // Sensor minus view at the moment the sensor came on, so the
  // sample that switched it on maps onto the view as it stood
  const offsetRef = useRef<ViewAngles | null>(null);
  const draggingRef = useRef(false);
  const inertiaRef = useRef<{ frame: number; vYaw: number; vPitch: number } | null>(null);
  const degPerPxRef = useRef(degPerPx);
  degPerPxRef.current = degPerPx;


  const commit = useCallback(
    (yaw: number, pitch: number) => {
      shared.yaw = normaliseYaw(yaw);
      shared.pitch = clampPitch(pitch);
      shared.dirty = true;
      setView({ yaw: shared.yaw, pitch: shared.pitch });
    },
    [shared],
  );

  // A relative move. Under sensor control the offset travels
  // with it, so a drag re-aims where the sensor points instead
  // of being undone by the next sample; the pitch is clamped
  // first and the offset takes only the delta that applied
  const nudge = useCallback(
    (dYaw: number, dPitch: number) => {
      const pitch = clampPitch(shared.pitch + dPitch);
      const offset = offsetRef.current;
      if (offset) offsetRef.current = { yaw: offset.yaw + dYaw, pitch: offset.pitch + (pitch - shared.pitch) };
      commit(shared.yaw + dYaw, pitch);
    },
    [commit, shared],
  );


  const stopInertia = useCallback(() => {
    if (!inertiaRef.current) return;
    cancelAnimationFrame(inertiaRef.current.frame);
    inertiaRef.current = null;
  }, []);

  const fling = useCallback(
    (vYaw: number, vPitch: number) => {
      stopInertia();
      if (Math.abs(vYaw) < INERTIA_STOP_DEG && Math.abs(vPitch) < INERTIA_STOP_DEG) return;


      const motion = { frame: 0, vYaw, vPitch };
      inertiaRef.current = motion;
      const tick = () => {
        nudge(motion.vYaw, motion.vPitch);
        motion.vYaw *= INERTIA_DECAY;
        motion.vPitch *= INERTIA_DECAY;
        if (Math.abs(motion.vYaw) < INERTIA_STOP_DEG && Math.abs(motion.vPitch) < INERTIA_STOP_DEG) {
          inertiaRef.current = null;
          return;
        }
        motion.frame = requestAnimationFrame(tick);
      };
      motion.frame = requestAnimationFrame(tick);
    },
    [nudge, stopInertia],
  );

  // A stage unmounting mid-fling must not keep turning
  useEffect(() => stopInertia, [stopInertia]);


  // Built once: the handlers above are stable (they close over
  // refs and the shared object only), so the responder never
  // goes stale. The finger's delta is taken per event, not from
  // the grant, which is what lets the offset ride along
  const responderRef = useRef<PanResponderInstance | null>(null);
  if (!responderRef.current) {
    const last = { dx: 0, dy: 0 };
    const isDrag = (_event: unknown, g: { dx: number; dy: number }) => Math.abs(g.dx) + Math.abs(g.dy) > DRAG_SLOP_PX;
    const flingSpeed = (pxPerMs: number) => Math.max(-MAX_FLING_DEG, Math.min(MAX_FLING_DEG, pxPerMs * degPerPxRef.current * FRAME_MS));

    responderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: isDrag,
      // A press that began on a hotspot and then travelled is a
      // drag of the stage — the chip lets go
      onMoveShouldSetPanResponderCapture: isDrag,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        stopInertia();
        draggingRef.current = true;
        last.dx = 0;
        last.dy = 0;
      },
      onPanResponderMove: (_event, g) => {
        // The photo follows the finger: a finger going left
        // reveals what lies to the right, a finger going down
        // reveals what lies above
        const scale = degPerPxRef.current;
        nudge(-(g.dx - last.dx) * scale, (g.dy - last.dy) * scale);
        last.dx = g.dx;
        last.dy = g.dy;
      },
      onPanResponderRelease: (_event, g) => {
        draggingRef.current = false;
        fling(flingSpeed(-g.vx), flingSpeed(g.vy));
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
      },
    });
  }


  // One sample, one step. A null sample forgets the offset, so
  // the sensor coming back takes a fresh first sample and again
  // starts from wherever the view stands
  useEffect(() => {
    if (!orientation) {
      offsetRef.current = null;
      return;
    }


    const raw = gyroAngles(orientation);
    const offset = offsetRef.current;
    if (!offset) {
      offsetRef.current = { yaw: shared.yaw - raw.yaw, pitch: shared.pitch - raw.pitch };
      return;
    }
    if (draggingRef.current) return;


    const dYaw = shortestArcDeg(shared.yaw, raw.yaw + offset.yaw);
    const dPitch = clampPitch(raw.pitch + offset.pitch) - shared.pitch;
    const distance = Math.hypot(dYaw, dPitch);
    // A sample that says "still here" must not cost a render
    if (distance < 1e-3) return;
    const step = gyroStep(distance);
    commit(shared.yaw + dYaw * step, shared.pitch + dPitch * step);
  }, [orientation, commit, shared]);


  return { view, shared, panHandlers: responderRef.current.panHandlers };
}







// -----------------------------------------------------------
// SphereSurface
// -----------------------------------------------------------
//
// The GL surface and everything that lives exactly as long as
// its context: the renderer (cleared to the stage ground, so
// the surface reads as the stage before the photo arrives),
// the camera, the inside-out sphere and its material, and the
// frame loop. The sphere is built at context time but joins
// the scene only when its texture has — an untextured material
// draws flat white, and white is the last thing a dark stage
// should flash. A photo change swaps the texture on the same
// mesh; the previous one is released once the new one is on.
// A texture landing after the surface went (or after the photo
// changed again) is released on the spot and never touches the
// scene.
//
// Two things must agree with projectToScreen: the camera's yaw
// turns the opposite way (its default look is down the
// negative depth axis, so a positive yaw is a negative turn
// about the vertical), in yaw-then-pitch order so the pitch is
// about the camera's own horizontal; and the sphere is turned
// a quarter the other way so the photo's CENTRE column sits
// straight ahead at yaw 0 — where the flat stage and the
// routing engine put it — with the columns to its right
// growing to the viewer's right.
//
// A context can arrive after the surface has gone — the native
// side creates it on its own time, and a quick navigation
// away outruns it. Such a context reaches no state, so it is
// released on the spot and starts no frame loop. The mounted
// flag starts true (a child surface's effects fire before this
// one's, so a context may arrive within the mounting commit),
// is put back to true whenever the mount effect re-runs (the
// development double-invoke), and goes false only on the way
// out.
//
// Used by:
//   - SphereStage (below)
// -----------------------------------------------------------

interface SceneHandles {
  gl: StageGl;
  renderer: StageRenderer;
  scene: StageScene;
  camera: StageCamera;
  geometry: StageGeometry;
  material: StageMaterial;
  mesh: StageMesh;
  texture: StageTexture | null;
  onStage: boolean;
  frame: number;
  disposed: boolean;
}


// Sources already warned about, so a photo the walker returns
// to all afternoon warns once
const warnedOversize = new Set<string | number>();

const warnOversize = (source: string | number, texture: StageTexture) => {
  const width = texture.image?.width ?? 0;
  if (!__DEV__ || width <= MAX_TEXTURE_PX || warnedOversize.has(source)) return;
  warnedOversize.add(source);
  console.warn(`[wayfinduikit] panorama ${String(source)} is ${width} px wide; textures over ${MAX_TEXTURE_PX} px are downsampled or rejected by many mobile GPUs`);
};

// The one way a scene goes: the loop first, so no frame draws
// with a released renderer; a scene that never started a loop
// holds frame 0, which cancels nothing
const releaseScene = (handles: SceneHandles) => {
  handles.disposed = true;
  cancelAnimationFrame(handles.frame);
  handles.texture?.dispose();
  handles.material.dispose();
  handles.geometry.dispose();
  handles.renderer.dispose();
};


function SphereSurface({
  peers,
  source,
  shared,
  fovDeg,
  width,
  height,
  ground,
  a11yLabel,
  onFail,
}: {
  peers: GlPeers;
  source: string | number;
  shared: SharedView;
  fovDeg: number;
  width: number;
  height: number;
  ground: string;
  a11yLabel: string;
  onFail: (reason: 'context' | 'texture' | 'render', error: unknown) => void;
}) {

  const [context, setContext] = useState<SceneHandles | null>(null);

  // Read at context time through refs, so the callback itself
  // stays stable — the surface calls it once, and must not be
  // handed a new one on every render
  const setupRef = useRef({ fovDeg, width, height, ground });
  setupRef.current = { fovDeg, width, height, ground };

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);


  const onContextCreate = useCallback(
    (gl: StageGl) => {
      try {
        const { three } = peers;
        const setup = setupRef.current;
        const renderer = new peers.Renderer({ gl, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, clearColor: setup.ground });
        const scene = new three.Scene();
        const camera = new three.PerspectiveCamera(verticalFovDeg(setup.fovDeg, setup.width, setup.height), Math.max(1, setup.width) / Math.max(1, setup.height), 0.1, SPHERE_RADIUS * 10);
        camera.rotation.order = 'YXZ';
        const geometry = new three.SphereGeometry(SPHERE_RADIUS, 64, 32);
        // Inside out, so the photo reads the right way round
        // from the centre without a back-face material
        geometry.scale(-1, 1, 1);
        const material = new three.MeshBasicMaterial();
        const mesh = new three.Mesh(geometry, material);
        // The mirrored sphere's middle column sits on the
        // negative x axis; this quarter turn carries it onto
        // the camera's forward axis with the right-hand half of
        // the photo to the right
        mesh.rotation.y = -Math.PI / 2;


        const handles: SceneHandles = { gl, renderer, scene, camera, geometry, material, mesh, texture: null, onStage: false, frame: 0, disposed: false };
        // Too late: the surface is gone and state would drop
        // the handles on the floor, loop and all
        if (!mountedRef.current) {
          releaseScene(handles);
          return;
        }
        const tick = () => {
          handles.frame = requestAnimationFrame(tick);
          if (!shared.dirty) return;
          shared.dirty = false;
          camera.rotation.y = -three.MathUtils.degToRad(shared.yaw);
          camera.rotation.x = three.MathUtils.degToRad(shared.pitch);
          renderer.render(scene, camera);
          gl.endFrameEXP();
        };
        // The first frame paints the ground over whatever the
        // surface held before the context existed
        shared.dirty = true;
        handles.frame = requestAnimationFrame(tick);
        setContext(handles);
      } catch (error) {
        onFail('context', error);
      }
    },
    [peers, shared, onFail],
  );


  // The texture, per photo, once there is a scene to put it in
  useEffect(() => {
    if (!context) return;
    let stale = false;


    peers.loadAsync(source).then(
      (texture) => {
        if (stale || context.disposed) {
          texture.dispose();
          return;
        }
        warnOversize(source, texture);
        // A photo is authored in display space; without saying
        // so the renderer would treat it as linear and wash it out
        if (peers.three.SRGBColorSpace) texture.colorSpace = peers.three.SRGBColorSpace;
        const previous = context.texture;
        context.texture = texture;
        context.material.map = texture;
        context.material.needsUpdate = true;
        if (!context.onStage) {
          context.scene.add(context.mesh);
          context.onStage = true;
        }
        previous?.dispose();
        shared.dirty = true;
      },
      (error: unknown) => {
        if (!stale) onFail('texture', error);
      },
    );


    return () => {
      stale = true;
    };
  }, [context, source, peers, shared, onFail]);


  // The lens and the viewport follow the stage's layout and fov;
  // the buffer's own pixel size is the truth for both
  useEffect(() => {
    if (!context) return;
    const { gl, camera, renderer } = context;
    const bufferWidth = Math.max(1, gl.drawingBufferWidth);
    const bufferHeight = Math.max(1, gl.drawingBufferHeight);
    renderer.setSize(bufferWidth, bufferHeight, false);
    camera.aspect = bufferWidth / bufferHeight;
    camera.fov = verticalFovDeg(fovDeg, bufferWidth, bufferHeight);
    camera.updateProjectionMatrix();
    shared.dirty = true;
  }, [context, fovDeg, width, height, shared]);


  // Everything the context owns goes with it — and a surface
  // that hands over a second context (the native view was
  // recreated) releases the first the same way
  useEffect(() => {
    if (!context) return;
    return () => releaseScene(context);
  }, [context]);


  const { GLView } = peers;
  return (
    <View testID="wayfinduikit-stage-surface" accessible accessibilityRole="image" accessibilityLabel={a11yLabel} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GLView testID="wayfinduikit-stage-gl" style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}







// -----------------------------------------------------------
// HotspotChip
// -----------------------------------------------------------
//
// One hotspot over the surface: a round glyph for its kind and
// the label beside it, centred on the anchor the stage
// projected. Inert without onPress — a stage used as a plain
// viewer still shows what is there.
//
// Used by:
//   - SphereStage (below)
// -----------------------------------------------------------

function HotspotChip({ hotspot, x, y, onPress }: { hotspot: KitHotspot; x: number; y: number; onPress?: () => void }) {

  const { colors, fonts, radii } = useKitTheme();


  return (
    <Pressable
      testID={`wayfinduikit-hotspot-${hotspot.id}`}
      accessibilityRole="button"
      accessibilityLabel={hotspot.label ?? undefined}
      disabled={!onPress}
      onPress={onPress}
      style={{
        position: 'absolute',
        left: x - HOTSPOT_SIZE / 2,
        top: y - HOTSPOT_SIZE / 2,
        height: HOTSPOT_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 4,
        paddingRight: hotspot.label ? 12 : 4,
        borderRadius: radii.pill,
        backgroundColor: colors.overlay,
      }}
    >
      <Ionicons name={HOTSPOT_GLYPH[hotspot.kind]} size={HOTSPOT_SIZE - 8} color={hotspot.kind === 'route' ? colors.brand : colors.overlayInk} />
      {hotspot.label ? (
        <Text numberOfLines={1} style={{ marginLeft: 6, maxWidth: 140, fontSize: 12, fontFamily: fonts.medium, color: colors.overlayInk }}>
          {hotspot.label}
        </Text>
      ) : null}
    </Pressable>
  );
}







// -----------------------------------------------------------
// HintPill
// -----------------------------------------------------------
//
// "Drag to look around", top centre, fading on its own after
// a moment — the first pan teaches the gesture and the hint
// must not compete with the photo afterwards. The stage
// re-keys it per photo, so a new panorama gets a fresh hint.
//
// Used by:
//   - SphereStage (below)
// -----------------------------------------------------------

function HintPill({ text }: { text: string }) {

  const { colors, fonts, radii } = useKitTheme();
  const opacity = useRef(new Animated.Value(1)).current;


  useEffect(() => {
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: HINT_FADE_MS,
      delay: HINT_HOLD_MS,
      useNativeDriver: Platform.OS !== 'web',
    });
    fade.start();
    return () => fade.stop();
  }, [opacity]);


  return (
    <Animated.View testID="wayfinduikit-stage-hint" pointerEvents="none" style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', opacity }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.overlay }}>
        <Ionicons name="swap-horizontal" size={14} color={colors.overlayInk} />
        <Text style={{ marginLeft: 6, fontSize: 12, fontFamily: fonts.medium, color: colors.overlayInk }}>{text}</Text>
      </View>
    </Animated.View>
  );
}







// -----------------------------------------------------------
// StageBoundary
// -----------------------------------------------------------
//
// A GL view that throws in render (no surface on this device,
// a native module that failed to link) would otherwise take
// the whole screen down. The boundary reports the crash to the
// stage, which decides: under 'auto' it swallows and the stage
// re-renders as the flat one; under 'sphere' the error is
// thrown on from here, so the host's own boundary sees exactly
// what it would have seen without this one.
//
// Used by:
//   - PanoramaStage (below)
// -----------------------------------------------------------

class StageBoundary extends Component<{ swallow: boolean; onError: (error: unknown) => void; children: ReactNode }, { caught: boolean; error: unknown }> {

  state = { caught: false, error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { caught: true, error };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    if (!this.state.caught) return this.props.children;
    if (!this.props.swallow) throw this.state.error;
    return null;
  }
}







// -----------------------------------------------------------
// SphereStage
// -----------------------------------------------------------
//
// The sphere with its chrome. Layout gives the projection its
// viewport (the window width is the first-frame guess, as on
// the flat stage), the view hook gives it the angles, and the
// same camera description places the marker and every hotspot
// the GL surface is drawing under them.
//
// Used by:
//   - PanoramaStage (below)
// -----------------------------------------------------------

interface SphereStageProps extends Omit<PanoramaStageProps, 'renderer' | 'showHint' | 'height' | 'initialYaw' | 'fovDeg'> {
  peers: GlPeers;
  showHint: boolean;
  height: number;
  initialYaw: number;
  fovDeg: number;
  onFail: (reason: 'context' | 'texture' | 'render', error: unknown) => void;
}

function SphereStage({
  peers,
  source,
  targetYaw,
  targetLabel,
  hotspots,
  onYawChange,
  onPressHotspot,
  showHint,
  height,
  orientation,
  initialYaw,
  fovDeg,
  onFail,
}: SphereStageProps) {

  const { colors } = useKitTheme();
  const labels = useKitLabels();
  const env = useKitEnv();
  const { width: windowWidth } = useWindowDimensions();


  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const width = Math.max(1, measuredWidth ?? windowWidth);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: laidOut } = event.nativeEvent.layout;
    if (laidOut > 0) setMeasuredWidth(laidOut);
  }, []);


  // A stored reference goes through the host; a bundled asset
  // and a ready-made uri are handed to the loader as they are.
  // Keyed on the photo's value, like everything below
  const sourceKey = panoSourceKey(source);
  const isReference = typeof source === 'string';
  const resolvedSource = useMemo<string | number>(() => (isReference && typeof sourceKey === 'string' ? env.resolveImageUrl(sourceKey) : sourceKey), [sourceKey, isReference, env]);


  // The projection has no pinhole outside (0, 180); the same
  // clamp feeds the drag scale, the camera and the overlays
  const fov = Math.min(179, Math.max(1, fovDeg));
  const { view, shared, panHandlers } = useViewAngles({ initialYaw, orientation, degPerPx: fov / width });


  // The hint belongs to the photo — reset during render when
  // it changes, so no frame of the new photo wears the old one
  const [hintEpoch, setHintEpoch] = useState(0);
  const [seenKey, setSeenKey] = useState(sourceKey);
  if (seenKey !== sourceKey) {
    setSeenKey(sourceKey);
    setHintEpoch((epoch) => epoch + 1);
  }


  // The flat stage's rule, so a host hears the same thing from
  // either surface: whole degrees, once moved three of them the
  // short way round; the callback through a ref so a fresh
  // closure per host render never re-fires the report
  const onYawRef = useRef(onYawChange);
  onYawRef.current = onYawChange;
  const lastReportedYaw = useRef<number | null>(null);
  useEffect(() => {
    const yaw = Math.round(view.yaw) % 360;
    const last = lastReportedYaw.current;
    if (last !== null && Math.abs(shortestArcDeg(last, yaw)) < YAW_REPORT_STEP_DEG) return;
    lastReportedYaw.current = yaw;
    onYawRef.current?.(yaw);
  }, [view.yaw]);


  const camera = { yaw: view.yaw, pitch: view.pitch, fovDeg: fov, width, height };

  // Behind the camera the projection already answers a point
  // far outside, so the clamp pins the marker at the edge that
  // is the short way round — and flags it as pinned
  const marker = targetYaw != null ? { deltaDeg: shortestArcDeg(view.yaw, targetYaw), ...clampToEdge(projectToScreen({ yaw: targetYaw }, camera), { width, height }, MARKER_SIZE / 2 + MARKER_EDGE_INSET) } : null;


  const placedHotspots = useMemo(
    () =>
      (hotspots ?? []).flatMap((hotspot) => {
        const point = projectToScreen({ yaw: hotspot.yaw, pitch: hotspot.pitch }, { yaw: view.yaw, pitch: view.pitch, fovDeg: fov, width, height });
        const half = HOTSPOT_SIZE / 2;
        if (!point.visible || point.x < -half || point.x > width + half || point.y < -half || point.y > height + half) return [];
        return [{ hotspot, x: point.x, y: point.y }];
      }),
    [hotspots, view.yaw, view.pitch, fov, width, height],
  );


  return (
    <View testID="wayfinduikit-stage" onLayout={onLayout} {...panHandlers} style={{ height, overflow: 'hidden', backgroundColor: colors.stageBg }}>

      <SphereSurface
        peers={peers}
        source={resolvedSource}
        shared={shared}
        fovDeg={fov}
        width={width}
        height={height}
        ground={colors.stageBg}
        a11yLabel={labels.stageA11y(targetLabel)}
        onFail={onFail}
      />

      {placedHotspots.map(({ hotspot, x, y }) => (
        <HotspotChip key={hotspot.id} hotspot={hotspot} x={x} y={y} onPress={onPressHotspot ? () => onPressHotspot(hotspot) : undefined} />
      ))}

      {marker ? (
        <View testID="wayfinduikit-stage-marker" pointerEvents="none" style={{ position: 'absolute', left: marker.x - MARKER_SIZE / 2, top: marker.y - MARKER_SIZE / 2 }}>
          <DirectionMarker deltaDeg={marker.deltaDeg} label={targetLabel} clamped={marker.clamped} />
        </View>
      ) : null}

      {showHint ? <HintPill key={hintEpoch} text={labels.stageHint360} /> : null}

    </View>
  );
}







// -----------------------------------------------------------
// PanoramaStage (default export)
// -----------------------------------------------------------
//
//   <PanoramaStage source={step.panorama} targetYaw={step.yaw}
//                  hotspots={step.hotspots}
//                  orientation={gyroOn ? sample : null}
//                  onYawChange={setHeading}
//                  onPressHotspot={(h) => goTo(h.id)} />
//
// A failure is remembered for the photo it happened on — by
// its key, so a host re-rendering with a fresh { uri } object
// is not asking again: the next photo tries the sphere again,
// since a broken texture says nothing about the next one and
// the surface itself costs nothing to ask for twice.
//
// Used by:
//   - the host app, through the root export
// -----------------------------------------------------------

export default function PanoramaStage({
  source,
  targetYaw,
  targetLabel,
  hotspots,
  onYawChange,
  onPressHotspot,
  showHint = true,
  height = 260,
  orientation = null,
  initialYaw = 0,
  fovDeg = DEFAULT_FOV_DEG,
  renderer = 'auto',
}: PanoramaStageProps) {

  const [failedKey, setFailedKey] = useState<PanoSourceKey | null>(null);

  // The photo at the moment of failure (and the mode deciding
  // what follows), read through refs so the callback stays one
  // object for the surface's lifetime
  const sourceKey = panoSourceKey(source);
  const sourceKeyRef = useRef(sourceKey);
  sourceKeyRef.current = sourceKey;
  const rendererRef = useRef(renderer);
  rendererRef.current = renderer;
  const onFail = useCallback((reason: 'context' | 'texture' | 'render', error: unknown) => {
    if (__DEV__) {
      const outcome = rendererRef.current === 'auto' ? 'showing the flat stage' : 'the stage stays dark';
      console.warn(`[wayfinduikit] sphere ${reason} failed, ${outcome}:`, error);
    }
    setFailedKey(sourceKeyRef.current);
  }, []);


  const peers = renderer === 'flat' ? null : loadGlPeers();
  const flatProps: FlatPanoramaProps = { source, targetYaw, targetLabel, hotspots, onYawChange, onPressHotspot, showHint, height, initialYaw };

  // No peers is not a failure but an absent capability — there
  // is no sphere to insist on, whatever `renderer` asked for
  if (!peers || (renderer === 'auto' && failedKey === sourceKey)) return <FlatPanorama {...flatProps} />;


  return (
    <StageBoundary swallow={renderer === 'auto'} onError={(error) => onFail('render', error)}>
      <SphereStage
        {...flatProps}
        showHint={showHint}
        height={height}
        peers={peers}
        orientation={orientation}
        initialYaw={initialYaw}
        fovDeg={fovDeg}
        onFail={onFail}
      />
    </StageBoundary>
  );
}
