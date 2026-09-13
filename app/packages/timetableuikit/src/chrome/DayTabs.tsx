// -----------------------------------------------------------
//  [*] timetableuikit — DayTabs
//
//  The quick day tab bar: whichever day set the host passes
//  (weekdays, or the full week once a weekend day is in
//  view), each tab showing the short day name and announcing
//  the full one. The active tab carries a brand underline and
//  the brandText tone (AA-safe where small brand text would
//  fail).
//
//  Used by:
//    - hosts, under their filter row
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';

import { useTimetableLabels, useTimetableTheme } from '../provider';


export default function DayTabs({
  days,
  selectedDay,
  onSelect,
}: {
  // 0=Monday…6=Sunday, in display order
  days: readonly number[];
  selectedDay: number;
  onSelect: (day: number) => void;
}) {

  const { colors, fonts } = useTimetableTheme();
  const labels = useTimetableLabels();


  return (
    <View
      style={{
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.surface,
      }}
    >
      {days.map((day) => {
        const active = selectedDay === day;
        return (
          <Pressable
            key={day}
            onPress={() => onSelect(day)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labels.dayLong[day]}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
          >
            <View
              style={{
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: 2,
                borderBottomColor: active ? colors.brand : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: active ? fonts.bold : fonts.medium,
                  color: active ? colors.brandText : colors.inkSoft,
                }}
              >
                {labels.dayShort[day]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
