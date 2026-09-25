// -----------------------------------------------------------
//  [*] Tabs — Schedule
//
//  The faculty timetable on REAL dates: a weekStart cursor
//  (the ISO Monday of the visible week) under a quick tab bar
//  (Monday–Friday plus every weekend day the week's rows
//  fill — a group with Saturday lectures gets its Saturday
//  pill, KNF-174) and header chevrons that CROSS week
//  boundaries — stepping past Sunday lands on the next week's
//  Monday, before Monday on the previous week's Sunday, and
//  week mode steps whole weeks. The header always shows where
//  the cursor is, compactly enough that the screen's own
//  title stays whole on a 320 pt phone: the selected day's
//  name over its MM-DD in day modes, the ISO week number in
//  week mode (the week's date range rides the strip below,
//  which week mode leaves free of day tabs). While the cursor
//  is anywhere but today, a Today button sits at the strip's
//  end and snaps it home (KNF-175). The screen opens on
//  today's week and re-follows the calendar on
//  focus/foreground.
//
//  BOTH perspectives live off ONE dated fetch per (week,
//  scope) — GET /schedule/events rows, ScheduleLesson plus
//  date, lectureType and subgroups — feeding all three view
//  modes: the card list filters the week client-side by the
//  selected day, the day timeline and week grid run the same
//  rows through the engine pipeline. The scope is the
//  selected group, or ?teacher= with the lecturer's exact
//  display string — teacher rows arrive server-filtered, once
//  per group under the SAME event id, so a lecture shared by
//  several groups merges by id into one card listing every
//  group; double-bookings are washed via the engine's
//  person-scope conflicts. An alternating slot (Monday one
//  week, Tuesday the next) therefore shows only on its real
//  dates. Every card opens the detail sheet, like a grid cell
//  does; an exam (or a retake, an assessment, a
//  consultation) wears its badge on the card, the cell and
//  the sheet, and a split practical names its subgroup. On
//  TODAY's list of a group or a teacher, the lecture under
//  way says so and the next one counts down ("Po 25 min.")
//  off the kit's minute clock.
//
//  With no group of their own choosing — a first visit, a
//  fresh login — a student lands on the group their profile
//  names (studyGroup, matched to the timetable's groups with
//  case, spaces and hyphens folded: "isks 2" is ISKS-2), and
//  follows it while their profile changes; a group (or "all
//  groups") picked in the filter sheet is theirs and is never
//  overridden. A different account on the phone starts
//  fresh. The first fetch of a first visit waits for the
//  group list instead of flashing every group's lectures. The
//  schedule is also where a student SETS their group: picking
//  one in the sheet that their profile does not name offers a
//  "save as my group" tick, which writes the profile (the one
//  source the ID card and the assistant read too) and merges
//  the answer into the session; a guest's pick stays local.
//
//  The semester section of the filter sheet is NAVIGATION,
//  and says so ("Pereiti į semestrą"): its checked row is the
//  term of the week on screen (the scraper's own date rule,
//  so it can never disagree with a card), and applying
//  another term jumps to the week of that term's first REAL
//  event — the dates GET /schedule/filters publishes per term
//  — or, for today's term, back to today (KNF-037). Nothing
//  rides the wire and nothing is persisted: only the group or
//  teacher that actually narrows the fetch names itself in an
//  empty day's hint (KNF-173). A week outside every published
//  term reads "not published yet" instead of "no lectures".
//
//  That same group or teacher can be SUBSCRIBED to: a
//  calendar button joins the filter row whenever one is
//  applied (a guest's too) and opens CalendarSubscribeSheet —
//  the timetable as an iCalendar feed in the phone's own
//  calendar, kept current by the calendar app. It takes the
//  place the old "1" count pill held, so the row still fits a
//  320 pt phone.
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
//  design and flagging them would paint the list red — and
//  never pairs two disjoint subgroups of the group.
//
//  The timetable CHROME — day stepper and tabs, the Today
//  button, the view-mode segment, the conflict banner and the
//  lesson card — comes from @knf/timetableuikit, themed
//  through TimetableHost (which therefore wraps the WHOLE
//  screen) with this app's Ionicons handed in; only the
//  filter sheet and its bar stay app-built, since they encode
//  the group/teacher/semester policy.
//
//  Split into (root component last):
//
//    matchProfileGroup — a profile's studyGroup → a timetable group
//    termStartMonday — a term label → its nominal first Monday
//    termTarget      — a term label → the week/day a jump lands on
//    clockOf         — a wire "HH:MM" through the one clock
//    liveStatuses    — today's under-way / next-up rows
//    withRowIds      — (event × group) row identity
//    mergeEventRows  — shared-id rows → one row, groups joined
//    Separator       — hoisted lesson-list separator
//    LessonRow       — one tappable list card
//    FilterBar       — active-filter summary, opens the modal
//    CalendarButton  — the filter row's subscribe-in-calendar glyph
//    FilterOption    — one radio row of the filter picker
//    FilterModal     — perspective + group/teacher + term jump
//    ScheduleScreen  — the tab itself (default export)
// -----------------------------------------------------------

// Offline-cache strip shown when the list renders stale data
// The shipping gate — features.json decides whether this
// module renders or shows the not-ready screen
import withFeature from '@/components/FeatureGate';

import CachedBanner from '@/components/CachedBanner';

// The timetable module: engine math + kit views, wired through
// the host (theme/locale/clock), the view pipeline, the tap
// sheet and the human term names
import CalendarSubscribeSheet from '@/components/schedule/CalendarSubscribeSheet';
import LessonSheet, { type SheetLesson } from '@/components/schedule/LessonSheet';
import TimetableHost from '@/components/schedule/TimetableHost';
import TimetableView from '@/components/schedule/TimetableView';
import { termName } from '@/components/schedule/terms';
import {
  DAY_MS,
  conflictIds as engineConflictIds,
  dayIndexOf,
  forGroup,
  formatMinutes,
  isoWeekNumber,
  knfKind,
  mondayOf,
  normalizeKnf,
  parseISO,
  parseTimeToMinutes,
  termKeyOf,
  toISO,
  toTimetableEntry,
  todayISO,
  visibleDays as engineVisibleDays,
  type ConflictOptions,
  type KnfLesson,
  type TimetableEntry,
} from '@knf/timetableengine';
import {
  ConflictBanner,
  DayStepper,
  DayTabs,
  LessonCard,
  TodayButton,
  ViewModeSwitch,
  kindName,
  useNow,
  useTimetableLabels,
} from '@knf/timetableuikit';

// UI kit — chrome and the three data states
import { Button, EmptyState, ErrorState, Header, Input, LoadingSpinner, RefreshSpinner, Screen } from '@/components/ui';
import { TAB_BAR_CLEARANCE, useTabBarScroll } from '@/components/navigation/tabBarCollapse';

// JS-side colors for icons and the refresh tint
import { useTheme } from '@/hooks/useTheme';

// Conflict detection + refetch when connectivity returns
import { useDataEngine, useNetworkRestore } from '@knf/dataengine';
import { useScheduleConflicts } from '@/hooks/useScheduleConflicts';

// Timetable API + the offline cache it falls back to
import {
  fetchScheduleEvents,
  fetchScheduleFilters,
  updateProfile,
  type ScheduleCalendarScope,
  type ScheduleEventRow,
  type ScheduleEventsResponse,
  type ScheduleTerm,
} from '@/services/api';
import { cacheKeyScheduleEvents, SCHEDULE_CACHE_MAX_AGE } from '@/services/cacheKeys';
import { foldForSearch } from '@/services/format';

// Failed silent refreshes toast instead of touching the list;
// the session names the student's own group
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// Filter choice persistence across launches
import AsyncStorage from '@react-native-async-storage/async-storage';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from 'expo-router/js-tabs';
import { type ParamListBase } from 'expo-router/react-navigation';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

// Shrinks the filter sheet's list while the teacher search types
import useKeyboardVisible from '@/hooks/useKeyboardVisible';







// -----------------------------------------------------------
// SCHEDULE_PREFS_KEY
// -----------------------------------------------------------
//
// AsyncStorage key for the persisted group/teacher/view-mode
// choice.
//
// Used by:
//   - ScheduleScreen (below) — load/save of SchedulePrefs
//   - context/AuthContext.tsx — drops the entry on logout
// -----------------------------------------------------------

export const SCHEDULE_PREFS_KEY = 'schedule_prefs';

// The strip under the filter bar — the day tabs' own height
// (24 pt pills in 10 pt of padding), pinned so week mode,
// which shows the week's dates there instead, keeps the
// chrome steady across the mode switch. A plain number: the
// NativeWind rem scale would make a min-h class 12% short
const STRIP_HEIGHT = 44;

// How the timetable renders and through whose eyes
type ViewMode = 'list' | 'day' | 'week';
type Perspective = 'group' | 'teacher';

// Shape persisted under SCHEDULE_PREFS_KEY. groupExplicit
// records that the student picked the group (or "all groups")
// in the sheet — without it the group follows their profile.
// Older builds also wrote semester/semesterExplicit — read
// past, never written: the semester is navigation now, the
// week cursor its state
interface SchedulePrefs {
  group: string | null;
  groupExplicit?: boolean;
  viewMode?: ViewMode;
  perspective?: Perspective;
  teacher?: string | null;
}

// A list card's live status: the lecture under way, or the
// next one with its whole-minute countdown
type LiveStatus = { live: true } | { live: false; startsIn: number };

// How far ahead the next lecture counts down — beyond it the
// countdown is noise, not help
const NEXT_UP_WINDOW_MIN = 120;

// What the filter modal lifts on Apply — one object; term is
// the semester to JUMP to, set only when the user picked a
// term other than the one on screen; saveAsMine asks for the
// picked group to become the profile's
interface FilterChoice {
  group: string | null;
  term: string | null;
  perspective: Perspective;
  teacher: string | null;
  saveAsMine: boolean;
}







// -----------------------------------------------------------
// matchProfileGroup
// -----------------------------------------------------------
//
// The timetable group a profile's free-text studyGroup names:
// the exact string first, then a fold that ignores case,
// diacritics, spaces and hyphens ("isks 2", "ISKS2" and
// "ISKS-2" are one group). null for no profile group or one
// the timetable does not list — a guess would put a student
// on someone else's lectures.
//
// Used by:
//   - ScheduleScreen (below) — the profile default
// -----------------------------------------------------------

function matchProfileGroup(profile: string | null | undefined, groups: readonly string[]): string | null {
  const fold = (value: string) => foldForSearch(value).replace(/[^\p{L}\p{N}]/gu, '');
  const wanted = fold(profile ?? '');
  if (!wanted) return null;
  return groups.find((group) => group === profile) ?? groups.find((group) => fold(group) === wanted) ?? null;
}







// -----------------------------------------------------------
// termStartMonday
// -----------------------------------------------------------
//
// A 'YYYY-R/P' label → the ISO Monday its lectures nominally
// start on: the first Monday of September YYYY for autumn, of
// February YYYY+1 for spring (the label year is the academic
// year's first calendar year). The FALLBACK of the semester
// jump only — a server that dates its terms (termTarget)
// always wins, since a term opening mid-week in August or a
// January exam session lives nowhere near these Mondays. A
// label outside that shape — a stray sheet name — returns
// null and the jump stays put.
//
// Used by:
//   - termTarget (below)
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
// termTarget
// -----------------------------------------------------------
//
// Where the semester jump lands for a label: the week holding
// the term's FIRST real event, on that event's weekday, when
// the filters response dated the term — the 2026 autumn opens
// on Tuesday 1 September, a week the nominal Monday skipped,
// and the 2026 spring label holds only a January exam
// session. Without server dates, termStartMonday's nominal
// Monday. null when neither can place the label.
//
// Used by:
//   - ScheduleScreen (below) — applyFilters' semester jump
// -----------------------------------------------------------

function termTarget(label: string, terms: readonly ScheduleTerm[]): { weekStart: string; day: number } | null {
  const dated = terms.find((term) => term.semester === label);
  if (dated && /^\d{4}-\d{2}-\d{2}$/.test(dated.from)) {
    return { weekStart: mondayOf(dated.from), day: (new Date(parseISO(dated.from)).getUTCDay() + 6) % 7 };
  }
  const monday = termStartMonday(label);
  return monday ? { weekStart: monday, day: 0 } : null;
}







// -----------------------------------------------------------
// clockOf
// -----------------------------------------------------------
//
// A wire "HH:MM" through the engine's formatMinutes — the one
// clock the grid, the list and the detail sheet all print
// (KNF-184). An unpadded "9:00" is padded first, exactly as
// the adapter pads it on its way into the grid; a value the
// strict parser still refuses is shown as it came rather than
// hidden.
//
// Used by:
//   - LessonRow (below) — the card's time range
// -----------------------------------------------------------

function clockOf(raw: string): string {
  const trimmed = raw.trim();
  const minutes = parseTimeToMinutes(/^\d:\d\d$/.test(trimmed) ? `0${trimmed}` : trimmed);
  return minutes === null ? raw : formatMinutes(minutes);
}







// -----------------------------------------------------------
// liveStatuses
// -----------------------------------------------------------
//
// Today's rows against the minute on the wall clock: every
// row under way now is `live`; the earliest start still ahead
// — every row sharing it — counts down, while it is within
// NEXT_UP_WINDOW_MIN. Keyed by the caller's row key (the list
// keys (event × group), the teacher's cards the event id); a
// row whose times do not parse stays silent.
//
// Used by:
//   - ScheduleScreen (below) — the list cards' status chips
// -----------------------------------------------------------

function liveStatuses(
  rows: readonly ScheduleEventRow[],
  nowMin: number,
  keyOf: (row: ScheduleEventRow) => string,
): Map<string, LiveStatus> {
  const out = new Map<string, LiveStatus>();
  const minutes = (raw: string) => parseTimeToMinutes(/^\d:\d\d$/.test(raw.trim()) ? `0${raw.trim()}` : raw);
  let nextStart = Infinity;
  let nextKeys: string[] = [];
  for (const row of rows) {
    const start = minutes(row.timeStart);
    const end = minutes(row.timeEnd);
    if (start === null || end === null) continue;
    if (start <= nowMin && nowMin < end) {
      out.set(keyOf(row), { live: true });
    } else if (start > nowMin && start < nextStart) {
      nextStart = start;
      nextKeys = [keyOf(row)];
    } else if (start === nextStart) {
      nextKeys.push(keyOf(row));
    }
  }
  if (nextStart - nowMin <= NEXT_UP_WINDOW_MIN) {
    for (const key of nextKeys) out.set(key, { live: false, startsIn: nextStart - nowMin });
  }
  return out;
}







// -----------------------------------------------------------
// withRowIds
// -----------------------------------------------------------
//
// Re-keys wire rows on their TRUE identity, (event × group):
// under "all groups" a lecture shared by several groups
// repeats with the same event id, and the engine's entries —
// which become React keys in the kit's grids — must never
// collide. The teacher scope skips this: it merges shared
// rows into one first.
//
// Used by:
//   - ScheduleScreen (below) — the group scope's normalize
//     inputs (shown week and both pager neighbours)
// -----------------------------------------------------------

function withRowIds(rows: ScheduleEventRow[]): ScheduleEventRow[] {
  return rows.map((row) => ({ ...row, id: `${row.id}:${row.group}` }));
}







// -----------------------------------------------------------
// mergeEventRows
// -----------------------------------------------------------
//
// The teacher scope's wire ships one row PER GROUP for a
// lecture shared by several — all under the SAME event id.
// One card per physical lecture: rows sharing an id collapse
// into the first one, their group labels joined sorted
// ("FT-1, ISKS-1"), so the card footnote and the grid cell
// name every cohort. Order is the wire's (date, start time),
// which the first-seen row keeps.
//
// Used by:
//   - ScheduleScreen (below) — the teacher perspective's rows
//     before normalizing (cards, timeline, grid, pager pages)
// -----------------------------------------------------------

function mergeEventRows(rows: readonly ScheduleEventRow[]): ScheduleEventRow[] {
  const merged = new Map<string, { row: ScheduleEventRow; groups: Set<string> }>();
  for (const row of rows) {
    const held = merged.get(row.id);
    if (held) held.groups.add(row.group);
    else merged.set(row.id, { row, groups: new Set([row.group]) });
  }
  return [...merged.values()].map(({ row, groups }) => ({
    ...row,
    group: [...groups].sort((a, b) => a.localeCompare(b)).join(', '),
  }));
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
// LessonRow
// -----------------------------------------------------------
//
// One list card, tappable like a grid cell: a press opens the
// detail sheet (the card clips a long title at two lines and
// a co-taught teacher line at one — the sheet holds the full
// story). The wire row meets the kit card's NEUTRAL shape
// here — the one mapping point where a ScheduleEventRow may
// touch the kit — with the time through the one clock, the
// kind and subgroups from the dated wire, and the group as
// the footnote (the term is the same for every card of a
// week; the sheet names it). The whole card is ONE screen-
// reader element with a composed sentence, kind and clash
// included. Rendered INSIDE TimetableHost, so the kit labels
// it reads speak the app's language. The Pressable keeps a
// plain style — its pressed dim rides the child render
// function (a Pressable style function is dropped on device).
//
// Used by:
//   - ScheduleScreen (below) — both perspectives' lists
// -----------------------------------------------------------

function LessonRow({
  lesson,
  conflict,
  status,
  onPress,
}: {
  lesson: ScheduleEventRow;
  conflict: boolean;
  // Today's under-way / next-up mark, when the screen ticks
  status?: LiveStatus;
  onPress: (lesson: ScheduleEventRow) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const labels = useTimetableLabels();


  const kind = knfKind(lesson.lectureType);
  const subgroups = lesson.subgroups ?? [];
  const start = clockOf(lesson.timeStart);
  const end = clockOf(lesson.timeEnd);
  const statusLabel = status ? (status.live ? labels.inProgress : labels.startsIn(status.startsIn)) : null;
  const sentence = [
    statusLabel,
    lesson.title,
    kindName(labels, kind, lesson.lectureType),
    `${start} – ${end}`,
    lesson.room,
    lesson.teacher,
    lesson.group,
    subgroups.length > 0 ? labels.subgroups(subgroups) : null,
    conflict ? labels.conflict : null,
  ]
    .filter(Boolean)
    .join(', ');


  return (
    <Pressable
      onPress={() => onPress(lesson)}
      accessibilityRole="button"
      accessibilityLabel={sentence}
      accessibilityHint={t('schedule.openDetailsHint')}
    >
      {({ pressed }) => (
        <View style={{ opacity: pressed ? 0.85 : 1 }}>
          <LessonCard
            title={lesson.title}
            person={lesson.teacher}
            room={lesson.room}
            timeStart={start}
            timeEnd={end}
            footnote={lesson.group}
            kind={kind}
            subgroups={subgroups}
            conflict={conflict}
            conflictIcon={<Ionicons name="alert-circle" size={14} color={colors.danger} />}
            timeIcon={<Ionicons name="time-outline" size={14} color={conflict ? colors.danger : colors.brand} />}
            status={statusLabel ? { label: statusLabel, live: !!status?.live } : undefined}
          />
        </View>
      )}
    </Pressable>
  );
}







// -----------------------------------------------------------
// FilterBar
// -----------------------------------------------------------
//
// One-row summary of the active choice — the group or a
// teacher's name. Tapping anywhere opens the FilterModal. The
// border and ground live on the parent row it shares with
// CalendarButton and ViewModeSwitch; with the calendar button
// right behind it (`trailing`), its own right padding shrinks
// to 4 pt — the glyph's box brings its own air — which keeps
// a group label like "VDL-MRK-1" whole at 320 pt. The 44 pt
// floor is a plain style number: NativeWind's native rem is
// 14 px, so py-3 alone lands the row near 40 pt on a phone.
//
// Used by:
//   - ScheduleScreen (below)
// -----------------------------------------------------------

function FilterBar({
  label,
  trailing,
  onPress,
}: {
  label: string;
  // A CalendarButton follows in the row
  trailing: boolean;
  onPress: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('schedule.filterTitle')}
      className="flex-1 flex-row items-center justify-between pl-md py-3 active:bg-surface-soft"
      style={{ minHeight: 44, paddingRight: trailing ? 4 : 16 }}
    >

      <View className="flex-1 flex-row items-center">
        <Ionicons name="filter-outline" size={16} color={colors.brand} />
        <Text className="ml-2 font-raleway-medium text-sm text-ink" numberOfLines={1}>
          {label}
        </Text>
      </View>

      <View className="ml-2">
        <Ionicons name="chevron-down" size={16} color={colors.inkFaint} />
      </View>

    </Pressable>
  );
}







// -----------------------------------------------------------
// CalendarButton
// -----------------------------------------------------------
//
// The filter row's calendar glyph, between the summary and
// the view-mode segment — rendered only while a group or a
// teacher is applied, the scopes a calendar feed exists for —
// opening the subscription sheet. 40 pt wide with a 2 pt hit
// slop each side and the row's 44 pt height, as plain style
// numbers (NativeWind's native rem is 14 px); pressed
// feedback rides an active: class, never a style function.
//
// Used by:
//   - ScheduleScreen (below)
// -----------------------------------------------------------

function CalendarButton({ onPress }: { onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('schedule.subscribeAction')}
      hitSlop={{ left: 2, right: 2 }}
      className="items-center justify-center active:opacity-70"
      style={{ width: 40, height: 44 }}
      testID="schedule-calendar-button"
    >
      <Ionicons name="calendar-outline" size={20} color={colors.brand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// FilterOption
// -----------------------------------------------------------
//
// One radio row of the picker: brand-soft wash + brand text
// when selected, an optional quieter second line (a term's
// dates). A 44 pt minimum height as a plain number — py-3 is
// 10.5 px at NativeWind's native rem, short of the floor.
//
// Used by:
//   - FilterModal (below) — "all" rows, groups, teachers, terms
// -----------------------------------------------------------

function FilterOption({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      className={`mb-1 justify-center rounded-lg px-md py-3 ${selected ? 'bg-brand-soft' : ''}`}
      style={{ minHeight: 44 }}
    >
      <Text className={selected ? 'font-raleway-bold text-base text-brand-text' : 'font-raleway text-base text-ink'}>
        {label}
      </Text>
      {hint ? <Text className="mt-0.5 font-raleway text-xs text-ink-soft">{hint}</Text> : null}
    </Pressable>
  );
}







// -----------------------------------------------------------
// FilterModal
// -----------------------------------------------------------
//
// Bottom-sheet picker: a perspective segment (group timetable
// or a teacher's), then the matching list — groups, or the
// searchable teacher roster — with the term jump in the
// footer of both. Taps edit a LOCAL draft and "Atlikta" lifts
// everything in ONE FilterChoice — one schedule fetch per
// visit instead of one behind the sheet for every candidate
// tapped; "Valyti" clears the group/teacher branch without
// closing, and a scrim/back dismissal discards an unapplied
// draft. The teacher roster is the filters response's
// `teachers` list, fetched once at mount alongside groups and
// terms — the search folds both sides, so 'birz' finds
// 'Biržietienė'.
//
// The term section is titled as the jump it is: its rows are
// the published terms in human words ("2026 m. ruduo") with
// the dates they span, the checked one is the term of the
// week on screen, and only a DIFFERENT pick rides the choice
// as a jump.
//
// A signed-in student whose draft group is not the one their
// profile names sees a "save as my group" tick above the
// buttons — unticked, never a dialog; a guest (myGroup
// undefined) never does.
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
  terms,
  teachers,
  selectedGroup,
  visibleTerm,
  perspective,
  selectedTeacher,
  myGroup,
  onApply,
  onClose,
}: {
  visible: boolean;
  groups: string[];
  semesters: string[];
  terms: readonly ScheduleTerm[];
  teachers: string[];
  selectedGroup: string | null;
  // The term of the week on screen — the checked row
  visibleTerm: string;
  perspective: Perspective;
  selectedTeacher: string | null;
  // The profile's group as the timetable knows it — null for
  // a student without one, undefined for a guest (no offer)
  myGroup: string | null | undefined;
  onApply: (choice: FilterChoice) => void;
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  // The draft of the choice while the sheet is open — re-seeded
  // from the applied values on every open, so a dismissal
  // without "Atlikta" leaves the screen's filters untouched
  const [draftGroup, setDraftGroup] = useState<string | null>(selectedGroup);
  const [draftTerm, setDraftTerm] = useState<string>(visibleTerm);
  const [draftPerspective, setDraftPerspective] = useState<Perspective>(perspective);
  const [draftTeacher, setDraftTeacher] = useState<string | null>(selectedTeacher);
  const [teacherQuery, setTeacherQuery] = useState('');
  // The "save as my group" tick — always starts unticked
  const [saveAsMine, setSaveAsMine] = useState(false);
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the sheet opening is the event: drafts re-seed from the live filters at that moment, never continuously
      setDraftGroup(selectedGroup);
      setDraftTerm(visibleTerm);
      setDraftPerspective(perspective);
      setDraftTeacher(selectedTeacher);
      setTeacherQuery('');
      setSaveAsMine(false);
    }
    // Re-seed only on open — the applied values cannot change
    // while the sheet is up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);


  const teacherMode = draftPerspective === 'teacher';
  const keyboardUp = useKeyboardVisible();

  // The offer: a signed-in student, a real group drafted, and
  // not the one the profile already names
  const offerSave = myGroup !== undefined && !teacherMode && draftGroup !== null && draftGroup !== myGroup;

  // Folded on both sides so 'birz' finds 'Biržietienė'
  const visibleTeachers = useMemo(() => {
    const query = foldForSearch(teacherQuery.trim());
    if (!query) return teachers;
    return teachers.filter((name) => foldForSearch(name).includes(query));
  }, [teachers, teacherQuery]);

  // A term's dates, when the server published them
  const spanOf = (label: string) => {
    const term = terms.find((candidate) => candidate.semester === label);
    return term ? `${term.from} – ${term.to}` : undefined;
  };


  // Everything lifts in one object; a term rides it only when
  // it differs from the week on screen — re-picking where you
  // already are is no jump
  const apply = () => {
    onApply({
      group: draftGroup,
      term: draftTerm !== visibleTerm ? draftTerm : null,
      perspective: draftPerspective,
      teacher: draftPerspective === 'teacher' ? draftTeacher : null,
      saveAsMine: offerSave && saveAsMine,
    });
    onClose();
  };

  const clearBranch = () => {
    if (teacherMode) setDraftTeacher(null);
    else setDraftGroup(null);
  };


  const semesterFooter = semesters.length > 0 ? (
    <>
      <Text className="mb-2 mt-lg font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
        {t('schedule.jumpToSemester')}
      </Text>
      {semesters.map((semester) => (
        <FilterOption
          key={semester}
          label={termName(t, semester)}
          hint={spanOf(semester)}
          selected={draftTerm === semester}
          onPress={() => setDraftTerm(semester)}
        />
      ))}
    </>
  ) : null;


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
                    onPress={() => setDraftPerspective(candidate)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    className={`flex-1 items-center justify-center rounded-lg py-3 ${active ? 'bg-surface' : ''}`}
                    style={{ minHeight: 44 }}
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
                // Only a query that folded every name away says
                // so — a roster that never arrived (the silent
                // filters failure) stays as blank as the groups
                // list does
                teacherMode && teachers.length > 0 ? (
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

            {/* The one-tick offer to make the drafted group the
                profile's — a className Pressable with active:
                feedback only (a style function would drop the
                classes on device) */}
            {offerSave ? (
              <Pressable
                onPress={() => setSaveAsMine((on) => !on)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: saveAsMine }}
                accessibilityLabel={t('schedule.saveAsMyGroup')}
                accessibilityHint={t('schedule.saveAsMyGroupHint')}
                className="mx-lg mt-md flex-row items-center rounded-lg px-md py-3 active:bg-surface-soft"
              >
                <Ionicons
                  name={saveAsMine ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={saveAsMine ? colors.brand : colors.inkSoft}
                />
                <View className="ml-3 flex-1">
                  <Text className="font-raleway-medium text-sm text-ink">{t('schedule.saveAsMyGroup')}</Text>
                  <Text className="mt-0.5 font-raleway text-xs text-ink-soft">{t('schedule.saveAsMyGroupHint')}</Text>
                </View>
              </Pressable>
            ) : null}

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
// Owns ONE dataset: the DATED three-week window of events,
// fetched per (week, scope) where the scope is the selected
// group or the selected teacher — with a sequence guard,
// cache fallback and last-served key mark (a repeat need for
// the same scope refreshes silently instead of blanking a
// filled view; a hop onto an already-fetched neighbour week
// refreshes silently too, teacher hops included). Around it:
// the weekStart cursor the chevrons, the Today button and the
// semester jump move, the persisted prefs round trip with
// stale-choice validation, the focus/foreground today
// re-check, and the derived body branch table the render
// walks. With the teacher perspective on but no teacher
// picked nothing fetches — the pick-a-teacher prompt renders
// instead.
//
// Used by:
//   - expo-router — the /tabs/schedule tab
// -----------------------------------------------------------

function ScheduleScreen() {
  // The engine's cache — the offline copy of each day/group/semester
  const { cache } = useDataEngine();

  const { t } = useTranslation();
  const tabBarScroll = useTabBarScroll();
  // JS-side colors for the icons handed into the kit chrome
  const { colors } = useTheme();

  // The student's own group, and whose session this is —
  // trusted only once the session restore has settled
  const { user, hydrated, setUser } = useAuth();
  const profileGroup = user?.studyGroup ?? null;
  const accountId = hydrated ? (user?.id ?? null) : undefined;

  // The profile save merges over the LATEST user, never the
  // render closure that started it (see the ID card's save)
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // One profile save at a time — a second Done tap while the
  // first is in flight must not fire a duplicate PUT
  const savingGroupRef = useRef(false);


  // Opens on today's tab — weekends included, now that the
  // full week is reachable
  const [selectedDay, setSelectedDay] = useState(() => dayIndexOf(new Date()));

  // The ISO Monday of the visible week — the dated fetch, the
  // header captions and the semester time-jump all move on it
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayISO()));


  // How the timetable renders (persisted), and through whose
  // eyes: the group's — or one teacher's, across every group
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [perspective, setPerspective] = useState<Perspective>('group');
  const [teacher, setTeacher] = useState<string | null>(null);


  // A tapped timetable cell or list card opens the detail sheet
  const [sheetLesson, setSheetLesson] = useState<SheetLesson | null>(null);

  // The calendar button opens the subscription sheet with the
  // scope applied AT THAT MOMENT — captured, so nothing that
  // moves the filter underneath can swap the sheet's feed
  const [subscribeScope, setSubscribeScope] = useState<ScheduleCalendarScope | null>(null);


  // BOTH perspectives' dataset — ONE dated three-week window
  // of events per (weekStart, scope), feeding all three view
  // modes — its three data states, and the cache age
  const [events, setEvents] = useState<ScheduleEventRow[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [eventsCachedAt, setEventsCachedAt] = useState<number | null>(null);


  // Server-provided filter options + the user's choice;
  // filtersFetched separates "lists arrived" from "fetch
  // failed", and validation additionally trusts only NON-EMPTY
  // lists, so an empty catalogue can't wipe a stored choice.
  // teachers is the whole roster the filter modal searches —
  // exact ?teacher= values, no dataset fetch behind it; terms
  // date each published semester for the jump
  const [groups, setGroups] = useState<string[]>([]);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [terms, setTerms] = useState<ScheduleTerm[]>([]);
  const [teachers, setTeachers] = useState<string[]>([]);
  const [filtersFetched, setFiltersFetched] = useState(false);
  // The filters request ended either way — the profile default
  // stops waiting for a list that is not coming
  const [filtersSettled, setFiltersSettled] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // True once the student chose the group themselves (the
  // sheet, or a stored choice) — until then it follows the
  // profile. STATE, not a ref: the persistence effect writes it
  const [groupExplicit, setGroupExplicit] = useState(false);


  // Only the newest request may write — rapid day taps fire
  // overlapping fetches, and a slow early response must not
  // put the wrong week on screen or flip the spinner off early
  const eventsSeqRef = useRef(0);


  // The loader remembers which cache key it last SERVED — a
  // repeat need for the same data (a view-mode round trip)
  // refreshes silently instead of blanking a filled view
  // behind a spinner; a failed serve clears the mark so the
  // next need retries with the full spinner path
  const eventsKeyRef = useRef<string | null>(null);

  // What the dated rows on screen were fetched FOR — the load
  // effect reads it to tell a hop onto an already-rendered
  // neighbour week of the SAME scope (silent refresh) from a
  // real jump or a scope change (spinner)
  const eventsServedRef = useRef<{ weekStart: string; group: string | null; teacher: string | null } | null>(null);


  // One code path for first load / window change (spinner),
  // pull-to-refresh and network restore (silent): THREE dated
  // weeks — the shown one plus a week either side, so the week
  // pager has real neighbour pages to scroll onto and a day
  // step across the boundary lands on data it already holds —
  // cached per (weekStart, scope), where the scope is a group
  // OR a teacher (never both — the effect below derives it
  // from the perspective); a failure serves the offline cache
  // before admitting a distinct error state
  const loadEvents = useCallback(
    async (weekStartISO: string, group: string | null, teacher: string | null, spinner: boolean) => {
      const seq = ++eventsSeqRef.current;
      if (spinner) {
        setEventsLoading(true);
        setEventsError(false);
      }

      const key = cacheKeyScheduleEvents(weekStartISO, group, teacher);
      const fromISO = toISO(parseISO(weekStartISO) - 7 * DAY_MS);
      const untilISO = toISO(parseISO(weekStartISO) + 13 * DAY_MS);
      try {
        // Group scope keeps the three-argument call shape the
        // wire tests pin; only the teacher scope rides the
        // fourth parameter
        const resp = teacher
          ? await fetchScheduleEvents(fromISO, untilISO, undefined, teacher)
          : await fetchScheduleEvents(fromISO, untilISO, group ?? undefined);
        if (seq !== eventsSeqRef.current) return;
        setEvents(resp.events);
        setEventsCachedAt(null);
        setEventsError(false);
        eventsKeyRef.current = key;
        eventsServedRef.current = { weekStart: weekStartISO, group, teacher };
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
          eventsServedRef.current = { weekStart: weekStartISO, group, teacher };
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


  // Filter options fail silently — the modal simply offers
  // only the "all" rows (and an empty teacher roster) until
  // the network-restore retry below. terms is optional on the
  // wire: a response cached before the backend dated its
  // terms reads as "no dates", and the jump falls back to the
  // nominal Monday
  const loadFilters = useCallback(async () => {
    try {
      const resp = await fetchScheduleFilters();
      setGroups(resp.groups);
      setSemesters(resp.semesters);
      setTerms(Array.isArray(resp.terms) ? resp.terms : []);
      setTeachers(resp.teachers);
      setFiltersFetched(true);
    } catch {
      // keep whatever we had
    } finally {
      setFiltersSettled(true);
    }
  }, []);


  // Restore the persisted filter choice before the first fetch
  // — validating the shape instead of casting, so a corrupt or
  // foreign blob reads as "no filter" rather than poisoning
  // state with non-strings. An older build's semester fields
  // are read past: the semester is navigation now. A stored
  // group counts as the student's own choice when the blob
  // says so — or when an older build stored it, since those
  // stored only a group the student picked
  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(SCHEDULE_PREFS_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const prefs = parsed as Partial<SchedulePrefs>;
            const storedGroup = typeof prefs.group === 'string' && prefs.group ? prefs.group : null;
            if (storedGroup) setSelectedGroup(storedGroup);
            if (prefs.groupExplicit === true || (prefs.groupExplicit === undefined && storedGroup)) {
              setGroupExplicit(true);
            }
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


  // Browsing writes one cache row per week/scope combination
  // and most are never read again (cacheGet only evicts what
  // it is asked for) — sweep the expired ones once per mount
  // so the store cannot grow without bound
  useEffect(() => {
    void cache.sweepPrefix('schedule:', SCHEDULE_CACHE_MAX_AGE);
  }, [cache]);


  // Persist the choice — but never before the initial read, or
  // the mount defaults would wipe the stored prefs
  useEffect(() => {
    if (!prefsLoaded) return;
    const prefs: SchedulePrefs = {
      group: selectedGroup,
      groupExplicit,
      viewMode,
      perspective,
      teacher,
    };
    AsyncStorage.setItem(SCHEDULE_PREFS_KEY, JSON.stringify(prefs)).catch(() => {});
  }, [prefsLoaded, selectedGroup, groupExplicit, viewMode, perspective, teacher]);


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
      // A vanished choice is no choice — the profile may speak
      setGroupExplicit(false);
    }
  }, [prefsLoaded, filtersFetched, groups, selectedGroup]);


  // No group of the student's own choosing: the one their
  // profile names, once the timetable's list can confirm it —
  // and again whenever the profile changes. Never over a
  // choice made in the sheet
  useEffect(() => {
    if (!prefsLoaded || !filtersFetched || groupExplicit) return;
    const match = matchProfileGroup(profileGroup, groups);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the group list or the profile arriving is the event; the default follows it
    if (match !== selectedGroup) setSelectedGroup(match);
  }, [prefsLoaded, filtersFetched, groupExplicit, profileGroup, groups, selectedGroup]);


  // A different account on this phone (a login, a logout, a
  // switch) is a fresh visit: the previous student's picks
  // must not follow the next one. The first trusted reading —
  // the session restore settling — only records who is here
  const accountRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (accountId === undefined) return;
    if (accountRef.current === undefined || accountRef.current === accountId) {
      accountRef.current = accountId;
      return;
    }
    accountRef.current = accountId;
    // The session changing hands is the event: the filters
    // reset once, in response
    setSelectedGroup(null);
    setGroupExplicit(false);
    setPerspective('group');
    setTeacher(null);
  }, [accountId]);


  // The fetch scope BOTH perspectives share: exactly one of
  // group/teacher is set — the other perspective's remembered
  // choice never leaks onto the wire. No semester either: the
  // dates themselves say which term is on screen. With the
  // teacher perspective on but no teacher picked there is
  // nothing to fetch — teacherIdle parks the loader and the
  // body renders the pick-a-teacher prompt instead
  const scopeGroup = perspective === 'group' ? selectedGroup : null;
  const scopeTeacher = perspective === 'teacher' ? teacher : null;
  const teacherIdle = perspective === 'teacher' && teacher === null;

  // The profile default and whether the fetch must wait for
  // it. A first visit of a student with a profile group waits
  // for the group list (one request, fired at mount) — "all
  // groups" flashing up and being replaced a moment later is
  // exactly the confusion the default fixes; a failed list
  // ends the wait. Once the list is in, the fetch waits only
  // while the default effect above has yet to APPLY what the
  // list resolved (the list can land before the stored prefs
  // do, in the same commit as the first fetch). A stored
  // default — a later visit — never waits at all
  const resolvedDefault = filtersFetched ? matchProfileGroup(profileGroup, groups) : undefined;
  const defaultPending =
    perspective === 'group' &&
    !groupExplicit &&
    !!profileGroup &&
    (resolvedDefault === undefined ? selectedGroup === null && !filtersSettled : resolvedDefault !== selectedGroup);


  // (Re)load the dated week whenever the window or the scope
  // changes — gated on prefsLoaded so the persisted filter
  // applies to the very first fetch instead of arriving one
  // fetch late. ONE fetch serves all three view modes of
  // whichever perspective is on.
  useEffect(() => {
    if (!prefsLoaded || teacherIdle || defaultPending) return;
    // A hop onto a week the fetched window ALREADY covers (same
    // scope, one week either side — a settled pager swipe, a day
    // step across the boundary, Today from next door) refreshes
    // silently: the grid is fully drawn, and flashing a spinner
    // over it was the settle glitch. Real jumps — a new week, a
    // group or teacher change, a perspective flip — keep the
    // spinner
    const served = eventsServedRef.current;
    const adjacent =
      served !== null &&
      served.group === scopeGroup &&
      served.teacher === scopeTeacher &&
      Math.abs(parseISO(weekStart) - parseISO(served.weekStart)) <= 7 * DAY_MS;
    const spinner = !adjacent && eventsKeyRef.current !== cacheKeyScheduleEvents(weekStart, scopeGroup, scopeTeacher);
    void loadEvents(weekStart, scopeGroup, scopeTeacher, spinner);
  }, [prefsLoaded, teacherIdle, defaultPending, weekStart, scopeGroup, scopeTeacher, loadEvents]);


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


  // The teacher scope merges shared-id rows FIRST, so one
  // physical lecture is one row however many groups sit in it
  // — the group scope's rows are already one-per-lecture
  const shownWeekRows = useMemo(
    () => (perspective === 'teacher' ? mergeEventRows(weekBuckets[1]) : weekBuckets[1]),
    [perspective, weekBuckets],
  );

  // The shown week through the engine gate. The rows are
  // exactly the wire shape the adapter expects — only the open
  // index signature is missing, so assert (through unknown:
  // their extra date/lectureType fields land under that
  // signature, which defeats the direct cast).
  const datedNormalized = useMemo(
    () =>
      normalizeKnf(
        (perspective === 'teacher' ? shownWeekRows : withRowIds(shownWeekRows)) as unknown as KnfLesson[],
      ),
    [perspective, shownWeekRows],
  );

  // The pager's side pages, scoped like the middle one — the
  // group filter or the teacher merge; their skipped counts
  // stay silent, the notice describes the week actually on
  // screen
  const neighbourWeeks = useMemo(() => {
    const filter = (rows: ScheduleEventRow[]) => {
      if (perspective === 'teacher') return normalizeKnf(mergeEventRows(rows) as unknown as KnfLesson[]).entries;
      const normalized = normalizeKnf(withRowIds(rows) as unknown as KnfLesson[]).entries;
      return selectedGroup ? forGroup(normalized, selectedGroup) : normalized;
    };
    return { prev: filter(weekBuckets[0]), next: filter(weekBuckets[2]) };
  }, [weekBuckets, perspective, selectedGroup]);

  // Both perspectives read the same dated entries — teacher
  // rows arrived server-filtered by ?teacher=, so no client
  // filter re-runs here; the group filter is the belt over
  // the server's braces
  const perspectiveEntries = useMemo<TimetableEntry<KnfLesson>[]>(() => {
    if (perspective === 'teacher') return datedNormalized.entries;
    return selectedGroup ? forGroup(datedNormalized.entries, selectedGroup) : datedNormalized.entries;
  }, [datedNormalized, perspective, selectedGroup]);


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



  // The teacher perspective's card list: the shown week's
  // merged rows filtered to the selected day — the wire's
  // (date, start time) order survives the merge, so no
  // re-sort. The person-scope wash flags real double-bookings
  // while the engine's identity rule keeps a shared slot from
  // clashing with itself
  const teacherDayCards = useMemo(() => {
    if (viewMode !== 'list' || perspective !== 'teacher') return [];
    const ids = engineConflictIds(datedNormalized.entries, { scope: 'person' });
    return shownWeekRows
      .filter((row) => row.dayOfWeek === selectedDay)
      .map((row) => ({ conflict: ids.has(row.id), lesson: row }));
  }, [viewMode, perspective, shownWeekRows, datedNormalized, selectedDay]);


  // Connectivity returning refetches the current scope's
  // window (and the filter lists if they never arrived);
  // useNetworkRestore always runs the latest closure, so no
  // refs are needed
  useNetworkRestore(() => {
    if (!teacherIdle) void loadEvents(weekStart, scopeGroup, scopeTeacher, events === null);
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


  // Today's coordinates — the tab strip's outline marker, the
  // now-line gate and the Today button read them each render
  const todayDate = todayISO();
  const todayMonday = mondayOf(todayDate);
  const todayIndex = dayIndexOf(new Date());


  // Both cursors home to today — the Today button's press and
  // the tab re-press gesture below. Fresh Date reads inside
  // the handler, so a listener mounted before midnight still
  // lands on the new day
  const snapToToday = useCallback(() => {
    setWeekStart(mondayOf(todayISO()));
    setSelectedDay(dayIndexOf(new Date()));
  }, []);


  // The news-feed gesture, adopted here: tapping the Schedule
  // tab WHILE ALREADY ON IT snaps both cursors back to today —
  // switching in from another tab keeps whatever week and day
  // the user left (the Today button is the visible route)
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  useEffect(() => {
    return navigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      snapToToday();
    });
  }, [navigation, snapToToday]);


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
    setWeekStart(mondayOf(todayISO()));
  }, []);

  useFocusEffect(evaluateToday);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') evaluateToday();
    });
    return () => sub.remove();
  }, [evaluateToday]);


  // The modal lifts everything at once. A term that rides the
  // choice is a TIME JUMP in both perspectives: today's term
  // back to today, any other to the week of its first real
  // event (termTarget) — nothing rides the wire, the dates say
  // it all
  const applyFilters = (choice: FilterChoice) => {
    if (choice.term) {
      const target =
        choice.term === termKeyOf(todayISO())
          ? { weekStart: mondayOf(todayISO()), day: dayIndexOf(new Date()) }
          : termTarget(choice.term, terms);
      // An unparsable label has no start date — stay put
      if (target) {
        setWeekStart(target.weekStart);
        setSelectedDay(target.day);
      }
    }
    // A group the student changed in the sheet is theirs from
    // now on; leaving it untouched keeps the profile default
    if (choice.group !== selectedGroup) setGroupExplicit(true);
    setSelectedGroup(choice.group);
    setPerspective(choice.perspective);
    setTeacher(choice.teacher);
    if (choice.saveAsMine && choice.group) void saveMyGroup(choice.group);
  };


  // "Save as my group": the profile's study_group through the
  // shared wrapper, the answer MERGED into the session user
  // (the PUT omits fields the session carries — a replace
  // would drop them). A failure toasts and changes nothing —
  // the pick still filters the timetable locally
  const saveMyGroup = async (group: string) => {
    const owner = userRef.current;
    if (!owner || savingGroupRef.current) return;
    savingGroupRef.current = true;
    try {
      const updated = await updateProfile({ study_group: group });
      const latest = userRef.current;
      // Merged only into the SAME account's session — a logout
      // landing mid-save must not resurrect the old user
      if (latest && latest.id === owner.id) setUser({ ...latest, ...updated });
      showToast('success', t('schedule.myGroupSaved'));
    } catch {
      showToast('error', t('schedule.myGroupSaveError'));
    } finally {
      savingGroupRef.current = false;
    }
  };


  // Pull-to-refresh: silent reload of the current window,
  // first-load spinner hidden; nothing to reload while the
  // teacher prompt is up
  const onRefresh = async () => {
    setRefreshing(true);
    if (!teacherIdle) await loadEvents(weekStart, scopeGroup, scopeTeacher, false);
    setRefreshing(false);
  };


  // ErrorState's button — full reload with the spinner
  const retry = () => {
    if (!teacherIdle) void loadEvents(weekStart, scopeGroup, scopeTeacher, true);
  };


  // The applied scope — the group or the teacher, the only
  // choices that narrow the fetch: only they explain an empty
  // day (the semester is navigation and filters nothing —
  // KNF-173), tick today's list live, and have a calendar feed
  // to follow — and the filter bar's summary naming them
  const appliedScope: ScheduleCalendarScope | null = scopeGroup
    ? { group: scopeGroup }
    : scopeTeacher
      ? { teacher: scopeTeacher }
      : null;
  const filterSummary =
    perspective === 'teacher' ? (teacher ?? t('schedule.pickTeacher')) : (selectedGroup ?? t('schedule.allGroups'));


  // Which branch fills the body, and the dated states behind
  // it. While the teacher prompt is up the loader is parked,
  // so its states are leftovers of the OTHER scope — the
  // teacherIdle gates keep a stale spinner, error or cache
  // banner from covering the prompt
  const groupList = viewMode === 'list' && perspective === 'group';
  const bodyLoading = !teacherIdle && eventsLoading;
  const bodyError = !teacherIdle && eventsError;
  const bodyCachedAt = teacherIdle ? null : eventsCachedAt;
  const skippedCount = datedNormalized.skipped;
  const bannerCount =
    viewMode !== 'list' ? 0 : perspective === 'teacher' ? teacherDayCards.filter((card) => card.conflict).length : conflictIds.size;


  // The cursor's captions. Day modes date the selected day as
  // MM-DD under its name, week mode names the ISO week — the
  // header stays compact enough for the title to read whole
  // at 320 pt. The week's full range rides the strip in week
  // mode and the "not published" hint: it trims to MM-DD
  // except across New Year, where the trimmed form ("12-29 –
  // 01-04") would hide which years the week straddles
  const weekEnd = toISO(parseISO(weekStart) + 6 * DAY_MS);
  const selectedDateISO = toISO(parseISO(weekStart) + selectedDay * DAY_MS);
  const weekCaption = t('schedule.weekShort', { week: isoWeekNumber(weekStart) });
  const weekRange =
    weekStart.slice(0, 4) === weekEnd.slice(0, 4)
      ? `${weekStart.slice(5)} – ${weekEnd.slice(5)}`
      : `${weekStart} – ${weekEnd}`;

  // Away from today — the whole week in week mode, the day in
  // the day modes — the Today button shows
  const displaced = viewMode === 'week' ? weekStart !== todayMonday : selectedDateISO !== todayDate;

  // The term of the week on screen — the filter sheet's
  // checked row, by the scraper's own date rule
  const visibleTerm = termKeyOf(weekStart);


  // Today's list of a group or a teacher ticks: the kit's
  // clock re-renders the screen once a MINUTE, and only while
  // the list shows today (switched on, it reads the wall clock
  // at once — never a stale sample)
  const showLive = viewMode === 'list' && selectedDateISO === todayDate && appliedScope !== null;
  const clock = useNow({ enabled: showLive });
  const nowMin = showLive ? clock.minutes : -1;
  const liveByKey = useMemo(() => {
    if (nowMin < 0) return new Map<string, LiveStatus>();
    return perspective === 'teacher'
      ? liveStatuses(teacherDayCards.map((card) => card.lesson), nowMin, (row) => row.id)
      : liveStatuses(groupDayLessons, nowMin, (row) => `${row.id}:${row.group}`);
  }, [nowMin, perspective, teacherDayCards, groupDayLessons]);


  // The day tabs: Monday–Friday, every weekend day the shown
  // week's rows fill (a group with Saturday lectures gets its
  // Saturday pill before anyone lands there — KNF-174), and
  // the selected day, so the active tab is never missing
  const dayTabs = useMemo(() => {
    const days = new Set([...engineVisibleDays(datedNormalized.entries), selectedDay]);
    return [...days].sort((a, b) => a - b);
  }, [datedNormalized, selectedDay]);


  // Whether the visible week lies OUTSIDE the published
  // timetable altogether. With the terms the filters response
  // dates, published means inside [the first term's first
  // date, the last term's last date] — a group-less week
  // inside it (a practice period, a group that only runs in
  // autumn) is plain "no lectures". Without them (the filters
  // never arrived, or an old cached copy) the loaded
  // three-week window is all the screen knows: a week wholly
  // before its first row or after its last — or a window with
  // no rows anywhere — reads as "not published", while a week
  // with rows on either side of it (a break) keeps the plain
  // copy. ISO dates compare as strings
  const weekOutsidePublished = useMemo(() => {
    // The week's Sunday, derived here from the one real input
    const sunday = toISO(parseISO(weekStart) + 6 * DAY_MS);
    if (terms.length > 0) {
      const first = terms.reduce((min, term) => (term.from < min ? term.from : min), terms[0].from);
      const last = terms.reduce((max, term) => (term.to > max ? term.to : max), terms[0].to);
      return sunday < first || weekStart > last;
    }
    const rows = events ?? [];
    if (rows.length === 0) return true;
    let first = rows[0].date;
    let last = rows[0].date;
    for (const row of rows) {
      if (row.date < first) first = row.date;
      if (row.date > last) last = row.date;
    }
    return sunday < first || weekStart > last;
  }, [terms, events, weekStart]);


  // A list card's press: the wire row through the same adapter
  // the grid's entries came through, so the sheet reads one
  // shape (kind, subgroups, raw teacher and room strings)
  // whichever view it was opened from
  const openRow = useCallback((row: ScheduleEventRow) => {
    setSheetLesson(toTimetableEntry(row as unknown as KnfLesson));
  }, []);

  const renderLesson = useCallback(
    ({ item }: { item: ScheduleEventRow }) => (
      <LessonRow
        lesson={item}
        conflict={conflictIds.has(item.id)}
        status={liveByKey.get(`${item.id}:${item.group}`)}
        onPress={openRow}
      />
    ),
    [conflictIds, liveByKey, openRow],
  );

  const renderTeacherCard = useCallback(
    ({ item }: { item: { conflict: boolean; lesson: ScheduleEventRow } }) => (
      <LessonRow lesson={item.lesson} conflict={item.conflict} status={liveByKey.get(item.lesson.id)} onPress={openRow} />
    ),
    [liveByKey, openRow],
  );


  // One definition serves all three scrollable branches — the
  // list, the empty day and the error all pull-to-refresh
  const refreshControl = (
    <RefreshSpinner
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );

  // An empty day's two readings — outside the published
  // timetable, or a day with nothing on it (the hint names
  // the filter that narrowed it, when one did)
  const emptyDay = weekOutsidePublished ? (
    <EmptyState icon="calendar-clear-outline" title={t('schedule.weekNotPublished')} hint={weekRange} />
  ) : (
    <EmptyState
      icon="calendar-outline"
      title={t('schedule.noLectures')}
      hint={appliedScope ? filterSummary : undefined}
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
              subtitle={selectedDateISO.slice(5)}
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
          trailing={appliedScope !== null}
          onPress={() => setModalVisible(true)}
        />
        {appliedScope ? <CalendarButton onPress={() => setSubscribeScope(appliedScope)} /> : null}
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

      {/* The strip: the day tabs in the day modes, the week's
          dates in week mode — same height either way — with
          the Today button at its end while the cursor is away
          from today */}
      <View className="flex-row items-center border-b border-line bg-surface" style={{ minHeight: STRIP_HEIGHT }}>
        {viewMode !== 'week' ? (
          <View className="flex-1">
            <DayTabs
              days={dayTabs}
              selectedDay={selectedDay}
              // A foreign week has no today column to outline
              today={weekStart === todayMonday ? todayIndex : undefined}
              onSelect={setSelectedDay}
              bordered={false}
            />
          </View>
        ) : (
          <Text className="ml-md flex-1 font-raleway-medium text-sm text-ink-soft" numberOfLines={1}>
            {weekRange}
          </Text>
        )}
        {displaced ? (
          <View className="ml-2 mr-md">
            <TodayButton
              onPress={snapToToday}
              icon={<Ionicons name="today-outline" size={14} color={colors.brandText} />}
            />
          </View>
        ) : null}
      </View>

      {bodyCachedAt !== null && <CachedBanner cachedAt={bodyCachedAt} />}
      {!bodyLoading && bannerCount > 0 && (
        <ConflictBanner
          count={bannerCount}
          icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
        />
      )}

      {/* Body — spinner, error with retry, then the active
          path: the group card list, the teacher's card list,
          the pick-a-group / pick-a-teacher prompts (each with
          the button that opens the sheet), or the kit's
          timeline/grid; error and empty stay distinct states,
          and an empty week outside the published range is told
          apart from an empty day */}
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
            {emptyDay}
          </ScrollView>
        ) : (
          <FlatList
            data={groupDayLessons}
            // The row identity is (event × group): under "all
            // groups" a lecture shared by several groups repeats
            // with the SAME event id, one row per group
            keyExtractor={(item) => `${item.id}:${item.group}`}
            contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE }}
            onScroll={tabBarScroll.onScroll}
            onScrollBeginDrag={tabBarScroll.onScrollBeginDrag}
            onScrollEndDrag={tabBarScroll.onScrollEndDrag}
            scrollEventThrottle={tabBarScroll.scrollEventThrottle}
            refreshControl={refreshControl}
            ItemSeparatorComponent={Separator}
            renderItem={renderLesson}
          />
        )
      ) : perspective === 'group' && selectedGroup === null ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState
            icon="people-outline"
            title={t('schedule.pickGroup')}
            action={{ label: t('schedule.chooseGroupAction'), onPress: () => setModalVisible(true) }}
          />
        </ScrollView>
      ) : perspective === 'teacher' && teacher === null ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
          <EmptyState
            icon="person-outline"
            title={t('schedule.pickTeacher')}
            action={{ label: t('schedule.chooseTeacherAction'), onPress: () => setModalVisible(true) }}
          />
        </ScrollView>
      ) : viewMode === 'list' ? (
        teacherDayCards.length === 0 ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl}>
            {emptyDay}
          </ScrollView>
        ) : (
          <FlatList
            data={teacherDayCards}
            keyExtractor={(card) => card.lesson.id}
            contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_CLEARANCE }}
            onScroll={tabBarScroll.onScroll}
            onScrollBeginDrag={tabBarScroll.onScrollBeginDrag}
            onScrollEndDrag={tabBarScroll.onScrollEndDrag}
            scrollEventThrottle={tabBarScroll.scrollEventThrottle}
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
            // Both perspectives ride real dates now — the window
            // only owns "now" while it actually shows this week
            currentWeek={weekStart === todayMonday}
            weeks={neighbourWeeks}
            emptyLabel={weekOutsidePublished ? t('schedule.weekNotPublished') : undefined}
            onChangeDay={changeDay}
            onChangeWeek={changeWeek}
            onPressLesson={setSheetLesson}
          />
        </View>
      )}

      <FilterModal
        visible={modalVisible}
        groups={groups}
        semesters={semesters}
        terms={terms}
        teachers={teachers}
        selectedGroup={selectedGroup}
        visibleTerm={visibleTerm}
        perspective={perspective}
        selectedTeacher={teacher}
        myGroup={user ? matchProfileGroup(profileGroup, groups) : undefined}
        onApply={applyFilters}
        onClose={() => setModalVisible(false)}
      />

      <LessonSheet lesson={sheetLesson} onClose={() => setSheetLesson(null)} />

      <CalendarSubscribeSheet scope={subscribeScope} onClose={() => setSubscribeScope(null)} />

      </TimetableHost>
    </Screen>
  );
}


// The gate wraps the export, so a disabled module's tab
// screen never mounts even on a direct navigation
export default withFeature('schedule', ScheduleScreen);
