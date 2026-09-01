// -----------------------------------------------------------
//  [*] LessonSheet — tap a timetable cell, read the details
//
//  The grid's cells truncate by design (a 30-minute sliver
//  shows one line), so a tap opens this bottom sheet with the
//  full story: title, teacher, room, time and group·semester.
//  Teacher names show the raw backend string when the lesson
//  came through the adapter — the academic titles the engine
//  folds out of `people` still belong on a detail card. A
//  teacher-perspective card merged across groups lists every
//  group chip it serves.
//
//  Used by:
//    - app/(main)/tabs/schedule.tsx — onPressLesson of the
//      timetable views
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatMinutes } from '@knf/timetableengine';
import type { TimetableLesson } from '@knf/timetableuikit';

import { Button } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';


// The kit hands back the structural lesson; entries born in
// the KNF adapter still carry the backend row's raw fields
type SheetLesson = TimetableLesson & {
  teacher?: unknown;
  room?: unknown;
  timeStart?: unknown;
  timeEnd?: unknown;
};

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);







// -----------------------------------------------------------
// DetailRow
// -----------------------------------------------------------
//
// One icon + text row of the sheet; renders nothing without a
// value, so absent fields cost no empty lines.
//
// Used by:
//   - LessonSheet (below)
// -----------------------------------------------------------

function DetailRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string | null }) {
  const { colors } = useTheme();
  if (!text) return null;
  return (
    <View className="mb-3 flex-row items-center">
      <Ionicons name={icon} size={16} color={colors.brand} />
      <Text className="ml-3 flex-1 font-raleway text-sm text-ink">{text}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// LessonSheet (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — onPressLesson
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
  const insets = useSafeAreaInsets();

  const time = lesson
    ? `${str(lesson.timeStart) ?? formatMinutes(lesson.startMin)} – ${str(lesson.timeEnd) ?? formatMinutes(lesson.endMin)}`
    : null;
  const teacher = lesson ? (str(lesson.teacher) ?? ((lesson.people ?? []).join(', ') || null)) : null;
  const room = lesson ? (str(lesson.room) ?? ((lesson.location ?? []).join(', ') || null)) : null;
  const groups = lesson ? (lesson.groupKeys ?? (lesson.groupKey ? [lesson.groupKey] : [])).join(', ') || null : null;
  const cohort = lesson ? [groups, lesson.termKey ?? null].filter(Boolean).join(' · ') || null : null;

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
          <Text className="mb-4 font-raleway-bold text-lg leading-6 text-ink" accessibilityRole="header">
            {lesson?.title}
          </Text>

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
