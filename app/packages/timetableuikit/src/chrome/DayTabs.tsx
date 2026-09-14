// -----------------------------------------------------------
//  [*] timetableuikit — DayTabs
//
//  The quick day tab bar: whichever day set the host passes
//  (weekdays, or the full week once a weekend day is in
//  view), each day a real BUTTON — an evenly spaced pill
//  showing the short day name and announcing the full one.
//  The selected day fills with the brand color; today, while
//  not selected, wears a brand outline (a dated host passes
//  `today` only when the shown week actually contains it);
//  every other day is a quiet line-bordered pill.
//
//  Used by:
//    - hosts, under their filter row
// -----------------------------------------------------------

import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import { useTimetableLabels, useTimetableTheme } from '../provider';







// -----------------------------------------------------------
// DayTabs (default export)
// -----------------------------------------------------------
//
// Each pill is content-sized with a fixed gap — the row hugs
// left rather than stretching to fill, and when the full set
// would overflow (a weekend week beside a wide host control)
// the strip SCROLLS horizontally instead of squeezing the
// pills until their padding clips the letters — and it keeps
// the SELECTED pill in view by itself, so a weekend day
// chosen by swipe never rests hidden past the viewport edge
// (behind a host control sharing the row); a press reports up
// through onSelect — the row keeps no selection state of its
// own. Selection outranks today when both land on one pill:
// the fill IS the selection, and today's outline reappears
// the moment the selection moves elsewhere.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — under the filter row
// -----------------------------------------------------------

export default function DayTabs({
  days,
  selectedDay,
  today,
  onSelect,
}: {
  // 0=Monday…6=Sunday, in display order
  days: readonly number[];
  selectedDay: number;
  // Which pill is TODAY — pass it only when the shown week
  // really contains today; a foreign week has no today column
  today?: number;
  onSelect: (day: number) => void;
}) {

  const { colors, fonts } = useTimetableTheme();
  const labels = useTimetableLabels();

  // The auto-scroll bookkeeping: each chip reports its frame,
  // the viewport its width, and a selection change centers the
  // selected chip (RN clamps an out-of-range x itself)
  const scrollRef = useRef<ScrollView>(null);
  const chipFrames = useRef<Record<number, { x: number; width: number }>>({});
  const viewportWidth = useRef(0);

  useEffect(() => {
    const frame = chipFrames.current[selectedDay];
    if (!frame || viewportWidth.current === 0) return;
    const x = Math.max(0, frame.x + frame.width / 2 - viewportWidth.current / 2);
    scrollRef.current?.scrollTo({ x, animated: true });
  }, [selectedDay, days]);


  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(event: LayoutChangeEvent) => {
        viewportWidth.current = event.nativeEvent.layout.width;
      }}
      // A ScrollView is flex-elastic — flexGrow 0 keeps the
      // strip its content height inside a column
      style={{
        flexGrow: 0,
        flexShrink: 0,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.surface,
      }}
      contentContainerStyle={{
        flexDirection: 'row',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      {days.map((day) => {
        const active = selectedDay === day;
        const isToday = today === day;
        return (
          <Pressable
            key={day}
            onPress={() => onSelect(day)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={isToday ? `${labels.dayLong[day]}, ${labels.today}` : labels.dayLong[day]}
            // NO style function on the Pressable: under the host
            // app's css-interop runtime a function style drops
            // whatever it returns on device. The chips keep
            // their natural size — an overflowing set scrolls,
            // never squeezes; the pill and the pressed dim ride
            // the child render function's View. hitSlop grows
            // the compact chip back to a comfortable target
            hitSlop={{ top: 8, bottom: 8 }}
            onLayout={(event: LayoutChangeEvent) => {
              chipFrames.current[day] = {
                x: event.nativeEvent.layout.x,
                width: event.nativeEvent.layout.width,
              };
            }}
          >
            {({ pressed }) => (
              <View
                style={{
                  height: 24,
                  paddingHorizontal: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: active || isToday ? colors.brand : colors.line,
                  backgroundColor: active ? colors.brand : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: active || isToday ? fonts.bold : fonts.medium,
                    color: active ? colors.onBrand : isToday ? colors.brandText : colors.inkSoft,
                  }}
                >
                  {labels.dayShort[day]}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
