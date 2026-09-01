// -----------------------------------------------------------
//  [*] wayfinduikit — FloorSwitcher
//
//  The stack of floor pills beside the plan, top floor on top
//  (ordinal descending, whatever order the host keeps its
//  list in), the shown floor filled in the brand. While a
//  route is up the host passes `enabled` — the levels the
//  route touches — and every other pill dims and goes inert,
//  so a walker cannot wander onto a floor the route never
//  visits; with no list every floor is open. The kit never
//  changes the floor itself: a tap only asks, and the host
//  answers by changing `current`.
//
//  Pills are tabs to a screen reader — one selected among
//  several mutually exclusive views — and the group announces
//  which floor is showing, so the switcher is understood
//  before any pill is touched.
//
//  Used by:
//    - the host app's wayfinding screen, beside FloorPlan
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import type { KitLevel } from '../core/types';
import { useKitLabels, useKitTheme } from '../provider';


export default function FloorSwitcher({
  levels,
  current,
  onSelect,
  enabled = null,
  vertical = true,
  style,
}: {
  levels: readonly KitLevel[];
  current: string;
  onSelect: (id: string) => void;
  enabled?: readonly string[] | null;
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  // Sort is stable, so two levels sharing an ordinal keep the
  // host's order between them
  const ordered = [...levels].sort((a, b) => b.ordinal - a.ordinal);
  const currentLabel = levels.find((level) => level.id === current)?.label ?? current;


  return (
    <View
      testID="wayfinduikit-floor-switcher"
      accessibilityRole="tablist"
      accessibilityLabel={labels.floorSwitcherA11y(currentLabel)}
      style={[
        {
          flexDirection: vertical ? 'column' : 'row',
          alignSelf: 'flex-start',
          gap: 6,
          padding: 4,
          borderRadius: radii.card,
          backgroundColor: colors.surface,
          shadowColor: colors.shadow,
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        },
        style,
      ]}
    >
      {ordered.map((level) => {
        const isCurrent = level.id === current;
        const disabled = enabled != null && !enabled.includes(level.id);
        return (
          <Pressable
            key={level.id}
            testID={`wayfinduikit-floor-${level.id}`}
            accessibilityRole="tab"
            accessibilityLabel={labels.floorA11y(level.label, isCurrent)}
            accessibilityState={{ selected: isCurrent, disabled }}
            disabled={disabled}
            // Guarded inside too — a host element's onPress can
            // be invoked straight past the prop
            onPress={() => {
              if (!disabled) onSelect(level.id);
            }}
            hitSlop={4}
            style={{
              minWidth: 44,
              height: 40,
              paddingHorizontal: 12,
              borderRadius: radii.chip,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isCurrent ? colors.brand : 'transparent',
              opacity: disabled ? 0.4 : 1,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 15,
                fontFamily: fonts.medium,
                fontWeight: '600',
                color: isCurrent ? colors.onBrand : colors.ink,
              }}
            >
              {level.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
