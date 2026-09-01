// -----------------------------------------------------------
//  [*] Tabs — Schedule
//
//  The faculty timetable, one day at a time: a quick tab bar
//  (Mon–Fri, growing to the full week once a weekend day is
//  in view) plus header chevrons that cycle all seven days —
//  the API numbers days 0=Monday…6=Sunday and weekend lessons
//  exist, so they must be reachable. The screen opens on
//  today and re-follows the calendar on focus/foreground. The
//  group/semester filter persists across launches and is
//  re-validated against the server's non-empty filter lists;
//  with no stored choice the newest parsable semester is
//  defaulted so stale semesters never interleave into one day.
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
//  Three view modes and two perspectives. The card LIST keeps
//  its per-day fetch and offline path exactly as it always
//  worked; the DAY timeline and WEEK grid come from
//  @knf/timetableuikit over @knf/timetableengine geometry, fed
//  by ONE whole-semester fetch (every group, paged past the
//  backend's 500-row cap) that also powers the TEACHER
//  perspective — a lecturer's lessons across every group,
//  merged into single cards, double-bookings washed via the
//  engine's person-scope conflicts.
//
//  Split into (root component last):
//
//    jsDayToApi     — JS Date.getDay() → 0=Monday API days
//    newestSemester — pick the newest 'YYYY-P/R' label
//    Separator      — hoisted lesson-list separator
//    DayStepper     — header chevrons + current day label
//    DayTabs        — the Mon–Fri quick tab bar
//    ViewModeSwitch — list / day / week icon segment
//    FilterBar      — active-filter summary, opens the modal
//    ConflictBanner — "N lectures overlap" danger strip
//    LessonCard     — one timetable entry, conflict-aware
//    FilterOption   — one radio row of the filter picker
//    FilterModal    — perspective + group/teacher/semester picker
//    ScheduleScreen — the tab itself (default export)
// -----------------------------------------------------------

// Offline-cache strip shown when the list renders stale data
import CachedBanner from '@/components/CachedBanner';

// The timetable module: engine math + kit views, wired through
// the host (theme/locale), the view pipeline and the tap sheet
import LessonSheet from '@/components/schedule/LessonSheet';
import TimetableHost from '@/components/schedule/TimetableHost';
import TimetableView from '@/components/schedule/TimetableView';
import {
  compareEntries,
  conflictIds as engineConflictIds,
  forGroup,
  forTeacher,
  formatMinutes,
  listTeachers,
  normalizeKnf,
  type ConflictOptions,
  type KnfLesson,
  type TimetableEntry,
} from '@knf/timetableengine';
import type { TimetableLesson } from '@knf/timetableuikit';

// UI kit — chrome and the three data states
import { Button, EmptyState, ErrorState, Header, Input, LoadingSpinner, Screen } from '@/components/ui';

// JS-side colors for icons and the refresh tint
import { useTheme } from '@/hooks/useTheme';

// Conflict detection + refetch when connectivity returns
import { useDataEngine, useNetworkRestore } from '@knf/dataengine';
import { useScheduleConflicts } from '@/hooks/useScheduleConflicts';

// Timetable API + the offline cache it falls back to
import { fetchSchedule, fetchScheduleFilters, fetchScheduleWeek, type ScheduleLesson, type ScheduleResponse } from '@/services/api';
import { cacheKeySchedule, cacheKeyScheduleWeek, SCHEDULE_CACHE_MAX_AGE } from '@/services/cacheKeys';

// Failed silent refreshes toast instead of touching the list
import { showToast } from '@/context/NetworkContext';

// Filter choice persistence across launches
import AsyncStorage from '@react-native-async-storage/async-storage';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

// Shrinks the filter sheet's list while the teacher search types
import useKeyboardVisible from '@/hooks/useKeyboardVisible';


// AsyncStorage key for the persisted group/semester choice —
// exported so AuthContext can drop it on logout
export const SCHEDULE_PREFS_KEY = 'schedule_prefs';

// The quick tab bar defaults to weekdays and grows to the full
// week once a weekend day is in view; day numbers stay the
// API's 0=Monday…6=Sunday range throughout
const WEEKDAYS = [0, 1, 2, 3, 4];
const FULL_WEEK = [0, 1, 2, 3, 4, 5, 6];

// i18n key suffixes per API day — short forms feed the tab
// bar, full forms the header label and a11y announcements
const DAY_SHORT_KEYS = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat', 'daySun'];
const DAY_FULL_KEYS = ['dayFullMon', 'dayFullTue', 'dayFullWed', 'dayFullThu', 'dayFullFri', 'dayFullSat', 'dayFullSun'];

// Soft elevation for lesson cards; '#000' as shadowColor is
// the one sanctioned exception to the no-raw-hex rule
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 4,
  elevation: 2,
} as const;

// How the timetable renders and through whose eyes
type ViewMode = 'list' | 'day' | 'week';
type Perspective = 'group' | 'teacher';

// Teacher search must find 'Biržietienė' from 'birz' — fold
// the Lithuanian diacritics on both sides, like the backend's
// search columns do
const LT_FOLD_FROM = 'ąčęėįšųūž';
const LT_FOLD_TO = 'aceeisuuz';
const foldLt = (value: string): string =>
  value.toLowerCase().replace(/[ąčęėįšųūž]/g, (ch) => LT_FOLD_TO[LT_FOLD_FROM.indexOf(ch)]);

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

// JS Date.getDay() counts 0=Sunday; the API counts 0=Monday
const jsDayToApi = (jsDay: number): number => (jsDay === 0 ? 6 : jsDay - 1);


// Semester labels follow 'YYYY-P' (pavasaris) / 'YYYY-R'
// (ruduo): the newest is the highest year, autumn over spring
// within it. The backend's list order can't be trusted (BINARY-
// collation DESC misorders it) and unparsable labels like
// '2025-pavasaris' never win; null when nothing parses.
const newestSemester = (labels: string[]): string | null => {
  let best: string | null = null;
  let bestRank = -1;
  for (const label of labels) {
    const match = /^(\d{4})-([PR])$/.exec(label.trim());
    if (!match) continue;
    const rank = Number(match[1]) * 2 + (match[2] === 'R' ? 1 : 0);
    if (rank > bestRank) {
      bestRank = rank;
      best = label;
    }
  }
  return best;
};


// Hoisted so the lesson list's separators keep their identity
// instead of remounting on every screen render
const Separator = () => <View className="h-3" />;







// -----------------------------------------------------------
// DayStepper
// -----------------------------------------------------------
//
// The header-right day switcher: back/forward chevrons around
// the SHORT weekday name — the long Lithuanian full names
// ("Ketvirtadienis") truncate next to the screen title, so
// the full name rides on the accessibility label instead. The
// chevron hit areas are 32×44 plus hitSlop, clearing the 44pt
// target on both axes.
//
// Used by:
//   - ScheduleScreen (below) — Header right slot
// -----------------------------------------------------------

function DayStepper({
  label,
  fullLabel,
  onPrev,
  onNext,
}: {
  label: string;
  fullLabel: string;
  onPrev: () => void;
  onNext: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="flex-row items-center">

      <Pressable
        onPress={onPrev}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('schedule.prevDay')}
        className="h-11 w-8 items-center justify-center"
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.onBrand} />
      </Pressable>

      <Text
        className="mx-1 font-raleway-bold text-base text-on-brand"
        numberOfLines={1}
        style={{ flexShrink: 1 }}
        accessibilityLabel={fullLabel}
      >
        {label}
      </Text>

      <Pressable
        onPress={onNext}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('schedule.nextDay')}
        className="h-11 w-8 items-center justify-center"
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="chevron-forward" size={20} color={colors.onBrand} />
      </Pressable>

    </View>
  );
}







// -----------------------------------------------------------
// DayTabs
// -----------------------------------------------------------
//
// The quick tab bar under the filter bar — Mon–Fri by default,
// the full week when the caller passes it (a weekend day in
// view). Tabs are announced by their full day name while
// showing the short form; the active tab carries a brand
// underline (the label uses the AA-safe brand-text tone).
//
// Used by:
//   - ScheduleScreen (below)
// -----------------------------------------------------------

function DayTabs({
  days,
  selectedDay,
  onSelect,
}: {
  days: number[];
  selectedDay: number;
  onSelect: (day: number) => void;
}) {

  const { t } = useTranslation();


  return (
    <View className="flex-row border-b border-line bg-surface">
      {days.map((day) => {
        const active = selectedDay === day;
        return (
          <Pressable
            key={day}
            onPress={() => onSelect(day)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(`schedule.${DAY_FULL_KEYS[day]}`)}
            className="flex-1 items-center"
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <View className={`items-center border-b-2 py-3 ${active ? 'border-brand' : 'border-transparent'}`}>
              <Text className={`text-sm ${active ? 'font-raleway-bold text-brand-text' : 'font-raleway-medium text-ink-soft'}`}>
                {t(`schedule.${DAY_SHORT_KEYS[day]}`)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}







// -----------------------------------------------------------
// ViewModeSwitch
// -----------------------------------------------------------
//
// The list / day / week segment at the filter row's end. Icons
// only — the row is tight — with the mode name riding on the
// accessibility label.
//
// Used by:
//   - ScheduleScreen (below) — beside FilterBar
// -----------------------------------------------------------

function ViewModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();

  const options = [
    { mode: 'list', icon: 'list-outline', label: t('schedule.viewList') },
    { mode: 'day', icon: 'time-outline', label: t('schedule.viewDay') },
    { mode: 'week', icon: 'grid-outline', label: t('schedule.viewWeek') },
  ] as const;


  return (
    <View className="mr-md flex-row rounded-lg bg-surface-soft p-0.5">
      {options.map((option) => {
        const active = option.mode === mode;
        return (
          <Pressable
            key={option.mode}
            onPress={() => onChange(option.mode)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            className={`h-8 w-9 items-center justify-center rounded-md ${active ? 'bg-surface' : ''}`}
          >
            <Ionicons name={option.icon} size={16} color={active ? colors.brand : colors.inkFaint} />
          </Pressable>
        );
      })}
    </View>
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
      className="flex-1 flex-row items-center justify-between px-md py-3"
      style={({ pressed }) => [pressed && { backgroundColor: colors.surfaceSoft }]}
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
// ConflictBanner
// -----------------------------------------------------------
//
// Danger strip above the list summarizing how many lectures
// overlap. Copy comes from the pluralized
// schedule.conflictBanner_one/_few/_other keys — Lithuanian
// needs all three forms.
//
// Used by:
//   - ScheduleScreen (below) — only under an active group
//     filter, and only when conflicts exist
// -----------------------------------------------------------

function ConflictBanner({ count }: { count: number }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    // accessible + a polite live region — role='alert' alone is
    // a no-op announcement-wise on RN
    <View
      accessible
      accessibilityLiveRegion="polite"
      className="mx-md mt-3 flex-row items-center rounded-xl border border-danger bg-danger-soft px-3.5 py-2.5"
    >
      <Ionicons name="alert-circle" size={16} color={colors.danger} />
      <Text className="ml-2 flex-1 font-raleway-bold text-xs text-danger">
        {t('schedule.conflictBanner', { count })}
      </Text>
    </View>
  );
}







// -----------------------------------------------------------
// LessonCard
// -----------------------------------------------------------
//
// One timetable entry: left accent bar, title + teacher, room
// chip, and a footer with the time range and group·semester.
// A conflicting lesson flips to the danger wash with an
// "overlap" chip. Times render raw — timeStart/timeEnd are
// wall-clock "HH:MM" strings from the schedule API, not the
// UTC-broken preformatted timestamps other endpoints carry.
// Memoized: with a stable renderItem only the cards whose
// props changed re-render.
//
// Used by:
//   - ScheduleScreen (below) — FlatList renderItem
// -----------------------------------------------------------

const LessonCard = memo(function LessonCard({ lesson, conflict }: { lesson: ScheduleLesson; conflict: boolean }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View
      className={`overflow-hidden rounded-xl ${conflict ? 'bg-danger-soft' : 'bg-surface'}`}
      style={CARD_SHADOW}
    >
      <View className="flex-row">

        <View className={`w-1 ${conflict ? 'bg-danger' : 'bg-brand'}`} />

        <View className="flex-1 p-md">

          {/* The wash alone is easy to miss — the chip names the
              problem; bordered, since a soft-on-soft fill would
              vanish into the card's own danger wash */}
          {conflict && (
            <View className="mb-2 flex-row items-center self-start rounded-lg border border-danger px-2.5 py-1">
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <Text className="ml-1.5 font-raleway-bold text-xs text-danger">
                {t('schedule.conflict')}
              </Text>
            </View>
          )}

          <View className="flex-row items-start justify-between">
            <View className="mr-3 flex-1">
              <Text className="font-raleway-bold text-base leading-6 text-ink" numberOfLines={2}>
                {lesson.title}
              </Text>
              <Text className="mt-1.5 font-raleway text-sm text-ink-soft" numberOfLines={1}>
                {lesson.teacher}
              </Text>
            </View>
            <View className="rounded-lg bg-brand-soft px-3.5 py-2" style={{ maxWidth: 130 }}>
              <Text className="font-raleway-bold text-xs text-brand" numberOfLines={1}>
                {lesson.room}
              </Text>
            </View>
          </View>

          <View
            className={`mt-3.5 flex-row items-center justify-between border-t pt-3 ${conflict ? 'border-danger' : 'border-line'}`}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="time-outline" size={14} color={conflict ? colors.danger : colors.brand} />
              <Text className={`font-raleway-bold text-sm ${conflict ? 'text-danger' : 'text-brand'}`}>
                {lesson.timeStart} {'–'} {lesson.timeEnd}
              </Text>
            </View>
            <Text className="font-raleway text-xs text-ink-soft">
              {lesson.group} {'·'} {lesson.semester}
            </Text>
          </View>

        </View>

      </View>
    </View>
  );
});







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
    const query = foldLt(teacherQuery.trim());
    if (!query) return teachers;
    return teachers.filter((name) => foldLt(name).includes(query));
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
// Used by:
//   - expo-router — the /tabs/schedule tab
// -----------------------------------------------------------

export default function ScheduleScreen() {
  // The engine's cache — the offline copy of each day/group/semester
  const { cache } = useDataEngine();

  const { t } = useTranslation();
  const { colors } = useTheme();


  // Opens on today's tab — weekends included, now that the
  // full week is reachable
  const [selectedDay, setSelectedDay] = useState(() => jsDayToApi(new Date().getDay()));


  // How the timetable renders (persisted), and through whose
  // eyes: the group's — or one teacher's, across every group
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [perspective, setPerspective] = useState<Perspective>('group');
  const [teacher, setTeacher] = useState<string | null>(null);


  // The whole-semester dataset behind the timetable views and
  // the teacher perspective — null until first needed. Its own
  // three states beside the day list's, so flipping view modes
  // never blanks the other path's data.
  const [weekLessons, setWeekLessons] = useState<ScheduleLesson[] | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState(false);
  const [weekCachedAt, setWeekCachedAt] = useState<number | null>(null);


  // A tapped timetable cell opens the detail sheet
  const [sheetLesson, setSheetLesson] = useState<TimetableLesson | null>(null);


  // Lesson list, its three data states, and the cache age
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);


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
  // put the wrong day on screen or flip the spinner off early
  const loadSeqRef = useRef(0);


  // Under "all groups" parallel lectures overlap by design, so
  // detection only runs while a group filter is active
  const conflictIds = useScheduleConflicts(lessons, selectedGroup !== null);


  // Both loaders remember which cache key they last SERVED — a
  // repeat need for the same data (a view-mode round trip, a
  // perspective flip) refreshes silently instead of blanking a
  // filled view behind a spinner; a failed serve clears the
  // mark so the next need retries with the full spinner path
  const weekSeqRef = useRef(0);
  const weekKeyRef = useRef<string | null>(null);
  const listKeyRef = useRef<string | null>(null);


  // One code path for first load / day change (spinner), pull-
  // to-refresh and network restore (silent); a failure serves
  // the offline cache before admitting a distinct error state
  const loadLessons = useCallback(
    async (day: number, group: string | null, semester: string | null, spinner: boolean) => {
      const seq = ++loadSeqRef.current;
      if (spinner) {
        setLoading(true);
        setError(false);
      }

      const key = cacheKeySchedule(day, group, semester);
      try {
        const resp = await fetchSchedule(day, group ?? undefined, semester ?? undefined);
        if (seq !== loadSeqRef.current) return;
        setLessons(resp.lessons);
        setCachedAt(null);
        setError(false);
        listKeyRef.current = key;
        void cache.set(key, resp);
      } catch {
        // A failed SILENT refresh keeps whatever is on screen
        // and just toasts — swapping live lessons for stale
        // cache (or an empty error state) mid-view is worse
        // than admitting the refresh failed. Spinner loads
        // (first load / day change) still fall back to cache
        // before the error state.
        if (!spinner) {
          if (seq === loadSeqRef.current) showToast('error', t('schedule.loadError'));
          return;
        }
        const cached = await cache.get<ScheduleResponse>(key, SCHEDULE_CACHE_MAX_AGE);
        if (seq !== loadSeqRef.current) return;
        if (cached) {
          setLessons(cached.data.lessons);
          setCachedAt(cached.cachedAt);
          setError(false);
          listKeyRef.current = key;
        } else {
          setLessons([]);
          setCachedAt(null);
          setError(true);
          listKeyRef.current = null;
        }
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [t, cache],
  );


  // The whole-semester fetch behind the timetable views: every
  // group, every day, paged past the backend's 500-row cap by
  // fetchScheduleWeek, cached like the day rows and falling
  // back to that cache the same way
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
    void loadFilters();
  }, [loadFilters]);


  // Browsing groups writes one cache row per day/group/semester
  // combination and most are never read again (cacheGet only
  // evicts what it is asked for) — sweep the expired ones once
  // per mount so the store cannot grow without bound
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
      setSelectedGroup(null);
    }
    if (semesters.length > 0 && selectedSemester !== null && !semesters.includes(selectedSemester)) {
      // Clearing a stale semester also clears the explicit
      // mark, so the newest-semester default below re-applies
      setSemesterExplicit(false);
      setSelectedSemester(null);
    }
  }, [prefsLoaded, filtersFetched, groups, semesters, selectedGroup, selectedSemester]);


  // No stored semester choice: default to the newest label the
  // 'YYYY-P/R' shape parses to, so lectures from stale
  // semesters never interleave into one day. "All semesters"
  // stays an explicit opt-in through the filter modal.
  useEffect(() => {
    if (!prefsLoaded || !filtersFetched) return;
    if (semesterExplicit || selectedSemester !== null) return;
    const newest = newestSemester(semesters);
    if (newest) setSelectedSemester(newest);
  }, [prefsLoaded, filtersFetched, semesters, selectedSemester, semesterExplicit]);


  // What the wire and the cache keys call the semester choice:
  // a picked label rides as itself; a DELIBERATE "all" must be
  // sent as the literal 'all' — the backend rewrites an omitted
  // ?semester to the newest one and only 'all' opts out; the
  // transient null before the auto-default lands stays omitted
  // (the backend's newest IS what the default will pick)
  const semesterParam = selectedSemester ?? (semesterExplicit ? 'all' : null);


  // (Re)load whenever the visible day or the filters change —
  // gated on prefsLoaded so the persisted filter applies to
  // the very first fetch instead of arriving one fetch late.
  // The per-day path only serves the group-perspective card
  // list; the other views live off the week dataset below.
  useEffect(() => {
    if (!prefsLoaded) return;
    if (viewMode !== 'list' || perspective !== 'group') return;
    const spinner = listKeyRef.current !== cacheKeySchedule(selectedDay, selectedGroup, semesterParam);
    void loadLessons(selectedDay, selectedGroup, semesterParam, spinner);
  }, [prefsLoaded, viewMode, perspective, selectedDay, selectedGroup, semesterParam, loadLessons]);


  // Which paths need the whole-semester dataset — the teacher
  // perspective always (the roster rides it); group-perspective
  // timetable views only once a group is picked, because an
  // all-groups grid packs parallel lessons into unreadable
  // slivers and the body shows the pick-a-group prompt instead
  const needsWeek = perspective === 'teacher' || (viewMode !== 'list' && selectedGroup !== null);


  // Load the week dataset when a timetable view or the teacher
  // perspective first needs it — with a spinner only when the
  // semester's data was never served, silently after that
  useEffect(() => {
    if (!prefsLoaded || !needsWeek) return;
    void loadWeek(semesterParam, weekKeyRef.current !== cacheKeyScheduleWeek(semesterParam));
  }, [prefsLoaded, needsWeek, semesterParam, loadWeek]);


  // The engine pipeline over the week dataset: normalize once,
  // then filter through the active perspective's eyes
  // ScheduleLesson is exactly the wire row the adapter expects
  // — only the open index signature is missing, so assert
  const normalized = useMemo(() => normalizeKnf((weekLessons ?? []) as KnfLesson[]), [weekLessons]);
  const weekEntries = normalized.entries;

  const teachers = useMemo(() => listTeachers(weekEntries), [weekEntries]);

  const perspectiveEntries = useMemo<TimetableEntry<KnfLesson>[]>(() => {
    if (perspective === 'teacher') return teacher ? forTeacher(weekEntries, teacher) : [];
    return selectedGroup ? forGroup(weekEntries, selectedGroup) : weekEntries;
  }, [weekEntries, perspective, teacher, selectedGroup]);

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


  // Connectivity returning refetches whichever paths are in
  // use (and the filter lists if they never arrived);
  // useNetworkRestore always runs the latest closure, so no
  // refs are needed
  useNetworkRestore(() => {
    if (viewMode === 'list' && perspective === 'group') {
      void loadLessons(selectedDay, selectedGroup, semesterParam, lessons.length === 0);
    }
    if (needsWeek) void loadWeek(semesterParam, weekLessons === null);
    if (!filtersFetched) void loadFilters();
  });


  // Chevrons cycle the FULL week — weekend lessons exist and
  // must be reachable; the +7 keeps the modulo positive when
  // stepping back from Monday
  const changeDay = (delta: number) => {
    setSelectedDay((prev) => (prev + delta + 7) % 7);
  };


  // The mount-time "today" must not fossilize: on focus and on
  // foreground the calendar date is re-checked, and once it
  // rolled over the selection follows today again (the load
  // effect refetches on the day change)
  const dayMarkerRef = useRef(new Date().toDateString());
  const evaluateToday = useCallback(() => {
    const marker = new Date().toDateString();
    if (marker === dayMarkerRef.current) return;
    dayMarkerRef.current = marker;
    setSelectedDay(jsDayToApi(new Date().getDay()));
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
  // and must survive as such
  const applyFilters = (choice: FilterChoice) => {
    if (choice.semesterChanged) {
      setSemesterExplicit(true);
      setSelectedSemester(choice.semester);
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


  // Pull-to-refresh: silent reload of whichever path is on
  // screen, first-load spinner hidden
  const onRefresh = async () => {
    setRefreshing(true);
    if (needsWeek) await loadWeek(semesterParam, false);
    else await loadLessons(selectedDay, selectedGroup, semesterParam, false);
    setRefreshing(false);
  };


  // ErrorState's button — full reload with the spinner
  const retry = () => {
    if (needsWeek) void loadWeek(semesterParam, true);
    else void loadLessons(selectedDay, selectedGroup, semesterParam, true);
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


  // Which path fills the body, and that path's states
  const groupList = viewMode === 'list' && perspective === 'group';
  const bodyLoading = groupList ? loading : weekLoading;
  const bodyError = groupList ? error : weekError;
  const bodyCachedAt = groupList ? cachedAt : weekCachedAt;
  const bannerCount =
    viewMode !== 'list' ? 0 : perspective === 'teacher' ? teacherDayCards.filter((card) => card.conflict).length : conflictIds.size;


  // Stable renderItem so the memoized cards only re-render
  // when their own lesson or conflict flag changes
  const renderLesson = useCallback(
    ({ item }: { item: ScheduleLesson }) => (
      <LessonCard lesson={item} conflict={conflictIds.has(item.id)} />
    ),
    [conflictIds],
  );

  const renderTeacherCard = useCallback(
    ({ item }: { item: { conflict: boolean; lesson: ScheduleLesson } }) => (
      <LessonCard lesson={item.lesson} conflict={item.conflict} />
    ),
    [],
  );


  // The quick tabs grow to the full week while a weekend day
  // is in view, so the active tab is never missing
  const visibleDays = selectedDay > 4 ? FULL_WEEK : WEEKDAYS;


  // One definition serves all three scrollable branches — the
  // list, the empty day and the error all pull-to-refresh
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.brand}
      colors={[colors.brand]}
    />
  );


  return (
    <Screen>

      <Header
        title={t('schedule.title')}
        right={
          viewMode === 'week' ? undefined : (
            <DayStepper
              label={t(`schedule.${DAY_SHORT_KEYS[selectedDay]}`)}
              fullLabel={t(`schedule.${DAY_FULL_KEYS[selectedDay]}`)}
              onPrev={() => changeDay(-1)}
              onNext={() => changeDay(1)}
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
        <ViewModeSwitch mode={viewMode} onChange={setViewMode} />
      </View>

      {viewMode !== 'week' && <DayTabs days={visibleDays} selectedDay={selectedDay} onSelect={setSelectedDay} />}

      {bodyCachedAt !== null && <CachedBanner cachedAt={bodyCachedAt} />}
      {!bodyLoading && bannerCount > 0 && <ConflictBanner count={bannerCount} />}

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
        lessons.length === 0 ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
            <EmptyState
              icon="calendar-outline"
              title={t('schedule.noLectures')}
              hint={activeFilterCount > 0 ? filterSummary : undefined}
            />
          </ScrollView>
        ) : (
          <FlatList
            data={lessons}
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
        <TimetableHost>
          <View className="flex-1 px-2 pt-2">
            <TimetableView
              entries={perspectiveEntries}
              skipped={normalized.skipped}
              scope={conflictScope}
              mode={viewMode}
              day={selectedDay}
              onChangeDay={changeDay}
              onPressLesson={setSheetLesson}
            />
          </View>
        </TimetableHost>
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

    </Screen>
  );
}
