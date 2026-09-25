// -----------------------------------------------------------
//  [*] timetableuikit — TodayButton
//
//  The snap-back to today for a dated timetable: a soft-filled
//  pill carrying labels.today (and an optional host icon)
//  that a host shows ONLY while its cursor is away from today
//  — its presence is the "you have wandered off" signal, a
//  press brings the cursor home. Built for the day-strip row
//  under a host's filter bar, where it stays on screen on a
//  320 pt phone; a header slot beside a title and a stepper
//  has no room left for it there (the header's own title
//  truncated). DayStepper keeps an onToday of its own for
//  hosts with a roomier header.
//
//  The Pressable carries a PLAIN style and hitSlop only — the
//  pill and the pressed dim ride the child render function's
//  View: under the host app's css-interop runtime a style
//  FUNCTION on a Pressable is dropped on device (see
//  DayTabs). 28 pt tall plus 8 pt of slop either side makes
//  the 44 pt target.
//
//  Used by:
//    - app/(main)/tabs/schedule.tsx — the day-strip row, while
//      the week or the day on screen is not today's
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { useTimetableLabels, useTimetableTheme } from '../provider';







// -----------------------------------------------------------
// TodayButton (default export)
// -----------------------------------------------------------
//
// Stateless: a press only calls onPress — the host decides
// what "today" means for its cursor (the week, the day, both)
// and when the button is shown at all. The label is the
// accessible name; the icon, when given, stays decorative.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the day-strip row
// -----------------------------------------------------------

export default function TodayButton({ onPress, icon }: { onPress: () => void; icon?: ReactNode }) {

  const { colors, fonts } = useTimetableTheme();
  const labels = useTimetableLabels();


  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={labels.today}
      testID="timetableuikit-today"
    >
      {({ pressed }) => (
        <View
          style={{
            height: 28,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            borderRadius: 14,
            backgroundColor: colors.brandSoft,
            opacity: pressed ? 0.7 : 1,
          }}
        >
          {icon ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {icon}
            </View>
          ) : null}
          <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.brandText }}>
            {labels.today}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
