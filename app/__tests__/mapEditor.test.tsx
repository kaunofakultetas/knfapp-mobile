// -----------------------------------------------------------
//  [*] Tests — the map editor screen over the three packages
//
//  An admin loads the draft, adds a node by tapping the plan,
//  links it to the entrance, undoes both, and publishes — every
//  edit reaching the mocked server as ops with the loaded
//  revisions, every answer re-stamping the entity with ITS
//  batch's revision. The link tool keeps its first pick across
//  a floor switch (that is how cross-level connectors are
//  authored) and refuses a self-link; a placing tool makes the
//  room polygons transparent to the finger; a refused upload
//  gets retry / remove and never hides a later stored url.
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';

import MapEditorScreen from '@/app/(main)/map-editor/index';
import { SyncRejected } from '@knf/wayfindsync';


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
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
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
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts && 'count' in opts ? `${key}:${opts.count}` : key) }) }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { surface: '#fff', surfaceSoft: '#eee', ink: '#111', inkSoft: '#666', inkFaint: '#999', brand: '#7B003F', onBrand: '#fff' }, scheme: 'light' }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'a1', role: 'admin' }, hydrated: true }) }));
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@knf/dataengine', () => ({ useDataEngine: () => ({ onRestore: () => () => undefined, cache: { get: async () => null, set: async () => undefined } }) }));
jest.mock('@/hooks/usePlanXml', () => ({ usePlanXml: () => null }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true })) }));
jest.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// The op shape as the wire sees it, loose enough to filter by
type SentOp = { id: string; type?: string; kind?: string; entityId?: string; data?: Record<string, unknown>; baseRevision?: number };

const mockPostOps = jest.fn(async (_b: string, ops: SentOp[]) => ({ revision: 4, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) }));
const mockPublish = jest.fn(async () => ({ ok: true as const, revision: 4, etag: 'e', publishedAt: 'now' }));
const mockUploadPanorama = jest.fn();
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


type Rendered = Awaited<ReturnType<typeof render>>;
type Handler = (e: unknown) => unknown;

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const gesture = (fingers: { x: number; y: number }[], t: number) => ({
  nativeEvent: { touches: fingers.map((f) => ({ pageX: f.x, pageY: f.y })), timestamp: t },
  touchHistory: {
    numberActiveTouches: fingers.length,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: t,
    touchBank: fingers.map((f) => ({ touchActive: true, currentPageX: f.x, currentPageY: f.y, currentTimeStamp: t, previousPageX: f.x, previousPageY: f.y, previousTimeStamp: t - 16, startPageX: f.x, startPageY: f.y, startTimeStamp: t - 16 })),
  },
});

// Lay the plan area and the viewport out, then tap the drawing
const layOutPlan = async (r: Rendered) => {
  await act(async () => {
    fireEvent(r.getByTestId('editor-plan-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } } });
  });
  await act(async () => {
    (r.getByTestId('wayfinduikit-plan').props.onLayout as Handler)({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 240 } } });
  });
};

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


// Every op the mocked server saw, flattened across batches
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
    expect(r.getByTestId('editor-link-hint').props.children).toBe('mapEditor.linkFirst');
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-entrance'));
    });
    expect(r.getByTestId('editor-link-hint').props.children).toBe('mapEditor.linkNext · n-entrance');
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

    // An edit to a loaded entity carries its loaded revision
    await act(async () => {
      fireEvent.press(r.getByTestId('editor-tool-select'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
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
    expect(r.getByTestId('editor-link-hint').props.children).toBe('mapEditor.linkNext · n-stairs1');

    // The same node again is no link: the pick is kept, nothing sent
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-stairs1'));
    });
    await settle();
    expect(mockToast).not.toHaveBeenCalledWith('success', 'mapEditor.linked');
    expect(r.getByTestId('editor-link-hint').props.children).toBe('mapEditor.linkNext · n-stairs1');

    // The pick SURVIVES the floor switch — the second endpoint of
    // a stairs connector lives on the other floor
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-floor-L2'));
    });
    await settle();
    expect(r.getByTestId('editor-link-hint').props.children).toBe('mapEditor.linkNext · n-stairs1');
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-plan-node-n-a'));
    });
    await settle();
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.linked');
    const edges = sentOps().filter((op) => op.kind === 'edge');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: 'upsert', entityId: 'n-stairs1--n-a', data: { a: 'n-stairs1', b: 'n-a', kind: 'stairs', lengthM: 10 } });
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
    expect(r.getByText('mapEditor.node · n-entrance')).toBeTruthy();
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
});
