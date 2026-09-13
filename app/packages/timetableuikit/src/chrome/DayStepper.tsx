// -----------------------------------------------------------
//  [*] timetableuikit — DayStepper
//
//  A header-slot day switcher: back/forward controls around
//  the SHORT weekday name — full names truncate next to a
//  screen title, so the long form rides the accessibility
//  label instead. Hit areas are 32×44 plus hitSlop, clearing
//  the 44pt target on both axes. The chevrons default to
//  dependency-free text glyphs; a host with an icon set
//  passes its own through prevIcon/nextIcon.
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


export default function DayStepper({
  day,
  onPrev,
  onNext,
  prevIcon,
  nextIcon,
  tint,
}: {
  // 0=Monday…6=Sunday — the kit's day indexing throughout
  day: number;
  onPrev: () => void;
  onNext: () => void;
  prevIcon?: ReactNode;
  nextIcon?: ReactNode;
  tint?: ColorValue;
}) {

  const { colors, fonts } = useTimetableTheme();
  const labels = useTimetableLabels();
  const color = tint ?? colors.onBrand;


  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>

      <Pressable
        onPress={onPrev}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={labels.prevDay}
        style={({ pressed }) => ({
          height: 44,
          width: 32,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {prevIcon ?? <Text style={{ color, fontSize: 22, lineHeight: 24 }}>‹</Text>}
      </Pressable>

      <Text
        numberOfLines={1}
        style={{ marginHorizontal: 4, flexShrink: 1, color, fontFamily: fonts.bold, fontSize: 16 }}
        accessibilityLabel={labels.dayLong[day]}
      >
        {labels.dayShort[day]}
      </Text>

      <Pressable
        onPress={onNext}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={labels.nextDay}
        style={({ pressed }) => ({
          height: 44,
          width: 32,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {nextIcon ?? <Text style={{ color, fontSize: 22, lineHeight: 24 }}>›</Text>}
      </Pressable>

    </View>
  );
}
