// -----------------------------------------------------------
//  [*] Tests — the map tab over the wayfinding packages
//
//  The seed building end to end: search finds a room on the
//  second floor, the preview quotes the route, the walk climbs
//  the stairs to the arrival card, and Done returns to the
//  picker. Runs on the flat stage (no GL peers under jest).
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import MapScreen from '@/app/(main)/tabs/map';
import { KNF_GRAPH } from '@/services/wayfind/seed';
import { validateGraph } from '@knf/wayfindengine';


// The ui barrel drags the API client and the i18n polyfills in;
// plain stand-ins keep the screen's own logic under test
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
jest.mock('@knf/dataengine', () => ({
  useDataEngine: () => ({
    cache: { get: async () => null, set: async () => undefined },
    onRestore: () => () => undefined,
  }),
}));


type Rendered = Awaited<ReturnType<typeof render>>;

const layOutStage = async (r: Rendered) => {
  await act(async () => {
    fireEvent(r.getByTestId('map-stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 320 } } });
  });
};

const wrap = (ui: ReactElement) => render(ui);


describe('MapScreen', () => {

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
});
