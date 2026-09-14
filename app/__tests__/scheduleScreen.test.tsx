// -----------------------------------------------------------
//  [*] Tests — the schedule screen's state machine
//
//  The seams the wiring promises and no lower layer can pin:
//  ONE dated Monday–Sunday fetch per (week, scope) for BOTH
//  perspectives — the group as ?group=, the teacher as
//  ?teacher= with the exact display string — with the
//  chevrons crossing week boundaries, the semester picker
//  acting as a TIME JUMP (a past term's first Monday, the
//  current term back to today) while its default is the
//  CURRENT term — not the next term the backend publishes
//  early; the filter modal's untouched Apply preserving an
//  auto-default that landed under the open sheet, prefs
//  round-tripping without promoting a default to a choice,
//  the pick-a-group gate in front of the timetable views, the
//  teacher roster coming from the filters response, the
//  teacher day cards merging shared-id rows, and the
//  alternating-slot regression the dated wire exists for: a
//  lecture that lives on next week's date never paints a
//  phantom card into this week.
// -----------------------------------------------------------

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

const mockFetchEvents = jest.fn();
const mockFetchFilters = jest.fn();
jest.mock('@/services/api', () => ({
  fetchScheduleEvents: (...args: unknown[]) => mockFetchEvents(...(args as [])),
  fetchScheduleFilters: (...args: unknown[]) => mockFetchFilters(...(args as [])),
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
const tabPressListeners: (() => void)[] = [];
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      effect();
    }, [effect]);
  },
  // The tab-repress reset: tests fire the captured listeners to
  // simulate tapping the Schedule tab while already on it
  useNavigation: () => ({
    addListener: (_event: string, listener: () => void) => {
      tabPressListeners.push(listener);
      return () => {};
    },
    isFocused: () => true,
  }),
}));
jest.mock('expo-router/js-tabs', () => ({}));
jest.mock('expo-router/react-navigation', () => ({}));
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
  tabPressListeners.length = 0;
  cacheMock().get.mockReset().mockResolvedValue(null);
  cacheMock().set.mockReset().mockResolvedValue(undefined);
  mockFetchEvents.mockReset().mockResolvedValue({ events: [eventRow('a')] });
  // '2023-R' gives the time-jump a PAST term with a known
  // first Monday; nextTerm ranks newest and must not win the
  // default over currentTerm. The teacher roster rides the
  // same filters response — exact display strings, titles in
  mockFetchFilters.mockReset().mockResolvedValue({
    groups: ['ISKS-1', 'PDF-2'],
    semesters: ['2023-R', currentTerm, nextTerm],
    teachers: ['A. Petraitis', 'Eglė Gabrėnaitė, Doc., Dr.'],
  });
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

  it('"all groups" rows sharing one event id render side by side under distinct keys', async () => {
    // A lecture shared by two groups arrives once PER GROUP with
    // the SAME event id — the list must key on (event × group),
    // or React logs the duplicate-key error the logged-out
    // (filterless) schedule tab surfaced
    mockFetchEvents.mockResolvedValue({
      events: [eventRow('shared'), eventRow('shared', { group: 'PDF-2' })],
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const view = await render(<ScheduleScreen />);
      await flush();
      expect(view.getAllByText('Lesson shared')).toHaveLength(2);
      const complained = spy.mock.calls.some((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes('same key')));
      expect(complained).toBe(false);
    } finally {
      spy.mockRestore();
    }
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

  it('re-tapping the Schedule tab snaps back to today; a mere tab switch never does', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();

    // Wander a week away
    await fireEvent.press(view.getByLabelText('Previous day'));
    await flush();
    const wandered = lastEventsCall();
    expect(wandered).not.toEqual([...fetchWindow(monday), undefined]);

    // The news-feed gesture: tapping the tab while ON it
    await act(async () => {
      for (const listener of tabPressListeners) listener();
    });
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), undefined]);
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

describe('prefs round trip', () => {
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
  it('week mode without a group prompts for one', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    // The kit's ViewModeSwitch announces its own catalog (EN default env here)
    await fireEvent.press(view.getByLabelText('Week'));
    await flush();
    expect(view.getByText('empty:schedule.pickGroup')).toBeTruthy();
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

describe('teacher perspective on the dated wire', () => {
  it('a restored teacher rides as ?teacher= on the dated window — never the remembered group', async () => {
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({
        // The remembered group must NOT leak onto the teacher
        // scope's wire — exactly one scope param per fetch
        group: 'ISKS-1', semester: null, semesterExplicit: true,
        perspective: 'teacher', teacher: 'A. Petraitis',
      }),
    );
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(mockFetchEvents).toHaveBeenCalledWith(...fetchWindow(monday), undefined, 'A. Petraitis');
    expect(view.getByText('Lesson a')).toBeTruthy();
  });

  it('picking a teacher from the filters roster fetches their dated window', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    // The roster is the filters response's `teachers` — no
    // dataset fetch stands behind the picker any more
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByText('schedule.teacherLabel'));
    await fireEvent.press(view.getByLabelText('Eglė Gabrėnaitė, Doc., Dr.'));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), undefined, 'Eglė Gabrėnaitė, Doc., Dr.']);
  });

  it('merges shared-id rows of a cross-group lecture into one card listing every group, sorted', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [
        // The SAME physical lecture served to two groups — the
        // wire ships it once per group under ONE event id
        eventRow('a', { teacher: 'Eglė Gabrėnaitė, Doc., Dr.', group: 'ISKS-1' }),
        eventRow('a', { teacher: 'Eglė Gabrėnaitė, Doc., Dr.', group: 'FT-1' }),
      ],
    });
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({
        group: null, semester: currentTerm, semesterExplicit: true,
        viewMode: 'list', perspective: 'teacher', teacher: 'Eglė Gabrėnaitė, Doc., Dr.',
      }),
    );
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getAllByText('Lesson a')).toHaveLength(1);
    expect(view.getByText(/FT-1, ISKS-1/)).toBeTruthy();
  });

  it('an alternating slot shows ONE card this week — the next-week twin stays on its own date', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [
        eventRow('now', { title: 'Tinklai', timeStart: '13:45', timeEnd: '15:15' }),
        // The twin lives ONLY next week, same weekday and time.
        // The folded weekly pattern used to paint BOTH copies
        // into every week — six lectures instead of five
        eventRow('next', {
          title: 'Tinklai',
          timeStart: '13:45',
          timeEnd: '15:15',
          date: toISO(parseISO(monday) + (7 + todayIdx) * DAY_MS),
        }),
      ],
    });
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({
        group: null, semester: currentTerm, semesterExplicit: true,
        viewMode: 'list', perspective: 'teacher', teacher: 'A. Petraitis',
      }),
    );
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getAllByText('Tinklai')).toHaveLength(1);
  });
});
