// -----------------------------------------------------------
//  [*] Map editor — panorama facing alignment
//
//  The admin sets which plan direction a node's panorama
//  faces: pick a neighbour, turn the photo until that
//  neighbour's doorway sits under the centre crosshair, and
//  confirm. The arithmetic is one line — the neighbour's plan
//  bearing minus the view's yaw in the photo's frame, folded
//  into [0, 360) — because a photo centred on the neighbour
//  means the photo's yaw-zero column faces the neighbour's
//  bearing minus however far the view had to turn to reach
//  it. A fine-tune stepper under the confirm nudges the
//  result ±10° for a doorway the crosshair cannot quite pin.
//
//  The write is the same editor-less wiring the capture
//  screen uses: the NodeSheet passes the node's whole JSON,
//  its base revision, and the neighbour list (name + plan
//  bearing, computed over the draft with the engine's
//  bearingDeg) as route params; Confirm enqueues ONE node
//  upsert — the node's data with panoYaw and panoHeading
//  { source: 'aligned' } — through this screen's own outbox
//  (storage prefix 'wayfind-align', so its drains never race
//  the editor's provider), then AWAITS the drain: a conflict
//  (another editor bumped the node past the params' base) is
//  surfaced right here as a confirm dialog — overwrite or
//  discard — because no other screen ever shows this outbox.
//  Only a clean answer toasts success and goes back.
//
//  Split into (root component last):
//
//    fold360      — the confirm's arithmetic, exported for tests
//    settleUpsert — the write's awaited verdict + conflict dialog
//    FineTune     — the ±10° stepper
//    AlignBody    — stage, chips, crosshair, confirm
//    AlignScreen  — gate, params, providers (default export)
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button, EmptyState, LoadingSpinner, Screen, confirmAction } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { useRouteParam } from '@/hooks/useRouteParam';
import { useTheme } from '@/hooks/useTheme';
import { getUploadUrl } from '@/services/api';
import { BUNDLED_PANOS, KNF_BUILDING_ID } from '@/services/wayfind/seed';
import { wayfindTransport } from '@/services/wayfindTransport';
import { useDataEngine } from '@knf/dataengine';
import { WayfindSyncProvider, useWayfindSync, type DrainReport, type SyncEnv } from '@knf/wayfindsync';
import { PanoramaStage, WayfindUiKitProvider, type KitPanoGeometry } from '@knf/wayfinduikit';


export interface AlignNeighbour {
  nodeId: string;
  name: string;
  bearingDeg: number;
}

// One nudge of the fine-tune stepper, clamped to its range
const FINE_STEP_DEG = 1;
const FINE_RANGE_DEG = 10;

const STAGE_HEIGHT = 300;

let minted = 0;
const mintId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}${(minted++).toString(36)}`;

// A route param is JSON or it is nothing — a mangled deep link
// must not crash the screen
const parseJson = <T,>(raw: string | undefined): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};




// -----------------------------------------------------------
// fold360
// -----------------------------------------------------------
//
// A degree value folded into [0, 360) — the frame panoYaw
// lives in. Negative inputs fold up, exact multiples fold to
// zero.
//
// Used by:
//   - AlignBody (below) — panoYaw = fold360(bearing − viewYaw)
//   - __tests__/mapEditorAlign.test.tsx
// -----------------------------------------------------------

export function fold360(deg: number): number {

  return ((deg % 360) + 360) % 360;
}




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
//   - AlignBody (below) — the confirm write
//   - app/(main)/map-editor/capture.tsx keeps its own copy for
//     the assign write (separate route, separate outbox)
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
// FineTune
// -----------------------------------------------------------
//
// The ±10° adjuster: two steppers around the current offset.
// Steppers rather than a drag track — the app carries no
// slider control, and a 1° step is exactly the precision the
// crosshair cannot deliver by eye.
//
// Used by:
//   - AlignBody (below)
// -----------------------------------------------------------

function FineTune({ value, onChange }: { value: number; onChange: (next: number) => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const nudge = (dir: -1 | 1) => onChange(Math.max(-FINE_RANGE_DEG, Math.min(FINE_RANGE_DEG, value + dir * FINE_STEP_DEG)));


  return (
    <View className="mt-sm flex-row items-center justify-center" testID="align-fine">
      <Text className="mr-md font-raleway text-sm text-ink-soft">{t('mapEditor.align.fine')}</Text>
      <Pressable onPress={() => nudge(-1)} accessibilityRole="button" hitSlop={8} testID="align-fine-minus" style={{ padding: 8 }}>
        <Ionicons name="remove-circle-outline" size={24} color={colors.brand} />
      </Pressable>
      <Text className="mx-sm font-raleway-medium text-sm text-ink" testID="align-fine-value">{`${value > 0 ? '+' : ''}${value}°`}</Text>
      <Pressable onPress={() => nudge(1)} accessibilityRole="button" hitSlop={8} testID="align-fine-plus" style={{ padding: 8 }}>
        <Ionicons name="add-circle-outline" size={24} color={colors.brand} />
      </Pressable>
    </View>
  );
}




// -----------------------------------------------------------
// AlignBody
// -----------------------------------------------------------
//
// The panorama on the stage (bundled asset or served url,
// resolved the way the map tab does it), the neighbour
// chips, the instruction naming the picked neighbour, the
// fixed centre crosshair, and Confirm. The stage reports the
// live yaw through onYawChange in the photo's own frame —
// exactly the frame the fold arithmetic wants.
//
// Used by:
//   - AlignScreen (below)
// -----------------------------------------------------------

function AlignBody({
  nodeId,
  nodeData,
  baseRevision,
  pano,
  geometry,
  neighbours,
}: {
  nodeId: string;
  nodeData: Record<string, unknown>;
  baseRevision: number | null;
  pano: string;
  geometry: KitPanoGeometry | null;
  neighbours: AlignNeighbour[];
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const sync = useWayfindSync();


  const [picked, setPicked] = useState(0);
  const [viewYaw, setViewYaw] = useState(0);
  const [fine, setFine] = useState(0);

  // Bundled seed panoramas are require() numbers; anything else
  // is a served reference the kit's own resolver makes absolute
  const source = BUNDLED_PANOS[pano] ?? pano;
  const neighbour = neighbours[picked] ?? null;


  // Enqueue the one upsert, then await its verdict: applied or
  // queued-offline toasts and leaves, a conflict runs the
  // dialog (overwrite drains again, discard drops and stays),
  // a refused overwrite stays with an error
  const confirmingRef = useRef(false);
  const confirm = useCallback(async () => {
    if (!neighbour || confirmingRef.current) return;
    confirmingRef.current = true;
    const opId = mintId('op');
    const panoYaw = fold360(neighbour.bearingDeg - viewYaw + fine);
    sync.enqueueOps([
      {
        id: opId,
        type: 'upsert',
        kind: 'node',
        entityId: nodeId,
        data: { ...nodeData, panoYaw, panoHeading: { source: 'aligned' } },
        ...(baseRevision != null ? { baseRevision } : {}),
      },
    ]);
    const settled = await settleUpsert(sync, opId, {
      title: t('mapEditor.conflictTitle'),
      message: t('mapEditor.conflictBody'),
      confirmLabel: t('mapEditor.keepMine'),
      cancelLabel: t('mapEditor.takeTheirs'),
    });
    confirmingRef.current = false;
    if (settled === 'refused') {
      showToast('error', t('mapEditor.saveRejected'));
      return;
    }
    if (settled === 'dropped') return;
    showToast('success', t('mapEditor.align.saved'));
    router.back();
  }, [neighbour, viewYaw, fine, sync, nodeId, nodeData, baseRevision, t, router]);


  if (neighbours.length === 0) {
    return <EmptyState icon="git-branch-outline" title={t('mapEditor.align.noNeighbours')} />;
  }


  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">

      <View>
        <PanoramaStage source={source} geometry={geometry} height={STAGE_HEIGHT} onYawChange={setViewYaw} showHint={false} />
        {/* The aim line the neighbour is turned onto */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: STAGE_HEIGHT, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none" testID="align-crosshair">
          <View style={{ width: 2, height: 48, backgroundColor: colors.onBrand, opacity: 0.85 }} />
          <View style={{ position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.onBrand, opacity: 0.85 }} />
        </View>
      </View>

      <Text className="mt-md px-lg font-raleway-medium text-xs uppercase text-ink-soft">{t('mapEditor.align.pickNeighbour')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }} keyboardShouldPersistTaps="handled">
        {neighbours.map((item, index) => (
          <Pressable
            key={item.nodeId}
            onPress={() => setPicked(index)}
            accessibilityRole="button"
            accessibilityState={{ selected: index === picked }}
            testID={`align-neighbour-${item.nodeId}`}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: index === picked ? colors.brand : colors.surfaceSoft, marginRight: 6 }}
          >
            <Text style={{ color: index === picked ? colors.onBrand : colors.ink, fontSize: 13, fontWeight: '600' }}>{item.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text className="px-lg py-xs text-center font-raleway text-sm text-ink" testID="align-instruction">
        {t('mapEditor.align.instruction', { name: neighbour?.name ?? '' })}
      </Text>

      <View className="mt-sm px-lg">
        <Button title={t('mapEditor.align.confirm')} onPress={() => void confirm()} leftIcon="checkmark" />
      </View>
      <FineTune value={fine} onChange={setFine} />

    </ScrollView>
  );
}




// -----------------------------------------------------------
// AlignScreen (default export)
// -----------------------------------------------------------
//
// The gate (admin / curator) and the params the NodeSheet
// minted: nodeId, the node's JSON (pano, panoGeometry and
// the rest of its data ride inside it), its base revision,
// and the neighbour list with plan bearings. A node without
// a panorama has nothing to align.
//
// Used by:
//   - expo-router — the (main)/map-editor/align route
//   - app/(main)/map-editor/index.tsx — the NodeSheet's
//     align button pushes here
// -----------------------------------------------------------

export default function AlignScreen() {

  const { t } = useTranslation();
  const { user, hydrated } = useAuth();
  const { onRestore } = useDataEngine();
  const allowed = user?.role === 'admin' || user?.role === 'curator';

  const nodeId = useRouteParam('nodeId');
  const nodeJson = useRouteParam('node');
  const baseParam = useRouteParam('baseRevision');
  const neighboursJson = useRouteParam('neighbours');


  const node = useMemo(() => parseJson<{ id?: string; pano?: string | null; panoGeometry?: KitPanoGeometry | null } & Record<string, unknown>>(nodeJson), [nodeJson]);
  const neighbours = useMemo(() => parseJson<AlignNeighbour[]>(neighboursJson) ?? [], [neighboursJson]);
  const nodeData = useMemo<Record<string, unknown> | null>(() => {
    if (!node) return null;
    const { id: _dropped, ...data } = node;
    void _dropped;
    return data;
  }, [node]);
  const baseRevision = baseParam != null && baseParam !== '' && Number.isFinite(Number(baseParam)) ? Number(baseParam) : null;

  // The kit needs served references made absolute, like the
  // map tab's host does it
  const env = useMemo(() => ({ resolveImageUrl: (url: string) => getUploadUrl(url) ?? url }), []);


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
  if (!node?.pano) {
    return (
      <Screen>
        <EmptyState icon="image-outline" title={t('mapEditor.align.noPano')} />
      </Screen>
    );
  }


  return (
    <Screen>
      <WayfindUiKitProvider env={env}>
        <WayfindSyncProvider buildingId={KNF_BUILDING_ID} storage={AsyncStorage} transport={wayfindTransport} onRestore={onRestore} keyPrefix="wayfind-align">
          <AlignBody nodeId={nodeId} nodeData={nodeData} baseRevision={baseRevision} pano={node.pano} geometry={node.panoGeometry ?? null} neighbours={neighbours} />
        </WayfindSyncProvider>
      </WayfindUiKitProvider>
    </Screen>
  );
}
