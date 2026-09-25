// -----------------------------------------------------------
//  [*] timetableuikit — EmptyNotice
//
//  The "nothing here" line of an empty day or week, pinned
//  OVER the top of the grid instead of below it. Below the
//  grid it sat past thirteen hours of empty rows — 700+ px
//  down, off every phone screen, so an empty day looked like
//  a timetable that failed to load. Overlaid, it is the first
//  thing in view, and it takes no layout: the neighbouring
//  pager pages keep their grid at the very same offset, so a
//  swipe from an empty week to a full one never jumps.
//
//  Used by:
//    - WeekGrid.tsx — a week whose every visible day is empty
//    - DayTimeline.tsx — an empty day
// -----------------------------------------------------------

import { Text, View } from 'react-native';

import { useTimetableEnv } from '../provider';
import { AXIS_WIDTH } from './HourAxis';







// -----------------------------------------------------------
// EmptyNotice (default export)
// -----------------------------------------------------------
//
// A soft pill centred across the day columns (the hour axis
// excluded), 16 px below the grid's top edge; touches pass
// through to the grid under it. The text wraps — a host's
// longer copy ("no timetable published for this week yet")
// must never clip on a 320 pt phone.
//
// Used by:
//   - WeekGrid.tsx, DayTimeline.tsx — their empty state
// -----------------------------------------------------------

export default function EmptyNotice({ label }: { label: string }) {

  const { theme } = useTimetableEnv();


  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 16, left: AXIS_WIDTH, right: 0, alignItems: 'center', zIndex: 2 }}
    >
      <View
        style={{
          maxWidth: '100%',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 12,
          backgroundColor: theme.colors.surfaceSoft,
        }}
      >
        <Text testID="timetableuikit-empty" style={[theme.text.day, { color: theme.colors.inkSoft, textAlign: 'center' }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}
