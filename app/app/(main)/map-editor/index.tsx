// -----------------------------------------------------------
//  [*] Map editor — admins draw the building on the phone
//
//  The admin's side of the wayfinder: the draft graph on the
//  server, edited on the floor plan itself. The face is ONLY
//  the graph — a tool rail picks what a finger does (select,
//  add a node, link two nodes, drag a room box, author a
//  stairs connector across floors in two guided taps), the
//  selected node drags, and a slim sheet under the plan edits
//  the picked node (its room's name, the entrance, its links,
//  delete). Everything deeper — kinds, landmark, QR, the
//  panorama block, the level's label / scale / north / plan
//  upload and the validator's findings — still exists, folded
//  under a collapsed "Daugiau" expander so the everyday face
//  stays the drawing. Every edit is one undo step (a drag is
//  one, a drawn room is one, a stairs connector is one),
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
//    MoreSection      — the collapsed "Daugiau" expander
//    NodeSheet        — the picked node
//    LevelSheet       — the shown level, folded away
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
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Switch, Text, View, type LayoutChangeEvent } from 'react-native';
import { Svg, Circle, Line, SvgXml } from 'react-native-svg';

import { Button, EmptyState, Input, LoadingSpinner, Screen, confirmAction } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { usePlanXml } from '@/hooks/usePlanXml';
import { useTheme } from '@/hooks/useTheme';
import { ApiError } from '@/services/api';
import { KNF_BUILDING_ID, KNF_GRAPH } from '@/services/wayfind/seed';
import { createBuilding, fetchDraft, wayfindTransport } from '@/services/wayfindTransport';
import { useDataEngine } from '@knf/dataengine';
import { parsePanoMetadata, type PanoMetadata } from '@knf/wayfindcapture';
import { changesToOps, useEditor, type Change, type EditorActions, type EditorIssue, type EditorState } from '@knf/wayfindeditor';
import { bearingDeg, validateGraph, type BuildingGraph, type GraphEdge, type GraphNode, type NodeKind } from '@knf/wayfindengine';
import { WayfindSyncProvider, useWayfindSync, type OutboxEntry, type UploadItem } from '@knf/wayfindsync';
import { FloorPlan, FloorSwitcher, WayfindUiKitProvider, type PlanNode, type PlanRoom } from '@knf/wayfinduikit';


type Tool = 'select' | 'node' | 'link' | 'room' | 'stairs';

interface Draft {
  document: BuildingGraph;
  revision: number;
  revisions: Record<string, number>;
  offline: boolean;
}

const NODE_KINDS: NodeKind[] = ['corridor', 'door', 'stairs', 'elevator', 'ramp', 'entrance', 'room'];

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

// The picked photo's own word about itself — JPEG dimensions
// and the GPano coverage — read best-effort: a uri that will
// not load as bytes simply skips the pre-fill
const readPanoMetadata = async (uri: string): Promise<PanoMetadata | null> => {
  try {
    const buffer = await (await fetch(uri)).arrayBuffer();
    return parsePanoMetadata(new Uint8Array(buffer));
  } catch {
    return null;
  }
};

const edgeId = (edge: GraphEdge): string => edge.id ?? `${edge.a}--${edge.b}`;

// What an admin calls a node: its room, else its landmark, else
// the kind's word — never the minted id
const nodeName = (doc: BuildingGraph, node: GraphNode | undefined, t: (key: string) => string): string => {
  if (!node) return '';
  // Rooms point at their door node; the back-reference is optional
  const room = doc.rooms.find((r) => r.id === node.roomId) ?? doc.rooms.find((r) => r.nodeId === node.id);
  if (room) return room.name;
  if (node.landmark) return node.landmark;
  return t(node.kind === 'stairs' ? 'mapEditor.kinds.stairs' : node.kind === 'entrance' ? 'mapEditor.kinds.entrance' : 'mapEditor.node');
};







// -----------------------------------------------------------
// Chip / ToolRail
// -----------------------------------------------------------
//
// One active tool; the link and stairs tools remember their
// first pick in the body's state, and the hint line under the
// plan says what the next tap will do.
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
    { key: 'stairs', label: t('mapEditor.toolStairs') },
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

function Field({ label, value, onCommit, numeric, testID, autoFocus }: { label: string; value: string; onCommit: (text: string) => void; numeric?: boolean; testID?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return <Input label={label} value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} keyboardType={numeric ? 'decimal-pad' : 'default'} testID={testID} containerClassName="mb-sm" autoFocus={autoFocus} selectTextOnFocus={autoFocus} />;
}







// -----------------------------------------------------------
// MoreSection
// -----------------------------------------------------------
//
// The collapsed "Daugiau" expander: a chevron row that reads
// "Mažiau" while open. The advanced content it folds away is
// hidden, never deleted — everything the old sheets offered is
// still one tap deep. Hosts key it, so a fresh subject starts
// collapsed again.
//
// Used by:
//   - NodeSheet / LevelSheet (below)
// -----------------------------------------------------------

function MoreSection({ children, testID }: { children: ReactNode; testID?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View className="mt-sm">
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        testID={testID}
        className="flex-row items-center justify-between py-xs"
      >
        <Text className="font-raleway-medium text-sm text-ink-soft">{open ? t('mapEditor.less') : t('mapEditor.more')}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}







// -----------------------------------------------------------
// NodeSheet
// -----------------------------------------------------------
//
// The picked node, graph-first: its room's name (when it has
// one), the entrance switch, the links from it (the other end
// and a delete — kinds are the tools' business now) and
// delete. Everything deeper folds under "Daugiau": the kind
// chips, landmark, creating / unlinking the room, the whole
// panorama block (pick a photo → the upload queue → the
// stored url lands on the node when the upload finishes; a
// refused upload gets its own row with retry and remove, and
// never hides the url a later upload stored — and two doors
// out: the guided capture screen, and the alignment screen
// once a panorama exists), the facing and the QR payload.
//
// Used by:
//   - EditorBody (below)
// -----------------------------------------------------------

function NodeSheet({ state, actions, nodeId, fresh, onPickPanorama, onCapture, onAlign, uploads, onRetryUpload, onRemoveUpload }: { state: EditorState<BuildingGraph>; actions: EditorActions; nodeId: string; fresh: boolean; onPickPanorama: (nodeId: string) => void; onCapture: (nodeId: string) => void; onAlign: (nodeId: string) => void; uploads: readonly UploadItem[]; onRetryUpload: (id: string) => void; onRemoveUpload: (id: string) => void }) {

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
    // The box IS the node: a room's node takes the room with it,
    // in one step, so no orphan room is left to block a publish;
    // any other room still pointing here is unlinked
    const title = t(room ? 'mapEditor.deleteRoom' : 'mapEditor.deleteNode');
    if (!(await confirmAction({ title, message: t(room ? 'mapEditor.confirmDeleteRoom' : 'mapEditor.confirmDeleteNode'), confirmLabel: title, cancelLabel: t('common.cancel'), destructive: true }))) return;
    actions.begin(room ? 'delete room' : 'delete node');
    if (room) actions.deleteRoom(room.id);
    if (actions.deleteNode(nodeId).blocked?.reason === 'node_has_rooms') actions.deleteNode(nodeId, { force: true });
    actions.end();
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
      <Text className="mb-xs font-raleway-bold text-base text-ink" testID="editor-node-title">{nodeName(state.document, node, t)}</Text>

      {room ? (
        <Field label={t('mapEditor.roomName')} value={room.name} onCommit={(text) => actions.updateRoom(room.id, { name: text.trim() || room.name })} testID="editor-room-name" autoFocus={fresh} />
      ) : null}

      <View className="mt-sm flex-row items-center justify-between">
        <Text className="font-raleway text-sm text-ink">{t('mapEditor.entrance')}</Text>
        <Switch value={isEntrance} onValueChange={(on) => {
            actions.setBuilding({ entranceNodeId: on ? nodeId : null });
          }} testID="editor-entrance" />
      </View>

      <Text className="mt-sm font-raleway-medium text-xs uppercase text-ink-soft">{t('mapEditor.links')}</Text>
      {links.map((edge) => {
        const other = state.document.nodes.find((n) => n.id === (edge.a === nodeId ? edge.b : edge.a));
        const otherLevel = other && other.level !== node.level ? state.document.levels.find((l) => l.id === other.level)?.label ?? other.level : null;
        return (
        <View key={edgeId(edge)} className="flex-row items-center justify-between py-xs">
          <Text className="flex-1 font-raleway text-sm text-ink" numberOfLines={1}>{nodeName(state.document, other, t)}{otherLevel ? ` · ${otherLevel}` : ''}</Text>
          <Pressable onPress={() => actions.deleteEdge(edgeId(edge))} accessibilityRole="button" accessibilityLabel={t('mapEditor.deleteLink')} hitSlop={8} testID={`editor-delete-link-${edgeId(edge)}`}>
            <Ionicons name="trash-outline" size={18} color="#DC2626" />
          </Pressable>
        </View>
        );
      })}

      <View className="mt-md">
        <Button title={t(room ? 'mapEditor.deleteRoom' : 'mapEditor.deleteNode')} variant="outline" size="sm" leftIcon="trash-outline" onPress={() => void remove()} />
      </View>

      {/* Keyed on the node, so picking another one starts
          collapsed again — the everyday face stays the graph */}
      <MoreSection key={nodeId} testID="editor-node-more">
        <Text className="mb-xs font-raleway-medium text-xs uppercase text-ink-soft">{t('mapEditor.kind')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
          {NODE_KINDS.map((kind) => (
            <Chip key={kind} label={t(`mapEditor.kinds.${kind}`)} active={node.kind === kind} onPress={() => actions.updateNode(nodeId, { kind })} testID={`editor-kind-${kind}`} />
          ))}
        </ScrollView>

        <Field label={t('mapEditor.landmark')} value={node.landmark ?? ''} onCommit={(text) => actions.updateNode(nodeId, { landmark: text.trim() || null })} />

        {room ? (
          <Button title={t('mapEditor.unlinkRoom')} variant="outline" size="sm" onPress={() => actions.updateNode(nodeId, { roomId: null })} />
        ) : (
          <Button title={t('mapEditor.createRoom')} variant="outline" size="sm" onPress={createRoom} />
        )}

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
        <View className="mt-xs flex-row">
          <Chip label={t('mapEditor.capture.open')} onPress={() => onCapture(nodeId)} testID="editor-open-capture" />
          {/* Alignment needs a photo to turn — no panorama, no door */}
          {node.pano ? <Chip label={t('mapEditor.align.open')} onPress={() => onAlign(nodeId)} testID="editor-open-align" /> : null}
        </View>
        <Field label={t('mapEditor.panoYaw')} value={node.panoYaw == null ? '' : String(node.panoYaw)} numeric onCommit={(text) => actions.updateNode(nodeId, { panoYaw: numberOr(text, node.panoYaw ?? null), panoHeading: { source: 'manual' } })} />
        <Field label={t('mapEditor.qr')} value={node.qr ?? ''} onCommit={(text) => actions.updateNode(nodeId, { qr: text.trim() || null })} />
      </MoreSection>
    </View>
  );
}







// -----------------------------------------------------------
// LevelSheet
// -----------------------------------------------------------
//
// The shown level, wholly folded under "Daugiau": label,
// scale, north, the plan drawing (an SVG picked from the
// files → the upload queue → the stored url lands on the
// level) and the validator's findings. With nothing selected
// the bottom area is just the hint and this expander — a new
// level is the '+' pill beside the floor switcher now.
//
// Used by:
//   - EditorBody (below)
// -----------------------------------------------------------

function LevelSheet({ state, actions, levelId, onPickPlan }: { state: EditorState<BuildingGraph>; actions: EditorActions; levelId: string; onPickPlan: (levelId: string) => void }) {

  const { t } = useTranslation();
  const level = state.document.levels.find((l) => l.id === levelId);
  if (!level) return null;


  return (
    <View testID="editor-level-sheet">
      {/* Keyed on the level, so a floor switch starts collapsed */}
      <MoreSection key={levelId} testID="editor-level-more">
        <Text className="mb-xs font-raleway-bold text-base text-ink">{t('mapEditor.level')} · {level.id}</Text>
        <Field label={t('mapEditor.levelLabel')} value={level.label} onCommit={(text) => actions.updateLevel(levelId, { label: text.trim() || level.label })} testID="editor-level-label" />
        <Field label={t('mapEditor.metersPerPixel')} value={String(level.metersPerPixel)} numeric onCommit={(text) => actions.updateLevel(levelId, { metersPerPixel: numberOr(text, level.metersPerPixel) ?? level.metersPerPixel })} />
        <Field label={t('mapEditor.northDeg')} value={level.northDeg == null ? '' : String(level.northDeg)} numeric onCommit={(text) => actions.updateLevel(levelId, { northDeg: numberOr(text, level.northDeg ?? null) })} />
        <Text className="mb-xs font-raleway text-xs text-ink-faint" numberOfLines={1}>{level.plan ?? '—'}</Text>
        <Button title={t('mapEditor.uploadPlan')} variant="outline" size="sm" leftIcon="document-outline" onPress={() => onPickPlan(levelId)} />
        <Text className="mt-sm mb-xs font-raleway-medium text-xs uppercase text-ink-soft">{t('mapEditor.issues')}</Text>
        <IssuesPanel issues={state.issues} ignored={state.ignoredIssues} onIgnore={actions.ignoreIssue} />
      </MoreSection>
    </View>
  );
}







// -----------------------------------------------------------
// IssuesPanel
// -----------------------------------------------------------
//
// Used by:
//   - LevelSheet (above) — under the level's "Daugiau"
//   - EditorBody (below) — the toolbar's issues toggle
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
// sheet for what is picked, the sync line with a one-line
// hint for the active tool, and the header's undo / redo /
// issues / publish. The room tool hands the kit an onDrawRect
// and turns the drawn box into a polygon room with its node
// at the centre; the stairs tool is a guided two-tap — place
// or reuse a stairs node, switch floors, tap again — that
// links the pair with one stairs edge. Owns the editor hook;
// every closed checkpoint goes to the outbox, every drain
// report re-stamps revisions, every finished upload writes
// its url.
//
// Used by:
//   - MapEditorScreen (below)
// -----------------------------------------------------------

function EditorBody({ draft }: { draft: Draft }) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
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
  // The live per-entity revisions, for the capture / align
  // route params: the loaded map, re-stamped by every drain the
  // same way acknowledge re-stamps the editor
  const liveRevisions = useRef<Record<string, number>>({ ...draft.revisions });
  useEffect(() => {
    const report = sync.status.lastDrain;
    if (!report || report.applied.length === 0) return;
    const entries = report.applied.flatMap((a) => (a.kind && a.entityId && a.revision != null ? [{ kind: a.kind, id: a.entityId, revision: a.revision }] : []));
    if (entries.length > 0) {
      actionsRef.current.acknowledge(entries);
      for (const entry of entries) liveRevisions.current[`${entry.kind}:${entry.id}`] = entry.revision;
    }
  }, [sync.status.lastDrain]);
  // What the import parsed out of each picked photo, keyed by
  // its upload id — merged into the node when the upload lands
  const importMeta = useRef(new Map<string, PanoMetadata>());
  const acknowledgeUpload = sync.acknowledgeUpload;
  useEffect(() => {
    for (const item of sync.status.uploads) {
      if (item.status !== 'done' || !item.result || !item.target) continue;
      if (item.kind === 'panorama') {
        const result = item.result as { url: string; hfovDeg: number; vfovDeg: number };
        const meta = importMeta.current.get(item.id) ?? null;
        importMeta.current.delete(item.id);
        // The server answers the coverage it stored; the XMP adds
        // what the server does not keep — the crop's centre and
        // vertical offset — and the recorded compass heading
        // becomes a panoHeading no admin alignment ever loses to
        actionsRef.current.updateNode(item.target, {
          pano: result.url,
          panoGeometry: {
            hfovDeg: result.hfovDeg,
            vfovDeg: result.vfovDeg,
            ...(meta?.geometry ? { centreYawDeg: meta.geometry.centreYawDeg, vOffsetDeg: meta.geometry.vOffsetDeg } : {}),
          },
          ...(meta?.headingDeg != null ? { panoHeading: { source: 'compass', rawDeg: meta.headingDeg } } : {}),
        });
      } else {
        actionsRef.current.updateLevel(item.target, { plan: (item.result as { url: string }).url });
      }
      acknowledgeUpload(item.id);
    }
  }, [sync.status.uploads, acknowledgeUpload]);


  const [tool, setTool] = useState<Tool>('select');
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  // The stairs tool's pending start — a node already placed on
  // one floor, waiting for its twin on another; cleared by a
  // tool change or by the connector completing
  const [stairsFrom, setStairsFrom] = useState<string | null>(null);
  const [panel, setPanel] = useState<'sheet' | 'issues'>('sheet');
  const [planHeight, setPlanHeight] = useState(0);
  // The node a drawn box just created — its name field takes
  // the focus once, with the placeholder selected
  const [freshNodeId, setFreshNodeId] = useState<string | null>(null);

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


  // A connector to another floor cannot be drawn on this one —
  // the node that carries it gets a ring instead
  const connectorNodes = useMemo(() => {
    const ringed = new Set<string>();
    for (const edge of state.document.edges) {
      const a = byId.get(edge.a);
      const b = byId.get(edge.b);
      if (a && b && a.level !== b.level) {
        if (a.level === levelId) ringed.add(a.id);
        if (b.level === levelId) ringed.add(b.id);
      }
    }
    return state.document.nodes.filter((n) => n.level === levelId && (n.kind === 'stairs' || ringed.has(n.id)));
  }, [state.document.edges, state.document.nodes, byId, levelId]);


  const onPressPlan = useCallback(
    (point: { x: number; y: number }) => {
      if (!levelId) return;
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (tool === 'node') {
        const id = mint('n');
        actions.addNode({ id, level: levelId, x, y, kind: 'corridor' });
        actions.select({ kind: 'node', id });
        setPanel('sheet');
        return;
      }
      if (tool === 'stairs') {
        if (stairsFrom) {
          const from = byId.get(stairsFrom);
          // The pending start can vanish under the tool (an undo
          // ate it) — start the guided pair over
          if (!from) {
            setStairsFrom(null);
            return;
          }
          if (from.level === levelId) {
            // Still on the start's floor: the tap only moves the
            // pending start — the twin lives on ANOTHER floor
            actions.begin('move');
            actions.moveNode(stairsFrom, x, y);
            actions.end();
            return;
          }
          // The other floor: the twin lands here and the stairs
          // edge closes the connector — one undo step for both
          const id = mint('n');
          actions.begin('stairs');
          actions.addNode({ id, level: levelId, x, y, kind: 'stairs' });
          actions.addEdge(stairsFrom, id, { kind: 'stairs', lengthM: 10 });
          actions.end();
          setStairsFrom(null);
          showToast('success', t('mapEditor.linked'));
          return;
        }
        const id = mint('n');
        actions.addNode({ id, level: levelId, x, y, kind: 'stairs' });
        setStairsFrom(id);
        return;
      }
      if (tool === 'select') actions.select(null);
      // The room tool draws its box through onDrawRect; a bare
      // tap under it places nothing
    },
    [tool, levelId, stairsFrom, byId, actions, t],
  );

  // The room tool's drawn box, straight from the kit in plan
  // pixels: the polygon room and its node at the box centre are
  // ONE undo step, and the sheet opens on the fresh node so the
  // name can be typed at once
  const onDrawRect = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      if (!levelId) return;
      const left = Math.round(rect.x);
      const top = Math.round(rect.y);
      const right = Math.round(rect.x + rect.width);
      const bottom = Math.round(rect.y + rect.height);
      const id = mint('n');
      const roomId = mint('r');
      actions.begin('add room');
      actions.addNode({ id, level: levelId, x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), kind: 'room' });
      actions.addRoom({ id: roomId, name: t('mapEditor.newRoom'), level: levelId, nodeId: id, category: 'other', polygon: [[left, top], [right, top], [right, bottom], [left, bottom]] });
      actions.updateNode(id, { roomId });
      actions.end();
      actions.select({ kind: 'node', id });
      setFreshNodeId(id);
      setPanel('sheet');
    },
    [levelId, actions, t],
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
      if (tool === 'stairs') {
        const node = byId.get(id);
        if (!node) return;
        const from = stairsFrom ? byId.get(stairsFrom) : null;
        if (from && from.level !== node.level) {
          // The twin is an existing node on the other floor —
          // reused, upgraded to stairs, and linked in one step
          actions.begin('stairs');
          if (node.kind !== 'stairs') actions.updateNode(id, { kind: 'stairs' });
          actions.addEdge(from.id, id, { kind: 'stairs', lengthM: 10 });
          actions.end();
          setStairsFrom(null);
          showToast('success', t('mapEditor.linked'));
          return;
        }
        // First pick — or a re-pick on the same floor, which just
        // moves the pending start onto this node. An existing node
        // is reused, not stacked: only its kind is upgraded
        if (node.kind !== 'stairs') actions.updateNode(id, { kind: 'stairs' });
        setStairsFrom(id);
        return;
      }
      actions.select({ kind: 'node', id });
      setPanel('sheet');
    },
    [tool, linkFrom, stairsFrom, byId, actions, t],
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
      // The photo's own metadata pre-fills what the admin would
      // otherwise type: the GPano coverage rides to the server as
      // the upload's geometry fields, the compass heading as the
      // heading pair, and the rest waits in importMeta for the
      // finished upload to merge into the node
      const meta = await readPanoMetadata(asset.uri);
      const uploadId = mint('up');
      if (meta) importMeta.current.set(uploadId, meta);
      sync.enqueueUpload({
        id: uploadId,
        kind: 'panorama',
        file: { uri: asset.uri, name: asset.fileName || 'panorama.jpg', type: asset.mimeType || 'image/jpeg' },
        fields: {
          nodeId,
          headingSource: meta?.headingDeg != null ? 'compass' : 'manual',
          ...(meta?.headingDeg != null ? { headingRawDeg: String(meta.headingDeg) } : {}),
          ...(meta?.geometry ? { hfovDeg: String(meta.geometry.hfovDeg), vfovDeg: String(meta.geometry.vfovDeg) } : {}),
        },
        target: nodeId,
      });
      showToast('info', t('mapEditor.uploadQueued'));
    },
    [sync, t],
  );

  // The two doors out of the NodeSheet. The node rides along
  // WHOLE as JSON with its live base revision — capture.tsx and
  // align.tsx cannot reach this screen's editor, so they write
  // their pano fields as one editor-less upsert built from
  // exactly this copy (see their banners)
  const nodeParams = useCallback(
    (nodeId: string): Record<string, string> => {
      const node = state.document.nodes.find((n) => n.id === nodeId);
      const base = liveRevisions.current[`node:${nodeId}`];
      return { nodeId, node: JSON.stringify(node ?? { id: nodeId }), ...(base != null ? { baseRevision: String(base) } : {}) };
    },
    [state.document.nodes],
  );
  const openCapture = useCallback(
    (nodeId: string) => {
      router.push({ pathname: '/(main)/map-editor/capture', params: nodeParams(nodeId) });
    },
    [router, nodeParams],
  );
  const openAlign = useCallback(
    (nodeId: string) => {
      const node = byId.get(nodeId);
      if (!node) return;
      // Every linked neighbour with its plan bearing — the align
      // screen's chips; the name prefers what a human calls the
      // place over its id
      const neighbours = state.document.edges.flatMap((edge) => {
        const otherId = edge.a === nodeId ? edge.b : edge.b === nodeId ? edge.a : null;
        const other = otherId ? byId.get(otherId) : null;
        if (!other) return [];
        const room = other.roomId ? state.document.rooms.find((r) => r.id === other.roomId) : null;
        return [{ nodeId: other.id, name: other.landmark ?? room?.name ?? other.id, bearingDeg: bearingDeg({ x: node.x, y: node.y }, { x: other.x, y: other.y }) }];
      });
      router.push({ pathname: '/(main)/map-editor/align', params: { ...nodeParams(nodeId), neighbours: JSON.stringify(neighbours) } });
    },
    [router, nodeParams, byId, state.document.edges, state.document.rooms],
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


  // The '+' pill beside the floor switcher: a fresh level with
  // the seed's canvas, shown at once so the admin lands on it
  const addLevel = useCallback(() => {
    const ordinal = Math.max(0, ...state.document.levels.map((l) => l.ordinal)) + 1;
    const id = `L${ordinal}`;
    actions.addLevel({ id, label: `${ordinal} aukštas`, viewBox: [0, 0, 1000, 600], metersPerPixel: 0.05, ordinal, plan: null });
    actions.showLevel(id);
  }, [state.document.levels, actions]);


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
  // The stack header carries the title and back — the editor's
  // own actions sit in a toolbar beside the tool rail
  const actionBar = (
    <View className="flex-row items-center">
      <Pressable onPress={actions.undo} disabled={!state.canUndo} accessibilityRole="button" accessibilityLabel={t('mapEditor.undo')} hitSlop={6} testID="editor-undo" style={{ padding: 8, opacity: state.canUndo ? 1 : 0.4 }}>
        <Ionicons name="arrow-undo" size={22} color={colors.ink} />
      </Pressable>
      <Pressable onPress={actions.redo} disabled={!state.canRedo} accessibilityRole="button" accessibilityLabel={t('mapEditor.redo')} hitSlop={6} testID="editor-redo" style={{ padding: 8, opacity: state.canRedo ? 1 : 0.4 }}>
        <Ionicons name="arrow-redo" size={22} color={colors.ink} />
      </Pressable>
      <Pressable onPress={() => setPanel(panel === 'issues' ? 'sheet' : 'issues')} accessibilityRole="button" accessibilityLabel={t('mapEditor.issues')} hitSlop={6} testID="editor-issues-toggle" style={{ padding: 8 }}>
        <Ionicons name={openIssues.some((i) => i.severity === 'error') ? 'alert-circle' : 'checkmark-circle-outline'} size={22} color={colors.ink} />
        {openIssues.length > 0 ? <Text style={{ position: 'absolute', right: 0, top: 0, fontSize: 10, color: colors.brand, fontWeight: '700' }}>{openIssues.length}</Text> : null}
      </Pressable>
      <Pressable onPress={publish} accessibilityRole="button" accessibilityLabel={t('mapEditor.publish')} hitSlop={6} testID="editor-publish" style={{ padding: 8 }}>
        <Ionicons name="cloud-upload-outline" size={22} color={colors.brand} />
      </Pressable>
    </View>
  );


  const onPlanLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    setPlanHeight((prev) => (prev === measured ? prev : measured));
  };


  return (
    <Screen>
      {draft.offline ? <Text className="bg-surface-soft px-md py-xs font-raleway text-xs text-ink-soft">{t('mapEditor.offlineSeed')}</Text> : null}

      <View className="flex-row items-center">
        <View style={{ flex: 1 }}>
          <ToolRail
            tool={tool}
            onChange={(next) => {
              setTool(next);
              // A tool change abandons both guided pairs — a
              // half-authored link or stairs connector must not
              // fire from a tap made under another tool
              setLinkFrom(null);
              setStairsFrom(null);
            }}
          />
        </View>
        {actionBar}
      </View>

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
                    {connectorNodes.map((n) => (
                      <Circle key={n.id} cx={n.x} cy={n.y} r={16} fill="none" stroke={colors.brand} strokeWidth={3} strokeDasharray="5 4" />
                    ))}
                  </Svg>
                </View>
              }
              nodes={planNodes}
              rooms={planRooms}
              selectedNodeId={selectedNodeId}
              onPressPlan={onPressPlan}
              onPressNode={onPressNode}
              // The room tool draws its box through the kit's
              // rubber-band; a bare tap under it does nothing
              onDrawRect={tool === 'room' ? onDrawRect : undefined}
              // While a placing tool is active the polygons must
              // not swallow the touch: without onPress a polygon
              // is no touch target, so the finger falls through
              // to the viewport — a node (or a stairs start, or a
              // drawn box) can land inside a room
              onPressRoom={
                tool === 'node' || tool === 'room' || tool === 'stairs'
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
            <View style={{ position: 'absolute', right: 12, top: 12, alignItems: 'flex-end', gap: 8 }}>
              <FloorSwitcher
                levels={state.document.levels}
                current={level.id}
                // The link and stairs tools' first pick SURVIVES
                // the switch — the second endpoint of a cross-level
                // connector lives on another floor, and this is the
                // only way to reach it; only a tool change or a
                // completed connector clears the pick
                onSelect={(id) => {
                  actions.showLevel(id);
                  actions.select(null);
                }}
              />
              <Pressable
                onPress={addLevel}
                accessibilityRole="button"
                accessibilityLabel={t('mapEditor.addLevel')}
                testID="editor-add-level"
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
              >
                <Ionicons name="add" size={22} color={colors.brand} />
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      <SyncLine />
      {/* One line saying what the active tool's next touch does;
          the link and stairs pairs narrate their pending half */}
      <Text className="px-md pb-xs font-raleway text-xs text-ink-soft" testID="editor-tool-hint">
        {tool === 'link'
          ? linkFrom
            ? `${t('mapEditor.linkNext')} · ${nodeName(state.document, byId.get(linkFrom), t)}`
            : t('mapEditor.linkFirst')
          : tool === 'stairs'
            ? stairsFrom
              ? t('mapEditor.stairsNext')
              : t('mapEditor.stairsFirst')
            : tool === 'room'
              ? t('mapEditor.roomDrawHint')
              : tool === 'node'
                ? t('mapEditor.nodeHint')
                : t('mapEditor.selectHint')}
      </Text>

      <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {sync.status.rejectedOps.map((entry) => (
          <ConflictRow key={entry.op.id} entry={entry} onKeep={() => sync.resolveConflict(entry.op.id, 'keep-mine')} onTake={() => takeTheirs(entry)} />
        ))}
        {panel === 'issues' ? (
          <IssuesPanel issues={state.issues} ignored={state.ignoredIssues} onIgnore={actions.ignoreIssue} />
        ) : selectedNodeId ? (
          <NodeSheet state={state} actions={actions} nodeId={selectedNodeId} fresh={selectedNodeId === freshNodeId} onPickPanorama={pickPanorama} onCapture={openCapture} onAlign={openAlign} uploads={sync.status.uploads} onRetryUpload={sync.retryUpload} onRemoveUpload={sync.removeUpload} />
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
      const answer = await fetchDraft(KNF_BUILDING_ID);
      if (!answer) {
        setMissing(true);
        return;
      }
      setDraft({ document: answer.document, revision: answer.revision, revisions: answer.revisions, offline: false });
    } catch {
      setDraft({ document: KNF_GRAPH, revision: 0, revisions: {}, offline: true });
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
        <LoadingSpinner />
      </Screen>
    );
  }
  if (!allowed) {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title={t('mapEditor.noAccess')} />
      </Screen>
    );
  }
  if (missing || !draft) {
    return (
      <Screen>
        <EmptyState icon="business-outline" title={t('mapEditor.missing')} action={{ label: t('mapEditor.createFromSeed'), onPress: () => void bootstrap() }} />
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
