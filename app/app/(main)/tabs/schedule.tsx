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
//  Split into (root component last):
//
//    jsDayToApi     — JS Date.getDay() → 0=Monday API days
//    newestSemester — pick the newest 'YYYY-P/R' label
//    Separator      — hoisted lesson-list separator
//    DayStepper     — header chevrons + current day label
//    DayTabs        — the Mon–Fri quick tab bar
//    FilterBar      — active-filter summary, opens the modal
//    ConflictBanner — "N lectures overlap" danger strip
//    LessonCard     — one timetable entry, conflict-aware
//    FilterOption   — one radio row of the filter picker
//    FilterModal    — bottom-sheet group/semester picker
//    ScheduleScreen — the tab itself (default export)
// -----------------------------------------------------------

// Offline-cache strip shown when the list renders stale data
import CachedBanner from '@/components/CachedBanner';

// UI kit — chrome and the three data states
import { Button, EmptyState, ErrorState, Header, LoadingSpinner, Screen } from '@/components/ui';

// JS-side colors for icons and the refresh tint
import { useTheme } from '@/hooks/useTheme';

// Conflict detection + refetch when connectivity returns
import { useNetworkRestore } from '@/hooks/useNetworkRestore';
import { useScheduleConflicts } from '@/hooks/useScheduleConflicts';

// Timetable API + the offline cache it falls back to
import { fetchSchedule, fetchScheduleFilters, type ScheduleLesson, type ScheduleResponse } from '@/services/api';
import { cacheGet, cacheKeySchedule, cacheSet, cacheSweepPrefix, SCHEDULE_CACHE_MAX_AGE } from '@/services/cache';

// Failed silent refreshes toast instead of touching the list
import { showToast } from '@/context/NetworkContext';

// Filter choice persistence across launches
import AsyncStorage from '@react-native-async-storage/async-storage';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';


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

// Shape persisted under SCHEDULE_PREFS_KEY. semesterExplicit
// records that the user picked a semester (or "all") THEMSELVES
// — without it the newest semester is defaulted on launch
interface SchedulePrefs {
  group: string | null;
  semester: string | null;
  semesterExplicit?: boolean;
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
// FilterBar
// -----------------------------------------------------------
//
// One-row summary of the active group/semester choice ("IT-3
// · 5", or the all-groups label) with a count pill when any
// filter is set. Tapping anywhere opens the FilterModal.
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
      className="flex-row items-center justify-between border-b border-line bg-surface px-md py-3"
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
// Bottom-sheet picker for group and semester. Taps edit a
// LOCAL draft and "Taikyti" lifts it to the screen — one
// schedule fetch per visit instead of one behind the sheet
// for every candidate tapped; "Valyti" clears the draft
// without closing, and a scrim/back dismissal discards an
// unapplied draft. Groups are the unbounded list (dozens at
// faculty scale) so they get the virtualized FlatList; the
// bounded handful of semesters rides in its footer.
//
// Used by:
//   - ScheduleScreen (below)
// -----------------------------------------------------------

function FilterModal({
  visible,
  groups,
  semesters,
  selectedGroup,
  selectedSemester,
  onSelectGroup,
  onSelectSemester,
  onClose,
}: {
  visible: boolean;
  groups: string[];
  semesters: string[];
  selectedGroup: string | null;
  selectedSemester: string | null;
  onSelectGroup: (group: string | null) => void;
  onSelectSemester: (semester: string | null) => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();


  // The draft of the choice while the sheet is open — re-seeded
  // from the applied values on every open, so a dismissal
  // without "Taikyti" leaves the screen's filters untouched
  const [draftGroup, setDraftGroup] = useState<string | null>(selectedGroup);
  const [draftSemester, setDraftSemester] = useState<string | null>(selectedSemester);
  useEffect(() => {
    if (visible) {
      setDraftGroup(selectedGroup);
      setDraftSemester(selectedSemester);
    }
  }, [visible, selectedGroup, selectedSemester]);


  // Only CHANGED values lift on apply — calling the semester
  // callback for an untouched draft would wrongly mark the
  // defaulted semester as the user's explicit choice
  const apply = () => {
    if (draftGroup !== selectedGroup) onSelectGroup(draftGroup);
    if (draftSemester !== selectedSemester) onSelectSemester(draftSemester);
    onClose();
  };


  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>

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

          <FlatList
            data={groups}
            keyExtractor={(group) => group}
            className="px-lg"
            style={{ maxHeight: 384 }}
            ListHeaderComponent={
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
            }
            renderItem={({ item }) => (
              <FilterOption
                label={item}
                selected={draftGroup === item}
                onPress={() => setDraftGroup(item)}
              />
            )}
            ListFooterComponent={
              <>
                <Text className="mb-2 mt-lg font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
                  {t('schedule.semesterLabel')}
                </Text>
                <FilterOption
                  label={t('schedule.allSemesters')}
                  selected={draftSemester === null}
                  onPress={() => setDraftSemester(null)}
                />
                {semesters.map((semester) => (
                  <FilterOption
                    key={semester}
                    label={semester}
                    selected={draftSemester === semester}
                    onPress={() => setDraftSemester(semester)}
                  />
                ))}
              </>
            }
          />

          <View className="flex-row gap-3 px-lg pb-xl pt-md">
            <View className="flex-1">
              <Button
                title={t('schedule.clearFilters')}
                variant="outline"
                onPress={() => {
                  setDraftGroup(null);
                  setDraftSemester(null);
                }}
              />
            </View>
            <View className="flex-1">
              <Button title={t('schedule.applyFilters')} onPress={apply} />
            </View>
          </View>

        </Pressable>
      </Pressable>

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

  const { t } = useTranslation();
  const { colors } = useTheme();


  // Opens on today's tab — weekends included, now that the
  // full week is reachable
  const [selectedDay, setSelectedDay] = useState(() => jsDayToApi(new Date().getDay()));


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
  // semester is defaulted so stale semesters stay out of view
  const semesterExplicitRef = useRef(false);


  // Only the newest request may write — rapid day taps fire
  // overlapping fetches, and a slow early response must not
  // put the wrong day on screen or flip the spinner off early
  const loadSeqRef = useRef(0);


  // Under "all groups" parallel lectures overlap by design, so
  // detection only runs while a group filter is active
  const conflictIds = useScheduleConflicts(lessons, selectedGroup !== null);


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
        void cacheSet(key, resp);
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
        const cached = await cacheGet<ScheduleResponse>(key, SCHEDULE_CACHE_MAX_AGE);
        if (seq !== loadSeqRef.current) return;
        if (cached) {
          setLessons(cached.data.lessons);
          setCachedAt(cached.cachedAt);
          setError(false);
        } else {
          setLessons([]);
          setCachedAt(null);
          setError(true);
        }
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    },
    [t],
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
            if (typeof prefs.semester === 'string' && prefs.semester) {
              setSelectedSemester(prefs.semester);
              semesterExplicitRef.current = true;
            } else if (prefs.semesterExplicit === true) {
              // A recorded, deliberate "all semesters"
              semesterExplicitRef.current = true;
            }
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
    void cacheSweepPrefix('schedule:', SCHEDULE_CACHE_MAX_AGE);
  }, []);


  // Persist the choice — but never before the initial read, or
  // the mount defaults would wipe the stored prefs
  useEffect(() => {
    if (!prefsLoaded) return;
    const prefs: SchedulePrefs = {
      group: selectedGroup,
      semester: selectedSemester,
      semesterExplicit: semesterExplicitRef.current,
    };
    AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefsLoaded, selectedGroup, selectedSemester]);


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
      semesterExplicitRef.current = false;
      setSelectedSemester(null);
    }
  }, [prefsLoaded, filtersFetched, groups, semesters, selectedGroup, selectedSemester]);


  // No stored semester choice: default to the newest label the
  // 'YYYY-P/R' shape parses to, so lectures from stale
  // semesters never interleave into one day. "All semesters"
  // stays an explicit opt-in through the filter modal.
  useEffect(() => {
    if (!prefsLoaded || !filtersFetched) return;
    if (semesterExplicitRef.current || selectedSemester !== null) return;
    const newest = newestSemester(semesters);
    if (newest) setSelectedSemester(newest);
  }, [prefsLoaded, filtersFetched, semesters, selectedSemester]);


  // (Re)load whenever the visible day or the filters change —
  // gated on prefsLoaded so the persisted filter applies to
  // the very first fetch instead of arriving one fetch late
  useEffect(() => {
    if (!prefsLoaded) return;
    void loadLessons(selectedDay, selectedGroup, selectedSemester, true);
  }, [prefsLoaded, selectedDay, selectedGroup, selectedSemester, loadLessons]);


  // Connectivity returning refetches the visible day (and the
  // filter lists if they never arrived); useNetworkRestore
  // always runs the latest closure, so no refs are needed
  useNetworkRestore(() => {
    void loadLessons(selectedDay, selectedGroup, selectedSemester, lessons.length === 0);
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


  // Any choice made in the modal — a semester or "all" — is
  // the user's own and must survive as such
  const handleSelectSemester = (semester: string | null) => {
    semesterExplicitRef.current = true;
    setSelectedSemester(semester);
  };


  // Pull-to-refresh: silent reload, first-load spinner hidden
  const onRefresh = async () => {
    setRefreshing(true);
    await loadLessons(selectedDay, selectedGroup, selectedSemester, false);
    setRefreshing(false);
  };


  // ErrorState's button — full reload with the spinner
  const retry = () => {
    void loadLessons(selectedDay, selectedGroup, selectedSemester, true);
  };


  // "IT-3 · 5" summary of the active choice; doubles as the
  // empty-state hint so an over-filtered day explains itself
  const activeFilterCount = (selectedGroup ? 1 : 0) + (selectedSemester ? 1 : 0);
  const filterSummary = [selectedGroup ?? t('schedule.allGroups'), selectedSemester]
    .filter(Boolean)
    .join(' · ');


  // Stable renderItem so the memoized cards only re-render
  // when their own lesson or conflict flag changes
  const renderLesson = useCallback(
    ({ item }: { item: ScheduleLesson }) => (
      <LessonCard lesson={item} conflict={conflictIds.has(item.id)} />
    ),
    [conflictIds],
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
          <DayStepper
            label={t(`schedule.${DAY_SHORT_KEYS[selectedDay]}`)}
            fullLabel={t(`schedule.${DAY_FULL_KEYS[selectedDay]}`)}
            onPrev={() => changeDay(-1)}
            onNext={() => changeDay(1)}
          />
        }
      />

      <FilterBar
        label={filterSummary}
        activeCount={activeFilterCount}
        onPress={() => setModalVisible(true)}
      />

      <DayTabs days={visibleDays} selectedDay={selectedDay} onSelect={setSelectedDay} />

      {cachedAt !== null && <CachedBanner cachedAt={cachedAt} />}
      {!loading && conflictIds.size > 0 && <ConflictBanner count={conflictIds.size} />}

      {/* Body — spinner, error with retry, empty day, or the
          lesson list; error and empty are distinct states */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      ) : error ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <ErrorState message={t('schedule.loadError')} onRetry={retry} />
        </ScrollView>
      ) : lessons.length === 0 ? (
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
      )}

      <FilterModal
        visible={modalVisible}
        groups={groups}
        semesters={semesters}
        selectedGroup={selectedGroup}
        selectedSemester={selectedSemester}
        onSelectGroup={setSelectedGroup}
        onSelectSemester={handleSelectSemester}
        onClose={() => setModalVisible(false)}
      />

    </Screen>
  );
}
