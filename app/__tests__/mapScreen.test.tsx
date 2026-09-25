// -----------------------------------------------------------
//  [*] Tests — the map tab over the wayfinding packages
//
//  The seed building end to end: search finds a room on the
//  second floor, the preview quotes the route, the walk climbs
//  the stairs to the arrival card, and Done returns to the
//  picker. Runs on the flat stage (no GL peers under jest).
//  Plus the plan drawing's two guards: a plan text that does
//  not parse shows a notice instead of an empty floor, and a
//  fetched plan is cached under a versioned key. A served
//  two-wing building pins the route shapes: a floor the route
//  comes back to draws BOTH stretches (KNF-113), a room
//  nothing reaches says so with a way back to the list, and a
//  step-free switch that rules the route out offers the
//  stairs route instead of a dead end. The graph source never
//  shows what the engine could not index — a damaged cached
//  copy lends neither its graph nor its ETag, a malformed
//  server answer is ignored — a fresh server graph warms the
//  plan cache for every level, and a plan fetch that failed
//  offline is tried again on the next network restore.
// -----------------------------------------------------------

import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import MapScreen from '@/app/(main)/tabs/map';
import { useBuildingGraph } from '@/hooks/useBuildingGraph';
import { usePlanXml } from '@/hooks/usePlanXml';
import { cacheKeyWayfindPlan } from '@/services/cacheKeys';
import { logError } from '@/services/log';
import { fetchBuildingGraph, fetchPlanXml } from '@/services/api';
import { KNF_GRAPH } from '@/services/wayfind/seed';
import { validateGraph, type BuildingGraph } from '@knf/wayfindengine';


// The ui barrel drags the API client and the i18n polyfills in;
// plain stand-ins keep the screen's own logic under test
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

jest.mock('@/components/ui', () => {
  const { Pressable, Text, View } = require('react-native');
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
  };
});
// Mutable, so a test can switch the app to English
const mockI18n = { language: 'lt' };
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: mockI18n }) }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { canvas: '#fff', surface: '#fff', surfaceSoft: '#eee', ink: '#111', inkSoft: '#666', inkFaint: '#999', line: '#ddd', brand: '#7B003F', onBrand: '#fff', brandSoft: '#fce', success: '#0a0', danger: '#a00', scrim: 'rgba(0,0,0,0.5)', shadow: '#000' },
    scheme: 'light',
  }),
}));
jest.mock('@/services/format', () => ({ activeLocale: () => 'lt' }));
jest.mock('@/services/api', () => ({
  getUploadUrl: (path: string) => `https://x${path}`,
  fetchBuildingGraph: jest.fn(async () => ({ kind: 'unchanged' })),
  fetchPlanXml: jest.fn(async () => '<svg/>'),
}));
// One STABLE engine object, as the real provider hands out —
// usePlanXml lists the cache among its effect deps, so a fresh
// object per render would re-run the fetch forever
const mockCacheGet = jest.fn(async (..._args: unknown[]): Promise<unknown> => null);

// The cache's writes, for the specs to read
const mockCacheSet = jest.fn(async () => undefined);

// The restore bus: a test fires it to play a network restore
const mockRestore = new Set<() => void>();

// The one engine object every useDataEngine call answers
const mockEngine = {
  cache: { get: (...args: unknown[]) => mockCacheGet(...(args as [])), set: (...args: unknown[]) => mockCacheSet(...(args as [])) },
  onRestore: (listener: () => void) => {
    mockRestore.add(listener);
    return () => {
      mockRestore.delete(listener);
    };
  },
};
jest.mock('@knf/dataengine', () => ({ useDataEngine: () => mockEngine }));
// The seed's levels carry no plan, so the drawing only mounts
// when a test hands the screen a plan text of its own — the
// real hook still runs underneath so the hook suite below
// exercises it unmocked
const mockPlanXml: { override: string | null } = { override: null };
jest.mock('@/hooks/usePlanXml', () => {
  const actual = jest.requireActual('@/hooks/usePlanXml');
  return {
    // The prefetch the graph hook calls is the real one
    ...actual,
    usePlanXml: (reference: string | null | undefined) => {
      const real = actual.usePlanXml(reference);
      return mockPlanXml.override ?? real;
    },
  };
});
jest.mock('@/services/log', () => ({ logError: jest.fn() }));


type Rendered = Awaited<ReturnType<typeof render>>;

// What the old entity decode made of a plan: its '&lt;' became
// a bare '<' mid-text, which no XML parser accepts
const BROKEN_PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><text>1 < 2</text></svg>';

// The same plan with its entity intact — it parses
const GOOD_PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><text>1 &lt; 2</text></svg>';

// Two ground-floor wings joined only upstairs (L1 → L2 → L1 to
// the far wing), and a room on an island nothing reaches —
// served as a published revision, so it replaces the seed
const WINGS: BuildingGraph = {
  version: 1,
  building: 'knf',
  revision: 5,
  levels: [
    { id: 'L1', label: '1 aukštas', viewBox: [0, 0, 1000, 600], metersPerPixel: 0.05, ordinal: 1, plan: null },
    { id: 'L2', label: '2 aukštas', viewBox: [0, 0, 1000, 600], metersPerPixel: 0.05, ordinal: 2, plan: null },
  ],
  nodes: [
    { id: 'n-ent', level: 'L1', x: 100, y: 300, kind: 'entrance' },
    { id: 'n-s1', level: 'L1', x: 400, y: 300, kind: 'stairs' },
    { id: 'n-s2', level: 'L2', x: 400, y: 300, kind: 'stairs' },
    { id: 'n-s3', level: 'L2', x: 700, y: 300, kind: 'stairs' },
    { id: 'n-s4', level: 'L1', x: 700, y: 300, kind: 'stairs' },
    { id: 'n-far', level: 'L1', x: 900, y: 300, kind: 'room' },
    { id: 'n-island', level: 'L1', x: 900, y: 100, kind: 'room' },
  ],
  edges: [
    { a: 'n-ent', b: 'n-s1', kind: 'hallway' },
    { a: 'n-s1', b: 'n-s2', kind: 'stairs', lengthM: 8 },
    { a: 'n-s2', b: 'n-s3', kind: 'hallway' },
    { a: 'n-s3', b: 'n-s4', kind: 'stairs', lengthM: 8 },
    { a: 'n-s4', b: 'n-far', kind: 'hallway' },
  ],
  rooms: [
    { id: 'r-far', name: 'Tolimas sparnas', nameEn: 'Far wing', level: 'L1', nodeId: 'n-far', polygon: [[850, 250], [950, 250], [950, 350], [850, 350]] },
    // A malformed outline from the server must not break the plan
    { id: 'r-island', name: 'Sala', level: 'L1', nodeId: 'n-island', polygon: 'broken' as unknown as [number, number][] },
  ],
  entranceNodeId: 'n-ent',
};







// -----------------------------------------------------------
// layOutStage
// -----------------------------------------------------------
//
// Lay the walking stage out at 400 × 320 — nothing mounts
// inside it until it knows its height.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const layOutStage = async (r: Rendered) => {
  await act(async () => {
    fireEvent(r.getByTestId('map-stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 320 } } });
  });
};







// -----------------------------------------------------------
// wrap
// -----------------------------------------------------------
//
// Render a screen as the specs mount it.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const wrap = (ui: ReactElement) => render(ui);







// -----------------------------------------------------------
// openPlanView
// -----------------------------------------------------------
//
// Search, pick the Gronsko room, start the walk, lay the
// stage out, switch to the plan view and lay the plan's
// viewport out — the kit draws nothing inside it until it
// knows its size.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const openPlanView = async (r: Rendered) => {
  await act(async () => {
    fireEvent.changeText(r.getByPlaceholderText('navigation.searchPlaceholder'), 'gronsk');
  });
  await act(async () => {
    fireEvent.press(r.getByTestId('map-room-r-gronsko'));
  });
  await act(async () => {
    fireEvent.press(r.getByTestId('wayfinduikit-preview-start'));
  });
  await layOutStage(r);
  await act(async () => {
    fireEvent.press(r.getByTestId('map-view-plan'));
  });
  await act(async () => {
    (r.getByTestId('wayfinduikit-plan').props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 240 } } });
  });
};







// -----------------------------------------------------------
// withWings
// -----------------------------------------------------------
//
// Mount the tab with WINGS served, and wait for it to
// land.
//
// Used by:
//   - the specs below
// -----------------------------------------------------------

const withWings = async () => {
  (fetchBuildingGraph as jest.Mock).mockResolvedValueOnce({ kind: 'fresh', graph: WINGS, etag: '"w5"' });
  const r = await wrap(<MapScreen />);
  await waitFor(() => expect(r.getByTestId('map-room-r-far')).toBeTruthy());
  return r;
};


describe('MapScreen', () => {
  afterEach(() => {
    mockPlanXml.override = null;
    mockCacheGet.mockClear();
    mockCacheSet.mockClear();
    (logError as jest.Mock).mockClear();
  });


  it('ships a seed graph the engine accepts', () => {
    expect(validateGraph(KNF_GRAPH).filter((issue) => issue.severity === 'error')).toEqual([]);
  });


  it('searches, previews, walks upstairs to the arrival card and returns to the picker', async () => {
    const felt = jest.spyOn(Haptics, 'notificationAsync').mockResolvedValue(undefined);
    const r = await wrap(<MapScreen />);
    expect(r.getByText('navigation.whereTo')).toBeTruthy();

    // Every room lists under its floor; a folded query narrows it
    // The floor header plus one label per room on it
    expect(r.getAllByText('2 aukštas').length).toBe(7);
    await act(async () => {
      fireEvent.changeText(r.getByPlaceholderText('navigation.searchPlaceholder'), 'gronsk');
    });
    expect(r.queryByTestId('map-room-r-aud5')).toBeNull();
    await act(async () => {
      fireEvent.press(r.getByTestId('map-room-r-gronsko'));
    });

    // The preview names the room and its route climbs one floor
    expect(r.getByTestId('header-title').props.children).toBe('Gronsko auditorija');
    expect(r.getByTestId('wayfinduikit-preview')).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-preview-start'));
    });

    // The walk: the flat stage at the entrance, the sheet below
    await layOutStage(r);
    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-sheet')).toBeTruthy();
    // The entrance node is the PR office's own node, so the bar
    // names the room (the kit prefixes its 'you are at' label)
    expect(String(r.getByTestId('wayfinduikit-here-place').props.children)).toContain('navigation.rooms.publicRelations');

    // The plan view draws the route on the shown floor
    await act(async () => {
      fireEvent.press(r.getByTestId('map-view-plan'));
    });
    expect(r.getByTestId('wayfinduikit-floor-switcher')).toBeTruthy();

    // Next until the arrival card; the second floor is reached
    // on the way
    let guard = 0;
    while (!r.queryByTestId('wayfinduikit-sheet-arrival') && guard < 12) {
      await act(async () => {
        fireEvent.press(r.getByTestId('wayfinduikit-sheet-next'));
      });
      guard += 1;
    }
    expect(r.getByTestId('wayfinduikit-sheet-arrival')).toBeTruthy();
    expect(String(r.getByTestId('wayfinduikit-here-place').props.children)).toContain('Gronsko auditorija');
    // Arrival is felt once, as a success
    expect(felt.mock.calls.filter(([type]) => type === Haptics.NotificationFeedbackType.Success)).toHaveLength(1);
    felt.mockRestore();

    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-sheet-done'));
    });
    expect(r.getByText('navigation.whereTo')).toBeTruthy();
  });


  it('shows a notice and logs once when the plan text does not parse, and draws again when it does', async () => {
    mockPlanXml.override = BROKEN_PLAN;
    const r = await wrap(<MapScreen />);
    await openPlanView(r);
    expect(r.getByTestId('map-plan-failed')).toBeTruthy();
    expect(r.getByText('common.error')).toBeTruthy();
    expect(logError).toHaveBeenCalledTimes(1);
    expect((logError as jest.Mock).mock.calls[0][0]).toBe('map.plan');

    // The deferred state flip lands; a re-render of the stage
    // (its height changes — the plan stays mounted) must not
    // re-parse and re-log the same broken text
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      fireEvent(r.getByTestId('map-stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 321 } } });
    });
    expect(r.getByTestId('map-plan-failed')).toBeTruthy();
    expect(logError).toHaveBeenCalledTimes(1);

    // A plan text that parses replaces the notice
    mockPlanXml.override = GOOD_PLAN;
    await act(async () => {
      fireEvent(r.getByTestId('map-stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 322 } } });
    });
    expect(r.queryByTestId('map-plan-failed')).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});


describe('MapScreen — route shapes and dead ends', () => {

  it('draws both stretches of a floor the route comes back to, up to the destination pin', async () => {
    const r = await withWings();
    await act(async () => {
      fireEvent.press(r.getByTestId('map-room-r-far'));
    });
    await act(async () => {
      fireEvent.press(r.getByTestId('wayfinduikit-preview-start'));
    });
    // No photos in this building: the plan is the stage
    await layOutStage(r);
    await act(async () => {
      (r.getByTestId('wayfinduikit-plan').props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 240 } } });
    });
    expect(r.getByTestId('wayfinduikit-plan-route').props.d).toBe('M100 300 L400 300 M700 300 L900 300');
    expect(r.getByTestId('wayfinduikit-plan-end')).toBeTruthy();
    // The room with a drawable outline is on the plan; the one
    // whose outline is garbage is simply not
    expect(r.getByTestId('wayfinduikit-plan-room-r-far')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-plan-room-r-island')).toBeNull();
    // The floor pills scroll inside the stage instead of running
    // past its bottom edge on a short screen
    expect(StyleSheet.flatten(r.getByTestId('map-floor-scroll').props.style).maxHeight).toBe(320 - 56);
  });


  it("names a room by its nameEn in English, and finds it by either name", async () => {
    mockI18n.language = 'en';
    try {
      const r = await withWings();
      expect(r.getByText('Far wing')).toBeTruthy();
      await act(async () => {
        fireEvent.changeText(r.getByPlaceholderText('navigation.searchPlaceholder'), 'tolim');
      });
      expect(r.getByTestId('map-room-r-far')).toBeTruthy();
    } finally {
      mockI18n.language = 'lt';
    }
  });


  it('says a room nothing reaches has no route — at once, with a way back to the list', async () => {
    const r = await withWings();
    await act(async () => {
      fireEvent.press(r.getByTestId('map-room-r-island'));
    });
    expect(r.getByText('navigation.noRoute')).toBeTruthy();
    expect(r.getByText('navigation.noRouteHint')).toBeTruthy();
    expect(r.getByText('navigation.backToRooms')).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByTestId('empty-action'));
    });
    expect(r.getByText('navigation.whereTo')).toBeTruthy();
  });


  it('offers the stairs route when the step-free switch rules every route out', async () => {
    // The seed's floors meet only by stairs
    const r = await wrap(<MapScreen />);
    await act(async () => {
      fireEvent.press(r.getByTestId('map-room-r-gronsko'));
    });
    // The preview scrolls, so an unfolded step list keeps Start reachable
    expect(r.getByTestId('map-preview')).toBeTruthy();
    await act(async () => {
      fireEvent(r.getByTestId('wayfinduikit-preview-accessible'), 'valueChange', true);
    });
    expect(r.getByText('navigation.noAccessibleRoute')).toBeTruthy();
    expect(r.getByText('navigation.noAccessibleRouteHint')).toBeTruthy();
    await act(async () => {
      fireEvent.press(r.getByTestId('empty-action'));
    });
    expect(r.getByTestId('wayfinduikit-preview')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-preview-accessible').props.value).toBe(false);
  });
});


describe('usePlanXml', () => {
  afterEach(() => {
    mockCacheGet.mockClear();
    mockCacheSet.mockClear();
  });

  // The key carries a version: copies cached before the API
  // client stopped entity-decoding responses are corrupt, sit
  // under a content hash with no TTL, and must never be read
  // again — bypassed by the namespace, not by a sweep
  it('reads and writes a fetched plan under a versioned cache key', async () => {
    const reference = '/api/wayfind/plans/abc.svg';
    const { result } = await renderHook(() => usePlanXml(reference));
    await waitFor(() => expect(result.current).toBe('<svg/>'));
    const key = `${cacheKeyWayfindPlan(reference)}:v2`;
    expect(mockCacheGet).toHaveBeenCalledWith(key);
    expect(mockCacheSet).toHaveBeenCalledWith(key, '<svg/>');
  });
});


describe('the graph and plan sources', () => {
  beforeEach(() => {
    mockCacheSet.mockClear();
  });

  afterEach(() => {
    mockCacheGet.mockReset();
    mockCacheGet.mockImplementation(async () => null);
    (fetchBuildingGraph as jest.Mock).mockClear();
    (fetchPlanXml as jest.Mock).mockClear();
  });


  it('skips a damaged cached copy — its graph and its ETag — and adopts the fresh server copy', async () => {
    mockCacheGet.mockImplementation(async () => ({ data: { graph: { levels: 'oops' }, etag: '"stale"' } }));
    (fetchBuildingGraph as jest.Mock).mockResolvedValueOnce({ kind: 'fresh', graph: WINGS, etag: '"w5"' });
    const { result } = await renderHook(() => useBuildingGraph());
    await waitFor(() => expect(result.current.source).toBe('server'));
    expect(result.current.graph).toBe(WINGS);
    // The damaged copy's ETag never went out — a 304 against it
    // would have kept the seed on screen for good
    expect((fetchBuildingGraph as jest.Mock).mock.calls[0][1]).toBeNull();
  });


  it('ignores a server answer the engine could not index', async () => {
    (fetchBuildingGraph as jest.Mock).mockResolvedValueOnce({ kind: 'fresh', graph: '<html>proxy error</html>', etag: '"x"' });
    const { result } = await renderHook(() => useBuildingGraph());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.source).toBe('seed');
    expect(result.current.graph).toBe(KNF_GRAPH);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });


  it('warms the plan cache for every served level when a server graph lands', async () => {
    const withPlans: BuildingGraph = {
      ...WINGS,
      revision: 6,
      levels: WINGS.levels.map((level) => ({ ...level, plan: `/api/wayfind/plans/${level.id}.svg` })),
    };
    (fetchBuildingGraph as jest.Mock).mockResolvedValueOnce({ kind: 'fresh', graph: withPlans, etag: '"w6"' });
    const { result } = await renderHook(() => useBuildingGraph());
    await waitFor(() => expect(result.current.source).toBe('server'));
    await waitFor(() => expect(fetchPlanXml).toHaveBeenCalledTimes(2));
    expect((fetchPlanXml as jest.Mock).mock.calls.map(([reference]) => reference)).toEqual(['/api/wayfind/plans/L1.svg', '/api/wayfind/plans/L2.svg']);
    // Stored under the very key the plan view reads
    await waitFor(() => expect(mockCacheSet).toHaveBeenCalledWith(`${cacheKeyWayfindPlan('/api/wayfind/plans/L1.svg')}:v2`, '<svg/>'));
  });


  it('tries a failed plan fetch again on the next network restore', async () => {
    (fetchPlanXml as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const { result } = await renderHook(() => usePlanXml('/api/wayfind/plans/retry.svg'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBeNull();
    await act(async () => {
      for (const listener of [...mockRestore]) listener();
    });
    await waitFor(() => expect(result.current).toBe('<svg/>'));
    expect(fetchPlanXml).toHaveBeenCalledTimes(2);
  });
});

