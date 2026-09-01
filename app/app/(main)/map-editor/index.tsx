// -----------------------------------------------------------
//  [*] Map editor — admins draw the building on the phone
//
//  The admin's side of the wayfinder: the draft graph on the
//  server, edited on the floor plan itself. A tool rail picks
//  what a tap does (select, add a node, link two nodes, add a
//  room), the selected node drags, and a sheet under the plan
//  edits the picked node (kind, landmark, its room, the
//  entrance, the panorama and its facing, the QR code, its
//  links) or the shown level (label, scale, north, the plan
//  drawing). Every edit is one undo step (a drag is one),
//  reaches the server through the sync package's outbox as
//  soon as the phone is online — and waits, persisted, when it
//  is not — and comes back as the entities' new revisions so
//  the next edits carry the right base. Another editor's
//  change to the same entity is a conflict the sheet shows
//  with two answers: keep mine, take theirs. Publish validates
//  on the server and hands students the new revision.
//
//  First run: a server without the building offers to create
//  it from the bundled seed (the building row, then every seed
//  entity as an op). A server out of reach offers the bundled
//  seed to edit with the edits queued. Edits queued while
//  offline are replayed to the server, not onto a later local
//  reload — a phone restarted offline mid-session shows the
//  last fetched draft until the queue has gone out.
//
//  Editing the graph is the three packages together: the
//  editor (document, history, validation), the sync (outbox,
//  uploads, publish) and the kit's plan viewer (tap, drag,
//  select). The engine's validator is the editor's validator.
//
//  Split into (root component last):
//
//    helpers          — ids, plan shapes, seed ops
//    Chip / ToolRail  — the tool picker
//    Field            — a labelled numeric / text input
//    NodeSheet        — the picked node
//    LevelSheet       — the shown level
//    IssuesPanel      — the validator's findings
//    ConflictRow / SyncLine — one rejected op; the counts
//    EditorBody       — the plan and the sheets
//    MapEditorScreen  — gate, load, providers (default export)
//    SeedSender       — the first-run bootstrap through the outbox
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Switch, Text, View, type LayoutChangeEvent } from 'react-native';
import { Svg, Line, SvgXml } from 'react-native-svg';

import { Button, EmptyState, Header, Input, LoadingSpinner, Screen, confirmAction } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { usePlanXml } from '@/hooks/usePlanXml';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/services/api';
import { KNF_BUILDING_ID, KNF_GRAPH } from '@/services/wayfind/seed';
import { createBuilding, fetchDraft, wayfindTransport, type DraftAnswer } from '@/services/wayfindTransport';
import { useDataEngine } from '@knf/dataengine';
import { changesToOps, useEditor, type Change, type EditorActions, type EditorIssue, type EditorState } from '@knf/wayfindeditor';
import { validateGraph, type BuildingGraph, type GraphEdge, type NodeKind } from '@knf/wayfindengine';
import { WayfindSyncProvider, useWayfindSync, type OutboxEntry, type UploadItem } from '@knf/wayfindsync';
import { FloorPlan, FloorSwitcher, WayfindUiKitProvider, type PlanNode, type PlanRoom } from '@knf/wayfinduikit';


type Tool = 'select' | 'node' | 'link' | 'room';

interface Draft {
  document: BuildingGraph;
  revision: number;
  revisions: Record<string, number>;
  offline: boolean;
}

const NODE_KINDS: NodeKind[] = ['corridor', 'door', 'stairs', 'elevator', 'ramp', 'entrance', 'room'];
const EDGE_KINDS: GraphEdge['kind'][] = ['hallway', 'door', 'stairs', 'elevator', 'ramp'];

// Ids are minted on the phone: time-ordered, unique enough for
// one building's authors
let minted = 0;
const mint = (prefix: string): string => `${prefix}-${Date.now().toString(36)}${(minted++).toString(36)}`;

// The whole seed as ops with deterministic ids NAMED FOR THE
// BUILDING — a second bootstrap after a dropped connection is
// a batch of duplicates, and a second building's seed can
// never collide with the first's in the server's op log
const seedOps = (graph: BuildingGraph, buildingId: string) => {
  const changes: Change[] = [
    ...graph.levels.map((level): Change => ({ kind: 'level', id: level.id, before: null, after: level })),
    ...graph.nodes.map((node): Change => ({ kind: 'node', id: node.id, before: null, after: node })),
    ...graph.edges.map((edge): Change => ({ kind: 'edge', id: edge.id ?? `${edge.a}--${edge.b}`, before: null, after: { ...edge, id: edge.id ?? `${edge.a}--${edge.b}` } })),
    ...graph.rooms.map((room): Change => ({ kind: 'room', id: room.id, before: null, after: room })),
    { kind: 'building', before: { entranceNodeId: null, northDeg: null }, after: { entranceNodeId: graph.entranceNodeId ?? null, northDeg: graph.northDeg ?? null } },
  ];
  let n = 0;
  return changesToOps(changes, {}, () => `seed-${buildingId}-${n++}`);
};

const numberOr = (text: string, fallback: number | null): number | null => {
  if (text.trim() === '') return null;
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : fallback;
};

const edgeId = (edge: GraphEdge): string => edge.id ?? `${edge.a}--${edge.b}`;







// -----------------------------------------------------------
// Chip / ToolRail
// -----------------------------------------------------------
//
// One active tool; the link tool remembers its first node in
// the body's state and says so under the rail.
//
// Used by:
//   - EditorBody / NodeSheet / ConflictRow (below)
// -----------------------------------------------------------

function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      testID={testID}
      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? colors.brand : colors.surfaceSoft, marginRight: 6 }}
    >
      <Text style={{ color: active ? colors.onBrand : colors.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}


function ToolRail({ tool, onChange }: { tool: Tool; onChange: (tool: Tool) => void }) {
  const { t } = useTranslation();
  const tools: { key: Tool; label: string }[] = [
    { key: 'select', label: t('mapEditor.toolSelect') },
    { key: 'node', label: t('mapEditor.toolNode') },
    { key: 'link', label: t('mapEditor.toolLink') },
    { key: 'room', label: t('mapEditor.toolRoom') },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }} keyboardShouldPersistTaps="handled">
      {tools.map((item) => (
        <Chip key={item.key} label={item.label} active={tool === item.key} onPress={() => onChange(item.key)} testID={`editor-tool-${item.key}`} />
      ))}
    </ScrollView>
  );
}







// -----------------------------------------------------------
// Field
// -----------------------------------------------------------
//
// A labelled input that commits on blur / submit — a numeric
// field parses a comma too — so a keystroke is never an undo
// step.
//
// Used by:
//   - NodeSheet / LevelSheet (below)
// -----------------------------------------------------------

function Field({ label, value, onCommit, numeric, testID }: { label: string; value: string; onCommit: (text: string) => void; numeric?: boolean; testID?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return <Input label={label} value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} keyboardType={numeric ? 'decimal-pad' : 'default'} testID={testID} containerClassName="mb-sm" />;
}







// -----------------------------------------------------------
// NodeSheet
// -----------------------------------------------------------
//
// The picked node: kind, landmark, the room it is the door of
// (create / rename / unlink), the entrance, the panorama (pick
// a photo → the upload queue → the stored url lands on the
// node when the upload finishes; a refused upload gets its own
// row with retry and remove, and never hides the url a later
// upload stored) and its facing, the QR payload, the links
// from it, and delete.
//
// Used by:
//   - EditorBody (below)
// -----------------------------------------------------------

function NodeSheet({ state, actions, nodeId, onPickPanorama, uploads, onRetryUpload, onRemoveUpload }: { state: EditorState<BuildingGraph>; actions: EditorActions; nodeId: string; onPickPanorama: (nodeId: string) => void; uploads: readonly UploadItem[]; onRetryUpload: (id: string) => void; onRemoveUpload: (id: string) => void }) {

  const { t } = useTranslation();
  const node = state.document.nodes.find((n) => n.id === nodeId);
  const room = node?.roomId ? state.document.rooms.find((r) => r.id === node.roomId) : null;
  if (!node) return null;
  const links = state.document.edges.filter((edge) => edge.a === nodeId || edge.b === nodeId);
  const isEntrance = state.document.entranceNodeId === nodeId;
  // The status line prefers the newest in-flight upload; a
  // parked failure is its own row, not the node's whole story
  const panoUploads = uploads.filter((item) => item.target === nodeId && item.kind === 'panorama');
  const inFlight = [...panoUploads].reverse().find((item) => item.status === 'queued' || item.status === 'sending') ?? null;
  const failed = [...panoUploads].reverse().find((item) => item.status === 'failed') ?? null;


  const remove = async () => {
    if (!(await confirmAction({ title: t('mapEditor.deleteNode'), message: t('mapEditor.confirmDeleteNode'), confirmLabel: t('mapEditor.deleteNode'), cancelLabel: t('common.cancel'), destructive: true }))) return;
    const answer = actions.deleteNode(nodeId);
    if (answer.blocked?.reason === 'node_has_rooms') {
      if (!(await confirmAction({ title: t('mapEditor.deleteNode'), message: t('mapEditor.forceDeleteNode'), confirmLabel: t('mapEditor.deleteNode'), cancelLabel: t('common.cancel'), destructive: true }))) return;
      actions.deleteNode(nodeId, { force: true });
    }
    actions.select(null);
  };

  const createRoom = () => {
    const id = mint('r');
    actions.begin('add room');
    actions.addRoom({ id, name: t('mapEditor.newRoom'), level: node.level, nodeId, category: 'other' });
    actions.updateNode(nodeId, { roomId: id, kind: node.kind === 'corridor' ? 'room' : node.kind });
    actions.end();
  };


  return (
    <View testID="editor-node-sheet">
      <Text className="mb-xs font-raleway-bold text-base text-ink">{t('mapEditor.node')} · {nodeId}</Text>

      <Text className="mb-xs font-raleway-medium text-xs uppercase text-ink-soft">{t('mapEditor.kind')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        {NODE_KINDS.map((kind) => (
          <Chip key={kind} label={t(`mapEditor.kinds.${kind}`)} active={node.kind === kind} onPress={() => actions.updateNode(nodeId, { kind })} testID={`editor-kind-${kind}`} />
        ))}
      </ScrollView>

      <Field label={t('mapEditor.landmark')} value={node.landmark ?? ''} onCommit={(text) => actions.updateNode(nodeId, { landmark: text.trim() || null })} />

      {room ? (
        <>
          <Field label={t('mapEditor.roomName')} value={room.name} onCommit={(text) => actions.updateRoom(room.id, { name: text.trim() || room.name })} testID="editor-room-name" />
          <Button title={t('mapEditor.unlinkRoom')} variant="outline" size="sm" onPress={() => actions.updateNode(nodeId, { roomId: null })} />
        </>
      ) : (
        <Button title={t('mapEditor.createRoom')} variant="outline" size="sm" onPress={createRoom} />
      )}

      <View className="mt-sm flex-row items-center justify-between">
        <Text className="font-raleway text-sm text-ink">{t('mapEditor.entrance')}</Text>
        <Switch value={isEntrance} onValueChange={(on) => {
            actions.setBuilding({ entranceNodeId: on ? nodeId : null });
          }} testID="editor-entrance" />
      </View>

      <Text className="mt-sm font-raleway-medium text-xs uppercase text-ink-soft">{t('mapEditor.panorama')}</Text>
      <Text className="mb-xs font-raleway text-xs text-ink-faint" numberOfLines={1}>{inFlight ? t('mapEditor.uploadQueued') : (node.pano ?? '—')}</Text>
      {failed ? (
        <View className="mb-xs flex-row items-center" testID="editor-upload-failed">
          <Text className="flex-1 font-raleway text-xs" style={{ color: '#DC2626' }} numberOfLines={1}>{t('mapEditor.uploadFailed')}</Text>
          <Chip label={t('mapEditor.retry')} onPress={() => onRetryUpload(failed.id)} testID="editor-upload-retry" />
          <Chip label={t('common.clear')} onPress={() => onRemoveUpload(failed.id)} testID="editor-upload-remove" />
        </View>
      ) : null}
      <Button title={t('mapEditor.pickPanorama')} variant="outline" size="sm" leftIcon="image-outline" onPress={() => onPickPanorama(nodeId)} />
      <Field label={t('mapEditor.panoYaw')} value={node.panoYaw == null ? '' : String(node.panoYaw)} numeric onCommit={(text) => actions.updateNode(nodeId, { panoYaw: numberOr(text, node.panoYaw ?? null), panoHeading: { source: 'manual' } })} />
      <Field label={t('mapEditor.qr')} value={node.qr ?? ''} onCommit={(text) => actions.updateNode(nodeId, { qr: text.trim() || null })} />

      <Text className="mt-sm font-raleway-medium text-xs uppercase text-ink-soft">{t('mapEditor.links')}</Text>
      {links.map((edge) => (
        <View key={edgeId(edge)} className="flex-row items-center justify-between py-xs">
          <Text className="flex-1 font-raleway text-sm text-ink" numberOfLines={1}>{edge.a === nodeId ? edge.b : edge.a} · {t(`mapEditor.kinds.${edge.kind}`)}{edge.lengthM != null ? ` · ${edge.lengthM} m` : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 160 }} keyboardShouldPersistTaps="handled">
            {EDGE_KINDS.map((kind) => (
              <Chip key={kind} label={t(`mapEditor.kinds.${kind}`)} active={edge.kind === kind} onPress={() => actions.updateEdge(edgeId(edge), { kind })} />
            ))}
          </ScrollView>
          <Pressable onPress={() => actions.deleteEdge(edgeId(edge))} accessibilityRole="button" accessibilityLabel={t('mapEditor.deleteLink')} hitSlop={8} testID={`editor-delete-link-${edgeId(edge)}`}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </Pressable>
        </View>
      ))}

      <View className="mt-md">
        <Button title={t('mapEditor.deleteNode')} variant="outline" size="sm" leftIcon="trash-outline" onPress={() => void remove()} />
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// LevelSheet
// -----------------------------------------------------------
//
// The shown level: label, scale, north, the plan drawing (an
// SVG picked from the files → the upload queue → the stored
// url lands on the level), and a new level.
//
// Used by:
//   - EditorBody (below)
// -----------------------------------------------------------

function LevelSheet({ state, actions, levelId, onPickPlan }: { state: EditorState<BuildingGraph>; actions: EditorActions; levelId: string; onPickPlan: (levelId: string) => void }) {

  const { t } = useTranslation();
  const level = state.document.levels.find((l) => l.id === levelId);
  if (!level) return null;


  const addLevel = () => {
    const ordinal = Math.max(0, ...state.document.levels.map((l) => l.ordinal)) + 1;
    const id = `L${ordinal}`;
    actions.addLevel({ id, label: `${ordinal} aukštas`, viewBox: [0, 0, 1000, 600], metersPerPixel: 0.05, ordinal, plan: null });
    actions.showLevel(id);
  };


  return (
    <View testID="editor-level-sheet">
      <Text className="mb-xs font-raleway-bold text-base text-ink">{t('mapEditor.level')} · {level.id}</Text>
      <Field label={t('mapEditor.levelLabel')} value={level.label} onCommit={(text) => actions.updateLevel(levelId, { label: text.trim() || level.label })} testID="editor-level-label" />
      <Field label={t('mapEditor.metersPerPixel')} value={String(level.metersPerPixel)} numeric onCommit={(text) => actions.updateLevel(levelId, { metersPerPixel: numberOr(text, level.metersPerPixel) ?? level.metersPerPixel })} />
      <Field label={t('mapEditor.northDeg')} value={level.northDeg == null ? '' : String(level.northDeg)} numeric onCommit={(text) => actions.updateLevel(levelId, { northDeg: numberOr(text, level.northDeg ?? null) })} />
      <Text className="mb-xs font-raleway text-xs text-ink-faint" numberOfLines={1}>{level.plan ?? '—'}</Text>
      <Button title={t('mapEditor.uploadPlan')} variant="outline" size="sm" leftIcon="document-outline" onPress={() => onPickPlan(levelId)} />
      <View className="mt-sm">
        <Button title={t('mapEditor.addLevel')} variant="outline" size="sm" leftIcon="add" onPress={addLevel} />
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// IssuesPanel
// -----------------------------------------------------------
//
// Used by:
//   - EditorBody (below)
// -----------------------------------------------------------

function IssuesPanel({ issues, ignored, onIgnore }: { issues: EditorIssue[]; ignored: string[]; onIgnore: (id: string) => void }) {
  const { t } = useTranslation();
  const shown = issues.filter((issue) => !ignored.includes(issue.id));
  if (shown.length === 0) return <Text className="font-raleway text-sm text-ink-soft" testID="editor-no-issues">{t('mapEditor.noIssues')}</Text>;
  return (
    <View testID="editor-issues">
      {shown.map((issue) => (
        <View key={issue.id} className="flex-row items-center py-xs">
          <Ionicons name={issue.severity === 'error' ? 'alert-circle' : 'warning-outline'} size={16} color={issue.severity === 'error' ? '#DC2626' : '#D97706'} />
          <Text className="ml-sm flex-1 font-raleway text-sm text-ink">{issue.message}</Text>
          {issue.severity === 'warning' ? (
            <Pressable onPress={() => onIgnore(issue.id)} accessibilityRole="button" hitSlop={8}>
              <Text className="font-raleway-medium text-xs text-brand">{t('mapEditor.ignore')}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// ConflictRow / SyncLine
// -----------------------------------------------------------
//
// A rejected op: keep mine re-sends without the stale base
// (the server's copy is overwritten); take theirs drops the op
// and applies the server's entity to the document.
//
// Used by:
//   - EditorBody (below)
// -----------------------------------------------------------

function ConflictRow({ entry, onKeep, onTake }: { entry: OutboxEntry; onKeep: () => void; onTake: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="mb-xs rounded-xl bg-surface-soft px-md py-sm" testID={`editor-conflict-${entry.op.id}`}>
      <Text className="font-raleway text-sm text-ink">{entry.reason === 'conflict' ? t('mapEditor.conflict', { ref: `${entry.op.kind ?? ''} ${entry.op.entityId ?? ''}`.trim() }) : `${entry.op.entityId ?? ''}: ${entry.reason ?? ''}`}</Text>
      <View className="mt-xs flex-row">
        <Chip label={t('mapEditor.keepMine')} onPress={onKeep} testID={`editor-keep-${entry.op.id}`} />
        <Chip label={t('mapEditor.takeTheirs')} onPress={onTake} testID={`editor-take-${entry.op.id}`} />
      </View>
    </View>
  );
}


function SyncLine() {
  const { t } = useTranslation();
  const { status } = useWayfindSync();
  const text = status.sendingOps > 0 || status.draining ? t('mapEditor.sending') : status.pendingOps > 0 ? t('mapEditor.pending', { count: status.pendingOps }) : t('mapEditor.synced');
  return (
    <Text className="px-md py-xs font-raleway text-xs text-ink-faint" testID="editor-sync-line">
      {text}
      {status.rejectedOps.length > 0 ? ` · ${t('mapEditor.conflicts', { count: status.rejectedOps.length })}` : ''}
    </Text>
  );
}







// -----------------------------------------------------------
// EditorBody
// -----------------------------------------------------------
//
// The plan with the graph drawn on it, the tool rail, the
// sheet for what is picked, the sync line and the header's
// undo / redo / issues / publish. Owns the editor hook; every
// closed checkpoint goes to the outbox, every drain report
// re-stamps revisions, every finished upload writes its url.
//
// Used by:
//   - MapEditorScreen (below)
// -----------------------------------------------------------

function EditorBody({ draft }: { draft: Draft }) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const sync = useWayfindSync();


  const enqueueRef = useRef(sync.enqueueOps);
  enqueueRef.current = sync.enqueueOps;
  const { state, actions } = useEditor<BuildingGraph>({
    document: draft.document,
    revision: draft.revision,
    revisions: draft.revisions,
    validate: validateGraph,
    onCommit: ({ ops }) => enqueueRef.current(ops),
  });


  // The drain's answers: every applied entity is re-stamped
  // with ITS OWN batch's revision — a drain of several rounds
  // must not stamp round 1's entities with round 2's number —
  // and a finished upload writes its stored url
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    const report = sync.status.lastDrain;
    if (!report || report.applied.length === 0) return;
    const entries = report.applied.flatMap((a) => (a.kind && a.entityId && a.revision != null ? [{ kind: a.kind, id: a.entityId, revision: a.revision }] : []));
    if (entries.length > 0) actionsRef.current.acknowledge(entries);
  }, [sync.status.lastDrain]);
  const acknowledgeUpload = sync.acknowledgeUpload;
  useEffect(() => {
    for (const item of sync.status.uploads) {
      if (item.status !== 'done' || !item.result || !item.target) continue;
      if (item.kind === 'panorama') {
        const result = item.result as { url: string; hfovDeg: number; vfovDeg: number };
        actionsRef.current.updateNode(item.target, { pano: result.url, panoGeometry: { hfovDeg: result.hfovDeg, vfovDeg: result.vfovDeg } });
      } else {
        actionsRef.current.updateLevel(item.target, { plan: (item.result as { url: string }).url });
      }
      acknowledgeUpload(item.id);
    }
  }, [sync.status.uploads, acknowledgeUpload]);


  const [tool, setTool] = useState<Tool>('select');
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [panel, setPanel] = useState<'sheet' | 'issues'>('sheet');
  const [planHeight, setPlanHeight] = useState(0);

  const levelId = state.shownLevel ?? state.document.levels[0]?.id ?? null;
  const level = levelId ? (state.document.levels.find((l) => l.id === levelId) ?? null) : null;
  const xml = usePlanXml(level?.plan);
  const selectedNodeId = state.selection?.kind === 'node' ? state.selection.id : null;


  // The plan's shapes on the shown level; links are drawn in
  // the plan slot because the viewer knows nothing of edges
  const planNodes = useMemo<PlanNode[]>(() => state.document.nodes.filter((n) => n.level === levelId).map((n) => ({ id: n.id, x: n.x, y: n.y, label: n.landmark ?? n.roomId ?? n.id })), [state.document.nodes, levelId]);
  const planRooms = useMemo<PlanRoom[]>(() => state.document.rooms.filter((r) => r.level === levelId && r.polygon).map((r) => ({ id: r.id, polygon: r.polygon as [number, number][], label: r.name })), [state.document.rooms, levelId]);
  const byId = useMemo(() => new Map(state.document.nodes.map((n) => [n.id, n])), [state.document.nodes]);
  const links = useMemo(
    () =>
      state.document.edges.flatMap((edge) => {
        const a = byId.get(edge.a);
        const b = byId.get(edge.b);
        return a && b && a.level === levelId && b.level === levelId ? [{ id: edgeId(edge), a, b, kind: edge.kind }] : [];
      }),
    [state.document.edges, byId, levelId],
  );


  const onPressPlan = useCallback(
    (point: { x: number; y: number }) => {
      if (!levelId) return;
      if (tool === 'node' || tool === 'room') {
        const id = mint('n');
        actions.begin(tool === 'room' ? 'add room' : 'add node');
        actions.addNode({ id, level: levelId, x: Math.round(point.x), y: Math.round(point.y), kind: tool === 'room' ? 'room' : 'corridor' });
        if (tool === 'room') {
          const roomId = mint('r');
          actions.addRoom({ id: roomId, name: t('mapEditor.newRoom'), level: levelId, nodeId: id, category: 'other' });
          actions.updateNode(id, { roomId });
        }
        actions.end();
        actions.select({ kind: 'node', id });
        setPanel('sheet');
        return;
      }
      if (tool === 'select') actions.select(null);
    },
    [tool, levelId, actions, t],
  );

  const onPressNode = useCallback(
    (id: string) => {
      if (tool === 'link') {
        if (!linkFrom) {
          setLinkFrom(id);
          actions.select({ kind: 'node', id });
          return;
        }
        // The same node twice is no link: keep the first pick
        // and wait for a real second endpoint
        if (id === linkFrom) return;
        const from = byId.get(linkFrom);
        const to = byId.get(id);
        const crossLevel = !!from && !!to && from.level !== to.level;
        const answer = actions.addEdge(linkFrom, id, crossLevel ? { kind: 'stairs', lengthM: 10 } : { kind: 'hallway' });
        if (!answer.blocked) showToast('success', t('mapEditor.linked'));
        setLinkFrom(null);
        actions.select({ kind: 'node', id });
        return;
      }
      actions.select({ kind: 'node', id });
      setPanel('sheet');
    },
    [tool, linkFrom, byId, actions, t],
  );

  // A drag is one gesture: begin on the first move, end when
  // the viewer says the drag is over — a release, but also a
  // second finger landing, a responder terminate or a level
  // switch, all of which the plan routes through onDragNodeEnd
  // now, so the checkpoint a drag opened always closes. A grab
  // that never moved opened nothing, so there is nothing to end
  const dragging = useRef(false);
  const onDrag = useCallback(
    (id: string, point: { x: number; y: number }) => {
      if (!dragging.current) {
        dragging.current = true;
        actions.begin('move');
      }
      actions.moveNode(id, Math.round(point.x), Math.round(point.y));
    },
    [actions],
  );
  const onDragEnd = useCallback(
    (id: string, point: { x: number; y: number }) => {
      if (!dragging.current) return;
      actions.moveNode(id, Math.round(point.x), Math.round(point.y));
      actions.end();
      dragging.current = false;
    },
    [actions],
  );


  const pickPanorama = useCallback(
    async (nodeId: string) => {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      sync.enqueueUpload({
        id: mint('up'),
        kind: 'panorama',
        file: { uri: asset.uri, name: asset.fileName || 'panorama.jpg', type: asset.mimeType || 'image/jpeg' },
        fields: { nodeId, headingSource: 'manual' },
        target: nodeId,
      });
      showToast('info', t('mapEditor.uploadQueued'));
    },
    [sync, t],
  );

  const pickPlan = useCallback(
    async (targetLevel: string) => {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/svg+xml', 'text/xml', 'application/xml', '*/*'], copyToCacheDirectory: true, multiple: false });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      sync.enqueueUpload({ id: mint('up'), kind: 'plan', file: { uri: asset.uri, name: asset.name || 'plan.svg', type: 'image/svg+xml' }, fields: { levelId: targetLevel }, target: targetLevel });
      showToast('info', t('mapEditor.uploadQueued'));
    },
    [sync, t],
  );


  const publish = useCallback(async () => {
    if (!(await confirmAction({ title: t('mapEditor.publish'), message: t('mapEditor.confirmPublish'), confirmLabel: t('mapEditor.publish'), cancelLabel: t('common.cancel') }))) return;
    await sync.drain();
    try {
      const answer = await sync.publish();
      if (answer.ok) showToast('success', t('mapEditor.published'), `#${answer.revision}`);
      else if (answer.reason === 'unchanged') showToast('info', t('mapEditor.publishUnchanged'));
      else {
        showToast('error', t('mapEditor.publishInvalid'));
        setPanel('issues');
      }
    } catch (error) {
      showToast('error', error instanceof ApiError ? error.message : String(error));
    }
  }, [sync, t]);


  const takeTheirs = useCallback(
    (entry: OutboxEntry) => {
      const { op, current } = entry;
      if (op.kind && op.entityId && current) {
        const after = current.deleted || !current.data ? null : { id: op.entityId, ...current.data };
        actions.applyRemote([{ kind: op.kind, id: op.entityId, before: null, after } as Change], { [`${op.kind}:${op.entityId}`]: current.revision });
      }
      sync.resolveConflict(op.id, 'drop');
    },
    [actions, sync],
  );


  const openIssues = state.issues.filter((issue) => !state.ignoredIssues.includes(issue.id));
  const headerRight = (
    <View className="flex-row items-center">
      <Pressable onPress={actions.undo} disabled={!state.canUndo} accessibilityRole="button" accessibilityLabel={t('mapEditor.undo')} hitSlop={6} testID="editor-undo" style={{ padding: 8, opacity: state.canUndo ? 1 : 0.4 }}>
        <Ionicons name="arrow-undo" size={22} color={colors.onBrand} />
      </Pressable>
      <Pressable onPress={actions.redo} disabled={!state.canRedo} accessibilityRole="button" accessibilityLabel={t('mapEditor.redo')} hitSlop={6} testID="editor-redo" style={{ padding: 8, opacity: state.canRedo ? 1 : 0.4 }}>
        <Ionicons name="arrow-redo" size={22} color={colors.onBrand} />
      </Pressable>
      <Pressable onPress={() => setPanel(panel === 'issues' ? 'sheet' : 'issues')} accessibilityRole="button" accessibilityLabel={t('mapEditor.issues')} hitSlop={6} testID="editor-issues-toggle" style={{ padding: 8 }}>
        <Ionicons name={openIssues.some((i) => i.severity === 'error') ? 'alert-circle' : 'checkmark-circle-outline'} size={22} color={colors.onBrand} />
        {openIssues.length > 0 ? <Text style={{ position: 'absolute', right: 0, top: 0, fontSize: 10, color: colors.onBrand, fontWeight: '700' }}>{openIssues.length}</Text> : null}
      </Pressable>
      <Pressable onPress={publish} accessibilityRole="button" accessibilityLabel={t('mapEditor.publish')} hitSlop={6} testID="editor-publish" style={{ padding: 8 }}>
        <Ionicons name="cloud-upload-outline" size={22} color={colors.onBrand} />
      </Pressable>
    </View>
  );


  const onPlanLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    setPlanHeight((prev) => (prev === measured ? prev : measured));
  };


  return (
    <Screen>
      <Header title={t('mapEditor.title')} right={headerRight} />

      {draft.offline ? <Text className="bg-surface-soft px-md py-xs font-raleway text-xs text-ink-soft">{t('mapEditor.offlineSeed')}</Text> : null}

      <ToolRail
        tool={tool}
        onChange={(next) => {
          setTool(next);
          setLinkFrom(null);
        }}
      />
      {tool === 'link' ? (
        <Text className="px-md pb-xs font-raleway text-xs text-ink-soft" testID="editor-link-hint">
          {/* The first pick survives a floor switch (that is how a
              cross-level connector is authored), so the hint names
              it — the admin on another floor still knows what the
              next tap links to */}
          {linkFrom ? `${t('mapEditor.linkNext')} · ${linkFrom}` : t('mapEditor.linkFirst')}
        </Text>
      ) : null}

      <View style={{ flex: 1 }} onLayout={onPlanLayout} testID="editor-plan-area">
        {level && planHeight > 0 ? (
          <>
            <FloorPlan
              level={level}
              plan={
                <View style={{ flex: 1 }}>
                  {xml ? <SvgXml xml={xml} width="100%" height="100%" /> : null}
                  <Svg viewBox={level.viewBox.join(' ')} width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0 }}>
                    {links.map((link) => (
                      <Line key={link.id} x1={link.a.x} y1={link.a.y} x2={link.b.x} y2={link.b.y} stroke={link.kind === 'hallway' ? colors.inkSoft : colors.brand} strokeWidth={4} strokeLinecap="round" strokeDasharray={link.kind === 'door' ? '8 8' : undefined} />
                    ))}
                  </Svg>
                </View>
              }
              nodes={planNodes}
              rooms={planRooms}
              selectedNodeId={selectedNodeId}
              onPressPlan={onPressPlan}
              onPressNode={onPressNode}
              // While a placing tool is active the polygons must
              // not swallow the tap: without onPress a polygon is
              // no touch target, so the tap falls through to the
              // viewport and arrives as onPressPlan — a node can
              // be placed inside a room
              onPressRoom={
                tool === 'node' || tool === 'room'
                  ? undefined
                  : (id) => {
                      const room = state.document.rooms.find((r) => r.id === id);
                      if (room) actions.select({ kind: 'node', id: room.nodeId });
                    }
              }
              onDragNode={tool === 'select' ? onDrag : undefined}
              onDragNodeEnd={tool === 'select' ? onDragEnd : undefined}
              style={{ height: planHeight }}
              maxScale={6}
            />
            <FloorSwitcher
              levels={state.document.levels}
              current={level.id}
              // The link tool's first pick SURVIVES the switch —
              // the second endpoint of a stairs / elevator / ramp
              // connector lives on another floor, and this is the
              // only way to reach it; only a tool change or a
              // completed link clears the pick
              onSelect={(id) => {
                actions.showLevel(id);
                actions.select(null);
              }}
              style={{ position: 'absolute', right: 12, top: 12 }}
            />
          </>
        ) : null}
      </View>

      <SyncLine />

      <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {sync.status.rejectedOps.map((entry) => (
          <ConflictRow key={entry.op.id} entry={entry} onKeep={() => sync.resolveConflict(entry.op.id, 'keep-mine')} onTake={() => takeTheirs(entry)} />
        ))}
        {panel === 'issues' ? (
          <IssuesPanel issues={state.issues} ignored={state.ignoredIssues} onIgnore={actions.ignoreIssue} />
        ) : selectedNodeId ? (
          <NodeSheet state={state} actions={actions} nodeId={selectedNodeId} onPickPanorama={pickPanorama} uploads={sync.status.uploads} onRetryUpload={sync.retryUpload} onRemoveUpload={sync.removeUpload} />
        ) : levelId ? (
          <LevelSheet state={state} actions={actions} levelId={levelId} onPickPlan={pickPlan} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}







// -----------------------------------------------------------
// MapEditorScreen (default export)
// -----------------------------------------------------------
//
// The gate (admin / curator), the draft load with its two
// fallbacks (create from the seed; edit the seed offline), and
// the providers the body needs.
//
// Used by:
//   - expo-router — the (main)/map-editor route
//   - components/Sidebar.tsx — the MORE entry
// -----------------------------------------------------------

export default function MapEditorScreen() {

  const { t } = useTranslation();
  const { user, hydrated } = useAuth();
  const { onRestore } = useDataEngine();
  const allowed = user?.role === 'admin' || user?.role === 'curator';

  const [draft, setDraft] = useState<Draft | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seedQueued, setSeedQueued] = useState<ReturnType<typeof seedOps> | null>(null);


  const load = useCallback(async () => {
    setLoading(true);
    setMissing(false);
    try {
      const answer: DraftAnswer = await fetchDraft(KNF_BUILDING_ID);
      setDraft({ document: answer.document, revision: answer.revision, revisions: answer.revisions, offline: false });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setMissing(true);
      else setDraft({ document: KNF_GRAPH, revision: 0, revisions: {}, offline: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);


  const bootstrap = useCallback(async () => {
    try {
      await createBuilding(KNF_BUILDING_ID, 'VU KNF');
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409)) {
        showToast('error', error instanceof ApiError ? error.message : String(error));
        return;
      }
    }
    setSeedQueued(seedOps(KNF_GRAPH, KNF_BUILDING_ID));
    setDraft({ document: KNF_GRAPH, revision: 0, revisions: {}, offline: false });
    setMissing(false);
  }, []);

  const onSeedSent = useCallback(() => {
    setSeedQueued(null);
    void load();
  }, [load]);


  if (!hydrated || (allowed && loading)) {
    return (
      <Screen>
        <Header title={t('mapEditor.title')} />
        <LoadingSpinner />
      </Screen>
    );
  }
  if (!allowed) {
    return (
      <Screen>
        <Header title={t('mapEditor.title')} />
        <EmptyState icon="lock-closed-outline" title={t('mapEditor.noAccess')} />
      </Screen>
    );
  }
  if (missing || !draft) {
    return (
      <Screen>
        <Header title={t('mapEditor.title')} />
        <EmptyState icon="business-outline" title={t('mapEditor.missing')} />
        <View className="px-lg">
          <Button title={t('mapEditor.createFromSeed')} onPress={() => void bootstrap()} leftIcon="cloud-upload-outline" />
        </View>
      </Screen>
    );
  }


  return (
    <WayfindUiKitProvider>
      <WayfindSyncProvider buildingId={KNF_BUILDING_ID} storage={AsyncStorage} transport={wayfindTransport} onRestore={onRestore}>
        <SeedSender ops={seedQueued} onSent={onSeedSent} />
        <EditorBody draft={draft} />
      </WayfindSyncProvider>
    </WayfindUiKitProvider>
  );
}







// -----------------------------------------------------------
// SeedSender
// -----------------------------------------------------------
//
// The seed's ops go through the same outbox as every edit;
// once they are applied the draft is fetched again for its
// revisions.
//
// Used by:
//   - MapEditorScreen (above)
// -----------------------------------------------------------

function SeedSender({ ops, onSent }: { ops: ReturnType<typeof seedOps> | null; onSent: () => void }): ReactNode {
  const sync = useWayfindSync();
  const sent = useRef(false);
  useEffect(() => {
    if (!ops || sent.current) return;
    sent.current = true;
    sync.enqueueOps(ops);
    void sync.drain().then((report) => {
      if (report && !report.offline) onSent();
    });
  }, [ops, sync, onSent]);
  return null;
}
