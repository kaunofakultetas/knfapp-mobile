// -----------------------------------------------------------
//  [*] timetableuikit — DayStepper
//
//  A header-slot day switcher: back/forward controls around
//  the SHORT weekday name — full names truncate next to a
//  screen title, so the long form rides the accessibility
//  label instead. A dated host stacks the real calendar date
//  under the name through the optional subtitle, and a host
//  stepping something other than days (a week cursor) swaps
//  the name out through the optional label — with
//  prevAccessibilityLabel/nextAccessibilityLabel renaming
//  what the chevrons SAY they step, so a week cursor never
//  announces "previous day". onToday adds a snap-back BUTTON
//  (a filled pill carrying the labels.today string): a dated
//  host passes it only while the cursor is away from today,
//  so the button's presence itself marks displacement (a
//  host whose header has no room for it uses TodayButton in
//  its own row instead). The chevrons are 24 × 44 boxes with
//  12 pt of slop — a 48 × 68 target — and the label keeps a
//  2 pt margin: every point the stepper spends is taken from
//  the header's title, which must stay whole on a 320 pt
//  phone. The chevrons default to dependency-free text
//  glyphs; a host with an icon set passes its own through
//  prevIcon/nextIcon.
//
//  Every Pressable takes a PLAIN style and draws its visuals
//  in the child render function's View: under the host app's
//  css-interop runtime a style FUNCTION on a Pressable is
//  dropped on device (see DayTabs) — the Today pill's ground
//  with it, which would leave brand text on the brand bar.
//
//  Colors assume a BRAND-FILLED header bar (onBrand text) —
//  pass tint to put the stepper on a plain surface instead.
//
//  Used by:
//    - hosts, in their screen header's trailing slot
// -----------------------------------------------------------

import { Pressable, Text, View, type ColorValue } from 'react-native';
import type { ReactNode } from 'react';

import { useTimetableLabels, useTimetableTheme } from '../provider';







// -----------------------------------------------------------
// DayStepper (default export)
// -----------------------------------------------------------
//
// Stateless and controlled — no internal day cursor; each
// press only fires onPrev/onNext and the host decides how
// (and whether) the day wraps at the week's edges. label,
// subtitle, the accessibility overrides and onToday are all
// additive: without them the stepper reads exactly as it
// always did.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the screen header's
//     trailing slot
// -----------------------------------------------------------

export default function DayStepper({
  day,
  onPrev,
  onNext,
  prevIcon,
  nextIcon,
  tint,
  label,
  subtitle,
  prevAccessibilityLabel,
  nextAccessibilityLabel,
  onToday,
}: {
  // 0=Monday…6=Sunday — the kit's day indexing throughout
  day: number;
  onPrev: () => void;
  onNext: () => void;
  prevIcon?: ReactNode;
  nextIcon?: ReactNode;
  tint?: ColorValue;
  // Replaces the short day name — a host stepping a WEEK
  // cursor names it here ("38 sav."); also spoken instead of
  // the long day name
  label?: string;
  // Small second line under the name — the real calendar
  // date (or range) the structural index lands on
  subtitle?: string;
  // What the chevrons announce — a week cursor passes its
  // own strings; the defaults stay the day labels
  prevAccessibilityLabel?: string;
  nextAccessibilityLabel?: string;
  // Renders the labels.today snap-back pill when given — a
  // dated host passes it only while displaced from today
  onToday?: () => void;
}) {

  const { colors, fonts } = useTimetableTheme();
  const labels = useTimetableLabels();
  const color = tint ?? colors.onBrand;


  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>

      {onToday ? (
        // A FILLED pill so it reads as a real button, not a
        // caption: the ink becomes its ground and the label
        // takes the contrasting color for either header kind —
        // white pill with brand text on the brand bar, brand
        // pill with white text on a tinted plain surface
        <Pressable
          onPress={onToday}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={labels.today}
          style={{ marginRight: 4 }}
        >
          {({ pressed }) => (
            <View
              style={{
                height: 28,
                justifyContent: 'center',
                paddingHorizontal: 10,
                borderRadius: 14,
                backgroundColor: color,
                opacity: pressed ? 0.75 : 1,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: tint ? colors.onBrand : colors.brand,
                  fontFamily: fonts.bold,
                  fontSize: 12,
                }}
              >
                {labels.today}
              </Text>
            </View>
          )}
        </Pressable>
      ) : null}

      <Pressable
        onPress={onPrev}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={prevAccessibilityLabel ?? labels.prevDay}
      >
        {({ pressed }) => (
          <View style={{ height: 44, width: 24, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }}>
            {prevIcon ?? <Text style={{ color, fontSize: 22, lineHeight: 24 }}>‹</Text>}
          </View>
        )}
      </Pressable>

      <View style={{ marginHorizontal: 2, flexShrink: 1, alignItems: 'center' }}>
        <Text
          numberOfLines={1}
          style={{ color, fontFamily: fonts.bold, fontSize: 16 }}
          accessibilityLabel={label ?? labels.dayLong[day]}
        >
          {label ?? labels.dayShort[day]}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ color, opacity: 0.85, fontFamily: fonts.medium, fontSize: 11 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onNext}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={nextAccessibilityLabel ?? labels.nextDay}
      >
        {({ pressed }) => (
          <View style={{ height: 44, width: 24, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }}>
            {nextIcon ?? <Text style={{ color, fontSize: 22, lineHeight: 24 }}>›</Text>}
          </View>
        )}
      </Pressable>

    </View>
  );
}
