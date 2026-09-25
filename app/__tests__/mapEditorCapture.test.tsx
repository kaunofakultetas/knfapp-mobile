// -----------------------------------------------------------
//  [*] Tests — the guided capture screen over the capture stack
//
//  The whole chain with synthetic sensors: calibration ends
//  when the fed gyro holds still, the session shoots the
//  moment a target is aimed and the hand settles, every shot
//  is accepted and enqueued as a frame upload with the pose
//  as strings, finish waits for the LIVE queue (a backed-off
//  frame holds it, the kick timer retries it) and closes the
//  capture with the manifest's firstYawDeg, a lost finish
//  answer (409 not_uploading) joins the stitch poll, the
//  status card polls to done, and "assign" writes ONE
//  editor-less node upsert with the pano fields and the base
//  revision from the route params — awaited to its verdict,
//  with a conflict surfacing as the overwrite/discard dialog.
//  A retake purges the replaced target's queued frame so the
//  stale photo cannot outlive the new one, the screen sweeps
//  foreign leftovers on mount and empties its upload queue on
//  a delivered assign — its ops it never wipes: Close on a
//  failed stitch keeps an earlier assign still queued
//  (KNF-112) — and a re-captured node loses its stale panoYaw
//  unless the pano url is unchanged. With the map editor
//  mounted underneath the assign is HANDED to it
//  (editorHandoff), the stitched band's vOffsetDeg included,
//  and nothing goes through this screen's outbox; an editor
//  that declines is reported, and the no-editor fallback
//  whose server is out of reach says so instead of claiming a
//  success. Plus the
//  per-platform sensor adapter alone (iOS flips the accel
//  sign, Android passes through) and a camera failure re-
//  arming the shutter instead of losing the target.
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GraphNode } from '@knf/wayfindengine';
import { act, fireEvent, render } from '@testing-library/react-native';

import CaptureScreen, { trackerSampleFrom } from '@/app/(main)/map-editor/capture';
import { registerNodeEditSink } from '@/services/wayfind/editorHandoff';


// This suite pins its module's BEHAVIOR, so the shipping
// flags are pinned all-on — the real features.json (whatever
// the current release preset says) must never decide whether
// these tests see their subject
jest.mock('@/services/features', () => {
  const { TABS } = require('@/constants/tabs');
  return {
    isFeatureEnabled: () => true,
    FEATURES: { accounts: true, news: true, chat: true, social: true, schedule: true, assistant: true, studentId: true, map: true },
    ENABLED_TABS: TABS,
    ENABLED_TAB_KEYS: new Set(TABS.map((tab: { key: string }) => tab.key)),
    TAB_FEATURES: {},
  };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// The conflict dialog's answer — overwrite, unless a spec says
// discard
const mockConfirm = jest.fn(async () => true);
jest.mock('@/components/ui', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    confirmAction: (...args: unknown[]) => mockConfirm(...(args as [])),
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    Header: ({ title }: { title: string }) => <Text testID="header-title">{title}</Text>,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    LoadingSpinner: () => <Text>loading</Text>,
    Button: ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) => (
      <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts && 'count' in opts ? `${key}:${opts.count}` : key), i18n: { language: 'lt' } }) }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { surface: '#fff', surfaceSoft: '#eee', ink: '#111', inkSoft: '#666', inkFaint: '#999', brand: '#7B003F', onBrand: '#fff', danger: '#C62828', scrim: 'rgba(0,0,0,0.45)' }, scheme: 'light' }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'a1', role: 'admin' }, hydrated: true }) }));
// Every toast the screen raised, for the specs to read
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@knf/dataengine', () => ({ useDataEngine: () => ({ onRestore: () => () => undefined, cache: { get: async () => null, set: async () => undefined } }) }));

// The router's back, to see the screen leave
const mockBack = jest.fn();

// The route params the NodeSheet would mint, set per spec
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

// The camera: a ref that answers takePictureAsync from a mock
// the tests steer per shot
const mockTakePicture = jest.fn(async () => ({ uri: 'file:///shot.jpg', width: 100, height: 100 }));
jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  const React = require('react');
  const CameraView = React.forwardRef((_props: unknown, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: (...args: unknown[]) => mockTakePicture(...(args as [])) }));
    return <View testID="camera-view" />;
  });
  CameraView.displayName = 'CameraView';
  return { CameraView, useCameraPermissions: () => [{ granted: true }, jest.fn()] };
});

// The sensors: the tests hold the listeners and feed samples
// by hand — no real hardware ever runs in jest
const mockListeners: { gyro: ((s: { x: number; y: number; z: number }) => void) | null; accel: ((s: { x: number; y: number; z: number }) => void) | null } = { gyro: null, accel: null };
jest.mock('expo-sensors', () => ({
  Gyroscope: {
    setUpdateInterval: jest.fn(),
    addListener: (fn: (s: { x: number; y: number; z: number }) => void) => {
      mockListeners.gyro = fn;
      return {
        remove: () => {
          mockListeners.gyro = null;
        },
      };
    },
  },
  Accelerometer: {
    setUpdateInterval: jest.fn(),
    addListener: (fn: (s: { x: number; y: number; z: number }) => void) => {
      mockListeners.accel = fn;
      return {
        remove: () => {
          mockListeners.accel = null;
        },
      };
    },
  },
}));

type SentOp = { id: string; type?: string; kind?: string; entityId?: string; data?: Record<string, unknown>; baseRevision?: number };
// The server's op endpoint: every batch applied at revision 9
// unless a spec answers otherwise
const mockPostOps = jest.fn(async (_b: string, ops: SentOp[]): Promise<{ revision: number; results: Record<string, unknown>[] }> => ({ revision: 9, results: ops.map((op) => ({ id: op.id, status: 'applied' })) }));

// The frame upload: each PUT answers one stored frame
const mockUploadFrame = jest.fn(async (..._args: unknown[]) => ({ stored: 1, expected: 36 }));

// The capture record's create, answering the client's own id
const mockCreateCapture = jest.fn(async (_b: string, body: { id: string }) => ({ id: body.id, status: 'uploading' }));

// Finish, which queues the stitch
const mockFinishCapture = jest.fn(async (..._args: unknown[]) => ({ status: 'queued' }));

// The stitch-status poll, answered per spec
const mockGetCapture = jest.fn();
jest.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    serverCode?: string;
    constructor(message: string, status: number, serverCode?: string) {
      super(message);
      this.status = status;
      this.serverCode = serverCode;
    }
  },
  apiErrorKey: () => 'errors.generic',
  getUploadUrl: (path: string) => path,
}));
jest.mock('@/services/wayfindTransport', () => ({
  wayfindTransport: {
    postOps: (...args: [string, SentOp[]]) => mockPostOps(...args),
    publish: jest.fn(),
    uploadPanorama: jest.fn(),
    uploadPlan: jest.fn(),
    uploadFrame: (...args: unknown[]) => mockUploadFrame(...(args as [])),
  },
  createCapture: (...args: unknown[]) => mockCreateCapture(...(args as [string, { id: string }])),
  finishCapture: (...args: unknown[]) => mockFinishCapture(...(args as [])),
  getCapture: (...args: unknown[]) => mockGetCapture(...(args as [])),
}));


// A stitch the poll answers done: the served panorama the
// assign writes onto the node
const DONE_ANSWER = {
  id: 'c',
  status: 'done',
  frames: 8,
  expected: 36,
  pano: { id: 'h', url: '/api/wayfind/panoramas/h.jpg', width: 4096, height: 2048, hfovDeg: 360, vfovDeg: 160, centreYawDeg: 12 },
};







// -----------------------------------------------------------
// settle
// -----------------------------------------------------------
//
// Flush the fake clock's due work inside act, so the
// queue's drains and the screen's effects land.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const settle = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
};







// -----------------------------------------------------------
// feed
// -----------------------------------------------------------
//
// One synthetic sensor stretch: time moves first so the
// screen's Date.now dt matches the step, then the pair
// lands.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const feed = async (gyro: { x: number; y: number; z: number }, ms: number, stepMs = 50) => {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(stepMs);
      mockListeners.accel?.({ x: 0, y: -1, z: 0 });
      mockListeners.gyro?.(gyro);
    });
  }
};







// -----------------------------------------------------------
// calibrate
// -----------------------------------------------------------
//
// Hold still long enough for the tracker's 1500 ms
// window.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const calibrate = () => feed({ x: 0, y: 0, z: 0 }, 1700);







// -----------------------------------------------------------
// turnYaw
// -----------------------------------------------------------
//
// Turn the phone by yawDeg (clockwise seen from above):
// the facing swings -z → +x when the gyro spins NEGATIVE
// about device y, per the capture package's frames.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const turnYaw = (yawDeg: number) => feed({ x: 0, y: -((yawDeg * Math.PI) / 180), z: 0 }, 1000);







// -----------------------------------------------------------
// holdStill
// -----------------------------------------------------------
//
// Quiet long enough for the session's 300 ms stability
// window.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const holdStill = () => feed({ x: 0, y: 0, z: 0 }, 450);







// -----------------------------------------------------------
// sweepAll
// -----------------------------------------------------------
//
// The whole 8-shot walls row in one sweep — calibrate,
// shoot r0-0, then seven 30° turns each settling into its
// own shot.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const sweepAll = async () => {
  await calibrate();
  await holdStill();
  await settle();
  for (let shot = 1; shot < 8; shot++) {
    await turnYaw(30);
    await holdStill();
    await settle();
  }
};







// -----------------------------------------------------------
// startCapture
// -----------------------------------------------------------
//
// Pick the plan mode (walls unless told) and press Start —
// the capture record is created and aiming begins.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const startCapture = async (r: Awaited<ReturnType<typeof render>>, mode: 'walls' | 'full' = 'walls') => {
  if (mode === 'full') {
    await act(async () => {
      fireEvent.press(r.getByTestId('capture-mode-full'));
    });
  }
  await act(async () => {
    fireEvent.press(r.getByText('mapEditor.capture.start'));
  });
  await settle();
};


describe('trackerSampleFrom', () => {
  it('passes the gyro through untouched on both platforms', () => {
    const gyro = { x: 0.1, y: -0.2, z: 0.3 };
    expect(trackerSampleFrom(gyro, { x: 0, y: 1, z: 0 }, 20, 'android').gyro).toEqual(gyro);
    expect(trackerSampleFrom(gyro, { x: 0, y: -1, z: 0 }, 20, 'ios').gyro).toEqual(gyro);
  });

  it('keeps the Android accel (support force is already world up) and flips iOS', () => {
    // Upright portrait: world up is device +y. Android says so
    expect(trackerSampleFrom({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 20, 'android').accel).toEqual({ x: 0, y: 1, z: 0 });
    // iOS reports gravity itself — the same posture reads -1
    // (the zero axes flip to -0, which the tracker cannot tell apart)
    expect(trackerSampleFrom({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, 20, 'ios').accel).toEqual({ x: -0, y: 1, z: -0 });
    // Flat face-up: iOS z is -1, the tracker wants +1
    expect(trackerSampleFrom({ x: 0, y: 0, z: 0 }, { x: 0.1, y: 0, z: -1 }, 20, 'ios').accel).toEqual({ x: -0.1, y: -0, z: 1 });
  });

  it('carries dtMs through unchanged', () => {
    expect(trackerSampleFrom({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 35, 'android').dtMs).toBe(35);
  });
});


describe('CaptureScreen', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    mockPostOps.mockClear();
    mockUploadFrame.mockClear();
    mockUploadFrame.mockImplementation(async () => ({ stored: 1, expected: 36 }));
    mockCreateCapture.mockClear();
    mockFinishCapture.mockClear();
    mockGetCapture.mockReset();
    mockTakePicture.mockClear();
    mockTakePicture.mockImplementation(async () => ({ uri: 'file:///shot.jpg', width: 100, height: 100 }));
    mockToast.mockClear();
    mockBack.mockClear();
    mockConfirm.mockClear();
    mockConfirm.mockImplementation(async () => true);
    mockParams.nodeId = 'n-1';
    mockParams.node = JSON.stringify({ id: 'n-1', level: 'L1', x: 100, y: 200, kind: 'corridor', landmark: 'Holas' });
    mockParams.baseRevision = '7';
  });

  afterEach(() => {
    jest.useRealTimers();
  });


  it('creates the capture, shoots aimed-and-still targets, finishes, polls to done and assigns the pano', async () => {
    mockGetCapture.mockResolvedValueOnce({ id: 'c', status: 'stitching', frames: 8, expected: 36, progressPct: 40 });
    mockGetCapture.mockResolvedValue({
      id: 'c',
      status: 'done',
      frames: 8,
      expected: 36,
      pano: { id: 'h', url: '/api/wayfind/panoramas/h.jpg', width: 4096, height: 2048, hfovDeg: 360, vfovDeg: 160, centreYawDeg: 12 },
    });

    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);

    // The capture record carries the client id, the node, the
    // walls plan and the frame fov the HUD projects with
    expect(mockCreateCapture).toHaveBeenCalledTimes(1);
    const [buildingId, body] = mockCreateCapture.mock.calls[0] as unknown as [string, { id: string; nodeId: string; mode: string; frameHfovDeg: number; targets: { id: string }[] }];
    expect(buildingId).toBe('knf');
    expect(body).toMatchObject({ nodeId: 'n-1', mode: 'walls', frameHfovDeg: 60 });
    expect(body.id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(body.targets).toHaveLength(36);
    expect(body.targets[0]).toEqual({ id: 'r0-0', yawDeg: 0, pitchDeg: 0 });

    // Calibration first: the hold-still pill shows, nothing shoots
    expect(r.getByTestId('capture-calibrating')).toBeTruthy();
    expect(mockTakePicture).not.toHaveBeenCalled();
    await calibrate();
    expect(r.queryByTestId('capture-calibrating')).toBeNull();

    // Facing r0-0, still — one shoot, one accept, one enqueued
    // frame with the pose as strings
    await holdStill();
    await settle();
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(mockUploadFrame).toHaveBeenCalledTimes(1);
    const [frameBuilding, frameFile, frameFields] = mockUploadFrame.mock.calls[0] as unknown as [string, { uri: string; name: string; type: string }, Record<string, string>];
    expect(frameBuilding).toBe('knf');
    expect(frameFile).toMatchObject({ uri: 'file:///shot.jpg', name: 'r0-0.jpg', type: 'image/jpeg' });
    expect(frameFields.captureId).toBe(body.id);
    expect(frameFields.targetId).toBe('r0-0');
    expect(Number(frameFields.yawDeg)).toBeCloseTo(0, 3);
    expect(Number(frameFields.pitchDeg)).toBeCloseTo(0, 3);
    expect(Number(frameFields.rollDeg)).toBeCloseTo(0, 3);

    // Sweep the row: seven more turns of 30°, each settling into
    // its own shot — the server sees each target exactly once
    for (let shot = 1; shot < 8; shot++) {
      await turnYaw(30);
      await holdStill();
      await settle();
    }
    expect(mockUploadFrame).toHaveBeenCalledTimes(8);
    const shotTargets = mockUploadFrame.mock.calls.map((call) => (call as unknown as [string, unknown, Record<string, string>])[2].targetId);
    expect(shotTargets).toEqual(['r0-0', 'r0-1', 'r0-2', 'r0-3', 'r0-4', 'r0-5', 'r0-6', 'r0-7']);
    expect(Number((mockUploadFrame.mock.calls[3] as unknown as [string, unknown, Record<string, string>])[2].yawDeg)).toBeCloseTo(90, 1);

    // Finish: the queue is already drained, so the server is told
    // at once and the card starts polling — stitching first
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.finish'));
    });
    await settle();
    // finish carries the manifest's firstYawDeg — r0-0's yaw,
    // zero in the tracker's frame give or take integration noise
    expect(mockFinishCapture).toHaveBeenCalledTimes(1);
    const [finishId, finishBuilding, centreYaw] = mockFinishCapture.mock.calls[0] as unknown as [string, string, number];
    expect(finishId).toBe(body.id);
    expect(finishBuilding).toBe('knf');
    expect(Math.min(centreYaw, 360 - centreYaw)).toBeLessThan(1);
    expect(r.getByTestId('capture-status')).toBeTruthy();
    expect(r.getByTestId('capture-status-line').props.children).toContain('mapEditor.capture.stitching');

    // The next 3-second tick answers done: the url and the assign
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    await settle();
    expect(r.getByTestId('capture-pano-url').props.children).toBe('/api/wayfind/panoramas/h.jpg');

    // Assign writes ONE upsert: the node's own data from the route
    // params plus the pano fields, stamped with the param base
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.assign'));
    });
    await settle();
    const ops = mockPostOps.mock.calls.flatMap(([, batch]) => batch);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: 'upsert',
      kind: 'node',
      entityId: 'n-1',
      baseRevision: 7,
      data: {
        level: 'L1',
        x: 100,
        y: 200,
        kind: 'corridor',
        landmark: 'Holas',
        pano: '/api/wayfind/panoramas/h.jpg',
        panoGeometry: { hfovDeg: 360, vfovDeg: 160, centreYawDeg: 12 },
        panoYaw: null,
        panoHeading: { source: 'auto' },
      },
    });
    expect((ops[0].data as { id?: string }).id).toBeUndefined();
    expect(mockBack).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.capture.assigned');

    // A delivered assign empties the upload queue and leaves no op
    // behind — the applied one left the outbox with its answer.
    // (This once asserted the ops KEY was wiped: that was
    // clearAll, which also erased any still-queued assign —
    // KNF-112; the outbox is now only ever drained, never wiped)
    expect(await AsyncStorage.getItem('wayfind-capture:uploads:knf')).toBeNull();
    expect(JSON.parse((await AsyncStorage.getItem('wayfind-capture:ops:knf')) ?? '[]')).toEqual([]);
  });


  it('a camera failure fails the attempt and the shutter re-arms on the same target', async () => {
    mockTakePicture.mockRejectedValueOnce(new Error('camera busy'));

    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);
    await calibrate();

    // First attempt: the shoot fires, the camera refuses, nothing
    // is enqueued — and the target is NOT burned
    await holdStill();
    await settle();
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    expect(mockUploadFrame).not.toHaveBeenCalled();

    // Past the 500 ms re-arm pause the same aim shoots again and
    // this time the frame goes out
    await feed({ x: 0, y: 0, z: 0 }, 700);
    await settle();
    expect(mockTakePicture).toHaveBeenCalledTimes(2);
    expect(mockUploadFrame).toHaveBeenCalledTimes(1);
    expect((mockUploadFrame.mock.calls[0] as unknown as [string, unknown, Record<string, string>])[2].targetId).toBe('r0-0');
  });


  it('finish waits for a backed-off frame and the kick timer retries it — no premature finish call', async () => {
    let failures = 0;
    mockUploadFrame.mockImplementation(async (...args: unknown[]) => {
      const fields = args[2] as Record<string, string>;
      if (fields.targetId === 'r0-7' && failures < 2) {
        failures += 1;
        throw new Error('flaky network');
      }
      return { stored: 1, expected: 36 };
    });
    mockGetCapture.mockResolvedValue({ id: 'c', status: 'stitching', frames: 8, expected: 36 });

    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);
    await sweepAll();

    // r0-7 failed twice (the immediate rung-0 retry included)
    // and sits queued on its 1 s backoff — Finish must wait
    expect(mockUploadFrame).toHaveBeenCalledTimes(9);
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.finish'));
    });
    await settle();
    expect(mockFinishCapture).not.toHaveBeenCalled();
    expect(r.getByTestId('capture-status-line').props.children).toContain('mapEditor.capture.sendingFrames');

    // The kick timer drains once the backoff expires; the frame
    // lands and only then does the finish go out
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2500);
    });
    await settle();
    expect(mockUploadFrame).toHaveBeenCalledTimes(10);
    expect(mockFinishCapture).toHaveBeenCalledTimes(1);
  });


  it('a 409 not_uploading on a retried finish joins the stitch poll instead of bouncing to the camera', async () => {
    const { ApiError } = jest.requireMock('@/services/api') as { ApiError: new (message: string, status: number, serverCode?: string) => Error };
    mockFinishCapture.mockRejectedValue(new ApiError('already finished', 409, 'not_uploading'));
    mockGetCapture.mockResolvedValue({ id: 'c', status: 'stitching', frames: 8, expected: 36, progressPct: 10 });

    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);
    await sweepAll();
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.finish'));
    });
    await settle();

    // The stitch already started server-side: no error toast, no
    // camera bounce — the status card polls the truth from here
    expect(mockFinishCapture).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalledWith('error', expect.anything());
    expect(r.queryByTestId('capture-camera-area')).toBeNull();
    expect(r.getByTestId('capture-status')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    await settle();
    expect(mockGetCapture).toHaveBeenCalled();
  });


  it('retake purges the replaced frame — the stale backed-off upload never lands after the new one', async () => {
    let shots = 0;
    mockTakePicture.mockImplementation(async () => ({ uri: `file:///shot-${++shots}.jpg`, width: 100, height: 100 }));
    let failures = 0;
    mockUploadFrame.mockImplementation(async (...args: unknown[]) => {
      const file = args[1] as { uri: string };
      if (file.uri === 'file:///shot-1.jpg' && failures < 2) {
        failures += 1;
        throw new Error('flaky network');
      }
      return { stored: 1, expected: 36 };
    });

    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);
    await calibrate();
    await holdStill();
    await settle();

    // shot-1 (r0-0) failed twice and sits queued on its backoff
    expect(mockUploadFrame).toHaveBeenCalledTimes(2);

    // Retake r0-0 and shoot it again from the same aim
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.retake'));
    });
    await feed({ x: 0, y: 0, z: 0 }, 700);
    await settle();

    // The stale item was removed before the new enqueue: even
    // long past its backoff, nothing re-sends the old photo —
    // the server keeps the retaken shot, not the discarded one
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });
    await settle();
    const uris = mockUploadFrame.mock.calls.map((call) => (call as unknown as [string, { uri: string }])[1].uri);
    expect(uris).toEqual(['file:///shot-1.jpg', 'file:///shot-1.jpg', 'file:///shot-2.jpg']);
    const held = JSON.parse((await AsyncStorage.getItem('wayfind-capture:uploads:knf')) ?? '[]') as { fields: { targetId: string }; file: { uri: string }; status: string }[];
    expect(held.filter((item) => item.fields.targetId === 'r0-0')).toHaveLength(1);
    expect(held[0].file.uri).toBe('file:///shot-2.jpg');
    expect(held[0].status).toBe('done');
  });


  it('leftover frame items from an earlier session are swept once the queue loads', async () => {
    await AsyncStorage.setItem(
      'wayfind-capture:uploads:knf',
      JSON.stringify([
        {
          id: 'fr-old',
          kind: 'frame',
          file: { uri: 'file:///old.jpg', name: 'r0-0.jpg', type: 'image/jpeg' },
          fields: { captureId: 'cap-dead', targetId: 'r0-0', yawDeg: '0', pitchDeg: '0', rollDeg: '0' },
          target: 'r0-0',
          status: 'done',
          attempts: 1,
          notBefore: 0,
          result: { stored: 1, expected: 36 },
          error: null,
          queuedAt: 1,
        },
      ]),
    );

    const r = await render(<CaptureScreen />);
    await settle();

    expect(r.getByText('mapEditor.capture.start')).toBeTruthy();
    expect(JSON.parse((await AsyncStorage.getItem('wayfind-capture:uploads:knf')) ?? '[]') as unknown[]).toHaveLength(0);
  });


  it('assign after a re-capture clears the stale panoYaw and stamps the heading auto', async () => {
    mockParams.node = JSON.stringify({ id: 'n-1', level: 'L1', x: 100, y: 200, kind: 'corridor', pano: '/api/wayfind/panoramas/old.jpg', panoYaw: 123, panoHeading: { source: 'aligned' } });
    mockGetCapture.mockResolvedValue(DONE_ANSWER);

    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);
    await sweepAll();
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.finish'));
    });
    await settle();
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.assign'));
    });
    await settle();

    const data = (mockPostOps.mock.calls.flatMap(([, batch]) => batch)[0] as SentOp).data as Record<string, unknown>;
    expect(data.pano).toBe('/api/wayfind/panoramas/h.jpg');
    expect(data.panoYaw).toBeNull();
    expect(data.panoHeading).toEqual({ source: 'auto' });
  });


  it('re-assigning the unchanged pano url keeps the admin’s alignment', async () => {
    mockParams.node = JSON.stringify({ id: 'n-1', level: 'L1', x: 100, y: 200, kind: 'corridor', pano: '/api/wayfind/panoramas/h.jpg', panoYaw: 123, panoHeading: { source: 'aligned' } });
    mockGetCapture.mockResolvedValue(DONE_ANSWER);

    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);
    await sweepAll();
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.finish'));
    });
    await settle();
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.assign'));
    });
    await settle();

    const data = (mockPostOps.mock.calls.flatMap(([, batch]) => batch)[0] as SentOp).data as Record<string, unknown>;
    expect(data.pano).toBe('/api/wayfind/panoramas/h.jpg');
    expect(data.panoYaw).toBe(123);
    expect(data.panoHeading).toEqual({ source: 'aligned' });
  });


  it("a conflicted assign surfaces the dialog; overwrite retries stamped at the server's revision and only then toasts", async () => {
    mockGetCapture.mockResolvedValue(DONE_ANSWER);
    mockPostOps.mockImplementationOnce(async (_b: string, ops: SentOp[]) => ({
      revision: 12,
      results: ops.map((op) => ({ id: op.id, status: 'rejected', reason: 'conflict', current: { data: { x: 9 }, revision: 12, deleted: false } })),
    }));

    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);
    await sweepAll();
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.finish'));
    });
    await settle();
    expect(mockToast).not.toHaveBeenCalledWith('success', 'mapEditor.capture.assigned');
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.assign'));
    });
    await settle();
    await settle();

    expect(mockConfirm).toHaveBeenCalledWith({
      title: 'mapEditor.conflictTitle',
      message: 'mapEditor.conflictBody',
      confirmLabel: 'mapEditor.keepMine',
      cancelLabel: 'mapEditor.takeTheirs',
    });
    const ops = mockPostOps.mock.calls.flatMap(([, batch]) => batch);
    expect(ops).toHaveLength(2);
    expect(ops[1].id).toBe(`${ops[0].id}-again`);
    // Keep mine lands over exactly the copy the server showed
    expect(ops[1].baseRevision).toBe(12);
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.capture.assigned');
    expect(mockBack).toHaveBeenCalled();
  });


  it('the full mode plans 44 targets with the pole caps', async () => {
    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r, 'full');
    const [, body] = mockCreateCapture.mock.calls[0] as unknown as [string, { mode: string; targets: { id: string }[] }];
    expect(body.mode).toBe('full');
    expect(body.targets).toHaveLength(44);
    expect(body.targets[43]).toEqual({ id: 'r-70-3', yawDeg: 135, pitchDeg: -70 });
  });


  // Sweep, finish, poll to done — the screen ready to assign
  const toDone = async (answer: Record<string, unknown> = DONE_ANSWER) => {
    mockGetCapture.mockResolvedValue(answer);
    const r = await render(<CaptureScreen />);
    await settle();
    await startCapture(r);
    await sweepAll();
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.capture.finish'));
    });
    await settle();
    return r;
  };


  it("with the editor underneath, assign hands the panorama to it — the band's offset included — and this outbox stays empty", async () => {
    const handed: [string, Record<string, unknown> | null][] = [];
    const release = registerNodeEditSink((nodeId, edit) => {
      // The editor's LIVE node carries an older, aligned photo
      handed.push([nodeId, edit({ id: 'n-1', level: 'L1', x: 100, y: 200, kind: 'corridor', pano: '/api/wayfind/panoramas/old.jpg', panoYaw: 40 } as GraphNode)]);
      return 'applied';
    });
    try {
      const r = await toDone({ ...DONE_ANSWER, pano: { ...DONE_ANSWER.pano, vfovDeg: 75, vOffsetDeg: 12 } });
      await act(async () => {
        fireEvent.press(r.getByText('mapEditor.capture.assign'));
      });
      await settle();
      expect(handed).toEqual([
        ['n-1', {
          pano: '/api/wayfind/panoramas/h.jpg',
          panoGeometry: { hfovDeg: 360, vfovDeg: 75, centreYawDeg: 12, vOffsetDeg: 12 },
          panoYaw: null,
          panoHeading: { source: 'auto' },
        }],
      ]);
      expect(mockPostOps).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.capture.assigned');
      expect(mockBack).toHaveBeenCalled();
      expect(await AsyncStorage.getItem('wayfind-capture:uploads:knf')).toBeNull();
    } finally {
      release();
    }
  });


  it('an editor that declines the assign is reported — the screen stays and writes nothing', async () => {
    const release = registerNodeEditSink(() => 'declined');
    try {
      const r = await toDone();
      await act(async () => {
        fireEvent.press(r.getByText('mapEditor.capture.assign'));
      });
      await settle();
      expect(mockToast).toHaveBeenCalledWith('error', 'mapEditor.nodeChanged');
      expect(mockPostOps).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });


  it('with no editor and no server, the assign stays queued and the screen says so instead of claiming success', async () => {
    mockPostOps.mockImplementation(async () => {
      throw new Error('offline');
    });
    try {
      const r = await toDone({ ...DONE_ANSWER, pano: { ...DONE_ANSWER.pano, vOffsetDeg: -4 } });
      await act(async () => {
        fireEvent.press(r.getByText('mapEditor.capture.assign'));
      });
      await settle();
      await settle();
      expect(mockToast).toHaveBeenCalledWith('info', 'mapEditor.savedOffline');
      expect(mockToast).not.toHaveBeenCalledWith('success', 'mapEditor.capture.assigned');
      expect(mockBack).not.toHaveBeenCalled();
      const stored = JSON.parse((await AsyncStorage.getItem('wayfind-capture:ops:knf')) ?? '[]') as { op: { data: { panoGeometry: Record<string, unknown> } }; status: string }[];
      expect(stored.map((entry) => entry.status)).toEqual(['queued']);
      // The fallback carries the band's offset too
      expect(stored[0].op.data.panoGeometry).toMatchObject({ vOffsetDeg: -4 });
    } finally {
      mockPostOps.mockImplementation(async (_b: string, ops: SentOp[]) => ({ revision: 9, results: ops.map((op) => ({ id: op.id, status: 'applied' })) }));
    }
  });


  it('Close on a failed stitch drops the frames and keeps an earlier assign still queued (KNF-112)', async () => {
    // An assign from an earlier session, waiting in this outbox —
    // the ops endpoint fails while frames still upload, the
    // residual case the audit found reachable
    const leftover = { op: { id: 'op-old', type: 'upsert', kind: 'node', entityId: 'n-9', data: { pano: '/api/wayfind/panoramas/x.jpg' }, baseRevision: 3 }, status: 'queued', queuedAt: 1 };
    await AsyncStorage.setItem('wayfind-capture:ops:knf', JSON.stringify([leftover]));
    mockPostOps.mockImplementation(async () => {
      throw new Error('ops down');
    });
    try {
      const r = await toDone({ id: 'c', status: 'failed', frames: 8, expected: 36, report: { reason: 'boom' } });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      await settle();
      expect(r.getByTestId('capture-status-line').props.children).toBe('mapEditor.capture.failed');
      await act(async () => {
        fireEvent.press(r.getByText('mapEditor.capture.close'));
      });
      await settle();
      expect(mockBack).toHaveBeenCalled();
      expect(await AsyncStorage.getItem('wayfind-capture:uploads:knf')).toBeNull();
      const stored = JSON.parse((await AsyncStorage.getItem('wayfind-capture:ops:knf')) ?? '[]') as { op: { id: string }; status: string }[];
      expect(stored.map((entry) => [entry.op.id, entry.status])).toEqual([['op-old', 'queued']]);
    } finally {
      mockPostOps.mockImplementation(async (_b: string, ops: SentOp[]) => ({ revision: 9, results: ops.map((op) => ({ id: op.id, status: 'applied' })) }));
    }
  });
});
