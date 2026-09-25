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
//  phantom card into this week. Plus the clock seams: "today"
//  is the LOCAL date (east of UTC, Monday's first hours must
//  not open LAST week), the term the sheet checks follows the
//  backend's month rule in January and August too, and an
//  empty week outside the published range is told apart from
//  an empty day inside it. And the 2026-09 sweep: the Today
//  button that appears only away from today (KNF-175), the
//  weekend pills the week's rows earn (KNF-174), the semester
//  as navigation that never counts as a filter (KNF-173), the
//  jump onto a term's first REAL week (KNF-037), the exam
//  badge and the subgroup on a card (KNF-078), the one clock
//  (KNF-184), and a card press opening the detail sheet. And
//  the calendar subscription: the filter row's calendar
//  button exists only for an applied group or teacher and
//  opens the sheet with exactly that scope.
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
const mockUpdateProfile = jest.fn();
jest.mock('@/services/api', () => ({
  fetchScheduleEvents: (...args: unknown[]) => mockFetchEvents(...(args as [])),
  fetchScheduleFilters: (...args: unknown[]) => mockFetchFilters(...(args as [])),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...(args as [])),
}));
// The session: a guest by default; the profile-group cases
// sign a student in and steer their studyGroup
type MockUser = { id: string; username: string; studyGroup?: string | null; invited?: boolean };
const mockAuth: { user: MockUser | null; hydrated: boolean; setUser: jest.Mock } = {
  user: null,
  hydrated: true,
  setUser: jest.fn(),
};
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
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
const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockShowToast(...(args as [])) }));
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
  // The count or the term year rides the key, so a term row's
  // label ("schedule.termAutumn:2026") names its term
  const t = (key: string, opts?: { count?: number; year?: number }) =>
    opts && 'count' in opts ? `${key}:${opts.count}` : opts && 'year' in opts ? `${key}:${opts.year}` : key;
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
    EmptyState: ({ title, hint, action }: { title: string; hint?: string; action?: { label: string; onPress: () => void } }) => (
      <View>
        <Text>{`empty:${title}`}</Text>
        {hint ? <Text>{`hint:${hint}`}</Text> : null}
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button">
            <Text>{`action:${action.label}`}</Text>
          </Pressable>
        ) : null}
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
// The sheet names what it was opened WITH — a card press must
// hand it the adapter's entry (kind and subgroups included)
jest.mock('@/components/schedule/LessonSheet', () => {
  const { Text } = require('react-native');
  function SheetMarker({ lesson }: { lesson: { title: string; kind?: string; subgroupKeys?: string[] } | null }) {
    return lesson ? <Text>{`sheet:${lesson.title}:${lesson.kind ?? ''}:${(lesson.subgroupKeys ?? []).join(',')}`}</Text> : null;
  }
  return SheetMarker;
});
// The subscription sheet has its own suite — the marker names
// the scope the calendar button opened it with
jest.mock('@/components/schedule/CalendarSubscribeSheet', () => {
  const { Text } = require('react-native');
  function SubscribeMarker({ scope }: { scope: { group?: string; teacher?: string } | null }) {
    return scope ? <Text>{`subscribe:${scope.group ? `group=${scope.group}` : `teacher=${scope.teacher}`}`}</Text> : null;
  }
  return SubscribeMarker;
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';

// The engine's date math stays REAL — the expected windows
// below are computed with the exact functions the screen uses
import { DAY_MS, mondayOf, parseISO, termKeyOf, toISO } from '@knf/timetableengine';

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

// Today's 'YYYY-R/P' term label — the BACKEND's rule (month
// >= 8 → {y}-R, else {y-1}-P, January counted 1), which the
// screen mirrors — and the NEXT term's label, which the engine
// ranks NEWER — the pair pins that the default follows today,
// not the ranking
const termKeyFor = (now: Date) => {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 8 ? `${year}-R` : `${year - 1}-P`;
};
const currentTerm = termKeyFor(new Date());
const nextTerm = currentTerm.endsWith('-R')
  ? currentTerm.replace('-R', '-P')
  : `${Number(currentTerm.slice(0, 4)) + 1}-R`;

// A term row's accessible name under the mocked t: the human
// name's key with its CALENDAR year ('2026-P' is spring 2027)
const termLabel = (label: string) =>
  label.endsWith('-R') ? `schedule.termAutumn:${label.slice(0, 4)}` : `schedule.termSpring:${Number(label.slice(0, 4)) + 1}`;

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

// Only the clock is faked — timers stay real so RNTL's
// pressability and the async flushes keep working
const freezeClock = (now: number) =>
  jest.useFakeTimers({
    now,
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout',
    ],
  });

// The jest sandbox hands every test file a COPY of process.env,
// so a plain `process.env.TZ = …` never reaches V8's clock. The
// real process, reached through the main context, does — Node
// re-reads TZ on every assignment — and it is restored after
const realProcess = (): NodeJS.Process => (require('vm') as typeof import('vm')).runInThisContext('process') as NodeJS.Process;
async function withTimeZone(tz: string, run: () => Promise<void>): Promise<void> {
  const real = realProcess();
  const before = real.env.TZ;
  real.env.TZ = tz;
  try {
    await run();
  } finally {
    if (before === undefined) delete real.env.TZ;
    else real.env.TZ = before;
  }
}

const cacheMock = () =>
  (globalThis as Record<string, unknown>).__cacheMock as { get: jest.Mock; set: jest.Mock };

beforeEach(async () => {
  tabPressListeners.length = 0;
  mockAuth.user = null;
  mockAuth.hydrated = true;
  mockAuth.setUser.mockReset();
  mockUpdateProfile.mockReset();
  mockShowToast.mockReset();
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

    // Wander a week away — press past Monday whatever today
    // is (a single press only crosses the boundary on Mondays)
    for (let i = 0; i <= todayIdx; i++) {
      await fireEvent.press(view.getByLabelText('Previous day'));
      await flush();
    }
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
    await fireEvent.press(view.getByLabelText(termLabel('2023-R')));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    // No server dates in this response: the nominal Monday —
    // September 1st 2023 was a Friday, the first Monday the 4th
    expect(lastEventsCall()).toEqual(['2023-08-28', '2023-09-17', undefined]);

    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText(termLabel(currentTerm)));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), undefined]);
  });

  it("a term the server dates lands on the week of its first REAL event, on that event's day (KNF-037)", async () => {
    // The nominal Monday misses both real openings: the 2026
    // autumn began on Tuesday 1 September, the 2026 spring label
    // holds only a January exam session
    const from = nextTerm.endsWith('-R') ? `${nextTerm.slice(0, 4)}-09-01` : `${Number(nextTerm.slice(0, 4)) + 1}-01-05`;
    const to = toISO(parseISO(from) + 11 * DAY_MS);
    mockFetchFilters.mockResolvedValue({
      groups: ['ISKS-1'],
      semesters: [nextTerm, currentTerm],
      terms: [{ semester: nextTerm, from, to }],
      teachers: [],
    });
    const view = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    // The row names the dates it jumps into
    await fireEvent.press(view.getByLabelText(`${termLabel(nextTerm)}, ${from} – ${to}`));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(mondayOf(from)), undefined]);
    // The day cursor sits on the first event's own weekday
    expect(view.getByText(from.slice(5))).toBeTruthy();
  });

  it("the sheet checks the term of the week on screen — today's, never the newest early-published label", async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    expect(view.getByLabelText(termLabel(currentTerm)).props.accessibilityState).toEqual({ checked: true });
    expect(view.getByLabelText(termLabel(nextTerm)).props.accessibilityState).toEqual({ checked: false });
    // Navigation, not a filter: nothing about it is persisted
    expect(lastPrefs()).not.toHaveProperty('semester');
    expect(lastPrefs()).not.toHaveProperty('semesterExplicit');
  });
});

describe('prefs round trip', () => {
  it("an older build's semester fields are read past and never written back", async () => {
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({ group: 'ISKS-1', semester: '2023-R', semesterExplicit: true }),
    );
    await render(<ScheduleScreen />);
    await flush();
    // The stored semester moves nothing — today's week loads
    expect(mockFetchEvents).toHaveBeenCalledWith(...fetchWindow(monday), 'ISKS-1');
    // An older build's stored group was the student's own pick
    expect(lastPrefs()).toEqual({ group: 'ISKS-1', groupExplicit: true, viewMode: 'list', perspective: 'group', teacher: null });
  });
});

describe('filter modal semantics', () => {
  it("an untouched term section never moves the week — a group pick fetches today's window", async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText('PDF-2')); // a group, not a term
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), 'PDF-2']);
  });

  it('re-picking the term already on screen is no jump — the chosen day stays', async () => {
    // The row for the week on screen, whatever today is
    mockFetchFilters.mockResolvedValue({ groups: ['ISKS-1'], semesters: [termKeyOf(monday)], teachers: [] });
    const view = await render(<ScheduleScreen />);
    await flush();
    // Move the DAY, not the week, away from today
    const otherIdx = todayIdx === 0 ? 1 : 0;
    await fireEvent.press(view.getByLabelText(otherIdx === 0 ? 'Monday' : 'Tuesday'));
    await flush();
    const otherDate = toISO(parseISO(monday) + otherIdx * DAY_MS).slice(5);
    expect(view.getByText(otherDate)).toBeTruthy();

    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText(termLabel(termKeyOf(monday))));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
    expect(view.getByText(otherDate)).toBeTruthy();
  });
});

describe('timetable view gating', () => {
  it('week mode without a group prompts for one — and the prompt opens the picker', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    // The kit's ViewModeSwitch announces its own catalog (EN default env here)
    await fireEvent.press(view.getByLabelText('Week'));
    await flush();
    expect(view.getByText('empty:schedule.pickGroup')).toBeTruthy();
    expect(view.queryByText('schedule.jumpToSemester')).toBeNull();
    await fireEvent.press(view.getByText('action:schedule.chooseGroupAction'));
    expect(view.getByText('schedule.jumpToSemester')).toBeTruthy();
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


describe('today is the LOCAL date', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("east of UTC, Monday's first hours open THIS week's Monday — not last week's via the UTC date", async () => {
    // Sunday 2026-09-20 21:30 UTC is Monday 2026-09-21 00:30 in
    // Vilnius: the UTC date put the screen on the week of the
    // 14th, marked "today"
    await withTimeZone('Europe/Vilnius', async () => {
      freezeClock(Date.UTC(2026, 8, 20, 21, 30));
      mockFetchEvents.mockResolvedValue({ events: [] });
      const view = await render(<ScheduleScreen />);
      await flush();
      expect(lastEventsCall()).toEqual([...fetchWindow('2026-09-21'), undefined]);
      // The stepper dates the selected day (MM-DD, compact for
      // the 320 pt header): Monday the 21st
      expect(view.getByText('09-21')).toBeTruthy();
      expect(view.queryByText('09-14')).toBeNull();
    });
  });
});


describe('the term on screen mirrors the backend', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('January belongs to the SPRING of the previous label year, as the scraper stamps it', async () => {
    freezeClock(Date.UTC(2027, 0, 12, 12));
    mockFetchFilters.mockResolvedValue({ groups: ['ISKS-1'], semesters: ['2027-R', '2026-P', '2026-R'], teachers: [] });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(termKeyFor(new Date())).toBe('2026-P');
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    expect(view.getByLabelText(termLabel('2026-P')).props.accessibilityState).toEqual({ checked: true });
    expect(view.getByLabelText(termLabel('2026-R')).props.accessibilityState).toEqual({ checked: false });
  });

  it('August already belongs to the AUTUMN label of its own year', async () => {
    freezeClock(Date.UTC(2026, 7, 20, 12));
    mockFetchFilters.mockResolvedValue({ groups: ['ISKS-1'], semesters: ['2026-P', '2026-R', '2025-P'], teachers: [] });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(termKeyFor(new Date())).toBe('2026-R');
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    expect(view.getByLabelText(termLabel('2026-R')).props.accessibilityState).toEqual({ checked: true });
  });
});


describe('an empty week outside the published range', () => {
  // The screen's own caption for the visible week
  const weekRange = monday.slice(0, 4) === sunday.slice(0, 4) ? `${monday.slice(5)} – ${sunday.slice(5)}` : `${monday} – ${sunday}`;
  const nextWeek = (id: string) => eventRow(id, { date: toISO(parseISO(monday) + 7 * DAY_MS) });
  const prevWeek = (id: string) => eventRow(id, { date: toISO(parseISO(monday) - 7 * DAY_MS) });

  it('a week before the first published lecture names its dates instead of asserting an empty day', async () => {
    mockFetchEvents.mockResolvedValue({ events: [nextWeek('n')] });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('empty:schedule.weekNotPublished')).toBeTruthy();
    expect(view.getByText(`hint:${weekRange}`)).toBeTruthy();
  });

  it('a window with nothing published anywhere reads the same way', async () => {
    mockFetchEvents.mockResolvedValue({ events: [] });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('empty:schedule.weekNotPublished')).toBeTruthy();
    expect(view.getByText(`hint:${weekRange}`)).toBeTruthy();
  });

  it('a break — lectures on both sides of the week — keeps the plain "no lectures" copy', async () => {
    mockFetchEvents.mockResolvedValue({ events: [prevWeek('p'), nextWeek('n')] });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('empty:schedule.noLectures')).toBeTruthy();
    expect(view.queryByText(`hint:${weekRange}`)).toBeNull();
    // No filter narrowed the day, so no hint blames one — the
    // semester never was one (KNF-173)
    expect(view.queryByText(/^hint:/)).toBeNull();
  });

  it("with the server's dated terms, an empty week INSIDE them is plain 'no lectures' however empty the window", async () => {
    // A group-less stretch (a practice period, a group that only
    // runs in autumn) inside the published timetable
    mockFetchEvents.mockResolvedValue({ events: [] });
    mockFetchFilters.mockResolvedValue({
      groups: ['ISKS-1'],
      semesters: [currentTerm],
      terms: [{ semester: currentTerm, from: toISO(parseISO(monday) - 30 * DAY_MS), to: toISO(parseISO(monday) + 30 * DAY_MS) }],
      teachers: [],
    });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('empty:schedule.noLectures')).toBeTruthy();
  });

  it("…and a week past the last published date reads 'not published' however full the window", async () => {
    mockFetchEvents.mockResolvedValue({ events: [prevWeek('p')] });
    mockFetchFilters.mockResolvedValue({
      groups: ['ISKS-1'],
      semesters: [currentTerm],
      terms: [{ semester: currentTerm, from: toISO(parseISO(monday) - 60 * DAY_MS), to: toISO(parseISO(monday) - 1 * DAY_MS) }],
      teachers: [],
    });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('empty:schedule.weekNotPublished')).toBeTruthy();
  });
});


describe('the Today button (KNF-175)', () => {
  it('shows only away from today, and snaps the week AND the day home', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    // On today: nothing to go back to
    expect(view.queryByLabelText('Today')).toBeNull();

    // Wander into last week — past Monday whatever today is
    for (let i = 0; i <= todayIdx; i++) {
      await fireEvent.press(view.getByLabelText('Previous day'));
      await flush();
    }
    expect(lastEventsCall()).not.toEqual([...fetchWindow(monday), undefined]);

    await fireEvent.press(view.getByLabelText('Today'));
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), undefined]);
    const todayDate = toISO(parseISO(monday) + todayIdx * DAY_MS).slice(5);
    expect(view.getByText(todayDate)).toBeTruthy();
    expect(view.queryByLabelText('Today')).toBeNull();
  });

  it('in week mode it follows the WEEK — another week shows it, this week does not', async () => {
    await AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify({ group: 'ISKS-1', viewMode: 'week' }));
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.queryByLabelText('Today')).toBeNull();
    await fireEvent.press(view.getByLabelText('schedule.nextWeek'));
    await flush();
    expect(view.getByLabelText('Today')).toBeTruthy();
  });
});


describe('the weekend pills follow the week (KNF-174)', () => {
  it("a week with Saturday lectures offers its Saturday pill from any weekday", async () => {
    mockFetchEvents.mockResolvedValue({
      events: [eventRow('a'), eventRow('sat', { dayOfWeek: 5, date: toISO(parseISO(monday) + 5 * DAY_MS) })],
    });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByLabelText(todayIdx === 5 ? 'Saturday, Today' : 'Saturday')).toBeTruthy();
  });

  it('a week without weekend rows keeps Monday–Friday (plus the selected day)', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    if (todayIdx !== 5) expect(view.queryByLabelText('Saturday')).toBeNull();
    if (todayIdx !== 6) expect(view.queryByLabelText('Sunday')).toBeNull();
    expect(view.getByLabelText(todayIdx === 0 ? 'Monday, Today' : 'Monday')).toBeTruthy();
  });
});


describe('only a real filter narrows — and only it can be subscribed to (KNF-173)', () => {
  it('no group: no hint on an empty day and no calendar button', async () => {
    // Lectures the week before and after: today is an empty day
    // INSIDE the published range
    mockFetchEvents.mockResolvedValue({ events: [eventRow('n', { date: toISO(parseISO(monday) + 7 * DAY_MS) }), eventRow('p', { date: toISO(parseISO(monday) - 7 * DAY_MS) })] });
    const bare = await render(<ScheduleScreen />);
    await flush();
    expect(bare.getByText('empty:schedule.noLectures')).toBeTruthy();
    expect(bare.queryByText(/^hint:/)).toBeNull();
    expect(bare.queryByLabelText('schedule.subscribeAction')).toBeNull();
    // The old "1" count pill is gone for good
    expect(bare.queryByText('1')).toBeNull();
  });

  it('a stored group alone explains an empty day, and earns the calendar button', async () => {
    mockFetchEvents.mockResolvedValue({ events: [eventRow('n', { date: toISO(parseISO(monday) + 7 * DAY_MS) }), eventRow('p', { date: toISO(parseISO(monday) - 7 * DAY_MS) })] });
    await AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify({ group: 'ISKS-1' }));
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('hint:ISKS-1')).toBeTruthy();
    expect(view.getByLabelText('schedule.subscribeAction')).toBeTruthy();
    expect(view.queryByText('1')).toBeNull();
  });
});


describe('subscribe in calendar', () => {
  it("the calendar button opens the sheet with the applied group — a guest's too", async () => {
    await AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify({ group: 'ISKS-1' }));
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(mockAuth.user).toBeNull();
    expect(view.queryByText(/^subscribe:/)).toBeNull();

    const button = view.getByLabelText('schedule.subscribeAction');
    expect(button.props.accessibilityRole).toBe('button');
    // A 40 pt glyph box on the row's 44 pt, the slop making up
    // the width — plain numbers, NativeWind's rem is 14 px
    const style = Object.assign({}, ...[button.props.style].flat(Infinity).filter(Boolean) as object[]) as { width?: number; height?: number };
    expect(style).toMatchObject({ width: 40, height: 44 });
    expect(button.props.hitSlop).toEqual({ left: 2, right: 2 });

    await fireEvent.press(button);
    expect(view.getByText('subscribe:group=ISKS-1')).toBeTruthy();
  });

  it("a teacher's timetable subscribes by the teacher — never the remembered group", async () => {
    await AsyncStorage.setItem(
      SCHEDULE_PREFS_KEY,
      JSON.stringify({ group: 'ISKS-1', viewMode: 'list', perspective: 'teacher', teacher: 'Eglė Gabrėnaitė, Doc., Dr.' }),
    );
    const view = await render(<ScheduleScreen />);
    await flush();

    await fireEvent.press(view.getByLabelText('schedule.subscribeAction'));
    expect(view.getByText('subscribe:teacher=Eglė Gabrėnaitė, Doc., Dr.')).toBeTruthy();
  });

  it('the teacher perspective with no teacher picked has nothing to subscribe to', async () => {
    await AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify({ group: 'ISKS-1', perspective: 'teacher', teacher: null }));
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('schedule.pickTeacher')).toBeTruthy();
    expect(view.queryByLabelText('schedule.subscribeAction')).toBeNull();
  });
});


describe('cards: kinds, subgroups, the one clock, and the sheet', () => {
  it('an exam wears its badge; a split practical names its subgroup (KNF-078)', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [
        eventRow('exam', { title: 'Akademinis raštingumas', lectureType: 'Egzaminas' }),
        eventRow('prac', { title: 'Programavimas', lectureType: 'Pratybos', subgroups: ['1'], timeStart: '11:00', timeEnd: '12:30' }),
      ],
    });
    const view = await render(<ScheduleScreen />);
    await flush();
    // Provider-less kit chrome here: the EN catalog
    expect(view.getByText('Exam')).toBeTruthy();
    // The everyday kind names itself quietly, then the group
    // and the subgroup
    expect(view.getByText('Practical · ISKS-1 · Subgroup 1')).toBeTruthy();
    // The semester no longer rides every card
    expect(view.queryByText(`ISKS-1 · ${currentTerm}`)).toBeNull();
  });

  it('a press opens the detail sheet with the adapter entry — kind and subgroups included', async () => {
    mockFetchEvents.mockResolvedValue({
      events: [eventRow('exam', { title: 'Akademinis raštingumas', lectureType: 'Egzaminas', subgroups: ['2'] })],
    });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.queryByText(/^sheet:/)).toBeNull();
    await fireEvent.press(view.getByText('Akademinis raštingumas'));
    expect(view.getByText('sheet:Akademinis raštingumas:exam:2')).toBeTruthy();
  });

  it('the whole card is one screen-reader button with a composed sentence', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    const card = view.getByLabelText('Lesson a, 09:00 – 10:30, 112, A. Petraitis, ISKS-1');
    expect(card.props.accessibilityRole).toBe('button');
  });

  it('an unpadded wire time prints through the one clock — "09:00", like the grid (KNF-184)', async () => {
    mockFetchEvents.mockResolvedValue({ events: [eventRow('a', { timeStart: '9:00', timeEnd: '10:30' })] });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.getByText('09:00 – 10:30')).toBeTruthy();
  });

  it('two subgroups in one slot are no clash; a shared slot of the whole group is', async () => {
    await AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify({ group: 'ISKS-1' }));
    mockFetchEvents.mockResolvedValue({
      events: [
        eventRow('s1', { title: 'Akademinis raštingumas', subgroups: ['1'], timeStart: '09:45', timeEnd: '11:15' }),
        eventRow('s2', { title: 'Reikalavimų analizė', subgroups: ['2'], timeStart: '09:45', timeEnd: '11:15' }),
      ],
    });
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(view.queryByText('Overlap')).toBeNull();
  });
});


describe("the student's own group", () => {
  it('a signed-in student with a profile group and no choice of their own lands on it — first fetch included', async () => {
    // Free text in the profile: case, spaces and hyphens fold
    mockAuth.user = { id: 'u1', username: 'studentas', studyGroup: 'isks 1' };
    await render(<ScheduleScreen />);
    await flush();
    // No "all groups" flash: the very first fetch is the group's
    expect(mockFetchEvents.mock.calls[0]).toEqual([...fetchWindow(monday), 'ISKS-1']);
    expect(lastPrefs()?.group).toBe('ISKS-1');
    expect(lastPrefs()?.groupExplicit).toBe(false);
  });

  it('a group (or "all groups") picked in the sheet is never overridden by the profile', async () => {
    mockAuth.user = { id: 'u1', username: 'studentas', studyGroup: 'ISKS-1' };
    await AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify({ group: null, groupExplicit: true }));
    await render(<ScheduleScreen />);
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), undefined]);
  });

  it("a profile group the timetable does not list — or a filters failure — leaves every group, and still loads", async () => {
    mockAuth.user = { id: 'u1', username: 'studentas', studyGroup: 'XYZ-9' };
    await render(<ScheduleScreen />);
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), undefined]);
  });

  it('a failed group list ends the wait instead of blocking the timetable', async () => {
    mockAuth.user = { id: 'u1', username: 'studentas', studyGroup: 'ISKS-1' };
    mockFetchFilters.mockRejectedValue(new Error('offline'));
    await render(<ScheduleScreen />);
    await flush();
    expect(mockFetchEvents).toHaveBeenCalledWith(...fetchWindow(monday), undefined);
  });

  it('a different account on the phone is a fresh visit — the old pick does not follow', async () => {
    mockAuth.user = { id: 'u1', username: 'pirmas', studyGroup: null };
    await AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify({ group: 'PDF-2', groupExplicit: true }));
    const view = await render(<ScheduleScreen />);
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), 'PDF-2']);

    mockAuth.user = { id: 'u2', username: 'antras', studyGroup: 'ISKS-1' };
    await view.rerender(<ScheduleScreen />);
    await flush();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), 'ISKS-1']);
  });
});


describe('"save as my group" (the schedule sets the profile group)', () => {
  const pick = async (view: Awaited<ReturnType<typeof render>>, group: string, tick: boolean) => {
    await fireEvent.press(view.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(view.getByLabelText(group));
    if (tick) await fireEvent.press(view.getByLabelText('schedule.saveAsMyGroup'));
    await fireEvent.press(view.getByText('schedule.applyFilters'));
    await flush();
  };

  it('ticking it saves the pick to the profile and MERGES the answer into the session', async () => {
    mockAuth.user = { id: 'u1', username: 'studentas', studyGroup: null, invited: true };
    mockUpdateProfile.mockResolvedValue({ id: 'u1', username: 'studentas', studyGroup: 'PDF-2' });
    const view = await render(<ScheduleScreen />);
    await flush();
    await pick(view, 'PDF-2', true);
    expect(mockUpdateProfile).toHaveBeenCalledWith({ study_group: 'PDF-2' });
    // Merged, not replaced: the flag the PUT omits survives
    expect(mockAuth.setUser).toHaveBeenCalledWith({ id: 'u1', username: 'studentas', studyGroup: 'PDF-2', invited: true });
    expect(mockShowToast).toHaveBeenCalledWith('success', 'schedule.myGroupSaved');
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), 'PDF-2']);
  });

  it('left unticked, the pick stays a local filter — nothing is written', async () => {
    mockAuth.user = { id: 'u1', username: 'studentas', studyGroup: null };
    const view = await render(<ScheduleScreen />);
    await flush();
    await pick(view, 'PDF-2', false);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(lastEventsCall()).toEqual([...fetchWindow(monday), 'PDF-2']);
  });

  it('a failed save toasts and changes nothing in the session', async () => {
    mockAuth.user = { id: 'u1', username: 'studentas', studyGroup: null };
    mockUpdateProfile.mockRejectedValue(new Error('offline'));
    const view = await render(<ScheduleScreen />);
    await flush();
    await pick(view, 'PDF-2', true);
    expect(mockAuth.setUser).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('error', 'schedule.myGroupSaveError');
  });

  it('no offer for a guest — the pick stays local', async () => {
    const guest = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(guest.getByLabelText('schedule.filterTitle'));
    await fireEvent.press(guest.getByLabelText('PDF-2'));
    expect(guest.queryByLabelText('schedule.saveAsMyGroup')).toBeNull();
  });

  it('no offer for the group the profile already names — only for another one', async () => {
    mockAuth.user = { id: 'u1', username: 'studentas', studyGroup: 'ISKS-1' };
    const own = await render(<ScheduleScreen />);
    await flush();
    await fireEvent.press(own.getByLabelText('schedule.filterTitle'));
    // The profile's own group is drafted already — nothing to offer
    expect(own.queryByLabelText('schedule.saveAsMyGroup')).toBeNull();
    await fireEvent.press(own.getByLabelText('PDF-2'));
    expect(own.getByLabelText('schedule.saveAsMyGroup')).toBeTruthy();
  });
});


describe('the schedule catalog has no dead twins (KNF-185)', () => {
  // The timetable CHROME's copy lives in the kit's labels; the
  // app catalogs keep only what the screen itself says. A key
  // no source names is a twin a translator would edit in vain
  // — 21 such schedule keys once sat here while the kit drew
  // its own strings. Plural suffixes fold to their base key
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const root = path.resolve(__dirname, '..');
  const catalog = (lang: string) =>
    (JSON.parse(fs.readFileSync(path.join(root, 'i18n', `${lang}.json`), 'utf8')) as { schedule: Record<string, string> }).schedule;
  const sources = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === '__tests__' ? [] : sources(rel);
      return /\.(ts|tsx)$/.test(entry.name) ? [fs.readFileSync(path.join(root, rel), 'utf8')] : [];
    });

  it('every schedule.* key is named by a source file, and both languages carry the same keys', () => {
    const text = ['app', 'components', 'hooks', 'services'].flatMap(sources).join('\n');
    const base = (key: string) => key.replace(/_(one|few|many|other|zero)$/, '');
    const lt = [...new Set(Object.keys(catalog('lt')).map(base))].sort();
    const en = [...new Set(Object.keys(catalog('en')).map(base))].sort();
    expect(lt).toEqual(en);
    const dead = lt.filter((key) => !new RegExp(`['"\`]schedule\\.${key}['"\`]`).test(text));
    expect(dead).toEqual([]);
  });
});


describe('the screen\'s own controls keep the 44 pt floor', () => {
  it('the filter bar, a picker row and the perspective segment carry a 44 pt minimum as a plain style', async () => {
    const view = await render(<ScheduleScreen />);
    await flush();
    const minHeight = (node: { props: { style?: unknown } }) =>
      (Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean) as object[]) as { minHeight?: number }).minHeight;
    const bar = view.getByLabelText('schedule.filterTitle');
    expect(minHeight(bar)).toBe(44);
    await fireEvent.press(bar);
    expect(minHeight(view.getByLabelText('PDF-2'))).toBe(44);
    const segment = view.getAllByRole('tab').find((node) => node.props.accessibilityState?.selected === true && minHeight(node) === 44);
    expect(segment).toBeTruthy();
  });
});


describe("today's list marks the lecture under way and counts down to the next", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // Wednesday 2026-09-23, 09:30 on the wall clock
  const on = (id: string, timeStart: string, timeEnd: string): ScheduleEventRow =>
    eventRow(id, { title: `Paskaita ${id}`, date: '2026-09-23', dayOfWeek: 2, timeStart, timeEnd });

  it('a group view: "in progress" on the running lecture, the countdown on the next, nothing beyond the window', async () => {
    await withTimeZone('UTC', async () => {
      freezeClock(Date.UTC(2026, 8, 23, 9, 30));
      await AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify({ group: 'ISKS-1' }));
      mockFetchEvents.mockResolvedValue({
        events: [on('a', '09:00', '10:30'), on('b', '11:00', '12:30'), on('c', '14:00', '15:30')],
      });
      const view = await render(<ScheduleScreen />);
      await flush();
      expect(view.getAllByText('In progress')).toHaveLength(1);
      expect(view.getAllByText('In 1 h 30 min')).toHaveLength(1);
      // The status leads the card's spoken sentence
      expect(view.getByLabelText(/^In progress, Paskaita a,/)).toBeTruthy();
      expect(view.queryByText(/^In 4 h/)).toBeNull();
    });
  });

  it('"all groups" is everyone\'s timetable — no live marks there', async () => {
    await withTimeZone('UTC', async () => {
      freezeClock(Date.UTC(2026, 8, 23, 9, 30));
      mockFetchEvents.mockResolvedValue({ events: [on('a', '09:00', '10:30'), on('b', '11:00', '12:30')] });
      const view = await render(<ScheduleScreen />);
      await flush();
      expect(view.queryByText('In progress')).toBeNull();
      expect(view.queryByText(/^In \d/)).toBeNull();
    });
  });
});
