// -----------------------------------------------------------
//  [*] timetableuikit — LessonCell
//
//  One lesson in its pixel frame, degrading by HEIGHT through
//  three tiers with a CONSTANT numberOfLines per tier — a cell
//  never reflows mid-scroll:
//
//    full   (>= 56px)  title ×2, time range, rooms · people · groups
//    medium (>= 34px)  title ×1, time range
//    short  (<  34px)  title ×1, nothing else
//
//  The ground is the subject's pastel (title-hashed over the
//  theme surface) behind an accent bar; a conflict swaps to
//  the danger wash and says so in the accessibility label; a
//  background block mutes to the soft surface with no bar.
//
//  Used by:
//    - grid/DayColumn.tsx — unless the host renderLesson swaps it
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';

import { subjectTint } from '../core/palette';
import type { LessonFrame, PlacedLesson, TimetableLesson } from '../core/types';
import { useTimetableEnv } from '../provider';

export const FULL_MIN_HEIGHT = 56;
export const MEDIUM_MIN_HEIGHT = 34;


export default function LessonCell({
  placed,
  frame,
  onPress,
}: {
  placed: PlacedLesson;
  frame: LessonFrame;
  onPress?: (lesson: TimetableLesson) => void;
}) {

  const { theme, labels, formatTime } = useTimetableEnv();
  const { entry, layout } = placed;

  const tier = frame.height >= FULL_MIN_HEIGHT ? 'full' : frame.height >= MEDIUM_MIN_HEIGHT ? 'medium' : 'short';
  const timeRange = `${formatTime(entry.startMin)}–${formatTime(entry.endMin)}`;

  const metaParts = [
    (entry.location ?? []).join(', '),
    (entry.people ?? []).join(', '),
    (entry.groupKeys ?? []).join(', '),
  ].filter(Boolean);

  const a11y = [
    entry.title,
    timeRange,
    ...metaParts,
    ...(layout.isConflict ? [labels.conflict] : []),
  ].join(', ');


  // STEP 1: the frame's look — pastel, conflict wash, or block
  // ==========================================================
  const tint = subjectTint(entry.title, theme.colors.surface, theme.subjectColors);
  const ground = entry.isBlock
    ? { backgroundColor: theme.colors.surfaceSoft }
    : layout.isConflict
      ? { backgroundColor: theme.colors.dangerSoft, borderLeftWidth: 3, borderLeftColor: theme.colors.danger }
      : { backgroundColor: tint.bg, borderLeftWidth: 3, borderLeftColor: tint.accent };

  const body = (
    <>
      <Text
        numberOfLines={tier === 'full' ? 2 : 1}
        style={[theme.text.title, { color: entry.isBlock ? theme.colors.inkFaint : theme.colors.ink }]}
      >
        {entry.title}
      </Text>
      {tier !== 'short' && !entry.isBlock ? (
        <Text numberOfLines={1} style={[theme.text.meta, { color: theme.colors.inkSoft }]}>
          {timeRange}
        </Text>
      ) : null}
      {tier === 'full' && !entry.isBlock && metaParts.length > 0 ? (
        <Text numberOfLines={1} style={[theme.text.meta, { color: theme.colors.inkSoft }]}>
          {metaParts.join(' · ')}
        </Text>
      ) : null}
    </>
  );


  // STEP 2: pressable lessons, inert blocks
  // =======================================
  const frameStyle = {
    position: 'absolute' as const,
    top: frame.top,
    left: frame.left,
    width: frame.width,
    height: frame.height,
    borderRadius: 6,
    paddingHorizontal: tier === 'short' ? 3 : 5,
    paddingVertical: tier === 'short' ? 1 : 3,
    overflow: 'hidden' as const,
  };

  if (entry.isBlock || !onPress) {
    return (
      <View testID={`timetableuikit-lesson-${entry.id}`} accessibilityLabel={a11y} style={[frameStyle, ground]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={`timetableuikit-lesson-${entry.id}`}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => onPress(entry)}
      style={[frameStyle, ground]}
    >
      {body}
    </Pressable>
  );
}
