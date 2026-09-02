// -----------------------------------------------------------
//  [*] Map editor — guided panorama capture
//
//  The admin photographs a panorama by sweeping the phone
//  across a planned set of directions: the capture package's
//  tracker turns raw gyro + accel samples into the P1 pose,
//  its session decides when the camera is aimed and still
//  enough to shoot, the kit's CaptureHud draws the targets
//  over the live preview, and every accepted photo goes to
//  the server as one frame of the capture through the sync
//  package's upload queue (kind 'frame'). Finish closes the
//  capture on the server once every queued frame landed,
//  handing over the manifest's firstYawDeg so the stitcher
//  centres the panorama on the first ACCEPTED frame, and a
//  status card polls the stitch until the panorama is done
//  or failed.
//
//  The wiring back to the editor is deliberately editor-less:
//  this screen cannot reach the map editor's useEditor
//  actions (it is a separate route), so the NodeSheet hands
//  it the node's whole JSON and its current base revision as
//  route params, and "Priskirti taškui" enqueues ONE node
//  upsert — the node's data plus the pano fields, stamped
//  with that base — through this screen's own outbox, then
//  AWAITS the drain: a conflict (another editor bumped the
//  node past that base) surfaces as a confirm dialog right
//  here — overwrite or discard — because no other screen ever
//  shows this outbox. The editor underneath keeps its older
//  copy until its next draft load.
//
//  The queues here live under their own storage prefix
//  ('wayfind-capture'), so this screen's drains never race
//  the editor's provider over the same persisted items — and
//  the screen owns their whole lifecycle: leftovers from an
//  earlier session are dropped on mount, and a delivered (or
//  abandoned) capture clears both queues on the way out.
//
//  Sensor plumbing: expo's Gyroscope answers rad/s in the
//  tracker's device frame on both platforms, so it passes
//  through untouched. The Accelerometer answers g, but the
//  two platforms disagree on the sign — Android reports the
//  support force (device flat face-up reads +1 g on z, what
//  the tracker wants), iOS reports gravity itself (-1 g on
//  z) — so the adapter flips the accel vector on iOS and
//  nothing else. trackerSampleFrom is that whole adapter,
//  pure and exported for its test.
//
//  Split into (root component last):
//
//    trackerSampleFrom — the per-platform sensor adapter
//    helpers           — ids, pose fields
//    settleUpsert      — the write's awaited verdict + dialog
//    ModeChip          — one plan-mode choice
//    StatusCard        — queued / stitching / done / failed
//    CaptureBody       — camera, sensors, session, HUD
//    CaptureScreen     — gate, params, providers (default)
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { Button, EmptyState, LoadingSpinner, Screen, confirmAction } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { useRouteParam } from '@/hooks/useRouteParam';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/services/api';
import { KNF_BUILDING_ID } from '@/services/wayfind/seed';
import { createCapture, finishCapture, getCapture, wayfindTransport, type CaptureStatusAnswer } from '@/services/wayfindTransport';
import { createCaptureSession, createPoseTracker, planTargets, useCaptureSession, type CaptureSession, type PlanMode, type Pose, type PoseTracker, type TrackerSample, type Vec3 } from '@knf/wayfindcapture';
import { useDataEngine } from '@knf/dataengine';
import { WayfindSyncProvider, useWayfindSync, type DrainReport, type SyncEnv } from '@knf/wayfindsync';
import { CaptureHud, WayfindUiKitProvider } from '@knf/wayfinduikit';


type Stage = 'setup' | 'capture' | 'sending' | 'stitch' | 'done' | 'failed';

// The P4 default the whole plan is spaced for
const FRAME_HFOV_DEG = 60;

// The server refuses a finish under 8 frames — the button
// waits for the same line
const MIN_FRAMES = 8;

const POLL_MS = 3000;

// While a frame of this capture sits queued (a retry backoff),
// the queue is kicked on this beat — nothing else re-drains a
// backed-off item until a network-restore signal
const RETRY_KICK_MS = 1000;

const SENSOR_INTERVAL_MS = 20;

// A stalled queue must not integrate one giant step when it
// wakes — a late sample is capped, not trusted
const MAX_DT_MS = 200;




// -----------------------------------------------------------
// trackerSampleFrom
// -----------------------------------------------------------
//
// One expo sensor pair as the tracker's sample. Gyro rad/s
// passes through — both platforms already speak the device
// frame of the capture package (x right, y up the screen, z
// out of the screen). Accel g flips sign on iOS: the tracker
// reads the accel as the SUPPORT force (world up), which is
// what Android reports and the exact negative of what iOS
// reports. Units stay g — the tracker only uses the direction.
//
// Used by:
//   - CaptureBody (below) — every gyro tick
//   - __tests__/mapEditorCapture.test.tsx — the axis/sign test
// -----------------------------------------------------------

export function trackerSampleFrom(gyro: Vec3, accel: Vec3, dtMs: number, platform: string): TrackerSample {

  const flip = platform === 'ios' ? -1 : 1;
  return { gyro, accel: { x: accel.x * flip, y: accel.y * flip, z: accel.z * flip }, dtMs };
}




// -----------------------------------------------------------
// helpers
// -----------------------------------------------------------
//
// Ids and the pose-as-form-fields shape the frame upload
// carries (P5: all strings).
//
// Used by:
//   - CaptureBody (below)
// -----------------------------------------------------------

let minted = 0;
const mintId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}${(minted++).toString(36)}`;

// The server wants [A-Za-z0-9-]{8,64}; time + randomness is
// unique enough for one admin's phone
const mintCaptureId = (): string => `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const poseFields = (pose: Pose): Record<string, string> => ({
  yawDeg: String(pose.yawDeg),
  pitchDeg: String(pose.pitchDeg),
  rollDeg: String(pose.rollDeg),
});




// -----------------------------------------------------------
// settleUpsert
// -----------------------------------------------------------
//
// The editor-less write, awaited to a verdict instead of
// toasted blind: drain the outbox and read what happened to
// THIS op. Applied → 'applied'. Rejected — another editor
// bumped the node past the route params' base revision — is
// this screen's to surface (no other screen ever renders this
// outbox's rejected entries): the confirm dialog offers
// overwrite (keep-mine, re-queued without a base, drained
// again) or discard (the op is dropped). A drain that could
// not reach the server leaves the op queued for a later
// mount's drain → 'queued'; a keep-mine the server still
// refuses (bad data, not a stale base) is dropped → 'refused'.
//
// Used by:
//   - CaptureBody (below) — the assign write
//   - app/(main)/map-editor/align.tsx keeps its own copy for
//     the facing write (separate route, separate outbox)
// -----------------------------------------------------------

async function settleUpsert(sync: SyncEnv, opId: string, labels: { title: string; message: string; confirmLabel: string; cancelLabel: string }): Promise<'applied' | 'queued' | 'dropped' | 'refused'> {

  const verdict = (report: DrainReport | null, id: string): 'applied' | 'rejected' | 'queued' =>
    report === null ? 'queued' : report.applied.some((entry) => entry.opId === id) ? 'applied' : report.rejected.some((entry) => entry.op.id === id) ? 'rejected' : 'queued';


  const first = verdict(await sync.drain(), opId);
  if (first !== 'rejected') return first;
  if (!(await confirmAction(labels))) {
    sync.resolveConflict(opId, 'drop');
    return 'dropped';
  }


  // keep-mine re-queues the op as '<id>-again' with no base —
  // an overwrite the server takes unless the data itself is bad
  sync.resolveConflict(opId, 'keep-mine');
  const second = verdict(await sync.drain(), `${opId}-again`);
  if (second !== 'rejected') return second;
  sync.resolveConflict(`${opId}-again`, 'drop');
  return 'refused';
}




// -----------------------------------------------------------
// ModeChip
// -----------------------------------------------------------
//
// Used by:
//   - CaptureBody (below)
// -----------------------------------------------------------

function ModeChip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: active ? colors.brand : colors.surfaceSoft, marginRight: 8 }}
    >
      <Text style={{ color: active ? colors.onBrand : colors.ink, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}




// -----------------------------------------------------------
// StatusCard
// -----------------------------------------------------------
//
// The after-capture card: uploading frames, waiting on the
// stitch queue, stitching (with the worker's percentage),
// done with the assign button, or failed. One card, one
// stage prop — the body owns the machine.
//
// Used by:
//   - CaptureBody (below)
// -----------------------------------------------------------

function StatusCard({
  stage,
  status,
  framesDone,
  framesTotal,
  onAssign,
  onClose,
}: {
  stage: Stage;
  status: CaptureStatusAnswer | null;
  framesDone: number;
  framesTotal: number;
  onAssign: () => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const line =
    stage === 'sending'
      ? t('mapEditor.capture.sendingFrames', { done: framesDone, total: framesTotal })
      : stage === 'done'
        ? t('mapEditor.capture.done')
        : stage === 'failed'
          ? t('mapEditor.capture.failed')
          : status?.status === 'stitching'
            ? `${t('mapEditor.capture.stitching')}${status.progressPct != null ? ` ${Math.round(status.progressPct)}%` : ''}`
            : t('mapEditor.capture.queued');


  return (
    <View className="mx-lg mt-lg rounded-2xl bg-surface p-lg" testID="capture-status">
      {stage === 'sending' || stage === 'stitch' ? <LoadingSpinner /> : null}
      <Text className="mt-sm text-center font-raleway-medium text-base" style={{ color: stage === 'failed' ? colors.danger : colors.ink }} testID="capture-status-line">
        {line}
      </Text>
      {stage === 'done' && status?.pano ? (
        <>
          <Text className="mt-xs text-center font-raleway text-xs text-ink-faint" numberOfLines={1} testID="capture-pano-url">
            {status.pano.url}
          </Text>
          <View className="mt-md">
            <Button title={t('mapEditor.capture.assign')} onPress={onAssign} leftIcon="checkmark" />
          </View>
        </>
      ) : null}
      {stage === 'failed' ? (
        <View className="mt-md">
          <Button title={t('mapEditor.capture.close')} variant="outline" onPress={onClose} />
        </View>
      ) : null}
    </View>
  );
}




// -----------------------------------------------------------
// CaptureBody
// -----------------------------------------------------------
//
// The whole flow: mode → create the capture record → hold
// still while the tracker calibrates → aim/auto-shoot with
// the HUD over the preview → finish once every queued frame
// landed → poll the stitch → assign. The tracker and the
// session live in refs/state minted at start; the sensor
// subscriptions run only while the capture stage does.
//
// Used by:
//   - CaptureScreen (below)
// -----------------------------------------------------------

function CaptureBody({ nodeId, nodeData, baseRevision }: { nodeId: string; nodeData: Record<string, unknown>; baseRevision: number | null }) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const sync = useWayfindSync();
  const [permission, requestPermission] = useCameraPermissions();


  const [stage, setStage] = useState<Stage>('setup');
  const [mode, setMode] = useState<PlanMode>('walls');
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [status, setStatus] = useState<CaptureStatusAnswer | null>(null);
  const [calibrating, setCalibrating] = useState(true);
  const [preview, setPreview] = useState({ width: 0, height: 0 });

  const trackerRef = useRef<PoseTracker | null>(null);
  const lastAccelRef = useRef<Vec3>({ x: 0, y: 1, z: 0 });
  const lastTsRef = useRef<number | null>(null);
  const lastPoseRef = useRef<Pose>({ yawDeg: 0, pitchDeg: 0, rollDeg: 0 });
  const cameraRef = useRef<CameraView | null>(null);
  const finishingRef = useRef(false);

  const snap = useCaptureSession(session);


  // The frame uploads of THIS capture, as the queue holds them.
  // Deliberately NOT memoised: the queue mutates one array in
  // place (status.uploads is reference-stable), so a memo keyed
  // on it would freeze on the first computation — the filter
  // re-runs on every provider tick and reads the live statuses
  const myFrames = captureId ? sync.status.uploads.filter((item) => item.kind === 'frame' && item.fields.captureId === captureId) : [];
  const framesPending = myFrames.filter((item) => item.status === 'queued' || item.status === 'sending').length;
  const framesLanded = myFrames.filter((item) => item.status === 'done').length;
  const frameFailed = myFrames.some((item) => item.status === 'failed');


  const start = useCallback(async () => {
    const targets = planTargets({ mode });
    const id = mintCaptureId();
    try {
      await createCapture(KNF_BUILDING_ID, { id, nodeId, mode, frameHfovDeg: FRAME_HFOV_DEG, targets });
    } catch (error) {
      showToast('error', t('mapEditor.capture.startFailed'), error instanceof ApiError ? error.message : undefined);
      return;
    }
    trackerRef.current = createPoseTracker();
    lastTsRef.current = null;
    setCalibrating(true);
    setCaptureId(id);
    setSession(createCaptureSession({ targets }));
    setStage('capture');
  }, [mode, nodeId, t]);


  // The shoot answer: photo → accept + enqueue the frame; any
  // camera trouble → fail, and the session re-arms itself. In
  // a ref so the session subscription never re-subscribes
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const captureIdRef = useRef(captureId);
  captureIdRef.current = captureId;
  const shootRef = useRef<(targetId: string) => Promise<void>>(async () => {});
  shootRef.current = async (targetId: string) => {
    const live = session;
    const id = captureIdRef.current;
    if (!live || !id) return;
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) {
        live.fail(targetId);
        return;
      }
      const pose = lastPoseRef.current;
      live.accept(targetId, pose);
      // A retaken target may still hold its previous frame in
      // the queue, and the server's per-target PUT is last-
      // write-wins: an old frame parked in a retry backoff
      // would upload AFTER the new one and resurrect the
      // discarded photo. An in-flight (sending) one is left to
      // settle first — the single-flight drain sends the new
      // frame after it either way — then every queued/failed
      // leftover for this target is removed before the new
      // frame goes in
      const stale = () => syncRef.current.status.uploads.filter((item) => item.kind === 'frame' && item.fields.captureId === id && item.fields.targetId === targetId);
      if (stale().some((item) => item.status === 'sending')) await syncRef.current.drain();
      for (const item of stale()) {
        if (item.status === 'queued' || item.status === 'failed') syncRef.current.removeUpload(item.id);
      }
      syncRef.current.enqueueUpload({
        id: mintId('fr'),
        kind: 'frame',
        file: { uri: photo.uri, name: `${targetId}.jpg`, type: 'image/jpeg' },
        fields: { captureId: id, targetId, ...poseFields(pose) },
        target: targetId,
      });
    } catch {
      live.fail(targetId);
    }
  };

  useEffect(() => {
    if (!session) return;
    return session.subscribe((event) => {
      if (event?.type === 'shoot') void shootRef.current(event.targetId);
    });
  }, [session]);


  // Leftovers from an earlier session — frames of a capture
  // that is not this one — reload with the persisted queue and
  // would pollute every later count, so they are dropped once
  // the queue has loaded. Queued OPS are kept: an assign that
  // went out offline still deserves its drain
  const sweptRef = useRef(false);
  useEffect(() => {
    if (!sync.status.loaded || sweptRef.current) return;
    sweptRef.current = true;
    for (const item of sync.status.uploads) {
      if (item.kind === 'frame' && item.fields.captureId !== captureIdRef.current) sync.removeUpload(item.id);
    }
  }, [sync]);


  // Nothing else re-drains a backed-off frame: the queue only
  // drains on mount, enqueue and network restore, so a frame
  // waiting out its retry ladder would strand until a restore
  // signal arrived. While any frame of this capture sits
  // queued, the drain is kicked on a beat — a no-op until the
  // item's notBefore passes
  const framesWaiting = myFrames.some((item) => item.status === 'queued');
  useEffect(() => {
    if (!framesWaiting) return;
    const timer = setInterval(() => void syncRef.current.drain(), RETRY_KICK_MS);
    return () => clearInterval(timer);
  }, [framesWaiting]);


  // The sensors, only while aiming: accel is remembered, every
  // gyro tick pushes the tracker and feeds the session. The
  // session begins the moment calibration ends
  useEffect(() => {
    if (stage !== 'capture' || !session) return;
    Gyroscope.setUpdateInterval(SENSOR_INTERVAL_MS);
    Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
    const accelSub = Accelerometer.addListener((sample) => {
      lastAccelRef.current = { x: sample.x, y: sample.y, z: sample.z };
    });
    const gyroSub = Gyroscope.addListener((gyro) => {
      const tracker = trackerRef.current;
      if (!tracker) return;
      const now = Date.now();
      const dtMs = lastTsRef.current == null ? SENSOR_INTERVAL_MS : Math.min(MAX_DT_MS, now - lastTsRef.current);
      lastTsRef.current = now;
      const pose = tracker.push(trackerSampleFrom({ x: gyro.x, y: gyro.y, z: gyro.z }, lastAccelRef.current, dtMs, Platform.OS));
      const settled = tracker.state() === 'tracking';
      setCalibrating(!settled);
      if (!settled) return;
      if (session.phase() === 'idle') session.begin();
      lastPoseRef.current = pose;
      session.feed(pose, { x: gyro.x, y: gyro.y, z: gyro.z });
    });
    return () => {
      gyroSub.remove();
      accelSub.remove();
    };
  }, [stage, session]);


  const retake = useCallback(() => {
    if (!session) return;
    const shots = session.shots();
    const last = shots[shots.length - 1];
    if (last) session.retake(last.targetId);
  }, [session]);


  // Finish waits for the queue: once no frame of this capture
  // is queued or sending, the server is told the capture is
  // complete — with the manifest's firstYawDeg, the column the
  // stitcher rolls to the panorama's centre. A retried finish
  // whose first POST landed but whose answer was lost is
  // answered 409 not_uploading: the stitch is already running,
  // so the screen joins the poll instead of bouncing back to
  // the camera. A refused finish (too few frames — some upload
  // was rejected for good) drops back to aiming
  useEffect(() => {
    if (stage !== 'sending' || !captureId || !session || finishingRef.current) return;
    if (framesPending > 0) return;
    finishingRef.current = true;
    void (async () => {
      try {
        await finishCapture(captureId, KNF_BUILDING_ID, session.finish().firstYawDeg);
        setStage('stitch');
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && error.serverCode === 'not_uploading') {
          setStage('stitch');
          return;
        }
        showToast('error', error instanceof ApiError ? error.message : String(error));
        finishingRef.current = false;
        setStage('capture');
      }
    })();
  }, [stage, captureId, session, framesPending]);


  // The stitch poll, every 3 s until the server says done or
  // failed; a dropped poll just waits for the next tick
  useEffect(() => {
    if (stage !== 'stitch' || !captureId) return;
    let alive = true;
    const ask = async () => {
      try {
        const answer = await getCapture(captureId, KNF_BUILDING_ID);
        if (!alive) return;
        setStatus(answer);
        if (answer.status === 'done' && answer.pano) setStage('done');
        else if (answer.status === 'failed') setStage('failed');
      } catch {
        // Offline mid-stitch — keep polling
      }
    };
    void ask();
    const timer = setInterval(() => void ask(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [stage, captureId]);


  // The editor-less write: the node's data from the params,
  // the pano fields from the stitch, one upsert on the outbox,
  // then the drain's verdict (settleUpsert — a conflict is a
  // dialog, not a silent parked op). A NEW photo does not know
  // which plan direction it faces, so a panoYaw aligned on the
  // previous photo is cleared with it — panoHeading 'auto', an
  // honest machine guess — while re-assigning the unchanged
  // photo keeps the alignment. Success (applied, or queued for
  // an offline drain) toasts and leaves; a delivered write
  // also clears this screen's queues — op delivered, frames
  // consumed
  const assigningRef = useRef(false);
  const assign = useCallback(async () => {
    const pano = status?.pano;
    if (!pano || assigningRef.current) return;
    assigningRef.current = true;
    const opId = mintId('op');
    const samePano = nodeData.pano === pano.url;
    sync.enqueueOps([
      {
        id: opId,
        type: 'upsert',
        kind: 'node',
        entityId: nodeId,
        data: {
          ...nodeData,
          pano: pano.url,
          panoGeometry: { hfovDeg: pano.hfovDeg, vfovDeg: pano.vfovDeg, centreYawDeg: pano.centreYawDeg ?? null },
          ...(samePano ? {} : { panoYaw: null, panoHeading: { source: 'auto' } }),
        },
        ...(baseRevision != null ? { baseRevision } : {}),
      },
    ]);
    const settled = await settleUpsert(sync, opId, {
      title: t('mapEditor.conflictTitle'),
      message: t('mapEditor.conflictBody'),
      confirmLabel: t('mapEditor.keepMine'),
      cancelLabel: t('mapEditor.takeTheirs'),
    });
    assigningRef.current = false;
    if (settled === 'refused') {
      showToast('error', t('mapEditor.saveRejected'));
      return;
    }
    if (settled === 'dropped') return;
    if (settled === 'applied') sync.clearAll();
    showToast('success', t('mapEditor.capture.assigned'));
    router.back();
  }, [status, sync, nodeId, nodeData, baseRevision, t, router]);


  // The way out of a failed (or abandoned) capture: this
  // screen owns its queues, so nothing may stay behind
  const close = useCallback(() => {
    sync.clearAll();
    router.back();
  }, [sync, router]);


  const onPreviewLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPreview((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };


  if (!permission) return <LoadingSpinner />;
  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center px-lg">
        <Text className="mb-md text-center font-raleway text-base text-ink">{t('mapEditor.capture.cameraNeeded')}</Text>
        <Button title={t('mapEditor.capture.cameraAllow')} onPress={() => void requestPermission()} />
      </View>
    );
  }


  if (stage === 'setup') {
    return (
      <View className="flex-1 px-lg pt-lg">
        <View className="mb-sm flex-row">
          <ModeChip label={t('mapEditor.capture.modeWalls')} active={mode === 'walls'} onPress={() => setMode('walls')} testID="capture-mode-walls" />
          <ModeChip label={t('mapEditor.capture.modeFull')} active={mode === 'full'} onPress={() => setMode('full')} testID="capture-mode-full" />
        </View>
        <Text className="mb-md font-raleway text-sm text-ink-soft">{t('mapEditor.capture.modeHint')}</Text>
        <Button title={t('mapEditor.capture.start')} onPress={() => void start()} leftIcon="camera-outline" />
      </View>
    );
  }


  if (stage !== 'capture') {
    return <StatusCard stage={stage} status={status} framesDone={framesLanded} framesTotal={snap.shotsDone} onAssign={() => void assign()} onClose={close} />;
  }


  return (
    <View className="flex-1">
      <View style={{ flex: 1 }} onLayout={onPreviewLayout} testID="capture-camera-area">
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" animateShutter={false} />
        {preview.width > 0 && preview.height > 0 ? (
          <View style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
            <CaptureHud
              targets={snap.targets}
              currentId={snap.currentId}
              pose={lastPoseRef.current}
              fovDeg={FRAME_HFOV_DEG}
              aligned={snap.aim?.aligned ?? false}
              stable={snap.aim?.stable ?? false}
              shotsDone={snap.shotsDone}
              shotsTotal={snap.shotsTotal}
              width={preview.width}
              height={preview.height}
            />
          </View>
        ) : null}
        {calibrating ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: '45%', alignItems: 'center' }} pointerEvents="none" testID="capture-calibrating">
            <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.scrim }}>
              <Text style={{ color: colors.onBrand, fontSize: 14, fontWeight: '600' }}>{t('mapEditor.capture.holdStill')}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {frameFailed ? (
        <Text className="px-lg pt-xs text-center font-raleway text-xs" style={{ color: colors.danger }} testID="capture-frame-failed">
          {t('mapEditor.capture.frameFailed')}
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between px-lg py-md">
        <Button title={t('mapEditor.capture.retake')} variant="outline" size="sm" onPress={retake} disabled={snap.shotsDone === 0} />
        <Button title={t('mapEditor.capture.finish')} size="sm" onPress={() => setStage('sending')} disabled={snap.shotsDone < MIN_FRAMES} />
      </View>
      {snap.shotsDone < MIN_FRAMES ? (
        <Text className="pb-sm text-center font-raleway text-xs text-ink-faint" testID="capture-need-frames">
          {t('mapEditor.capture.needFrames', { count: MIN_FRAMES })}
        </Text>
      ) : null}
    </View>
  );
}




// -----------------------------------------------------------
// CaptureScreen (default export)
// -----------------------------------------------------------
//
// The gate (admin / curator), the params (nodeId, the node's
// JSON, its base revision — all minted by the NodeSheet), and
// the providers: the kit for the HUD, the sync package under
// its own storage prefix for the frame queue and the final
// upsert.
//
// Used by:
//   - expo-router — the (main)/map-editor/capture route
//   - app/(main)/map-editor/index.tsx — the NodeSheet's
//     capture button pushes here
// -----------------------------------------------------------

export default function CaptureScreen() {

  const { t } = useTranslation();
  const { user, hydrated } = useAuth();
  const { onRestore } = useDataEngine();
  const allowed = user?.role === 'admin' || user?.role === 'curator';

  const nodeId = useRouteParam('nodeId');
  const nodeJson = useRouteParam('node');
  const baseParam = useRouteParam('baseRevision');


  // The node's data as the NodeSheet last saw it — the id is
  // dropped because an upsert's data never carries it
  const nodeData = useMemo<Record<string, unknown> | null>(() => {
    if (!nodeJson) return null;
    try {
      const { id: _dropped, ...data } = JSON.parse(nodeJson) as { id?: string } & Record<string, unknown>;
      void _dropped;
      return data;
    } catch {
      return null;
    }
  }, [nodeJson]);
  const baseRevision = baseParam != null && baseParam !== '' && Number.isFinite(Number(baseParam)) ? Number(baseParam) : null;


  if (!hydrated) {
    return (
      <Screen>
        <LoadingSpinner />
      </Screen>
    );
  }
  if (!allowed || !nodeId || !nodeData) {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title={t('mapEditor.noAccess')} />
      </Screen>
    );
  }


  return (
    <Screen>
      <WayfindUiKitProvider>
        <WayfindSyncProvider buildingId={KNF_BUILDING_ID} storage={AsyncStorage} transport={wayfindTransport} onRestore={onRestore} keyPrefix="wayfind-capture">
          <CaptureBody nodeId={nodeId} nodeData={nodeData} baseRevision={baseRevision} />
        </WayfindSyncProvider>
      </WayfindUiKitProvider>
    </Screen>
  );
}
