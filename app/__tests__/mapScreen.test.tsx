// -----------------------------------------------------------
//  [*] Tests — the map tab over the wayfinding packages
//
//  The seed building end to end: search finds a room on the
//  second floor, the preview quotes the route, the walk climbs
//  the stairs to the arrival card, and Done returns to the
//  picker. Runs on the flat stage (no GL peers under jest).
//  Plus the plan drawing's two guards: a plan text that does
//  not parse shows a notice instead of an empty floor, and a
//  fetched plan is cached under a versioned key.
// -----------------------------------------------------------

import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import MapScreen from '@/app/(main)/tabs/map';
import { usePlanXml } from '@/hooks/usePlanXml';
import { cacheKeyWayfindPlan } from '@/services/cacheKeys';
import { logError } from '@/services/log';
import { KNF_GRAPH } from '@/services/wayfind/seed';
import { validateGraph } from '@knf/wayfindengine';


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
  const { Text, View } = require('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    Header: ({ title, right }: { title: string; right?: unknown }) => (
      <View>
        <Text testID="header-title">{title}</Text>
        {right as never}
      </View>
    ),
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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
const mockCacheGet = jest.fn(async () => null);
const mockCacheSet = jest.fn(async () => undefined);
const mockEngine = {
  cache: { get: (...args: unknown[]) => mockCacheGet(...(args as [])), set: (...args: unknown[]) => mockCacheSet(...(args as [])) },
  onRestore: () => () => undefined,
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
    usePlanXml: (reference: string | null | undefined) => {
      const real = actual.usePlanXml(reference);
      return mockPlanXml.override ?? real;
    },
  };
});
jest.mock('@/services/log', () => ({ logError: jest.fn() }));


type Rendered = Awaited<ReturnType<typeof render>>;

const layOutStage = async (r: Rendered) => {
  await act(async () => {
    fireEvent(r.getByTestId('map-stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 320 } } });
  });
};

const wrap = (ui: ReactElement) => render(ui);

// Search, pick the Gronsko room, start the walk, lay the stage
// out, switch to the plan view and lay the plan's viewport out
// — the kit draws nothing inside it until it knows its size
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

// What the old entity decode made of a plan: its '&lt;' became
// a bare '<' mid-text, which no XML parser accepts
const BROKEN_PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><text>1 < 2</text></svg>';
const GOOD_PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><text>1 &lt; 2</text></svg>';


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
