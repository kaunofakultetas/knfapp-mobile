// -----------------------------------------------------------
//  [*] Tabs — Schedule
//
//  The faculty timetable on REAL dates: a weekStart cursor
//  (the ISO Monday of the visible week) under a quick tab bar
//  (Mon–Fri, growing to the full week once a weekend day is
//  in view) and header chevrons that CROSS week boundaries —
//  stepping past Sunday lands on the next week's Monday,
//  before Monday on the previous week's Sunday, and week mode
//  steps whole weeks. The header always shows where the
//  cursor is: the selected day's date under its name, or the
//  ISO week number over the week's date range. The screen
//  opens on today's week and re-follows the calendar on
//  focus/foreground.
//
//  The GROUP perspective lives off ONE dated fetch per
//  (week, group) — GET /schedule/events rows, ScheduleLesson
//  plus date and lectureType — feeding all three view modes:
//  the card list filters the week client-side by the selected
//  day, the day timeline and week grid run the same rows
//  through the engine pipeline. The TEACHER perspective stays
//  on the legacy folded whole-semester fetch (a lecturer's
//  lessons across every group, merged into single cards,
//  double-bookings washed via the engine's person-scope
//  conflicts); the semester picker filters its wire — while
//  in the group perspective it is a TIME JUMP: a non-current
//  term moves weekStart to that term's first Monday, the
//  current term or "all" back to today's week. With no stored
//  choice the CURRENT term is defaulted — today's own label
//  when the server lists it (the next term's exam weeks
//  arrive early and must not steal the default), the newest
//  parsable label otherwise.
//
//  Every load is sequence-guarded — rapid day tapping fires
//  overlapping requests and only the newest may write. A
//  failed load falls back to the 7-day offline cache (with
//  CachedBanner showing its age) before admitting an error,
//  and the error screen stays distinct from "no lectures";
//  all three body branches keep pull-to-refresh alive.
//
//  Conflict detection runs only while a group filter is
//  active — under "all groups", parallel lectures overlap by
//  design and flagging them would paint the list red.
//
//  The timetable CHROME — day stepper and tabs, the view-mode
//  segment, the conflict banner and the lesson card — comes
//  from @knf/timetableuikit, themed through TimetableHost
//  (which therefore wraps the WHOLE screen) with this app's
//  Ionicons handed in; only the filter sheet and its bar stay
//  app-built, since they encode the group/teacher/semester
//  policy.
//
//  Split into (root component last):
//
//    currentTermKey  — today's 'YYYY-R/P' semester label
//    termStartMonday — a term label → its first ISO Monday
//    Separator       — hoisted lesson-list separator
//    FilterBar       — active-filter summary, opens the modal
//    FilterOption    — one radio row of the filter picker
//    FilterModal     — perspective + group/teacher/semester picker
//    ScheduleScreen  — the tab itself (default export)
// -----------------------------------------------------------

// Offline-cache strip shown when the list renders stale data
import CachedBanner from '@/components/CachedBanner';

// The timetable module: engine math + kit views, wired through
// the host (theme/locale), the view pipeline and the tap sheet
import LessonSheet from '@/components/schedule/LessonSheet';
import TimetableHost from '@/components/schedule/TimetableHost';
import TimetableView from '@/components/schedule/TimetableView';
import {
  DAY_MS,
  compareEntries,
  conflictIds as engineConflictIds,
  dayIndexOf,
  forGroup,
  forTeacher,
  formatMinutes,
  isoWeekNumber,
  listTeachers,
  mondayOf,
  newestSemesterKey,
  normalizeKnf,
  parseISO,
  toISO,
  type ConflictOptions,
  type KnfLesson,
  type TimetableEntry,
} from '@knf/timetableengine';
import {
  ConflictBanner,
  DayStepper,
  DayTabs,
  LessonCard,
  ViewModeSwitch,
  type TimetableLesson,
} from '@knf/timetableuikit';

// UI kit — chrome and the three data states
import { Button, EmptyState, ErrorState, Header, Input, LoadingSpinner, RefreshSpinner, Screen } from '@/components/ui';

// JS-side colors for icons and the refresh tint
import { useTheme } from '@/hooks/useTheme';

// Conflict detection + refetch when connectivity returns
import { useDataEngine, useNetworkRestore } from '@knf/dataengine';
import { useScheduleConflicts } from '@/hooks/useScheduleConflicts';

// Timetable API + the offline cache it falls back to
import {
  fetchScheduleEvents,
  fetchScheduleFilters,
  fetchScheduleWeek,
  type ScheduleEventRow,
  type ScheduleEventsResponse,
  type ScheduleLesson,
  type ScheduleResponse,
} from '@/services/api';
import { cacheKeyScheduleEvents, cacheKeyScheduleWeek, SCHEDULE_CACHE_MAX_AGE } from '@/services/cacheKeys';
import { foldForSearch } from '@/services/format';

// Failed silent refreshes toast instead of touching the list
import { showToast } from '@/context/NetworkContext';

// Filter choice persistence across launches
import AsyncStorage from '@react-native-async-storage/async-storage';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

// Shrinks the filter sheet's list while the teacher search types
import useKeyboardVisible from '@/hooks/useKeyboardVisible';







// -----------------------------------------------------------
// SCHEDULE_PREFS_KEY
// -----------------------------------------------------------
//
// AsyncStorage key for the persisted group/semester choice.
//
// Used by:
//   - ScheduleScreen (below) — load/save of SchedulePrefs
//   - context/AuthContext.tsx — drops the entry on logout
// -----------------------------------------------------------

export const SCHEDULE_PREFS_KEY = 'schedule_prefs';

// The quick tab bar defaults to weekdays and grows to the full
// week once a weekend day is in view; day numbers stay the
// API's 0=Monday…6=Sunday range throughout
const WEEKDAYS = [0, 1, 2, 3, 4];
// The grown tab bar: every day, weekend included
const FULL_WEEK = [0, 1, 2, 3, 4, 5, 6];

// How the timetable renders and through whose eyes
type ViewMode = 'list' | 'day' | 'week';
type Perspective = 'group' | 'teacher';

// Shape persisted under SCHEDULE_PREFS_KEY. semesterExplicit
// records that the user picked a semester (or "all") THEMSELVES
// — without it the newest semester is defaulted on launch
interface SchedulePrefs {
  group: string | null;
  semester: string | null;
  semesterExplicit?: boolean;
  viewMode?: ViewMode;
  perspective?: Perspective;
  teacher?: string | null;
}

// What the filter modal lifts on Apply — one object, so the
// screen marks the semester explicit ONLY when it truly changed
interface FilterChoice {
  group: string | null;
  semester: string | null;
  semesterChanged: boolean;
  perspective: Perspective;
  teacher: string | null;
}







// -----------------------------------------------------------
// currentTermKey
// -----------------------------------------------------------
//
// Today's semester label by the sheets' naming: the label
// year is the ACADEMIC year's first calendar year, so
// September–January belong to that year's R (autumn) and
// February–August to the PREVIOUS label year's P (spring —
// '2026-P' runs in calendar 2027).
//
// Used by:
//   - ScheduleScreen (below) — the current-term default and
//     the semester time-jump's "back to today" branch
// -----------------------------------------------------------

function currentTermKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0=January
  if (month >= 8) return `${year}-R`;
  if (month === 0) return `${year - 1}-R`;
  return `${year - 1}-P`;
}







// -----------------------------------------------------------
// termStartMonday
// -----------------------------------------------------------
//
// A 'YYYY-R/P' label → the ISO Monday its lectures start on:
// the first Monday of September YYYY for autumn, of February
// YYYY+1 for spring (the label year is the academic year's
// first calendar year). A label outside that shape — a stray
// sheet name — returns null and the time-jump stays put.
//
// Used by:
//   - ScheduleScreen (below) — the semester time-jump
// -----------------------------------------------------------

function termStartMonday(label: string): string | null {
  const match = /^(\d{4})-([PR])$/.exec(label);
  if (!match) return null;
  const first = match[2] === 'R' ? Date.UTC(Number(match[1]), 8, 1) : Date.UTC(Number(match[1]) + 1, 1, 1);
  // 0=Sunday..6=Saturday → days SINCE Monday, then the hop to
  // the first Monday on or after the 1st
  const sinceMonday = (new Date(first).getUTCDay() + 6) % 7;
  return toISO(first + ((7 - sinceMonday) % 7) * DAY_MS);
}







// -----------------------------------------------------------
// Separator
// -----------------------------------------------------------
//
// Hoisted so the lesson list's separators keep their identity
// instead of remounting on every screen render.
//
// Used by:
//   - ScheduleScreen (below) — both lesson lists
// -----------------------------------------------------------

const Separator = () => <View className="h-3" />;







// -----------------------------------------------------------
// TodayButton
// -----------------------------------------------------------
//
// The snap-back-to-today button, brand-filled so it reads as
// a button on the white day-tab strip it sits in (the header
// bar hid it — a brand pill on the brand ground). The screen
// mounts it only while the cursors are away from today, so
// its presence itself marks displacement. Button.tsx rules:
// layout in className, active: feedback, no style function.
//
// Used by:
//   - ScheduleScreen (below) — the day-tab strip's trailing
//     slot, every view mode
// -----------------------------------------------------------

function TodayButton({ onPress }: { onPress: () => void }) {

  const { t } = useTranslation();


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('schedule.today')}
      hitSlop={8}
      className="h-7 items-center justify-center self-center rounded-full bg-brand px-md active:bg-brand-strong"
    >
      <Text
        className="font-raleway-semibold text-xs text-on-brand"
        style={{ includeFontPadding: false, textAlignVertical: 'center' }}
      >
        {t('schedule.today')}
      </Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// FilterBar
// -----------------------------------------------------------
//
// One-row summary of the active choice — "IT-3 · 5" or a
// teacher's name — with a count pill when any filter is set.
// Tapping anywhere opens the FilterModal. The border and
// ground live on the parent row it shares with ViewModeSwitch.
//
// Used by:
//   - ScheduleScreen (below)
// -----------------------------------------------------------

function FilterBar({
  label,
  activeCount,
  onPress,
}: {
  label: string;
  activeCount: number;
  onPress: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('schedule.filterTitle')}
      className="flex-1 flex-row items-center justify-between px-md py-3 active:bg-surface-soft"
    >

      <View className="flex-1 flex-row items-center">
        <Ionicons name="filter-outline" size={16} color={colors.brand} />
        <Text className="ml-2 font-raleway-medium text-sm text-ink" numberOfLines={1}>
          {label}
        </Text>
      </View>

      {activeCount > 0 && (
        <View className="ml-2 h-5 w-5 items-center justify-center rounded-full bg-brand">
          <Text className="font-raleway-bold text-xs text-on-brand">{activeCount}</Text>
        </View>
      )}

      <View className="ml-2">
        <Ionicons name="chevron-down" size={16} color={colors.inkFaint} />
      </View>

    </Pressable>
  );
}







// -----------------------------------------------------------
// FilterOption
// -----------------------------------------------------------
//
// One radio row of the picker: brand-soft wash + brand text
// when selected. The 12pt vertical padding around base text
// keeps the row at ≥44pt.
//
// Used by:
//   - FilterModal (below) — "all" rows, groups, semesters
// -----------------------------------------------------------

function FilterOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      className={`mb-1 rounded-lg px-md py-3 ${selected ? 'bg-brand-soft' : ''}`}
    >
      <Text className={selected ? 'font-raleway-bold text-base text-brand' : 'font-raleway text-base text-ink'}>
        {label}
      </Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// FilterModal
// -----------------------------------------------------------
//
// Bottom-sheet picker: a perspective segment (group timetable
// or a teacher's), then the matching list — groups, or the
// searchable teacher roster — with the semester handful in the
// footer of both. Taps edit a LOCAL draft and "Atlikta" lifts
// everything in ONE FilterChoice — one schedule fetch per
// visit instead of one behind the sheet for every candidate
// tapped; "Valyti" clears the visible branch without closing,
// and a scrim/back dismissal discards an unapplied draft.
// Switching to the teacher tab asks the screen for the roster
// (onNeedTeachers) — it arrives from the whole-semester fetch.
//
// The sheet rides above the keyboard the proven way (see
// new-chat's banner): a KeyboardAvoidingView at the MODAL
// window's root, bare 'padding' on iOS, Android left to the
// window's own adjustResize — and the list additionally
// shrinks while the keyboard is up, so the search field, the
// matches and the Apply button all stay on screen together on
// a small phone.
//
// Used by:
//   - ScheduleScreen (below)
// -----------------------------------------------------------

function FilterModal({
  visible,
  groups,
  semesters,
  teachers,
  teachersLoading,
  selectedGroup,
  selectedSemester,
  perspective,
  selectedTeacher,
  onApply,
  onNeedTeachers,
  onClose,
}: {
  visible: boolean;
  groups: string[];
  semesters: string[];
  teachers: string[];
  teachersLoading: boolean;
  selectedGroup: string | null;
  selectedSemester: string | null;
  perspective: Perspective;
  selectedTeacher: string | null;
  onApply: (choice: FilterChoice) => void;
  onNeedTeachers: () => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();


  // The draft of the choice while the sheet is open — re-seeded
  // from the applied values on every open, so a dismissal
  // without "Atlikta" leaves the screen's filters untouched
  const [draftGroup, setDraftGroup] = useState<string | null>(selectedGroup);
  const [draftSemester, setDraftSemester] = useState<string | null>(selectedSemester);
  const [draftPerspective, setDraftPerspective] = useState<Perspective>(perspective);
  const [draftTeacher, setDraftTeacher] = useState<string | null>(selectedTeacher);
  const [teacherQuery, setTeacherQuery] = useState('');
  // Whether the user TOUCHED the semester rows this visit —
  // Apply must not read the live prop, which the newest-
  // semester default can move underneath an open sheet
  const semesterTouchedRef = useRef(false);
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the sheet opening is the event: drafts re-seed from the live filters at that moment, never continuously
      setDraftGroup(selectedGroup);
      setDraftSemester(selectedSemester);
      setDraftPerspective(perspective);
      setDraftTeacher(selectedTeacher);
      setTeacherQuery('');
      semesterTouchedRef.current = false;
      if (perspective === 'teacher') onNeedTeachers();
    }
    // Re-seed only on open — the applied values cannot change
    // while the sheet is up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);


  const teacherMode = draftPerspective === 'teacher';
  const keyboardUp = useKeyboardVisible();

  // Folded on both sides so 'birz' finds 'Biržietienė'
  const visibleTeachers = useMemo(() => {
    const query = foldForSearch(teacherQuery.trim());
    if (!query) return teachers;
    return teachers.filter((name) => foldForSearch(name).includes(query));
  }, [teachers, teacherQuery]);


  // Every deliberate tap on a semester row — a label, "all",
  // or the clear button — counts as the user's own choice
  const pickSemester = (semester: string | null) => {
    semesterTouchedRef.current = true;
    setDraftSemester(semester);
  };

  // Everything lifts in one object; semesterChanged marks the
  // semester explicit only when the user actually touched it
  const apply = () => {
    onApply({
      group: draftGroup,
      semester: draftSemester,
      semesterChanged: semesterTouchedRef.current,
      perspective: draftPerspective,
      teacher: draftPerspective === 'teacher' ? draftTeacher : null,
    });
    onClose();
  };

  const clearBranch = () => {
    if (teacherMode) setDraftTeacher(null);
    else setDraftGroup(null);
    pickSemester(null);
  };


  const semesterFooter = (
    <>
      <Text className="mb-2 mt-lg font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
        {t('schedule.semesterLabel')}
      </Text>
      <FilterOption
        label={t('schedule.allSemesters')}
        selected={draftSemester === null}
        onPress={() => pickSemester(null)}
      />
      {semesters.map((semester) => (
        <FilterOption
          key={semester}
          label={semester}
          selected={draftSemester === semester}
          onPress={() => pickSemester(semester)}
        />
      ))}
    </>
  );


  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Tapping the scrim closes the sheet; the inner Pressable
            swallows taps so touching the sheet itself doesn't.
            Both stay accessible={false} — an accessible Pressable
            would group its subtree into one screen-reader node and
            hide every control inside; closing remains reachable
            through the Done button and hardware back. */}
        <Pressable className="flex-1 justify-end bg-scrim" onPress={onClose} accessible={false}>
          <Pressable className="rounded-t-2xl bg-surface" onPress={() => {}} accessible={false}>

            <View className="items-center pb-1 pt-3">
              <View className="h-1 w-10 rounded-full bg-line-strong" />
            </View>

            <View className="px-lg pb-2 pt-md">
              <Text className="font-raleway-bold text-xl text-ink">{t('schedule.filterTitle')}</Text>
            </View>

            {/* Whose timetable: the group's, or one teacher's */}
            <View className="mx-lg mt-1 flex-row rounded-xl bg-surface-soft p-1">
              {(['group', 'teacher'] as const).map((candidate) => {
                const active = draftPerspective === candidate;
                return (
                  <Pressable
                    key={candidate}
                    onPress={() => {
                      setDraftPerspective(candidate);
                      if (candidate === 'teacher') onNeedTeachers();
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    className={`flex-1 items-center rounded-lg py-3 ${active ? 'bg-surface' : ''}`}
                  >
                    <Text className={active ? 'font-raleway-bold text-sm text-brand-text' : 'font-raleway-medium text-sm text-ink-soft'}>
                      {t(candidate === 'group' ? 'schedule.groupLabel' : 'schedule.teacherLabel')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <FlatList
              data={teacherMode ? visibleTeachers : groups}
              keyExtractor={(item) => item}
              className="px-lg"
              style={{ maxHeight: keyboardUp ? 220 : 384 }}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                teacherMode ? (
                  <View className="mt-md">
                    <Input
                      value={teacherQuery}
                      onChangeText={setTeacherQuery}
                      placeholder={t('schedule.searchTeacher')}
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID="schedule-teacher-search"
                    />
                    {teachersLoading && teachers.length === 0 ? (
                      <Text className="mb-2 font-raleway text-sm text-ink-soft">
                        {t('schedule.teachersLoading')}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <Text className="mb-2 mt-md font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
                      {t('schedule.groupLabel')}
                    </Text>
                    <FilterOption
                      label={t('schedule.allGroups')}
                      selected={draftGroup === null}
                      onPress={() => setDraftGroup(null)}
                    />
                  </>
                )
              }
              ListEmptyComponent={
                teacherMode && !teachersLoading ? (
                  <Text className="mt-2 font-raleway text-sm text-ink-soft">{t('schedule.searchNoResults')}</Text>
                ) : null
              }
              renderItem={({ item }) =>
                teacherMode ? (
                  <FilterOption
                    label={item}
                    selected={draftTeacher === item}
                    onPress={() => setDraftTeacher(item)}
                  />
                ) : (
                  <FilterOption
                    label={item}
                    selected={draftGroup === item}
                    onPress={() => setDraftGroup(item)}
                  />
                )
              }
              ListFooterComponent={semesterFooter}
            />

            <View className="flex-row gap-3 px-lg pb-xl pt-md">
              <View className="flex-1">
                <Button title={t('schedule.clearFilters')} variant="outline" onPress={clearBranch} />
              </View>
              <View className="flex-1">
                <Button title={t('schedule.applyFilters')} onPress={apply} />
              </View>
            </View>

          </Pressable>
        </Pressable>

      </KeyboardAvoidingView>

    </Modal>
  );
}







// -----------------------------------------------------------
// ScheduleScreen (default export)
// -----------------------------------------------------------
//
// Owns two independent datasets — the group perspective's
// DATED week of events and the teacher perspective's folded
// whole-semester week — each with its own sequence guard,
// cache fallback and last-served key mark (a repeat need
// refreshes silently instead of blanking a filled view).
// Around them: the weekStart cursor the chevrons and the
// semester time-jump move, the persisted prefs round trip
// with the current-term default and stale-choice validation,
// the teacher path's semesterParam wire rule (explicit "all"
// vs omitted), the focus/foreground today re-check, and the
// derived body branch table the render walks.
//
// Used by:
//   - expo-router — the /tabs/schedule tab
// -----------------------------------------------------------

export default function ScheduleScreen() {
  // The engine's cache — the offline copy of each day/group/semester
  const { cache } = useDataEngine();

  const { t } = useTranslation();
  // JS-side colors for the icons handed into the kit chrome
  const { colors } = useTheme();


  // Opens on today's tab — weekends included, now that the
  // full week is reachable
  const [selectedDay, setSelectedDay] = useState(() => dayIndexOf(new Date()));

  // The ISO Monday of the visible week — the dated fetch, the
  // header captions and the semester time-jump all move on it
  const [weekStart, setWeekStart] = useState(() => mondayOf(toISO(Date.now())));


  // How the timetable renders (persisted), and through whose
  // eyes: the group's — or one teacher's, across every group
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [perspective, setPerspective] = useState<Perspective>('group');
  const [teacher, setTeacher] = useState<string | null>(null);


  // The folded whole-semester dataset behind the TEACHER
  // perspective and its roster — null until first needed. Its
  // own three states beside the dated ones, so flipping
  // perspectives never blanks the other path's data.
  const [weekLessons, setWeekLessons] = useState<ScheduleLesson[] | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState(false);
  const [weekCachedAt, setWeekCachedAt] = useState<number | null>(null);


  // A tapped timetable cell opens the detail sheet
  const [sheetLesson, setSheetLesson] = useState<TimetableLesson | null>(null);


  // The group perspective's dataset — ONE dated week of
  // events per (weekStart, group), feeding all three view
  // modes — its three data states, and the cache age
  const [events, setEvents] = useState<ScheduleEventRow[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [eventsCachedAt, setEventsCachedAt] = useState<number | null>(null);


  // Server-provided filter options + the user's choice;
  // filtersFetched separates "lists arrived" from "fetch
  // failed", and validation additionally trusts only NON-EMPTY
  // lists, so an empty catalogue can't wipe a stored choice
  const [groups, setGroups] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [filtersFetched, setFiltersFetched] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);


  // True once the user (or their restored prefs) chose a
  // semester — including "all". Until then the newest parsable
  // semester is defaulted so stale semesters stay out of view.
  // STATE, not a ref: the wire param below derives from it
  const [semesterExplicit, setSemesterExplicit] = useState(false);


  // Only the newest request may write — rapid day taps fire
  // overlapping fetches, and a slow early response must not
  // put the wrong week on screen or flip the spinner off early
  const eventsSeqRef = useRef(0);


  // Both loaders remember which cache key they last SERVED — a
  // repeat need for the same data (a view-mode round trip, a
  // perspective flip) refreshes silently instead of blanking a
  // filled view behind a spinner; a failed serve clears the
  // mark so the next need retries with the full spinner path
  const weekSeqRef = useRef(0);
  const weekKeyRef = useRef<string | null>(null);
  const eventsKeyRef = useRef<string | null>(null);

  // What the dated rows on screen were fetched FOR — the load
  // effect reads it to tell a hop onto an already-rendered
  // neighbour week (silent refresh) from a real jump (spinner)
  const eventsServedRef = useRef<{ weekStart: string; group: string | null } | null>(null);


  // One code path for first load / window change (spinner),
  // pull-to-refresh and network restore (silent): THREE dated
  // weeks — the shown one plus a week either side, so the week
  // pager has real neighbour pages to scroll onto and a day
  // step across the boundary lands on data it already holds —
  // cached per (weekStart, group); a failure serves the
  // offline cache before admitting a distinct error state
  const loadEvents = useCallback(
    async (weekStartISO: string, group: string | null, spinner: boolean) => {
      const seq = ++eventsSeqRef.current;
      if (spinner) {
        setEventsLoading(true);
        setEventsError(false);
      }

      const key = cacheKeyScheduleEvents(weekStartISO, group);
      const fromISO = toISO(parseISO(weekStartISO) - 7 * DAY_MS);
      const untilISO = toISO(parseISO(weekStartISO) + 13 * DAY_MS);
      try {
        const resp = await fetchScheduleEvents(fromISO, untilISO, group ?? undefined);
        if (seq !== eventsSeqRef.current) return;
        setEvents(resp.events);
        setEventsCachedAt(null);
        setEventsError(false);
        eventsKeyRef.current = key;
        eventsServedRef.current = { weekStart: weekStartISO, group };
        void cache.set(key, resp);
      } catch {
        // A failed SILENT refresh keeps whatever is on screen
        // and just toasts — swapping live rows for stale
        // cache (or an empty error state) mid-view is worse
        // than admitting the refresh failed. Spinner loads
        // (first load / window change) still fall back to
        // cache before the error state.
        if (!spinner) {
          if (seq === eventsSeqRef.current) showToast('error', t('schedule.loadError'));
          return;
        }
        const cached = await cache.get<ScheduleEventsResponse>(key, SCHEDULE_CACHE_MAX_AGE);
        if (seq !== eventsSeqRef.current) return;
        if (cached) {
          setEvents(cached.data.events);
          setEventsCachedAt(cached.cachedAt);
          setEventsError(false);
          eventsKeyRef.current = key;
          eventsServedRef.current = { weekStart: weekStartISO, group };
        } else {
          setEvents([]);
          setEventsCachedAt(null);
          setEventsError(true);
          eventsKeyRef.current = null;
          eventsServedRef.current = null;
        }
      } finally {
        if (seq === eventsSeqRef.current) setEventsLoading(false);
      }
    },
    [t, cache],
  );


  // The folded whole-semester fetch behind the TEACHER
  // perspective: every group, every day, paged past the
  // backend's 500-row cap by fetchScheduleWeek, cached like
  // the dated rows and falling back to that cache the same way
  const loadWeek = useCallback(
    async (semester: string | null, spinner: boolean) => {
      const seq = ++weekSeqRef.current;
      if (spinner) {
        setWeekLoading(true);
        setWeekError(false);
      }

      const key = cacheKeyScheduleWeek(semester);
      try {
        const resp = await fetchScheduleWeek(semester ?? undefined);
        if (seq !== weekSeqRef.current) return;
        setWeekLessons(resp.lessons);
        setWeekCachedAt(null);
        setWeekError(false);
        weekKeyRef.current = key;
        void cache.set(key, resp);
      } catch {
        if (!spinner) {
          if (seq === weekSeqRef.current) showToast('error', t('schedule.loadError'));
          return;
        }
        const cached = await cache.get<ScheduleResponse>(key, SCHEDULE_CACHE_MAX_AGE);
        if (seq !== weekSeqRef.current) return;
        if (cached) {
          setWeekLessons(cached.data.lessons);
          setWeekCachedAt(cached.cachedAt);
          setWeekError(false);
          weekKeyRef.current = key;
        } else {
          setWeekLessons([]);
          setWeekCachedAt(null);
          setWeekError(true);
          // Next need for ANY semester must take the spinner
          // path again — it is the only one reading the cache
          weekKeyRef.current = null;
        }
      } finally {
        if (seq === weekSeqRef.current) setWeekLoading(false);
      }
    },
    [t, cache],
  );


  // Filter options fail silently — the modal simply offers
  // only the "all" rows until the network-restore retry below
  const loadFilters = useCallback(async () => {
    try {
      const resp = await fetchScheduleFilters();
      setGroups(resp.groups);
      setSemesters(resp.semesters);
      setFiltersFetched(true);
    } catch {
      // keep whatever we had
    }
  }, []);


  // Restore the persisted filter choice before the first fetch
  // — validating the shape instead of casting, so a corrupt or
  // foreign blob reads as "no filter" rather than poisoning
  // state with non-strings
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(SCHEDULE_PREFS_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const prefs = parsed as Partial<SchedulePrefs>;
            if (typeof prefs.group === 'string' && prefs.group) setSelectedGroup(prefs.group);
            if (typeof prefs.semester === 'string' && prefs.semester) setSelectedSemester(prefs.semester);
            // Only the RECORDED flag makes a restored semester
            // explicit — a stored auto-default must stay a
            // default, or a semester rollover could never move it
            if (prefs.semesterExplicit === true) setSemesterExplicit(true);
            if (prefs.viewMode === 'list' || prefs.viewMode === 'day' || prefs.viewMode === 'week') {
              setViewMode(prefs.viewMode);
            }
            if (prefs.perspective === 'teacher') setPerspective('teacher');
            if (typeof prefs.teacher === 'string' && prefs.teacher) setTeacher(prefs.teacher);
          }
        }
      } catch {
        // corrupt prefs read as "no filter"
      }
      setPrefsLoaded(true);
    })();
  }, []);


  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch kickoff: loadFilters flips its loading flag before the request it starts
    void loadFilters();
  }, [loadFilters]);


  // Browsing writes one cache row per week/group combination
  // (plus the teacher path's per-semester rows) and most are
  // never read again (cacheGet only evicts what it is asked
  // for) — sweep the expired ones once per mount so the store
  // cannot grow without bound
  useEffect(() => {
    void cache.sweepPrefix('schedule:', SCHEDULE_CACHE_MAX_AGE);
  }, [cache]);


  // Persist the choice — but never before the initial read, or
  // the mount defaults would wipe the stored prefs
  useEffect(() => {
    if (!prefsLoaded) return;
    const prefs: SchedulePrefs = {
      group: selectedGroup,
      semester: selectedSemester,
      semesterExplicit,
      viewMode,
      perspective,
      teacher,
    };
    AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefsLoaded, selectedGroup, selectedSemester, semesterExplicit, viewMode, perspective, teacher]);


  // Persisted filters can outlive the server's lists (a group
  // renamed or removed) — once real, NON-EMPTY lists arrive, a
  // stale choice is cleared instead of filtering every day to
  // empty; an empty catalogue (fresh deployment, mid-scrape)
  // leaves the stored preference untouched
  useEffect(() => {
    if (!prefsLoaded || !filtersFetched) return;
    if (groups.length > 0 && selectedGroup !== null && !groups.includes(selectedGroup)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the server catalog arriving is the event; a stale persisted choice is cleared once, in response
      setSelectedGroup(null);
    }
    if (semesters.length > 0 && selectedSemester !== null && !semesters.includes(selectedSemester)) {
      // Clearing a stale semester also clears the explicit
      // mark, so the newest-semester default below re-applies
      setSemesterExplicit(false);
      setSelectedSemester(null);
    }
  }, [prefsLoaded, filtersFetched, groups, semesters, selectedGroup, selectedSemester]);


  // No stored semester choice: default to the CURRENT term —
  // the backend also lists the NEXT term early (its exam
  // weeks), so the newest label must not steal the default.
  // Today's own label wins whenever the server lists it; only
  // a list without it falls back to the newest parsable label
  // (engine ranking: the label year is the academic year's
  // first calendar year, so a spring label outranks its own
  // autumn). "All semesters" stays an explicit opt-in through
  // the filter modal.
  useEffect(() => {
    if (!prefsLoaded || !filtersFetched) return;
    if (semesterExplicit || selectedSemester !== null) return;
    const current = currentTermKey();
    const picked = semesters.includes(current) ? current : newestSemesterKey(semesters);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the semester list arriving is the event; the current-term default applies once, in response
    if (picked) setSelectedSemester(picked);
  }, [prefsLoaded, filtersFetched, semesters, selectedSemester, semesterExplicit]);


  // What the TEACHER wire and its cache key call the semester
  // choice: a picked label rides as itself; a DELIBERATE "all"
  // must be sent as the literal 'all' — the backend rewrites an
  // omitted ?semester to the newest one and only 'all' opts
  // out; the transient null before the auto-default lands stays
  // omitted. The group perspective's dated fetch needs none of
  // this — its dates themselves say which term is on screen.
  const semesterParam = selectedSemester ?? (semesterExplicit ? 'all' : null);


  // (Re)load the dated week whenever the window or the group
  // changes — gated on prefsLoaded so the persisted filter
  // applies to the very first fetch instead of arriving one
  // fetch late. ONE fetch serves all three group-perspective
  // view modes; the teacher path lives off the folded dataset
  // below.
  useEffect(() => {
    if (!prefsLoaded || perspective !== 'group') return;
    // A hop onto a week the fetched window ALREADY covers (same
    // group, one week either side — a settled pager swipe, a day
    // step across the boundary, Today from next door) refreshes
    // silently: the grid is fully drawn, and flashing a spinner
    // over it was the settle glitch. Real jumps keep the spinner
    const served = eventsServedRef.current;
    const adjacent =
      served !== null &&
      served.group === selectedGroup &&
      Math.abs(parseISO(weekStart) - parseISO(served.weekStart)) <= 7 * DAY_MS;
    const spinner = !adjacent && eventsKeyRef.current !== cacheKeyScheduleEvents(weekStart, selectedGroup);
    void loadEvents(weekStart, selectedGroup, spinner);
  }, [prefsLoaded, perspective, weekStart, selectedGroup, loadEvents]);


  // The folded whole-semester dataset now serves the TEACHER
  // perspective alone — a lecturer's lessons across every
  // group, plus the roster the filter modal lists
  const teacherData = perspective === 'teacher';


  // Load it when the teacher perspective needs it — with a
  // spinner only when the semester's data was never served,
  // silently after that
  useEffect(() => {
    if (!prefsLoaded || !teacherData) return;
    void loadWeek(semesterParam, weekKeyRef.current !== cacheKeyScheduleWeek(semesterParam));
  }, [prefsLoaded, teacherData, semesterParam, loadWeek]);


  // The engine pipeline, once per dataset: the group
  // The fetched window holds THREE weeks — bucket the rows by
  // their week relative to weekStart, so every downstream
  // consumer reads exactly one week and the pager gets its
  // neighbour pages. dayOfWeek alone cannot split them: three
  // Thursdays live in one response
  const weekBuckets = useMemo(() => {
    const buckets: [ScheduleEventRow[], ScheduleEventRow[], ScheduleEventRow[]] = [[], [], []];
    const base = parseISO(weekStart);
    for (const row of events ?? []) {
      const offset = Math.floor((parseISO(row.date) - base) / (7 * DAY_MS));
      if (offset >= -1 && offset <= 1) buckets[offset + 1].push(row);
    }
    return buckets;
  }, [events, weekStart]);


  // perspective normalizes the DATED weeks (ScheduleEventRow is
  // a ScheduleLesson superset, so the adapter takes the rows
  // unchanged), the teacher perspective the folded semester.
  // Each is exactly the wire row the adapter expects — only
  // the open index signature is missing, so assert (the dated
  // rows through unknown: their extra date/lectureType fields
  // land under that signature, which defeats the direct cast).
  const datedNormalized = useMemo(() => normalizeKnf(weekBuckets[1] as unknown as KnfLesson[]), [weekBuckets]);
  const weekNormalized = useMemo(() => normalizeKnf((weekLessons ?? []) as KnfLesson[]), [weekLessons]);

  // The pager's side pages, group-filtered like the middle one;
  // their skipped counts stay silent — the notice describes the
  // week actually on screen
  const neighbourWeeks = useMemo(() => {
    const filter = (rows: ScheduleEventRow[]) => {
      const normalized = normalizeKnf(rows as unknown as KnfLesson[]).entries;
      return selectedGroup ? forGroup(normalized, selectedGroup) : normalized;
    };
    return { prev: filter(weekBuckets[0]), next: filter(weekBuckets[2]) };
  }, [weekBuckets, selectedGroup]);

  const teachers = useMemo(() => listTeachers(weekNormalized.entries), [weekNormalized]);

  const perspectiveEntries = useMemo<TimetableEntry<KnfLesson>[]>(() => {
    if (perspective === 'teacher') return teacher ? forTeacher(weekNormalized.entries, teacher) : [];
    return selectedGroup ? forGroup(datedNormalized.entries, selectedGroup) : datedNormalized.entries;
  }, [weekNormalized, datedNormalized, perspective, teacher, selectedGroup]);


  // The card list's rows: the SHOWN week filtered to the
  // selected day CLIENT-side — the per-day endpoint round
  // trips are gone. Rows arrive pre-sorted (date, start,
  // group) and the filter keeps that order.
  const groupDayLessons = useMemo(
    () => weekBuckets[1].filter((row) => row.dayOfWeek === selectedDay),
    [weekBuckets, selectedDay],
  );

  // Under "all groups" parallel lectures overlap by design, so
  // detection only runs while a group filter is active
  const conflictIds = useScheduleConflicts(groupDayLessons, selectedGroup !== null);

  const conflictScope = useMemo<ConflictOptions>(
    () =>
      perspective === 'teacher'
        ? { scope: 'person' }
        : { scope: 'group', groupFilterActive: selectedGroup !== null },
    [perspective, selectedGroup],
  );



  // The teacher perspective's card list: that day's merged
  // cards mapped back onto the LessonCard shape — group chips
  // joined, times from the raw row when it survived the merge
  const teacherDayCards = useMemo(() => {
    if (viewMode !== 'list' || perspective !== 'teacher') return [];
    const ids = engineConflictIds(perspectiveEntries, { scope: 'person' });
    return perspectiveEntries
      .filter((entry) => entry.day === selectedDay)
      .slice()
      .sort(compareEntries)
      .map((entry) => ({
        conflict: ids.has(entry.id),
        lesson: {
          id: entry.id,
          title: entry.title,
          teacher: (entry.people ?? []).join(', '),
          room: (entry.location ?? []).join(', '),
          timeStart: typeof entry.timeStart === 'string' ? entry.timeStart : formatMinutes(entry.startMin),
          timeEnd: typeof entry.timeEnd === 'string' ? entry.timeEnd : formatMinutes(entry.endMin),
          dayOfWeek: entry.day,
          group: (entry.groupKeys ?? (entry.groupKey ? [entry.groupKey] : [])).join(', '),
          semester: entry.termKey ?? '',
        } satisfies ScheduleLesson,
      }));
  }, [viewMode, perspective, perspectiveEntries, selectedDay]);


  // Connectivity returning refetches whichever path is in use
  // (and the filter lists if they never arrived);
  // useNetworkRestore always runs the latest closure, so no
  // refs are needed
  useNetworkRestore(() => {
    if (perspective === 'group') void loadEvents(weekStart, selectedGroup, events === null);
    else void loadWeek(semesterParam, weekLessons === null);
    if (!filtersFetched) void loadFilters();
  });


  // Chevrons and day swipes CROSS week boundaries instead of
  // wrapping: past Sunday lands on the next week's Monday,
  // before Monday on the previous week's Sunday — the window
  // effect then refetches the new week
  const changeDay = (delta: number) => {
    const next = selectedDay + delta;
    if (next < 0) {
      setWeekStart((prev) => toISO(parseISO(prev) - 7 * DAY_MS));
      setSelectedDay(6);
    } else if (next > 6) {
      setWeekStart((prev) => toISO(parseISO(prev) + 7 * DAY_MS));
      setSelectedDay(0);
    } else {
      setSelectedDay(next);
    }
  };

  // Week mode steps whole weeks, the day cursor staying put
  const changeWeek = (delta: number) => {
    setWeekStart((prev) => toISO(parseISO(prev) + delta * 7 * DAY_MS));
  };


  // The snap back from wherever the cursors wandered — the
  // TodayButton mounts in the day-tab strip only while
  // displaced, so its presence itself says "you are not on
  // today". Week mode ignores the day cursor: the week is the
  // displacement
  const todayMonday = mondayOf(toISO(Date.now()));
  const todayIndex = dayIndexOf(new Date());
  const displaced =
    viewMode === 'week'
      ? weekStart !== todayMonday
      : weekStart !== todayMonday || selectedDay !== todayIndex;
  const goToToday = () => {
    setWeekStart(todayMonday);
    setSelectedDay(todayIndex);
  };


  // The mount-time "today" must not fossilize: on focus and on
  // foreground the calendar date is re-checked, and once it
  // rolled over the selection AND the week window follow today
  // again (the load effect refetches on the change)
  const dayMarkerRef = useRef(new Date().toDateString());
  const evaluateToday = useCallback(() => {
    const marker = new Date().toDateString();
    if (marker === dayMarkerRef.current) return;
    dayMarkerRef.current = marker;
    setSelectedDay(dayIndexOf(new Date()));
    setWeekStart(mondayOf(toISO(Date.now())));
  }, []);

  useFocusEffect(evaluateToday);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') evaluateToday();
    });
    return () => sub.remove();
  }, [evaluateToday]);


  // The modal lifts everything at once; a semester that truly
  // moved — to a label or to "all" — is the user's own choice
  // and must survive as such. In the GROUP perspective that
  // choice is a TIME JUMP: a non-current term moves the window
  // to its first Monday (and Monday's tab), the current term
  // or "all" back to today's week — the teacher wire keeps
  // filtering by the label instead.
  const applyFilters = (choice: FilterChoice) => {
    if (choice.semesterChanged) {
      setSemesterExplicit(true);
      setSelectedSemester(choice.semester);
      if (choice.perspective === 'group') {
        const todayMonday = mondayOf(toISO(Date.now()));
        const target =
          choice.semester && choice.semester !== currentTermKey()
            ? termStartMonday(choice.semester)
            : todayMonday;
        // An unparsable label has no start date — stay put
        if (target) {
          setWeekStart(target);
          setSelectedDay(target === todayMonday ? dayIndexOf(new Date()) : 0);
        }
      }
    }
    setSelectedGroup(choice.group);
    setPerspective(choice.perspective);
    setTeacher(choice.teacher);
  };


  // The teacher tab of the modal needs the roster, which rides
  // the week dataset — fetch it whenever the held data is not
  // THIS semester's serve: never fetched, a failed last try
  // (the key mark was cleared), or another semester's leftovers
  const ensureTeachers = () => {
    if (weekLoading) return;
    if (weekKeyRef.current === cacheKeyScheduleWeek(semesterParam)) return;
    void loadWeek(semesterParam, true);
  };


  // Pull-to-refresh: silent reload of the current window (or
  // the teacher's semester), first-load spinner hidden
  const onRefresh = async () => {
    setRefreshing(true);
    if (teacherData) await loadWeek(semesterParam, false);
    else await loadEvents(weekStart, selectedGroup, false);
    setRefreshing(false);
  };


  // ErrorState's button — full reload with the spinner
  const retry = () => {
    if (teacherData) void loadWeek(semesterParam, true);
    else void loadEvents(weekStart, selectedGroup, true);
  };


  // "IT-3 · 5" (or the teacher's name) summary of the active
  // choice; doubles as the empty-state hint so an over-filtered
  // day explains itself
  const activeFilterCount =
    (perspective === 'teacher' ? (teacher ? 1 : 0) : selectedGroup ? 1 : 0) + (selectedSemester ? 1 : 0);
  const filterSummary = (
    perspective === 'teacher'
      ? [teacher ?? t('schedule.pickTeacher'), selectedSemester]
      : [selectedGroup ?? t('schedule.allGroups'), selectedSemester]
  )
    .filter(Boolean)
    .join(' · ');


  // Which path fills the body, and that path's states — the
  // whole group perspective rides the dated week, the teacher
  // perspective the folded semester
  const groupList = viewMode === 'list' && perspective === 'group';
  const bodyLoading = teacherData ? weekLoading : eventsLoading;
  const bodyError = teacherData ? weekError : eventsError;
  const bodyCachedAt = teacherData ? weekCachedAt : eventsCachedAt;
  const skippedCount = teacherData ? weekNormalized.skipped : datedNormalized.skipped;
  const bannerCount =
    viewMode !== 'list' ? 0 : perspective === 'teacher' ? teacherDayCards.filter((card) => card.conflict).length : conflictIds.size;


  // The header's proof of where the cursor is: day modes show
  // the selected day's real date under its name, week mode
  // the ISO week number over the Monday–Sunday range. The
  // range trims to MM-DD except across New Year, where the
  // trimmed form ("12-29 – 01-04") would hide which years the
  // week straddles — those weeks keep the full dates
  const weekEnd = toISO(parseISO(weekStart) + 6 * DAY_MS);
  const selectedDateISO = toISO(parseISO(weekStart) + selectedDay * DAY_MS);
  const weekCaption = t('schedule.weekShort', { week: isoWeekNumber(weekStart) });
  const weekRange =
    weekStart.slice(0, 4) === weekEnd.slice(0, 4)
      ? `${weekStart.slice(5)} – ${weekEnd.slice(5)}`
      : `${weekStart} – ${weekEnd}`;


  // The wire row onto the kit card's NEUTRAL shape — the one
  // mapping point where ScheduleLesson is allowed to touch the
  // kit; stable renderItems so only changed cards re-render
  const lessonCard = useCallback(
    (lesson: ScheduleLesson, conflict: boolean) => (
      <LessonCard
        title={lesson.title}
        person={lesson.teacher}
        room={lesson.room}
        timeStart={lesson.timeStart}
        timeEnd={lesson.timeEnd}
        footnote={`${lesson.group} · ${lesson.semester}`}
        conflict={conflict}
        conflictIcon={<Ionicons name="alert-circle" size={14} color={colors.danger} />}
        timeIcon={
          <Ionicons name="time-outline" size={14} color={conflict ? colors.danger : colors.brand} />
        }
      />
    ),
    [colors],
  );

  const renderLesson = useCallback(
    ({ item }: { item: ScheduleLesson }) => lessonCard(item, conflictIds.has(item.id)),
    [lessonCard, conflictIds],
  );

  const renderTeacherCard = useCallback(
    ({ item }: { item: { conflict: boolean; lesson: ScheduleLesson } }) =>
      lessonCard(item.lesson, item.conflict),
    [lessonCard],
  );


  // The quick tabs grow to the full week while a weekend day
  // is in view, so the active tab is never missing
  const visibleDays = selectedDay > 4 ? FULL_WEEK : WEEKDAYS;


  // One definition serves all three scrollable branches — the
  // list, the empty day and the error all pull-to-refresh
  const refreshControl = (
    <RefreshSpinner
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );


  return (
    <Screen>
      {/* TimetableProvider over the WHOLE screen: the kit chrome
          (stepper, tabs, banner, cards) reads theme and day
          names from it, not just the grid views */}
      <TimetableHost>

      {/* Week mode repurposes the stepper as a WEEK cursor:
          the label swaps the day name for the ISO week number
          and the chevrons step whole weeks — day modes step
          days across week boundaries and date the day */}
      <Header
        title={t('schedule.title')}
        right={
          viewMode === 'week' ? (
            <DayStepper
              day={selectedDay}
              label={weekCaption}
              subtitle={weekRange}
              onPrev={() => changeWeek(-1)}
              onNext={() => changeWeek(1)}
              prevAccessibilityLabel={t('schedule.prevWeek')}
              nextAccessibilityLabel={t('schedule.nextWeek')}
              prevIcon={<Ionicons name="chevron-back" size={20} color={colors.onBrand} />}
              nextIcon={<Ionicons name="chevron-forward" size={20} color={colors.onBrand} />}
            />
          ) : (
            <DayStepper
              day={selectedDay}
              subtitle={selectedDateISO}
              onPrev={() => changeDay(-1)}
              onNext={() => changeDay(1)}
              prevIcon={<Ionicons name="chevron-back" size={20} color={colors.onBrand} />}
              nextIcon={<Ionicons name="chevron-forward" size={20} color={colors.onBrand} />}
            />
          )
        }
      />

      <View className="flex-row items-center border-b border-line bg-surface">
        <FilterBar
          label={filterSummary}
          activeCount={activeFilterCount}
          onPress={() => setModalVisible(true)}
        />
        <View className="mr-md">
          <ViewModeSwitch
            mode={viewMode}
            onChange={setViewMode}
            renderIcon={(candidate, color, size) => (
              <Ionicons
                name={candidate === 'list' ? 'list-outline' : candidate === 'day' ? 'time-outline' : 'grid-outline'}
                size={size}
                color={color as string}
              />
            )}
          />
        </View>
      </View>

      {/* The Today button lives IN the day-tab row: the wrapper
          carries the same surface ground and hairline as the
          tabs, so the strip stays one unbroken white row however
          much of it the tabs yield to the button. Week mode
          keeps the strip in place — steady chrome across the
          mode switch — just without the day tabs, whose height
          the min-h pins while they are absent */}
      <View className="min-h-9 flex-row items-center border-b border-line bg-surface">
        {viewMode !== 'week' ? (
          <View className="flex-1">
            <DayTabs
              days={visibleDays}
              selectedDay={selectedDay}
              // A foreign week has no today column to outline
              today={weekStart === todayMonday ? todayIndex : undefined}
              onSelect={setSelectedDay}
            />
          </View>
        ) : (
          <View className="flex-1" />
        )}
        {displaced && (
          <View className="mr-md">
            <TodayButton onPress={goToToday} />
          </View>
        )}
      </View>

      {bodyCachedAt !== null && <CachedBanner cachedAt={bodyCachedAt} />}
      {!bodyLoading && bannerCount > 0 && (
        <ConflictBanner
          count={bannerCount}
          icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
        />
      )}

      {/* Body — spinner, error with retry, then the active
          path: the group card list exactly as it always was,
          the teacher's card list, the pick-a-teacher prompt,
          or the kit's timeline/grid; error and empty stay
          distinct states */}
      {bodyLoading ? (
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      ) : bodyError ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <ErrorState message={t('schedule.loadError')} onRetry={retry} />
        </ScrollView>
      ) : groupList ? (
        groupDayLessons.length === 0 ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
            <EmptyState
              icon="calendar-outline"
              title={t('schedule.noLectures')}
              hint={activeFilterCount > 0 ? filterSummary : undefined}
            />
          </ScrollView>
        ) : (
          <FlatList
            data={groupDayLessons}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            refreshControl={refreshControl}
            ItemSeparatorComponent={Separator}
            renderItem={renderLesson}
          />
        )
      ) : perspective === 'group' && selectedGroup === null ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState icon="people-outline" title={t('schedule.pickGroup')} hint={t('schedule.filterTitle')} />
        </ScrollView>
      ) : perspective === 'teacher' && teacher === null ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState icon="person-outline" title={t('schedule.pickTeacher')} hint={t('schedule.filterTitle')} />
        </ScrollView>
      ) : viewMode === 'list' ? (
        teacherDayCards.length === 0 ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
            <EmptyState icon="calendar-outline" title={t('schedule.noLectures')} hint={filterSummary} />
          </ScrollView>
        ) : (
          <FlatList
            data={teacherDayCards}
            keyExtractor={(card) => card.lesson.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
            refreshControl={refreshControl}
            ItemSeparatorComponent={Separator}
            renderItem={renderTeacherCard}
          />
        )
      ) : (
        <View className="flex-1 px-2 pt-2">
          <TimetableView
            entries={perspectiveEntries}
            skipped={skippedCount}
            scope={conflictScope}
            mode={viewMode}
            day={selectedDay}
            // The teacher dataset is a weekly PATTERN, where the
            // clock always applies; the dated group window only
            // owns "now" while it actually shows this week
            currentWeek={perspective === 'teacher' || weekStart === todayMonday}
            // A weekly PATTERN has no other week to scroll to —
            // only the dated group window gets the pager pages
            weeks={perspective === 'group' ? neighbourWeeks : undefined}
            onChangeDay={changeDay}
            onChangeWeek={perspective === 'group' ? changeWeek : undefined}
            onPressLesson={setSheetLesson}
          />
        </View>
      )}

      <FilterModal
        visible={modalVisible}
        groups={groups}
        semesters={semesters}
        teachers={teachers}
        teachersLoading={weekLoading}
        selectedGroup={selectedGroup}
        selectedSemester={selectedSemester}
        perspective={perspective}
        selectedTeacher={teacher}
        onApply={applyFilters}
        onNeedTeachers={ensureTeachers}
        onClose={() => setModalVisible(false)}
      />

      <LessonSheet lesson={sheetLesson} onClose={() => setSheetLesson(null)} />

      </TimetableHost>
    </Screen>
  );
}
