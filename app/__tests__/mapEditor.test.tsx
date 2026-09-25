// -----------------------------------------------------------
//  [*] Tests — the map editor screen over the three packages
//
//  An admin loads the draft, adds a node by tapping the plan,
//  links it to the entrance, undoes both, and publishes — every
//  edit reaching the mocked server as ops with the loaded
//  revisions, every answer re-stamping the entity with ITS
//  batch's revision. The editor's face is the graph alone: a
//  room is DRAWN as a box (the polygon room and its centred
//  node land as one step and the sheet opens on the node), a
//  stairs connector is two guided taps across a floor switch
//  (an existing node is reused and upgraded, a same-floor
//  second tap only moves the pending start), and everything
//  deeper — kind chips, the panorama block, the level fields,
//  the issues — hides under a collapsed "Daugiau" expander.
//  The link tool keeps its first pick across a floor switch
//  and refuses a self-link; a placing tool makes the room
//  polygons transparent to the finger; the '+' pill beside the
//  floor switcher adds a level; a refused upload gets retry /
//  remove and never hides a later stored url; a plan text
//  that does not parse shows a notice instead of an empty
//  floor. An imported photo keeps the node's facing only when
//  it is the same stored url — a different one clears the yaw
//  and stamps the heading's provenance. A server out of reach
//  offers the bundled seed behind a confirmation (declined:
//  nothing editable mounts); every edit on it goes out stamped
//  base 0, draws the server's conflict, and keep-mine lands it
//  at the revision the server showed. A server that ANSWERED
//  — a refusal (403) or a failure (500) — gets no seed offer:
//  the no-access face, or an error with a retry. A node edit
//  handed back by the capture / align screen (editorHandoff)
//  lands as an ordinary edit with the editor's own base and
//  undoes; a publish refusal's findings join the issue list
//  (named for a person, until the document moves on); a change
//  refused outright offers retry / discard with the server's
//  reason; the '+' floor is labelled in the admin's language
//  and never reuses a taken id; a scale that is not positive
//  keeps the old one; and the kit inside speaks the app's
//  language and paints with its palette (KNF-128).
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import MapEditorScreen from '@/app/(main)/map-editor/index';
import { logError } from '@/services/log';
import { deliverNodeEdit } from '@/services/wayfind/editorHandoff';
import { SyncRejected } from '@knf/wayfindsync';


// The language is mutable so a test can switch the app to English
const mockI18n = { language: 'lt' };

// Every toast the screen raised, for the specs to read
const mockToast = jest.fn();

// The seed's levels carry no plan; a test hands the editor a
// plan text through this slot when the drawing is the subject
const mockPlanXml: { value: string | null } = { value: null };

// The server's op endpoint: every batch applied at revision 4
// unless a spec answers otherwise
const mockPostOps = jest.fn(async (_b: string, ops: SentOp[]): Promise<{ revision: number; results: Record<string, unknown>[] }> => ({ revision: 4, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) }));

// The publish endpoint: a clean publish at revision 4 by default
const mockPublish = jest.fn(async () => ({ ok: true as const, revision: 4, etag: 'e', publishedAt: 'now' }));

// The panorama upload, reset per spec
const mockUploadPanorama = jest.fn();


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
jest.mock('@/components/ui', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    Header: ({ title, right }: { title: string; right?: unknown }) => (
      <View>
        <Text testID="header-title">{title}</Text>
        {right as never}
      </View>
    ),
    EmptyState: ({ title, hint, action }: { title: string; hint?: string; action?: { label: string; onPress: () => void } }) => (
      <View>
        <Text>{title}</Text>
        {hint ? <Text>{hint}</Text> : null}
        {action ? (
          <Pressable onPress={action.onPress} testID="empty-action">
            <Text>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
    LoadingSpinner: () => <Text>loading</Text>,
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{title}</Text>
      </Pressable>
    ),
    Input: ({ label, value, onChangeText, onBlur, testID }: { label?: string; value: string; onChangeText: (t: string) => void; onBlur?: () => void; testID?: string }) => (
      <View>
        <Text>{label}</Text>
        <TextInput value={value} onChangeText={onChangeText} onBlur={onBlur} testID={testID} />
      </View>
    ),
    confirmAction: jest.fn(async () => true),
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: mockI18n }) }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { surface: '#fff', surfaceSoft: '#eee', ink: '#111', inkSoft: '#666', inkFaint: '#999', brand: '#7B003F', onBrand: '#fff' }, scheme: 'light' }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'a1', role: 'admin' }, hydrated: true }) }));
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@knf/dataengine', () => ({ useDataEngine: () => ({ onRestore: () => () => undefined, cache: { get: async () => null, set: async () => undefined } }) }));
jest.mock('@/hooks/usePlanXml', () => ({ usePlanXml: () => mockPlanXml.value }));
jest.mock('@/services/log', () => ({ logError: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true })) }));
jest.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code = 'http') {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  apiErrorKey: (error: { status?: number }) => (error && error.status ? `errors.http.${error.status}` : 'errors.generic'),
  getUploadUrl: (path: string) => path,
}));
jest.mock('@/services/wayfindTransport', () => ({
  fetchDraft: jest.fn(async () => ({
    revision: 3,
    publishedRevision: null,
    building: { id: 'knf', name: 'KNF', northDeg: null, entranceNodeId: 'n-entrance' },
    document: require('@/services/wayfind/seed').KNF_GRAPH,
    revisions: { 'node:n-entrance': 3, 'node:n-stairs1': 2 },
    issues: [],
  })),
  createBuilding: jest.fn(),
  wayfindTransport: {
    postOps: (...args: [string, SentOp[]]) => mockPostOps(...args),
    publish: () => mockPublish(),
    uploadPanorama: (...args: unknown[]) => mockUploadPanorama(...args),
    uploadPlan: jest.fn(),
  },
}));

// The op shape as the wire sees it, loose enough to filter by
type SentOp = { id: string; type?: string; kind?: string; entityId?: string; data?: Record<string, unknown>; baseRevision?: number };

type Rendered = Awaited<ReturnType<typeof render>>;
type Handler = (e: unknown) => unknown;







// -----------------------------------------------------------
// mockT
// -----------------------------------------------------------
//
// The stand-in translator: the key itself, with the one
// interpolation a spec cares about appended (count,
// subject, ref or number).
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

function mockT(key: string, opts?: Record<string, unknown>): string {
  if (!opts) return key;
  for (const name of ['count', 'subject', 'ref', 'number']) {
    if (name in opts) return `${key}:${String(opts[name])}`;
  }
  return key;
}







// -----------------------------------------------------------
// settle
// -----------------------------------------------------------
//
// One macrotask inside act — lets the outbox's drain and
// the screen's effects land before a spec looks.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};







// -----------------------------------------------------------
// gesture
// -----------------------------------------------------------
//
// A responder event with a hand-built touch history, the
// way the responder system itself would feed the plan.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const gesture = (fingers: { x: number; y: number }[], t: number) => ({
  nativeEvent: { touches: fingers.map((f) => ({ pageX: f.x, pageY: f.y })), timestamp: t },
  touchHistory: {
    numberActiveTouches: fingers.length,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: t,
    touchBank: fingers.map((f) => ({ touchActive: true, currentPageX: f.x, currentPageY: f.y, currentTimeStamp: t, previousPageX: f.x, previousPageY: f.y, previousTimeStamp: t - 16, startPageX: f.x, startPageY: f.y, startTimeStamp: t - 16 })),
  },
});







// -----------------------------------------------------------
// layOutPlan
// -----------------------------------------------------------
//
// Lay the plan area and the kit's viewport out — the kit
// draws nothing inside it until it knows its size.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const layOutPlan = async (r: Rendered) => {
  await act(async () => {
    fireEvent(r.getByTestId('editor-plan-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } } });
  });
  await act(async () => {
    (r.getByTestId('wayfinduikit-plan').props.onLayout as Handler)({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 240 } } });
  });
};







// -----------------------------------------------------------
// tapPlan
// -----------------------------------------------------------
//
// One finger down and up on the viewport: a bare tap on
// the drawing, through the camera.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const tapPlan = async (r: Rendered, x: number, y: number) => {
  const vp = r.getByTestId('wayfinduikit-plan').props as Record<string, Handler>;
  await act(async () => {
    vp.onStartShouldSetResponderCapture(gesture([{ x, y }], 1000));
    vp.onResponderGrant(gesture([{ x, y }], 1000));
  });
  await act(async () => {
    vp.onResponderRelease(gesture([], 1100));
  });
};







// -----------------------------------------------------------
// dragPlan
// -----------------------------------------------------------
//
// One finger down, one move, release — the room tool's
// rubber-band box.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const dragPlan = async (r: Rendered, from: { x: number; y: number }, to: { x: number; y: number }) => {
  const vp = r.getByTestId('wayfinduikit-plan').props as Record<string, Handler>;
  await act(async () => {
    vp.onStartShouldSetResponderCapture(gesture([from], 1000));
    vp.onResponderGrant(gesture([from], 1000));
  });
  await act(async () => {
    vp.onResponderMove(gesture([to], 1050));
  });
  await act(async () => {
    vp.onResponderRelease(gesture([], 1100));
  });
};







// -----------------------------------------------------------
// sentOps
// -----------------------------------------------------------
//
// Every op the mocked server saw, flattened across
// batches.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const sentOps = (): SentOp[] => mockPostOps.mock.calls.flatMap(([, ops]) => ops);








describe('MapEditorScreen', () => {
  beforeEach(async () => {
    // The queues persist per building — a leftover from one
    // test must not drain into the next
    await AsyncStorage.clear();
    mockPostOps.mockClear();
    mockPostOps.mockImplementation(async (_b: string, ops: SentOp[]) => ({ revision: 4, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) }));
    mockPublish.mockClear();
    mockToast.mockClear();
    mockUploadPanorama.mockReset();
    mockPlanXml.value = null;
    (logError as jest.Mock).mockClear();
  });

  it('loads the draft, adds and links a node on the plan, undoes both, and publishes', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    expect(r.getByTestId('editor-level-sheet')).toBeTruthy();
    expect(r.getByTestId('editor-sync-line').props.children[0]).toBe('mapEditor.synced');
    await layOutPlan(r);

    // The node tool: a tap at (200, 120) on a 400 × 240 viewport of
    // a 1000 × 600 plan is plan (500, 300)
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-node'));
    });
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.nodeHint');
    await tapPlan(r, 200, 120);
    await settle();
    expect(r.getByTestId('editor-node-sheet')).toBeTruthy();
    expect(mockPostOps).toHaveBeenCalledTimes(1);
    const [, added] = mockPostOps.mock.calls[0] as unknown as [string, { type: string; kind: string; data: { x: number; y: number; kind: string; level: string }; baseRevision?: number }[]];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: 'upsert', kind: 'node', data: { x: 500, y: 300, kind: 'corridor', level: 'L1' } });
    expect(added[0].baseRevision).toBeUndefined();
    const newNodeId = (mockPostOps.mock.calls[0] as unknown as [string, { entityId: string }[]])[1][0].entityId;

    // The link tool: the entrance, then the new node
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-link'));
    });
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.linkFirst');
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-entrance'));
    });
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.linkNext · Viešųjų ryšių skyrius');
    await act(async () => {
      fireEvent.press(r.getByTestId(`wayfinduikit-plan-node-${newNodeId}`));
    });
    await settle();
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.linked');
    expect(mockPostOps).toHaveBeenCalledTimes(2);
    expect((mockPostOps.mock.calls[1] as unknown as [string, { type: string; kind: string; entityId: string; data: { a: string; b: string; kind: string } }[]])[1][0]).toMatchObject({
      type: 'upsert',
      kind: 'edge',
      entityId: `n-entrance--${newNodeId}`,
      data: { a: 'n-entrance', b: newNodeId, kind: 'hallway' },
    });

    // Undo twice: the link, then the node — each a delete on the wire
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-undo'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-undo'));
    });
    await settle();
    expect(mockPostOps).toHaveBeenCalledTimes(4);
    expect((mockPostOps.mock.calls[3] as unknown as [string, { type: string; entityId: string }[]])[1][0]).toMatchObject({ type: 'delete', entityId: newNodeId });
    expect(r.queryByTestId(`wayfinduikit-plan-node-${newNodeId}`)).toBeNull();

    // An edit to a loaded entity carries its loaded revision —
    // the kind chips live under the sheet's "Daugiau" now
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-select'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-kind-elevator'));
    });
    await settle();
    expect((mockPostOps.mock.calls[4] as unknown as [string, { entityId: string; baseRevision?: number; data: { kind: string } }[]])[1][0]).toMatchObject({ entityId: 'n-stairs1', baseRevision: 2, data: { kind: 'elevator' } });

    // Publish drains first, then asks the server
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-publish'));
    });
    await settle();
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.published', '#4');
  });


  it("an applied answer re-stamps the entity with its batch's revision, which the next edit carries", async () => {
    let rev = 10;
    mockPostOps.mockImplementation(async (_b: string, ops: SentOp[]) => ({ revision: ++rev, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) }));
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-kind-elevator'));
    });
    await settle();
    expect(sentOps()[0]).toMatchObject({ entityId: 'n-stairs1', baseRevision: 2, data: { kind: 'elevator' } });

    // That batch answered revision 11 — the acknowledge stamps
    // the ENTITY with it, and the very next edit says so
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-kind-ramp'));
    });
    await settle();
    expect(sentOps()[1]).toMatchObject({ entityId: 'n-stairs1', baseRevision: 11, data: { kind: 'ramp' } });
  });


  it('the link tool keeps its first node across a floor switch and refuses a self-link', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-link'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.linkNext · Laiptai');

    // The same node again is no link: the pick is kept, nothing sent
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    await settle();
    expect(mockToast).not.toHaveBeenCalledWith('success', 'mapEditor.linked');
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.linkNext · Laiptai');

    // The pick SURVIVES the floor switch — the second endpoint of
    // a stairs connector lives on the other floor
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-floor-L2'));
    });
    await settle();
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.linkNext · Laiptai');
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-a'));
    });
    await settle();
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.linked');
    const edges = sentOps().filter((op) => op.kind === 'edge');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: 'upsert', entityId: 'n-stairs1--n-a', data: { a: 'n-stairs1', b: 'n-a', kind: 'stairs', lengthM: 10 } });
  });


  it('the room tool draws a box: one step creates the polygon room with its node at the centre and opens the sheet', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-room'));
    });
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.roomDrawHint');

    // A drag from (80, 48) to (160, 96) on the 400 × 240 viewport
    // of the 1000 × 600 plan is the plan box (200, 120)–(400, 240)
    await dragPlan(r, { x: 80, y: 48 }, { x: 160, y: 96 });
    await settle();
    const nodeOps = sentOps().filter((op) => op.kind === 'node');
    const roomOps = sentOps().filter((op) => op.kind === 'room');
    expect(nodeOps).toHaveLength(1);
    expect(roomOps).toHaveLength(1);
    expect(nodeOps[0]).toMatchObject({ type: 'upsert', data: { x: 300, y: 180, kind: 'room', level: 'L1' } });
    expect(roomOps[0]).toMatchObject({
      type: 'upsert',
      data: { level: 'L1', nodeId: nodeOps[0].entityId, polygon: [[200, 120], [400, 120], [400, 240], [200, 240]] },
    });
    expect(nodeOps[0].data?.roomId).toBe(roomOps[0].entityId);

    // The sheet opens on the fresh node with its name editable
    expect(r.getByTestId('editor-node-sheet')).toBeTruthy();
    expect(r.getByTestId('editor-room-name')).toBeTruthy();
    expect(r.getByTestId(`wayfinduikit-plan-room-${roomOps[0].entityId}`)).toBeTruthy();

    // The whole drawn room is ONE undo step
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-undo'));
    });
    await settle();
    expect(r.queryByTestId(`wayfinduikit-plan-room-${roomOps[0].entityId}`)).toBeNull();
    expect(r.queryByTestId(`wayfinduikit-plan-node-${nodeOps[0].entityId}`)).toBeNull();
  });


  it('a room-tool release smaller than a room behaves as a tap and places nothing', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-room'));
    });
    // 2 viewport px is 5 plan px — under the kit's 8 px floor,
    // so the release falls through to onPressPlan, where the
    // room tool deliberately does nothing
    await dragPlan(r, { x: 100, y: 100 }, { x: 102, y: 102 });
    await settle();
    expect(sentOps()).toHaveLength(0);
    expect(r.queryByTestId('editor-node-sheet')).toBeNull();
  });


  it('the stairs tool authors a connector in two taps across a floor switch — both nodes and the stairs edge on the wire', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-stairs'));
    });
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.stairsFirst');

    // First tap places the stairs node on L1 and asks for the
    // floor switch
    await tapPlan(r, 200, 120);
    await settle();
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.stairsNext');
    const firstNode = sentOps().filter((op) => op.kind === 'node')[0];
    expect(firstNode).toMatchObject({ type: 'upsert', data: { x: 500, y: 300, kind: 'stairs', level: 'L1' } });

    // A second tap on the SAME floor only moves the pending start
    await tapPlan(r, 100, 60);
    await settle();
    const moved = sentOps().filter((op) => op.kind === 'node');
    expect(moved).toHaveLength(2);
    expect(moved[1]).toMatchObject({ entityId: firstNode.entityId, data: { x: 250, y: 150 } });
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.stairsNext');

    // The floor switch, then the second tap: the twin lands on L2
    // and the stairs edge closes the connector
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-floor-L2'));
    });
    await settle();
    await tapPlan(r, 100, 60);
    await settle();
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.linked');
    const nodes = sentOps().filter((op) => op.kind === 'node');
    const twin = nodes[nodes.length - 1];
    expect(twin).toMatchObject({ type: 'upsert', data: { x: 250, y: 150, kind: 'stairs', level: 'L2' } });
    const edges = sentOps().filter((op) => op.kind === 'edge');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: 'upsert', data: { a: firstNode.entityId, b: twin.entityId, kind: 'stairs', lengthM: 10 } });

    // The connector done, the guided pair starts over
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.stairsFirst');
  });


  it('the stairs tool reuses an existing node as its start — upgraded to stairs, never stacked — and a tool change drops the pending start', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-stairs'));
    });
    // The entrance already exists: the first tap upgrades its
    // kind instead of dropping a second node on top of it
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-entrance'));
    });
    await settle();
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.stairsNext');
    expect(sentOps()).toHaveLength(1);
    expect(sentOps()[0]).toMatchObject({ type: 'upsert', kind: 'node', entityId: 'n-entrance', baseRevision: 3, data: { kind: 'stairs' } });

    // A tool change abandons the pair: back on stairs, a tap on
    // the other floor is a fresh FIRST pick, not a second endpoint
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-select'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-stairs'));
    });
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.stairsFirst');
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-floor-L2'));
    });
    await settle();
    await tapPlan(r, 100, 60);
    await settle();
    expect(sentOps().filter((op) => op.kind === 'edge')).toHaveLength(0);
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.stairsNext');
  });


  it('room polygons are not tap targets while the node tool is active — the tap places a node inside the room', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    // With the node tool the polygon carries no press handler at
    // all — a tap on it selects nothing and sends nothing
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-node'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-room-r-pr'));
    });
    await settle();
    expect(r.queryByTestId('editor-node-sheet')).toBeNull();
    expect(sentOps().filter((op) => op.kind === 'node')).toHaveLength(0);

    // The finger falls through to the viewport instead: a tap at
    // screen (60, 70) on the 400 × 240 viewport of the 1000 × 600
    // plan is plan (150, 175) — inside r-pr's polygon
    await tapPlan(r, 60, 70);
    await settle();
    expect(r.getByTestId('editor-node-sheet')).toBeTruthy();
    const nodes = sentOps().filter((op) => op.kind === 'node' && op.type === 'upsert');
    expect(nodes[nodes.length - 1]).toMatchObject({ data: { x: 150, y: 175, kind: 'corridor', level: 'L1' } });

    // Back on the select tool the polygon is a tap target again
    // and picks the room's own node
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-select'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-room-r-pr'));
    });
    expect(r.getByTestId('editor-node-title').props.children).toBe('Viešųjų ryšių skyrius');
  });


  it('the node sheet is slim by default and "Daugiau" reveals the kind chips, panorama block and QR without losing anything', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-entrance'));
    });
    expect(r.getByTestId('editor-node-sheet')).toBeTruthy();
    // The slim face: entrance switch and links with a delete only
    expect(r.getByTestId('editor-entrance')).toBeTruthy();
    expect(r.getByTestId('editor-delete-link-n-entrance--n-stairs1')).toBeTruthy();
    // No kind chips, no panorama, no QR until "Daugiau" opens
    expect(r.queryByTestId('editor-kind-stairs')).toBeNull();
    expect(r.queryByText('mapEditor.pickPanorama')).toBeNull();
    expect(r.queryByTestId('editor-open-capture')).toBeNull();
    expect(r.queryByText('mapEditor.qr')).toBeNull();

    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });
    expect(r.getByTestId('editor-kind-stairs')).toBeTruthy();
    expect(r.getByText('mapEditor.pickPanorama')).toBeTruthy();
    expect(r.getByTestId('editor-open-capture')).toBeTruthy();
    expect(r.getByText('mapEditor.qr')).toBeTruthy();
    expect(r.getByText('mapEditor.less')).toBeTruthy();

    // And closes again
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });
    expect(r.queryByTestId('editor-kind-stairs')).toBeNull();
  });


  it("the level's fields and the issues hide under \"Daugiau\", and the '+' pill beside the switcher adds a floor", async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);

    // Nothing selected: only the hint and the collapsed expander
    expect(r.getByTestId('editor-tool-hint').props.children).toBe('mapEditor.selectHint');
    expect(r.getByTestId('editor-level-sheet')).toBeTruthy();
    expect(r.queryByTestId('editor-level-label')).toBeNull();
    expect(r.queryByText('mapEditor.uploadPlan')).toBeNull();

    await act(async () => {
      fireEvent.press(r.getByTestId('editor-level-more'));
    });
    expect(r.getByTestId('editor-level-label')).toBeTruthy();
    expect(r.getByText('mapEditor.uploadPlan')).toBeTruthy();
    expect(r.getByTestId('editor-no-issues')).toBeTruthy();

    // The '+' pill mints the next level and shows it at once
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-add-level'));
    });
    await settle();
    expect(r.getByTestId('wayfinduikit-floor-L3')).toBeTruthy();
    const levels = sentOps().filter((op) => op.kind === 'level');
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ type: 'upsert', entityId: 'L3', data: { ordinal: 3, metersPerPixel: 0.05 } });
  });


  it('a refused upload shows retry and remove, and a retry that succeeds lands the stored url', async () => {
    const picker = require('expo-image-picker') as { launchImageLibraryAsync: jest.Mock };
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///p.jpg', fileName: 'p.jpg', mimeType: 'image/jpeg' }] });
    mockUploadPanorama.mockRejectedValueOnce(new SyncRejected('Not a readable image', 'bad_image'));
    mockUploadPanorama.mockResolvedValueOnce({ id: 'p1', url: '/api/wayfind/panoramas/h.jpg', width: 4096, height: 2048, bytes: 5, hfovDeg: 360, vfovDeg: 180 });

    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    // The panorama block lives under "Daugiau" now — still fully
    // working once opened
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.pickPanorama'));
    });
    await settle();
    expect(mockUploadPanorama).toHaveBeenCalledTimes(1);
    expect(r.getByTestId('editor-upload-failed')).toBeTruthy();

    // Retry sends it again; success writes the stored url onto
    // the node, the parked row is gone and nothing masks the url
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-upload-retry'));
    });
    await settle();
    expect(mockUploadPanorama).toHaveBeenCalledTimes(2);
    expect(r.queryByTestId('editor-upload-failed')).toBeNull();
    expect(r.getByText('/api/wayfind/panoramas/h.jpg')).toBeTruthy();
    const stairs = sentOps().filter((op) => op.entityId === 'n-stairs1');
    expect(stairs[stairs.length - 1].data).toMatchObject({ pano: '/api/wayfind/panoramas/h.jpg' });

    // A second refusal parks a new row; remove drops it and the
    // stored url still shows
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///q.jpg', fileName: 'q.jpg', mimeType: 'image/jpeg' }] });
    mockUploadPanorama.mockRejectedValueOnce(new SyncRejected('Too large', 'too_large'));
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.pickPanorama'));
    });
    await settle();
    expect(r.getByTestId('editor-upload-failed')).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-upload-remove'));
    });
    await settle();
    expect(r.queryByTestId('editor-upload-failed')).toBeNull();
    expect(r.getByText('/api/wayfind/panoramas/h.jpg')).toBeTruthy();
  });


  it('importing a photo over an aligned node: the same stored url keeps the facing, a different one clears it and stamps the heading auto', async () => {
    const picker = require('expo-image-picker') as { launchImageLibraryAsync: jest.Mock };
    // n-stairs1 in the seed: pano 'pano:1.1.00', panoYaw 260, heading manual
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///p.jpg', fileName: 'p.jpg', mimeType: 'image/jpeg' }] });
    picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///q.jpg', fileName: 'q.jpg', mimeType: 'image/jpeg' }] });
    mockUploadPanorama.mockResolvedValueOnce({ id: 'p0', url: 'pano:1.1.00', width: 4096, height: 2048, bytes: 5, hfovDeg: 360, vfovDeg: 180 });
    mockUploadPanorama.mockResolvedValueOnce({ id: 'p1', url: '/api/wayfind/panoramas/new.jpg', width: 4096, height: 2048, bytes: 5, hfovDeg: 360, vfovDeg: 180 });

    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });

    // The identical picture — content-addressed, so the same url —
    // keeps the alignment and its provenance
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.pickPanorama'));
    });
    await settle();
    await settle();
    let stairs = sentOps().filter((op) => op.entityId === 'n-stairs1');
    expect(stairs).toHaveLength(1);
    expect(stairs[0].data).toMatchObject({ pano: 'pano:1.1.00', panoYaw: 260, panoHeading: { source: 'manual' } });

    // A different picture: the yaw measured on the old one is gone
    // and the heading says where it stands — no compass in this
    // file, so 'auto'
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.pickPanorama'));
    });
    await settle();
    await settle();
    stairs = sentOps().filter((op) => op.entityId === 'n-stairs1');
    expect(stairs).toHaveLength(2);
    expect(stairs[1].data).toMatchObject({ pano: '/api/wayfind/panoramas/new.jpg', panoYaw: null, panoHeading: { source: 'auto' } });
    expect(r.getByText('/api/wayfind/panoramas/new.jpg')).toBeTruthy();
  });

  it('a server out of reach offers the seed behind a confirmation — declined, nothing editable mounts', async () => {
    const transport = require('@/services/wayfindTransport') as { fetchDraft: jest.Mock };
    const ui = require('@/components/ui') as { confirmAction: jest.Mock };
    ui.confirmAction.mockClear();
    transport.fetchDraft.mockRejectedValueOnce(new Error('offline'));
    ui.confirmAction.mockResolvedValueOnce(false);

    const r = await render(<MapEditorScreen />);
    await settle();
    expect(ui.confirmAction).toHaveBeenCalledTimes(1);
    expect(ui.confirmAction).toHaveBeenCalledWith({ title: 'mapEditor.title', message: 'mapEditor.offlineSeed', confirmLabel: 'common.next', cancelLabel: 'common.cancel' });
    // Declined: a dead end naming the situation — no plan, no tools,
    // nothing for the outbox
    expect(r.queryByTestId('editor-plan-area')).toBeNull();
    expect(r.queryByTestId('editor-publish')).toBeNull();
    expect(r.getByText('mapEditor.offlineSeed')).toBeTruthy();
    expect(mockPostOps).not.toHaveBeenCalled();
  });

  it("accepted, the editor opens on the seed: every edit goes out stamped base 0, draws the server's conflict, and keep-mine lands it at the revision the server showed", async () => {
    const transport = require('@/services/wayfindTransport') as { fetchDraft: jest.Mock };
    const ui = require('@/components/ui') as { confirmAction: jest.Mock };
    ui.confirmAction.mockClear();
    transport.fetchDraft.mockRejectedValueOnce(new Error('offline'));
    // The server holds the entity past the seed: the first post
    // conflicts and hands the row back, the retry lands
    mockPostOps.mockImplementationOnce(async (_b: string, ops: SentOp[]) => ({
      revision: 5,
      results: ops.map((op) => ({ id: op.id, status: 'rejected' as const, reason: 'conflict', current: { data: { level: 'L1', x: 840, y: 300, kind: 'stairs', landmark: 'Serverio' }, revision: 5, deleted: false } })),
    }));

    const r = await render(<MapEditorScreen />);
    await settle();
    // The offer was taken: the seed is the document, the strip says so
    expect(ui.confirmAction).toHaveBeenCalledTimes(1);
    expect(r.getByText('mapEditor.offlineSeed')).toBeTruthy();
    await layOutPlan(r);
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-kind-door'));
    });
    await settle();
    const first = sentOps();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: 'upsert', entityId: 'n-stairs1', baseRevision: 0, data: { kind: 'door' } });

    // The conflict row shows; keep mine re-sends over exactly the
    // copy the server showed, and the row is gone once it lands
    expect(r.getByTestId(`editor-conflict-${first[0].id}`)).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByTestId(`editor-keep-${first[0].id}`));
    });
    await settle();
    const all = sentOps();
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ id: `${first[0].id}-again`, entityId: 'n-stairs1', baseRevision: 5, data: { kind: 'door' } });
    expect(r.queryByTestId(`editor-conflict-${first[0].id}`)).toBeNull();
  });

  it('shows a notice and logs once when the plan text does not parse, and draws a replacement', async () => {
    // What the old entity decode made of a plan: its '&lt;'
    // became a bare '<' mid-text, which no XML parser accepts
    mockPlanXml.value = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><text>1 < 2</text></svg>';
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);
    expect(r.getByTestId('editor-plan-failed')).toBeTruthy();
    expect(r.getByText('common.error')).toBeTruthy();
    expect(logError).toHaveBeenCalledTimes(1);
    expect((logError as jest.Mock).mock.calls[0][0]).toBe('mapEditor.plan');

    // The deferred state flip lands; a re-render (a tool
    // change) must not re-parse and re-log the same text
    await settle();
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-node'));
    });
    expect(r.getByTestId('editor-plan-failed')).toBeTruthy();
    expect(logError).toHaveBeenCalledTimes(1);

    // An uploaded replacement that parses takes the slot back
    mockPlanXml.value = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><text>1 &lt; 2</text></svg>';
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-select'));
    });
    expect(r.queryByTestId('editor-plan-failed')).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });


  it('a node edit handed back by the capture / align screen lands as an ordinary edit with the editor’s base, and undoes', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    let answer = '';
    await act(async () => {
      // Judged against the LIVE node: the seed's stairs photo is
      // replaced, so the facing measured on it is cleared
      answer = deliverNodeEdit('n-stairs1', (node) => ({ pano: '/api/wayfind/panoramas/new.jpg', panoYaw: node.pano === 'pano:1.1.00' ? null : node.panoYaw }));
    });
    await settle();
    expect(answer).toBe('applied');
    const [op] = sentOps();
    expect(op).toMatchObject({
      type: 'upsert',
      kind: 'node',
      entityId: 'n-stairs1',
      baseRevision: 2,
      data: { level: 'L1', kind: 'stairs', landmark: 'Laiptai', pano: '/api/wayfind/panoramas/new.jpg', panoYaw: null },
    });

    // One undo step, reverted on the wire like any edit
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-undo'));
    });
    await settle();
    expect(sentOps()[1]).toMatchObject({ entityId: 'n-stairs1', data: { pano: 'pano:1.1.00', panoYaw: 260 } });

    // A node the editor does not hold declines; with the editor
    // gone nobody takes the edit at all
    let missing = '';
    await act(async () => {
      missing = deliverNodeEdit('n-nowhere', () => ({ pano: 'x' }));
    });
    expect(missing).toBe('declined');
    expect(sentOps()).toHaveLength(2);
    await r.unmount();
    expect(deliverNodeEdit('n-stairs1', () => ({ pano: 'x' }))).toBe('absent');
  });


  it("a publish the server refuses lists the server's findings, named for a person, until the document moves on", async () => {
    mockPublish.mockResolvedValueOnce({ ok: false, reason: 'invalid', issues: [{ severity: 'error', code: 'bad_coordinate', ref: 'n-stairs1', message: "node 'n-stairs1' has coordinates (x, null)" }] } as never);
    const r = await render(<MapEditorScreen />);
    await settle();
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-publish'));
    });
    await settle();
    expect(mockToast).toHaveBeenCalledWith('error', 'mapEditor.publishInvalid');
    const row = r.getByTestId('editor-issue-bad_coordinate:n-stairs1');
    expect(within(row).getByText('mapEditor.issueCodes.bad_coordinate:Laiptai')).toBeTruthy();

    // An edit moves the document on — the server spoke about the
    // old one, and the local validator speaks for the new
    await layOutPlan(r);
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-kind-door'));
    });
    await settle();
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-issues-toggle'));
    });
    expect(r.queryByTestId('editor-issue-bad_coordinate:n-stairs1')).toBeNull();
  });


  it('a server that answered — a refusal or a failure — is not offered the seed: no access, or an error with a retry', async () => {
    const transport = require('@/services/wayfindTransport') as { fetchDraft: jest.Mock };
    const ui = require('@/components/ui') as { confirmAction: jest.Mock };
    const { ApiError } = require('@/services/api') as { ApiError: new (message: string, status: number, code?: string) => Error };
    ui.confirmAction.mockClear();

    transport.fetchDraft.mockRejectedValueOnce(new ApiError('forbidden', 403));
    const denied = await render(<MapEditorScreen />);
    await settle();
    expect(denied.getByText('mapEditor.noAccess')).toBeTruthy();
    await denied.unmount();

    transport.fetchDraft.mockRejectedValueOnce(new ApiError('boom', 500));
    const failed = await render(<MapEditorScreen />);
    await settle();
    expect(failed.getByText('mapEditor.loadFailed')).toBeTruthy();
    expect(failed.getByText('errors.http.500')).toBeTruthy();
    expect(ui.confirmAction).not.toHaveBeenCalled();

    // The retry asks the server again, and the draft opens
    await act(async () => {
      fireEvent.press(failed.getByTestId('empty-action'));
    });
    await settle();
    expect(failed.getByTestId('editor-plan-area')).toBeTruthy();
  });


  it("a change the server refuses outright offers retry and discard, with the server's reason", async () => {
    mockPostOps.mockImplementationOnce(async (_b: string, ops: SentOp[]) => ({
      revision: 4,
      results: ops.map((op) => ({ id: op.id, status: 'rejected' as const, reason: 'x and y must be finite numbers' })),
    }));
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-node-more'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-kind-door'));
    });
    await settle();

    const [op] = sentOps();
    const row = r.getByTestId(`editor-conflict-${op.id}`);
    expect(within(row).getByText('mapEditor.rejectedChange:Laiptai')).toBeTruthy();
    expect(within(row).getByText('x and y must be finite numbers')).toBeTruthy();
    expect(within(row).getByText('mapEditor.retry')).toBeTruthy();
    expect(within(row).getByText('mapEditor.discard')).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByTestId(`editor-take-${op.id}`));
    });
    expect(r.queryByTestId(`editor-conflict-${op.id}`)).toBeNull();
  });


  it("the '+' floor is labelled in the admin's language and never reuses a taken id", async () => {
    const transport = require('@/services/wayfindTransport') as { fetchDraft: jest.Mock };
    const seed = require('@/services/wayfind/seed').KNF_GRAPH;
    // A basement already holds 'L3' at ordinal 0: the next floor is
    // ordinal 3, and its natural id is taken
    transport.fetchDraft.mockResolvedValueOnce({
      revision: 3,
      publishedRevision: null,
      building: { id: 'knf', name: 'KNF', northDeg: null, entranceNodeId: 'n-entrance' },
      document: { ...seed, levels: [...seed.levels, { id: 'L3', label: 'Rūsys', viewBox: [0, 0, 1000, 600], metersPerPixel: 0.05, ordinal: 0, plan: null }] },
      revisions: {},
      issues: [],
    });
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-add-level'));
    });
    await settle();
    const level = sentOps().find((op) => op.kind === 'level');
    expect(level?.data).toMatchObject({ label: 'mapEditor.newLevelLabel:3', ordinal: 3 });
    expect(level?.entityId).not.toBe('L3');
    expect(level?.entityId).toMatch(/^L-/);
  });


  it('a scale that is not a positive number keeps the old one', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-level-more'));
    });
    for (const typed of ['0', '-2']) {
      await act(async () => {
        fireEvent.changeText(r.getByTestId('editor-level-scale'), typed);
      });
      await act(async () => {
        fireEvent(r.getByTestId('editor-level-scale'), 'blur');
      });
      await settle();
    }
    await act(async () => {
      fireEvent.changeText(r.getByTestId('editor-level-scale'), '0,08');
    });
    await act(async () => {
      fireEvent(r.getByTestId('editor-level-scale'), 'blur');
    });
    await settle();
    const scales = sentOps().filter((op) => op.kind === 'level').map((op) => op.data?.metersPerPixel);
    expect(scales.length).toBeGreaterThan(0);
    expect(scales.every((scale) => typeof scale === 'number' && scale > 0)).toBe(true);
    expect(scales[scales.length - 1]).toBe(0.08);
  });


  it('the kit inside the editor speaks the app language and paints with its palette (KNF-128)', async () => {
    mockI18n.language = 'en';
    try {
      const r = await render(<MapEditorScreen />);
      await settle();
      await layOutPlan(r);
      // The bare provider once answered Lithuanian and the kit's own
      // light paper whatever the app said
      expect(r.getByTestId('wayfinduikit-floor-switcher').props.accessibilityLabel).toBe('Floor switcher, showing 1 aukštas');
      expect(StyleSheet.flatten(r.getByTestId('wayfinduikit-plan').props.style).backgroundColor).toBe('#fff');
    } finally {
      mockI18n.language = 'lt';
    }
  });


  it('names what a screen reader meets: plan nodes by what a person calls them, the entrance switch by its label', async () => {
    const r = await render(<MapEditorScreen />);
    await settle();
    await layOutPlan(r);
    // The stairs node carries its landmark, the entrance its room
    expect(r.getByTestId('wayfinduikit-plan-node-n-stairs1').props.accessibilityLabel).toBe('Laiptai');
    expect(r.getByTestId('wayfinduikit-plan-node-n-entrance').props.accessibilityLabel).toBe('Viešųjų ryšių skyrius');
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    expect(r.getByTestId('editor-entrance').props.accessibilityLabel).toBe('mapEditor.entrance');
  });
});
