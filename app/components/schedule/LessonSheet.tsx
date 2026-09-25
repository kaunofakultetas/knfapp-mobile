// -----------------------------------------------------------
//  [*] LessonSheet — tap a lesson, read the details
//
//  The grid's cells truncate by design (a 30-minute sliver
//  shows one line) and a list card clips its title at two
//  lines, so a tap on either opens this bottom sheet with the
//  full story: title, the event's kind (an exam badged as
//  one), time, teacher, room, and group · subgroups · term.
//  Teacher names show the raw backend string when the lesson
//  came through the adapter — the academic titles the engine
//  folds out of `people` still belong on a detail card. A
//  teacher-perspective card merged across groups lists every
//  group chip it serves. The time is the engine's
//  formatMinutes of the entry's own minutes — the one clock
//  the grid and the list print too (KNF-184) — and the term
//  reads "2026 m. ruduo", never the raw '2026-R'.
//
//  Split into (root component last):
//
//    SheetLesson — the kit lesson plus the adapter's raw fields
//    str         — a raw field → a real string or null
//    DetailRow   — one icon + text row
//    KindBadge   — the filled chip an exam-like kind wears
//    LessonSheet — the sheet itself (default export)
//
//  Used by:
//    - app/(main)/tabs/schedule.tsx — onPressLesson of the
//      timetable views and of the list cards
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatMinutes } from '@knf/timetableengine';
import { kindBadge, kindName, useTimetableLabels, type TimetableLesson } from '@knf/timetableuikit';

import { termName } from '@/components/schedule/terms';
import { Button } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';







// -----------------------------------------------------------
// SheetLesson
// -----------------------------------------------------------
//
// The kit hands back the structural lesson; entries born in
// the KNF adapter still carry the backend row's raw fields
// (the teacher and room strings, the site's type word) and
// the engine's subgroup keys.
//
// Used by:
//   - LessonSheet (below) — its lesson prop
//   - app/(main)/tabs/schedule.tsx — the sheet state
// -----------------------------------------------------------

export type SheetLesson = TimetableLesson & {
  teacher?: unknown;
  room?: unknown;
  lectureType?: unknown;
  subgroupKeys?: string[];
};







// -----------------------------------------------------------
// str
// -----------------------------------------------------------
//
// A raw backend field is `unknown` — this keeps only a real,
// non-blank string and turns everything else into null.
//
// Used by:
//   - LessonSheet (below) — the adapter-born raw fields
// -----------------------------------------------------------

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);







// -----------------------------------------------------------
// DetailRow
// -----------------------------------------------------------
//
// One icon + text row of the sheet; renders nothing without a
// value, so absent fields cost no empty lines. The icon sits
// on the FIRST line of a wrapping value (a co-taught lecture's
// two names, a room pair), not beside its middle.
//
// Used by:
//   - LessonSheet (below)
// -----------------------------------------------------------

function DetailRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string | null }) {
  const { colors } = useTheme();
  if (!text) return null;
  return (
    <View className="mb-3 flex-row items-start">
      <View style={{ marginTop: 1 }}>
        <Ionicons name={icon} size={16} color={colors.brand} />
      </View>
      <Text className="ml-3 flex-1 font-raleway text-sm text-ink">{text}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// KindBadge
// -----------------------------------------------------------
//
// The filled brand chip an exam, a retake, an assessment or a
// consultation wears above its title — the same badge the
// list card and the grid cell show, so the sheet never plays
// an exam down to "details".
//
// Used by:
//   - LessonSheet (below)
// -----------------------------------------------------------

function KindBadge({ label }: { label: string }) {
  return (
    <View className="mb-2 self-start rounded-md bg-brand px-2.5 py-1" testID="lesson-sheet-kind-badge">
      <Text className="font-raleway-bold text-xs text-on-brand">{label}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// LessonSheet (default export)
// -----------------------------------------------------------
//
// Visibility IS the lesson prop — null closes the Modal. Each
// display string prefers the adapter's raw backend field and
// only then falls back to the engine's structural one (joined
// people/location); a field that comes up empty drops its
// DetailRow entirely. The kind prints the kit catalog's name
// for a known kind and the site's own word for any other.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — onPressLesson and the
//     list cards' press
// -----------------------------------------------------------

export default function LessonSheet({
  lesson,
  onClose,
}: {
  // Null closes the sheet
  lesson: SheetLesson | null;
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const labels = useTimetableLabels();
  const insets = useSafeAreaInsets();

  const time = lesson ? `${formatMinutes(lesson.startMin)} – ${formatMinutes(lesson.endMin)}` : null;
  const teacher = lesson ? (str(lesson.teacher) ?? ((lesson.people ?? []).join(', ') || null)) : null;
  const room = lesson ? (str(lesson.room) ?? ((lesson.location ?? []).join(', ') || null)) : null;
  const kind = lesson ? kindName(labels, lesson.kind, str(lesson.lectureType) ?? undefined) : null;
  const badge = lesson ? kindBadge(labels, lesson.kind) : null;
  const groups = lesson ? (lesson.groupKeys ?? (lesson.groupKey ? [lesson.groupKey] : [])).join(', ') || null : null;
  const subgroups = lesson && (lesson.subgroupKeys ?? []).length > 0 ? labels.subgroups(lesson.subgroupKeys ?? []) : null;
  const term = lesson?.termKey ? termName(t, lesson.termKey) : null;
  const cohort = lesson ? [groups, subgroups, term].filter(Boolean).join(' · ') || null : null;

  return (
    <Modal visible={lesson !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">

        <Pressable
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          className="absolute bottom-0 left-0 right-0 top-0 bg-scrim"
        />

        <View
          className="mx-md rounded-2xl bg-surface p-md"
          style={{ marginBottom: insets.bottom + 24 }}
          accessibilityViewIsModal
          testID="lesson-sheet"
        >

          <Text className="mb-1 font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
            {t('schedule.lessonDetails')}
          </Text>
          {badge ? <KindBadge label={badge} /> : null}
          <Text className="mb-4 font-raleway-bold text-lg leading-6 text-ink" accessibilityRole="header">
            {lesson?.title}
          </Text>

          {/* The badge already names an exam-like kind; the row
              names the everyday ones (and any unknown word) */}
          <DetailRow icon="school-outline" text={badge ? null : kind} />
          <DetailRow icon="time-outline" text={time} />
          <DetailRow icon="person-outline" text={teacher} />
          <DetailRow icon="location-outline" text={room} />
          <DetailRow icon="people-outline" text={cohort} />

          <View className="mt-2">
            <Button title={t('common.close')} variant="secondary" onPress={onClose} />
          </View>

        </View>
      </View>
    </Modal>
  );
}
