// -----------------------------------------------------------
//  [*] Tests — the facing alignment screen
//
//  The arithmetic and the flow: fold360 alone, then the
//  screen with a stubbed panorama stage whose yaw reports the
//  test hands in — pick a neighbour, "turn" the view, confirm
//  — and the ONE editor-less node upsert that comes out the
//  other side: panoYaw = fold360(bearing − viewYaw + fine),
//  panoHeading { source: 'aligned' }, the node's own data and
//  the base revision from the route params — awaited to its
//  verdict: a conflict runs the overwrite/discard dialog
//  (overwrite re-sends without a base, discard drops the op),
//  and only a clean answer toasts success and goes back. Plus
//  the gates: a node without a panorama or without links
//  aligns nothing.
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';

import AlignScreen, { fold360 } from '@/app/(main)/map-editor/align';


jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
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
      <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button">
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts && 'name' in opts ? `${key}:${opts.name}` : key) }) }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { surface: '#fff', surfaceSoft: '#eee', ink: '#111', inkSoft: '#666', inkFaint: '#999', brand: '#7B003F', onBrand: '#fff', danger: '#C62828' }, scheme: 'light' }),
}));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'a1', role: 'curator' }, hydrated: true }) }));
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@knf/dataengine', () => ({ useDataEngine: () => ({ onRestore: () => () => undefined, cache: { get: async () => null, set: async () => undefined } }) }));

const mockBack = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

// The stage stub: the screen only needs its onYawChange wire —
// the test IS the drag
const mockYawReport: { fire: ((yaw: number) => void) | null } = { fire: null };
jest.mock('@knf/wayfinduikit', () => {
  const { Text, View } = require('react-native');
  return {
    WayfindUiKitProvider: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    PanoramaStage: ({ source, onYawChange }: { source: unknown; onYawChange?: (yaw: number) => void }) => {
      mockYawReport.fire = onYawChange ?? null;
      return <Text testID="stage-stub">{String(source)}</Text>;
    },
  };
});

type SentOp = { id: string; type?: string; kind?: string; entityId?: string; data?: Record<string, unknown>; baseRevision?: number };
const mockPostOps = jest.fn(async (_b: string, ops: SentOp[]): Promise<{ revision: number; results: Record<string, unknown>[] }> => ({ revision: 9, results: ops.map((op) => ({ id: op.id, status: 'applied' })) }));
jest.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  getUploadUrl: (path: string) => `https://knf.example${path}`,
}));
jest.mock('@/services/wayfindTransport', () => ({
  wayfindTransport: {
    postOps: (...args: [string, SentOp[]]) => mockPostOps(...args),
    publish: jest.fn(),
    uploadPanorama: jest.fn(),
    uploadPlan: jest.fn(),
    uploadFrame: jest.fn(),
  },
}));


const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const sentOps = (): SentOp[] => mockPostOps.mock.calls.flatMap(([, ops]) => ops);

const NODE = { id: 'n-1', level: 'L1', x: 100, y: 200, kind: 'corridor', pano: '/api/wayfind/panoramas/h.jpg', panoYaw: 10, panoGeometry: { hfovDeg: 360, vfovDeg: 180 } };
const NEIGHBOURS = [
  { nodeId: 'n-b', name: 'Biblioteka', bearingDeg: 90 },
  { nodeId: 'n-c', name: 'n-c', bearingDeg: 200 },
];


describe('fold360', () => {
  it('folds any degree value into [0, 360)', () => {
    expect(fold360(0)).toBe(0);
    expect(fold360(360)).toBe(0);
    expect(fold360(725)).toBe(5);
    expect(fold360(-30)).toBe(330);
    expect(fold360(90 - 45)).toBe(45);
    // The negative-zero trap: -360 % 360 is -0, the fold ends at 0
    expect(Object.is(fold360(-360), 0)).toBe(true);
  });
});


describe('AlignScreen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPostOps.mockClear();
    mockToast.mockClear();
    mockBack.mockClear();
    mockConfirm.mockClear();
    mockConfirm.mockImplementation(async () => true);
    mockYawReport.fire = null;
    mockParams.nodeId = 'n-1';
    mockParams.node = JSON.stringify(NODE);
    mockParams.baseRevision = '7';
    mockParams.neighbours = JSON.stringify(NEIGHBOURS);
  });


  it('turning the first neighbour into the centre and confirming writes panoYaw = fold360(bearing − viewYaw)', async () => {
    const r = await render(<AlignScreen />);
    await settle();

    // The first neighbour is picked by default and named in the
    // instruction; the crosshair sits over the stage
    expect(r.getByTestId('align-instruction').props.children).toBe('mapEditor.align.instruction:Biblioteka');
    expect(r.getByTestId('align-crosshair')).toBeTruthy();

    // The admin "turns" until the library is centred at view yaw 45
    await act(async () => {
      mockYawReport.fire?.(45);
    });
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.align.confirm'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const ops = sentOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: 'upsert',
      kind: 'node',
      entityId: 'n-1',
      baseRevision: 7,
      data: { level: 'L1', x: 100, y: 200, kind: 'corridor', pano: '/api/wayfind/panoramas/h.jpg', panoYaw: 45, panoHeading: { source: 'aligned' } },
    });
    expect((ops[0].data as { id?: string }).id).toBeUndefined();
    expect(mockBack).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.align.saved');
  });


  it('a picked neighbour, a negative view yaw and the fine tune all land in the fold', async () => {
    const r = await render(<AlignScreen />);
    await settle();

    await act(async () => {
      fireEvent.press(r.getByTestId('align-neighbour-n-c'));
    });
    expect(r.getByTestId('align-instruction').props.children).toBe('mapEditor.align.instruction:n-c');

    // The stage reports a leftward turn as a negative yaw
    await act(async () => {
      mockYawReport.fire?.(-20);
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('align-fine-plus'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('align-fine-plus'));
    });
    expect(r.getByTestId('align-fine-value').props.children).toBe('+2°');
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.align.confirm'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 200 − (−20) + 2 = 222
    expect((sentOps()[0].data as { panoYaw: number }).panoYaw).toBe(222);
  });


  it('the fine tune clamps at ±10°', async () => {
    const r = await render(<AlignScreen />);
    await settle();
    for (let n = 0; n < 14; n++) {
      await act(async () => {
        fireEvent.press(r.getByTestId('align-fine-minus'));
      });
    }
    expect(r.getByTestId('align-fine-value').props.children).toBe('-10°');
  });


  it('a conflicted confirm surfaces the dialog; overwrite re-sends without a base and only then toasts', async () => {
    mockPostOps.mockImplementationOnce(async (_b: string, ops: SentOp[]) => ({
      revision: 12,
      results: ops.map((op) => ({ id: op.id, status: 'rejected', reason: 'conflict', current: { data: { x: 1 }, revision: 12, deleted: false } })),
    }));

    const r = await render(<AlignScreen />);
    await settle();
    await act(async () => {
      mockYawReport.fire?.(45);
    });
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.align.confirm'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockConfirm).toHaveBeenCalledWith({
      title: 'mapEditor.conflictTitle',
      message: 'mapEditor.conflictBody',
      confirmLabel: 'mapEditor.keepMine',
      cancelLabel: 'mapEditor.takeTheirs',
    });
    const ops = sentOps();
    expect(ops).toHaveLength(2);
    expect(ops[1].id).toBe(`${ops[0].id}-again`);
    expect(ops[1].baseRevision).toBeUndefined();
    expect((ops[1].data as { panoYaw: number }).panoYaw).toBe(45);
    expect(mockToast).toHaveBeenCalledWith('success', 'mapEditor.align.saved');
    expect(mockBack).toHaveBeenCalled();
  });


  it('a conflicted confirm discarded in the dialog drops the op — no toast, no navigation, nothing parked', async () => {
    mockConfirm.mockImplementationOnce(async () => false);
    mockPostOps.mockImplementationOnce(async (_b: string, ops: SentOp[]) => ({
      revision: 12,
      results: ops.map((op) => ({ id: op.id, status: 'rejected', reason: 'conflict', current: { data: { x: 1 }, revision: 12, deleted: false } })),
    }));

    const r = await render(<AlignScreen />);
    await settle();
    await act(async () => {
      mockYawReport.fire?.(45);
    });
    await act(async () => {
      fireEvent.press(r.getByText('mapEditor.align.confirm'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(sentOps()).toHaveLength(1);
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    // Dropped, not parked: the outbox holds no rejected leftover
    expect(JSON.parse((await AsyncStorage.getItem('wayfind-align:ops:knf')) ?? '[]') as unknown[]).toHaveLength(0);
  });


  it('a node without a panorama, or without links, aligns nothing', async () => {
    mockParams.node = JSON.stringify({ ...NODE, pano: null });
    const withoutPano = await render(<AlignScreen />);
    await settle();
    expect(withoutPano.getByText('mapEditor.align.noPano')).toBeTruthy();
    withoutPano.unmount();

    mockParams.node = JSON.stringify(NODE);
    mockParams.neighbours = JSON.stringify([]);
    const withoutLinks = await render(<AlignScreen />);
    await settle();
    expect(withoutLinks.getByText('mapEditor.align.noNeighbours')).toBeTruthy();
    expect(sentOps()).toHaveLength(0);
  });
});
