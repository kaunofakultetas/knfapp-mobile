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
//  A lesson of a BADGE kind (an exam, a retake, an
//  assessment, a consultation — core/kinds) keeps its
//  subject's hue, so the course stays recognisable, but wears
//  a brand outline and leads its time line with the kind's
//  name in bold ("Egzaminas · 09:00–11:00") — an exam must
//  never read as one more lecture; an everyday kind leads it
//  quietly ("Pratybos · …"), so a lecture and a practical are
//  told apart at a glance. The subgroups it names join the
//  meta line, and its kind joins the accessibility sentence.
//
//  A cell too NARROW for its title's longest word (a week
//  column on a phone) shows the course's short code instead
//  — "Kompiuterių tinklai" → "KT" (core/titles) — and the
//  short kind name ("Prat."): wrapped into a 40 pt line the
//  words broke mid-word ("Kompi / uterių"). The full title
//  stays in the accessibility sentence and the host's detail
//  sheet.
//
//  Used by:
//    - grid/DayColumn.tsx — unless the host renderLesson swaps it
// -----------------------------------------------------------

import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { isBadgeKind, kindBadge, kindName } from '../core/kinds';
import { subjectTint } from '../core/palette';
import { shortTitle, wordsFit } from '../core/titles';
import type { LessonFrame, PlacedLesson, TimetableLesson } from '../core/types';
import { useTimetableEnv } from '../provider';







// -----------------------------------------------------------
// FULL_MIN_HEIGHT
// -----------------------------------------------------------
//
// Cell height, in px, at which the full tier begins — title
// ×2, time range and the meta line all fit.
//
// Used by:
//   - LessonCell (below) — the tier pick
//   - re-exported through the public surface for hosts sizing
//     a custom renderLesson
// -----------------------------------------------------------

export const FULL_MIN_HEIGHT = 56;







// -----------------------------------------------------------
// MEDIUM_MIN_HEIGHT
// -----------------------------------------------------------
//
// Cell height, in px, at which the medium tier begins — title
// ×1 plus the time range; below it only the title survives.
//
// Used by:
//   - LessonCell (below) — the tier pick
//   - re-exported through the public surface for hosts sizing
//     a custom renderLesson
// -----------------------------------------------------------

export const MEDIUM_MIN_HEIGHT = 34;







// -----------------------------------------------------------
// LessonCell (default export)
// -----------------------------------------------------------
//
// The tier comes from frame.height alone, the compact title
// from frame.width (the inner width against the longest word
// at the SCALED title size — a larger system font narrows
// every column). Blocks — and any cell without an onPress —
// render an inert View instead of a Pressable; both carry the
// full a11y sentence.
//
// Used by:
//   - grid/DayColumn.tsx — unless the host's renderLesson
//     swaps it
// -----------------------------------------------------------

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
  const { fontScale } = useWindowDimensions();
  const { entry, layout } = placed;

  const tier = frame.height >= FULL_MIN_HEIGHT ? 'full' : frame.height >= MEDIUM_MIN_HEIGHT ? 'medium' : 'short';
  const timeRange = `${formatTime(entry.startMin)}–${formatTime(entry.endMin)}`;
  const subgroups = entry.subgroupKeys ?? [];
  // Blocks are backdrop, never an event with a kind
  const badge = entry.isBlock ? null : kindBadge(labels, entry.kind);

  // The inner width: the frame less its padding and the left
  // bar (and the badge outline's right edge)
  const padding = tier === 'short' ? 3 : 5;
  const innerWidth = frame.width - 2 * padding - 3 - (badge ? 2 : 0);
  const titleSize = (theme.text.title.fontSize ?? 12) * fontScale;
  const compact = !entry.isBlock && !wordsFit(entry.title, innerWidth, titleSize);
  const title = compact ? shortTitle(entry.title) : entry.title;

  // The kind leading the time line: a badge kind in bold, an
  // everyday kind quietly — short in a compact cell
  const kindLead = entry.isBlock || !entry.kind
    ? null
    : compact
      ? (labels.kindsShort[entry.kind] ?? null)
      : (badge ?? labels.kinds[entry.kind] ?? null);

  const metaParts = [
    (entry.location ?? []).join(', '),
    subgroups.length > 0 ? labels.subgroupsShort(subgroups) : '',
    (entry.people ?? []).join(', '),
    (entry.groupKeys ?? []).join(', '),
  ].filter(Boolean);

  const a11y = [
    entry.title,
    ...(entry.isBlock ? [] : [kindName(labels, entry.kind) ?? '']),
    timeRange,
    ...metaParts,
    ...(layout.isConflict ? [labels.conflict] : []),
  ].filter(Boolean).join(', ');


  // The frame's look — pastel, conflict wash, or block
  const tint = subjectTint(entry.title, theme.colors.surface, theme.subjectColors);
  const ground = entry.isBlock
    ? { backgroundColor: theme.colors.surfaceSoft }
    : layout.isConflict
      ? { backgroundColor: theme.colors.dangerSoft, borderLeftWidth: 3, borderLeftColor: theme.colors.danger }
      : { backgroundColor: tint.bg, borderLeftWidth: 3, borderLeftColor: tint.accent };
  // The badge kinds' outline — the side borders only; the
  // accent bar above keeps the left edge
  const outline = badge
    ? {
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderColor: layout.isConflict ? theme.colors.danger : theme.colors.brand,
      }
    : null;
  const badgeColor = layout.isConflict ? theme.colors.danger : theme.colors.brandText;

  const body = (
    <>
      <Text
        // A compact code (or a one-word title that cannot fit)
        // takes ONE line, ellipsized — never broken mid-word
        numberOfLines={tier === 'full' && !compact ? 2 : 1}
        style={[theme.text.title, { color: entry.isBlock ? theme.colors.inkFaint : theme.colors.ink }]}
      >
        {title}
      </Text>
      {tier !== 'short' && !entry.isBlock ? (
        <Text numberOfLines={1} style={[theme.text.meta, { color: theme.colors.inkSoft }]}>
          {kindLead ? (
            <Text style={isBadgeKind(entry.kind) ? { fontFamily: theme.fonts.bold, color: badgeColor } : null}>
              {`${kindLead} · `}
            </Text>
          ) : null}
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


  // Pressable lessons, inert blocks
  const frameStyle = {
    position: 'absolute' as const,
    top: frame.top,
    left: frame.left,
    width: frame.width,
    height: frame.height,
    borderRadius: 6,
    paddingHorizontal: padding,
    paddingVertical: tier === 'short' ? 1 : 3,
    overflow: 'hidden' as const,
  };

  if (entry.isBlock || !onPress) {
    return (
      <View testID={`timetableuikit-lesson-${entry.id}`} accessibilityLabel={a11y} style={[frameStyle, ground, outline]}>
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
      style={[frameStyle, ground, outline]}
    >
      {body}
    </Pressable>
  );
}
