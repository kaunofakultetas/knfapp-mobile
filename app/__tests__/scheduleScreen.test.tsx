// -----------------------------------------------------------
//  [*] Tests — the schedule screen's state machine
//
//  The seams the wiring promises and no lower layer can pin:
//  the explicit "all semesters" choice riding the wire as the
//  literal 'all' (an omitted param means NEWEST to the
//  backend), the filter modal's untouched Apply preserving an
//  auto-default that landed under the open sheet, prefs
//  round-tripping without promoting a default to a choice,
//  the pick-a-group gate in front of the timetable views, and
//  the teacher perspective's merged day cards.
// -----------------------------------------------------------

const mockFetchSchedule = jest.fn();
const mockFetchFilters = jest.fn();
const mockFetchWeek = jest.fn();
jest.mock('@/services/api', () => ({
  fetchSchedule: (...args: unknown[]) => mockFetchSchedule(...(args as [])),
  fetchScheduleFilters: (...args: unknown[]) => mockFetchFilters(...(args as [])),
  fetchScheduleWeek: (...args: unknown[]) => mockFetchWeek(...(args as [])),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@knf/dataengine', () => ({
  useDataEngine: () => ({
    cache: { set: async () => {}, get: async () => null, sweepPrefix: async () => {}, remove: async () => {} },
  }),
  useNetworkRestore: () => {},
}));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));
jest.mock('@/components/CachedBanner', () => () => null);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => (opts && 'count' in opts ? `${key}:${opts.count}` : key),
    i18n: { language: 'lt' },
  }),
}));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      brand: '#7B003F', onBrand: '#FFF', ink: '#111', inkSoft: '#666', inkFaint: '#999',
      surface: '#FFF', surfaceSoft: '#EEE', line: '#DDD', danger: '#C00', dangerSoft: '#FEE',
      accent: '#C62B4C', shadow: '#000',
    },
  }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      effect();
    }, [effect]);
  },
}));
jest.mock('@/components/ui', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    Header: ({ title, right }: { title: string; right?: unknown }) => (
      <View>
        <Text>{title}</Text>
        {(right as never) ?? null}
      </View>
    ),
    Button: ({ title, onPress }: { title: string; onPress?: () => void }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{title}</Text>
      </Pressable>
    ),
    Input: (props: object) => <TextInput {...props} />,
    LoadingSpinner: () => <Text>loading</Text>,
    RefreshSpinner: () => null,
    EmptyState: ({ title, hint }: { title: string; hint?: string }) => (
      <View>
        <Text>{`empty:${title}`}</Text>
        {hint ? <Text>{`hint:${hint}`}</Text> : null}
      </View>
    ),
    ErrorState: ({ message }: { message: string }) => <Text>{`error:${message}`}</Text>,
  };
});
// The kit seam is pinned by its own tests — a marker suffices
jest.mock('@/components/schedule/TimetableHost', () => ({ children }: { children?: unknown }) => children as never);
jest.mock('@/components/schedule/TimetableView', () => {
  const { Text } = require('react-native');
  function TimetableViewMarker({ mode, entries, scope }: { mode: string; entries: unknown[]; scope: { scope: string } }) {
    return <Text>{`timetable:${mode}:${entries.length}:${scope.scope}`}</Text>;
  }
  return TimetableViewMarker;
});
jest.mock('@/components/schedule/LessonSheet', () => () => null);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';

import ScheduleScreen, { SCHEDULE_PREFS_KEY } from '@/app/(main)/tabs/schedule';
import type { ScheduleLesson } from '@/services/api';

const row = (id: string, over: Partial<ScheduleLesson> = {}): ScheduleLesson => ({
  id,
  title: `Lesson ${id}`,
  teacher: 'A. Petraitis',
  room: '112',
  timeStart: '09:00',
  timeEnd: '10:30',
  // The screen opens on TODAY's tab — pin the rows to it
  dayOfWeek: (new Date().getDay() + 6) % 7,
  group: 'ISKS-1',
  semester: '2026-R',
  ...over,
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

beforeEach(async () => {
  mockFetchSchedule.mockReset().mockResolvedValue({ lessons: [row('a')] });
  mockFetchFilters.mockReset().mockResolvedValue({ groups: ['ISKS-1', 'PDF-2'], semesters: ['2026-R', '2026-P'] });
  mockFetchWeek.mockReset().mockResolvedValue({ lessons: [row('a'), row('b', { group: 'PDF-2' })] });
  await AsyncStorage.clear();
});

const lastPrefs = () => {
  const mock = AsyncStorage.setItem as unknown as jest.Mock;
  const writes = mock.mock.calls.filter((call) => call[0] === SCHEDULE_PREFS_KEY);
  return writes.length ? (JSON.parse(writes[writes.length - 1][1] as string) as Record<string, unknown>) : null;
};

describe('semester wire contract', () => {
  it("a restored explicit 'all semesters' rides as the literal 'all'", async () => {
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({ group: null, semester: null, semesterExplicit: true }),
    );
    await render(<ScheduleScreen />);
    await flush();
    const call = mockFetchSchedule.mock.calls[0];
    expect(call[2]).toBe('all');
  });

  it('a restored auto-default stays a default in the next persisted blob', async () => {
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({ group: null, semester: '2026-R', semesterExplicit: false }),
    );
    await render(<ScheduleScreen />);
    await flush();
    expect(mockFetchSchedule.mock.calls[0][2]).toBe('2026-R');
    expect(lastPrefs()?.semesterExplicit).toBe(false);
  });
});

describe('filter modal semantics', () => {
  it('an untouched Apply keeps the auto-default that landed while the sheet was open', async () => {
    const view = await render(<ScheduleScreen />);
    await flush(); // filters land → '2026-R' auto-defaults
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText('PDF-2')); // a group, not a semester
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    const call = mockFetchSchedule.mock.calls[mockFetchSchedule.mock.calls.length - 1];
    expect(call[1]).toBe('PDF-2');
    expect(call[2]).toBe('2026-R');
    expect(lastPrefs()?.semesterExplicit).toBe(false);
  });

  it("deliberately tapping 'all semesters' fetches with 'all' and records the choice", async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText('schedule.allSemesters'));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    const call = mockFetchSchedule.mock.calls[mockFetchSchedule.mock.calls.length - 1];
    expect(call[2]).toBe('all');
    expect(lastPrefs()?.semesterExplicit).toBe(true);
  });
});

describe('timetable view gating', () => {
  it('week mode without a group prompts for one and fetches NO week dataset', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(view.getByLabelText('schedule.viewWeek'));
    await flush();
    expect(view.getByText('empty:schedule.pickGroup')).toBeTruthy();
    expect(mockFetchWeek).not.toHaveBeenCalled();
  });

  it('week mode with a group loads the week and renders the grid seam', async () => {
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({ group: 'ISKS-1', semester: '2026-R', semesterExplicit: true, viewMode: 'week' }),
    );
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(mockFetchWeek).toHaveBeenCalledWith('2026-R');
    // Only ISKS-1's lesson survives the group perspective
    expect(view.getByText('timetable:week:1:group')).toBeTruthy();
  });
});

describe('teacher perspective', () => {
  it('merges a cross-group double slot into one card listing both groups', async () => {
    mockFetchWeek.mockResolvedValue({
      lessons: [
        // The SAME slot taught to two groups at once — only the
        // group differs, so the teacher view merges it
        row('a', { teacher: 'Eglė Gabrėnaitė, Doc., Dr.', group: 'ISKS-1' }),
        row('b', { title: 'Lesson a', teacher: 'Eglė Gabrėnaitė, Doc., Dr.', group: 'PDF-2' }),
      ],
    });
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({
        group: null, semester: '2026-R', semesterExplicit: true,
        viewMode: 'list', perspective: 'teacher', teacher: 'Eglė Gabrėnaitė',
      }),
    );
    const view = await render(<ScheduleScreen />);
    await flush();
    // One merged card, its group cell naming both cohorts; the
    // per-day list fetch never runs in this perspective
    expect(view.getByText('Lesson a')).toBeTruthy();
    expect(view.queryByText('Lesson b')).toBeNull();
    expect(view.getByText(/ISKS-1, PDF-2/)).toBeTruthy();
    expect(mockFetchSchedule).not.toHaveBeenCalled();
  });
});
