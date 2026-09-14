// -----------------------------------------------------------
//  [*] Tests — the schedule screen's state machine
//
//  The seams the wiring promises and no lower layer can pin:
//  the group perspective's ONE dated Monday–Sunday fetch per
//  (week, group) with the chevrons crossing week boundaries,
//  the semester picker acting as a TIME JUMP (a past term's
//  first Monday, the current term back to today) while its
//  default is the CURRENT term — not the next term the
//  backend publishes early; on the teacher side the explicit
//  "all semesters" choice riding the folded wire as the
//  literal 'all' (an omitted param means NEWEST to the
//  backend), the filter modal's untouched Apply preserving an
//  auto-default that landed under the open sheet, prefs
//  round-tripping without promoting a default to a choice,
//  the pick-a-group gate in front of the timetable views, and
//  the teacher perspective's merged day cards.
// -----------------------------------------------------------

const mockFetchEvents = jest.fn();
const mockFetchFilters = jest.fn();
const mockFetchWeek = jest.fn();
jest.mock('@/services/api', () => ({
  fetchScheduleEvents: (...args: unknown[]) => mockFetchEvents(...(args as [])),
  fetchScheduleFilters: (...args: unknown[]) => mockFetchFilters(...(args as [])),
  fetchScheduleWeek: (...args: unknown[]) => mockFetchWeek(...(args as [])),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// The cache rides loadEvents' useCallback deps — a fresh
// object per render would refire the load effect every
// render and turn fetch-count assertions into noise
jest.mock('@knf/dataengine', () => {
  const cache = {
    set: jest.fn(async () => {}),
    get: jest.fn(async () => null),
    sweepPrefix: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  };
  // The offline tests steer get() per case; the object identity
  // stays stable so loader deps never churn
  (globalThis as Record<string, unknown>).__cacheMock = cache;
  return {
    useDataEngine: () => ({ cache }),
    useNetworkRestore: () => {},
  };
});
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));
jest.mock('@/components/CachedBanner', () => () => null);
// The format service pulls the whole i18n bootstrap — mocked
// like every screen test does; the fold keeps its real
// behavior so the teacher search cases stay meaningful
jest.mock('@/services/format', () => ({
  foldForSearch: (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
}));
// t is a loader dep like the cache — kept stable for the
// same fetch-count reason
jest.mock('react-i18next', () => {
  const t = (key: string, opts?: { count?: number }) => (opts && 'count' in opts ? `${key}:${opts.count}` : key);
  return {
    useTranslation: () => ({ t, i18n: { language: 'lt' } }),
  };
});
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

// The engine's date math stays REAL — the expected windows
// below are computed with the exact functions the screen uses
import { DAY_MS, mondayOf, parseISO, toISO } from '@knf/timetableengine';

import ScheduleScreen, { SCHEDULE_PREFS_KEY } from '@/app/(main)/tabs/schedule';
import type { ScheduleEventRow, ScheduleLesson } from '@/services/api';

// The suite runs on ANY real date, so today's coordinates are
// computed, not hard-coded: the screen opens on today's tab
// inside today's Monday–Sunday window
const todayIdx = (new Date().getDay() + 6) % 7;
const monday = mondayOf(toISO(Date.now()));
const sunday = toISO(parseISO(monday) + 6 * DAY_MS);

// The screen fetches THREE weeks around a week start — the
// pager's neighbour pages ride the same response
const fetchWindow = (weekStart: string) => [
  toISO(parseISO(weekStart) - 7 * DAY_MS),
  toISO(parseISO(weekStart) + 13 * DAY_MS),
];

// Today's 'YYYY-R/P' term label (the screen's own rule: label
// year = the academic year's first calendar year) and the
// NEXT term's label, which the engine ranks NEWER — the pair
// pins that the default follows today, not the ranking
const currentTerm = (() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 8) return `${year}-R`;
  if (month === 0) return `${year - 1}-R`;
  return `${year - 1}-P`;
})();
const nextTerm = currentTerm.endsWith('-R')
  ? currentTerm.replace('-R', '-P')
  : `${Number(currentTerm.slice(0, 4)) + 1}-R`;

const row = (id: string, over: Partial<ScheduleLesson> = {}): ScheduleLesson => ({
  id,
  title: `Lesson ${id}`,
  teacher: 'A. Petraitis',
  room: '112',
  timeStart: '09:00',
  timeEnd: '10:30',
  // The screen opens on TODAY's tab — pin the rows to it
  dayOfWeek: todayIdx,
  group: 'ISKS-1',
  semester: currentTerm,
  ...over,
});

// A dated event: the folded row landed on today's real date
const eventRow = (id: string, over: Partial<ScheduleEventRow> = {}): ScheduleEventRow => ({
  ...row(id),
  date: toISO(parseISO(monday) + todayIdx * DAY_MS),
  lectureType: '',
  ...over,
});

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

const cacheMock = () =>
  (globalThis as Record<string, unknown>).__cacheMock as { get: jest.Mock; set: jest.Mock };

beforeEach(async () => {
  cacheMock().get.mockReset().mockResolvedValue(null);
  cacheMock().set.mockReset().mockResolvedValue(undefined);
  mockFetchEvents.mockReset().mockResolvedValue({ events: [eventRow('a')] });
  // '2023-R' gives the time-jump a PAST term with a known
  // first Monday; nextTerm ranks newest and must not win the
  // default over currentTerm
  mockFetchFilters.mockReset().mockResolvedValue({ groups: ['ISKS-1', 'PDF-2'], semesters: ['2023-R', currentTerm, nextTerm] });
  mockFetchWeek.mockReset().mockResolvedValue({ lessons: [row('a'), row('b', { group: 'PDF-2' })] });
  await AsyncStorage.clear();
});

const lastPrefs = () => {
  const mock = AsyncStorage.setItem as unknown as jest.Mock;
  const writes = mock.mock.calls.filter((call) => call[0] === SCHEDULE_PREFS_KEY);
  return writes.length ? (JSON.parse(writes[writes.length - 1][1] as string) as Record<string, unknown>) : null;
};

const lastEventsCall = () => mockFetchEvents.mock.calls[mockFetchEvents.mock.calls.length - 1];

describe('the dated group window', () => {
  it("fetches today's Monday–Sunday window once and renders its rows", async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(mockFetchEvents).toHaveBeenCalledWith(...fetchWindow(monday), undefined);
    expect(view.getByText('Lesson a')).toBeTruthy();
    // The folded semester dataset belongs to the teacher
    // perspective alone now
    expect(mockFetchWeek).not.toHaveBeenCalled();
  });

  it('stepping back past Monday crosses into the previous week and refetches', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    // Walk from today to Monday, then one more across the
    // boundary — only the boundary press may move the window
    for (let i = 0; i <= todayIdx; i++) {
      // Provider-less kit chrome speaks the EN default catalog
      await fireEvent.press(view.getByLabelText('Previous day'));
      await flush();
    }
    expect(mockFetchEvents).toHaveBeenCalledTimes(2);
    expect(lastEventsCall()).toEqual([
      ...fetchWindow(toISO(parseISO(monday) - 7 * DAY_MS)),
      undefined,
    ]);
  });

  it('a dead wire serves the offline cache instead of an error', async () => {
    // ONE render per test — a second mount in the same test
    // wedges RNTL's pressability plumbing for the whole file
    mockFetchEvents.mockRejectedValue(new Error('offline'));
    cacheMock().get.mockResolvedValue({ data: { events: [eventRow('c')] }, cachedAt: 123 });

    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('Lesson c')).toBeTruthy();
    expect(view.queryByText('error:schedule.loadError')).toBeNull();
  });

  it('a dead wire with an empty cache admits the error state', async () => {
    mockFetchEvents.mockRejectedValue(new Error('offline'));

    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('error:schedule.loadError')).toBeTruthy();
  });

  it('a hop onto an already-rendered neighbour week refreshes silently — no spinner over a drawn grid', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    // The neighbour-week refetch never resolves: the drawn rows
    // must stay on screen the whole time, spinnerless
    mockFetchEvents.mockImplementationOnce(() => new Promise(() => {}));
    for (let i = 0; i <= todayIdx; i++) {
      await fireEvent.press(view.getByLabelText('Previous day'));
      await flush();
    }
    expect(view.queryByText('loading')).toBeNull();
  });

  it('the Today pill appears only while displaced and snaps both cursors back', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    // On today's week and day the button must NOT exist — its
    // presence is the displacement cue; it renders app-side on
    // the day-tab row, so the mock t answers with the raw key
    expect(view.queryByText('schedule.today')).toBeNull();

    await fireEvent.press(view.getByLabelText('Previous day'));
    await flush();
    await fireEvent.press(view.getByText('schedule.today'));
    await flush();

    // Back on today's window (day steps inside the week fetch
    // nothing new — the LAST fetch is today's week either way)
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), undefined]);
    expect(view.queryByText('schedule.today')).toBeNull();
  });
});

describe('the semester time-jump', () => {
  it("a past term jumps the window to its first Monday; re-picking the current term jumps back to today's week", async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText('2023-R'));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    // September 1st 2023 was a Friday — the first Monday is the 4th
    expect(lastEventsCall()).toEqual(['2023-08-28', '2023-09-17', undefined]);

    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText(currentTerm));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), undefined]);
  });

  it('with no stored choice the CURRENT term is defaulted, never the newest early-published label', async () => {
    await render(<ScheduleScreen />);
    await flush();
    expect(lastPrefs()?.semester).toBe(currentTerm);
    expect(lastPrefs()?.semesterExplicit).toBe(false);
  });
});

describe('teacher semester wire contract', () => {
  it("a restored explicit 'all semesters' rides the folded wire as the literal 'all'", async () => {
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({ group: null, semester: null, semesterExplicit: true, perspective: 'teacher', teacher: 'A. Petraitis' }),
    );
    await render(<ScheduleScreen />);
    await flush();
    expect(mockFetchWeek).toHaveBeenCalledWith('all');
    // The dated fetch is the group perspective's alone
    expect(mockFetchEvents).not.toHaveBeenCalled();
  });

  it('a restored auto-default stays a default in the next persisted blob', async () => {
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({ group: null, semester: currentTerm, semesterExplicit: false }),
    );
    await render(<ScheduleScreen />);
    await flush();
    expect(lastPrefs()?.semester).toBe(currentTerm);
    expect(lastPrefs()?.semesterExplicit).toBe(false);
  });
});

describe('filter modal semantics', () => {
  it('an untouched Apply keeps the auto-default that landed while the sheet was open', async () => {
    const view = await render(<ScheduleScreen />);
    await flush(); // filters land → the current term auto-defaults
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText('PDF-2')); // a group, not a semester
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), 'PDF-2']);
    expect(lastPrefs()?.semester).toBe(currentTerm);
    expect(lastPrefs()?.semesterExplicit).toBe(false);
  });

  it("deliberately tapping 'all semesters' records the choice and stays on today's week", async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText('schedule.allSemesters'));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    expect(lastPrefs()?.semester).toBeNull();
    expect(lastPrefs()?.semesterExplicit).toBe(true);
    expect(lastEventsCall()[0]).toBe(fetchWindow(monday)[0]);
  });
});

describe('timetable view gating', () => {
  it('week mode without a group prompts for one and fetches NO folded dataset', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    // The kit's ViewModeSwitch announces its own catalog (EN default env here)
    await fireEvent.press(view.getByLabelText('Week'));
    await flush();
    expect(view.getByText('empty:schedule.pickGroup')).toBeTruthy();
    expect(mockFetchWeek).not.toHaveBeenCalled();
  });

  it('week mode with a group feeds the dated rows through the grid seam', async () => {
    mockFetchEvents.mockResolvedValue({ events: [eventRow('a'), eventRow('b', { group: 'PDF-2' })] });
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({ group: 'ISKS-1', semester: currentTerm, semesterExplicit: true, viewMode: 'week' }),
    );
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(mockFetchEvents).toHaveBeenCalledWith(...fetchWindow(monday), 'ISKS-1');
    // Only ISKS-1's event survives the group perspective
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
        group: null, semester: currentTerm, semesterExplicit: true,
        viewMode: 'list', perspective: 'teacher', teacher: 'Eglė Gabrėnaitė',
      }),
    );
    const view = await render(<ScheduleScreen />);
    await flush();
    // One merged card, its group cell naming both cohorts; the
    // dated group fetch never runs in this perspective
    expect(view.getByText('Lesson a')).toBeTruthy();
    expect(view.queryByText('Lesson b')).toBeNull();
    expect(view.getByText(/ISKS-1, PDF-2/)).toBeTruthy();
    expect(mockFetchEvents).not.toHaveBeenCalled();
  });
});
