// -----------------------------------------------------------
//  [*] Tabs — Schedule
//
//  The faculty timetable, one weekday at a time: a Mon–Fri
//  tab bar plus header chevrons that cycle through weekdays
//  only (the API numbers days 0=Monday…6=Sunday, but weekend
//  days are never offered — a weekend visitor lands on
//  Monday). The group/semester filter persists across
//  launches and is re-validated against the server's filter
//  lists, so a group removed server-side can't strand the
//  screen on an eternally empty week.
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
import { cacheGet, cacheKeySchedule, cacheSet, SCHEDULE_CACHE_MAX_AGE } from '@/services/cache';

// Filter choice persistence across launches
import AsyncStorage from '@react-native-async-storage/async-storage';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';


// AsyncStorage key for the persisted group/semester choice
const SCHEDULE_PREFS_KEY = 'schedule_prefs';

// The tab bar shows weekdays only; internal day numbers stay
// the API's full 0–6 range
const WEEKDAYS = [0, 1, 2, 3, 4];

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

// Shape persisted under SCHEDULE_PREFS_KEY
interface SchedulePrefs {
  group: string | null;
  semester: string | null;
}

// JS Date.getDay() counts 0=Sunday; the API counts 0=Monday
const jsDayToApi = (jsDay: number): number => (jsDay === 0 ? 6 : jsDay - 1);








// -----------------------------------------------------------
// DayStepper
// -----------------------------------------------------------
//
// The header-right day switcher: back/forward chevrons around
// the full weekday name. The chevron hit areas are 32×44 plus
// hitSlop, clearing the 44pt target on both axes.
//
// Used by:
//   - ScheduleScreen (below) — Header right slot
// -----------------------------------------------------------

function DayStepper({
  label,
  onPrev,
  onNext,
}: {
  label: string;
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

      <Text className="mx-1 font-raleway-bold text-base text-on-brand" numberOfLines={1}>
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
// The Mon–Fri quick tab bar under the filter bar. Tabs are
// announced by their full day name while showing the short
// form; the active tab carries a brand underline.
//
// Used by:
//   - ScheduleScreen (below)
// -----------------------------------------------------------

function DayTabs({
  selectedDay,
  onSelect,
}: {
  selectedDay: number;
  onSelect: (day: number) => void;
}) {

  const { t } = useTranslation();


  return (
    <View className="flex-row border-b border-line bg-surface">
      {WEEKDAYS.map((day) => {
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
              <Text className={`text-sm ${active ? 'font-raleway-bold text-brand' : 'font-raleway-medium text-ink-soft'}`}>
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
    <View
      accessibilityRole="alert"
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
//
// Used by:
//   - ScheduleScreen (below) — FlatList renderItem
// -----------------------------------------------------------

function LessonCard({ lesson, conflict }: { lesson: ScheduleLesson; conflict: boolean }) {

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
// Bottom-sheet picker for group and semester. Selection
// applies immediately; "Taikyti" only closes the sheet and
// "Valyti" clears both filters without closing. Groups are
// the unbounded list (dozens at faculty scale) so they get
// the virtualized FlatList; the bounded handful of semesters
// rides in its footer.
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
                  selected={selectedGroup === null}
                  onPress={() => onSelectGroup(null)}
                />
              </>
            }
            renderItem={({ item }) => (
              <FilterOption
                label={item}
                selected={selectedGroup === item}
                onPress={() => onSelectGroup(item)}
              />
            )}
            ListFooterComponent={
              <>
                <Text className="mb-2 mt-lg font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
                  {t('schedule.semesterLabel')}
                </Text>
                <FilterOption
                  label={t('schedule.allSemesters')}
                  selected={selectedSemester === null}
                  onPress={() => onSelectSemester(null)}
                />
                {semesters.map((semester) => (
                  <FilterOption
                    key={semester}
                    label={semester}
                    selected={selectedSemester === semester}
                    onPress={() => onSelectSemester(semester)}
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
                  onSelectGroup(null);
                  onSelectSemester(null);
                }}
              />
            </View>
            <View className="flex-1">
              <Button title={t('schedule.applyFilters')} onPress={onClose} />
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


  // Opens on today's tab; weekend visitors get Monday — the
  // tab bar is Mon–Fri and the coming week is what they plan
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = jsDayToApi(new Date().getDay());
    return today > 4 ? 0 : today;
  });


  // Lesson list, its three data states, and the cache age
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);


  // Server-provided filter options + the user's choice;
  // filtersFetched separates "lists arrived" from "fetch
  // failed", so validation never runs against empty lists
  const [groups, setGroups] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [filtersFetched, setFiltersFetched] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);


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
    [],
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
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(SCHEDULE_PREFS_KEY);
        if (raw) {
          const prefs = JSON.parse(raw) as SchedulePrefs;
          if (prefs.group) setSelectedGroup(prefs.group);
          if (prefs.semester) setSelectedSemester(prefs.semester);
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


  // Persist the choice — but never before the initial read, or
  // the mount defaults would wipe the stored prefs
  useEffect(() => {
    if (!prefsLoaded) return;
    const prefs: SchedulePrefs = { group: selectedGroup, semester: selectedSemester };
    AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefsLoaded, selectedGroup, selectedSemester]);


  // Persisted filters can outlive the server's lists (a group
  // renamed or removed) — once real lists arrive, a stale
  // choice is cleared instead of filtering every day to empty
  useEffect(() => {
    if (!prefsLoaded || !filtersFetched) return;
    if (selectedGroup !== null && !groups.includes(selectedGroup)) setSelectedGroup(null);
    if (selectedSemester !== null && !semesters.includes(selectedSemester)) setSelectedSemester(null);
  }, [prefsLoaded, filtersFetched, groups, semesters, selectedGroup, selectedSemester]);


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


  // Chevrons cycle Mon–Fri only, skipping the weekend; the +5
  // keeps the modulo positive when stepping back from Monday
  const changeDay = (delta: number) => {
    setSelectedDay((prev) => (prev + delta + 5) % 5);
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
            label={t(`schedule.${DAY_FULL_KEYS[selectedDay]}`)}
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

      <DayTabs selectedDay={selectedDay} onSelect={setSelectedDay} />

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
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <LessonCard lesson={item} conflict={conflictIds.has(item.id)} />
          )}
        />
      )}

      <FilterModal
        visible={modalVisible}
        groups={groups}
        semesters={semesters}
        selectedGroup={selectedGroup}
        selectedSemester={selectedSemester}
        onSelectGroup={setSelectedGroup}
        onSelectSemester={setSelectedSemester}
        onClose={() => setModalVisible(false)}
      />

    </Screen>
  );
}
