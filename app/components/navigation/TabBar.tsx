// -----------------------------------------------------------
//  [*] Navigation — TabBar
//
//  The bottom tab bar, hand-built instead of react-navigation's
//  default so the motion and the look are ours: a soft brand
//  pill springs in behind the active icon, the glyph swaps to
//  its filled variant, the label takes the brand color, and
//  the whole item eases down a touch while pressed. Springs
//  are critically damped — fluid, never bouncy.
//
//  Hidden tabs (expo-router href: null for unpinned surfaces)
//  never render; the messages tab carries the live unread
//  badge from useUnreadCount. The bar sits on the surface
//  color with a hairline top rule and pads itself for the home
//  indicator, so it reads the same in both schemes.
//
//  Split into (root component last):
//
//    TAB_ICONS — filled / outline glyph pairs per route
//    TabItem   — one animated tab
//    TabBar    — the bar (default export)
// -----------------------------------------------------------

// Unread badge and theme
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useTheme } from '@/hooks/useTheme';

// Navigation types and rendering
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';


type IoniconName = keyof typeof Ionicons.glyphMap;

// Glyph pairs keyed by route name — a route without an entry
// falls back to a neutral ellipsis so a new tab still renders
const TAB_ICONS: Record<string, { filled: IoniconName; outline: IoniconName }> = {
  news: { filled: 'newspaper', outline: 'newspaper-outline' },
  messages: { filled: 'chatbubbles', outline: 'chatbubbles-outline' },
  schedule: { filled: 'calendar', outline: 'calendar-outline' },
  id: { filled: 'id-card', outline: 'id-card-outline' },
  map: { filled: 'map', outline: 'map-outline' },
  settings: { filled: 'settings', outline: 'settings-outline' },
};

// Critically damped — the pill glides in, the press eases down
const PILL_SPRING = { damping: 20, stiffness: 240, mass: 0.8, overshootClamping: true };
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6, overshootClamping: true };

// Pill geometry behind the 24pt glyph
const PILL_WIDTH = 56;
const PILL_HEIGHT = 32;







// -----------------------------------------------------------
// TabItem
// -----------------------------------------------------------
//
// One tab: the pill and glyph swap follow `focused` through a
// spring, the press-down scale follows the finger. Badge
// counts cap at 99+ so the pill never stretches.
//
// Used by:
//   - TabBar (below)
// -----------------------------------------------------------

function TabItem({
  routeName,
  label,
  focused,
  badge,
  onPress,
  onLongPress,
}: {
  routeName: string;
  label: string;
  focused: boolean;
  badge: number;
  onPress: () => void;
  onLongPress: () => void;
}) {

  const { colors } = useTheme();


  const active = useSharedValue(focused ? 1 : 0);
  const pressed = useSharedValue(0);
  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, PILL_SPRING);
  }, [focused, active]);


  const pillStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scaleX: interpolate(active.value, [0, 1], [0.55, 1]) }],
  }));

  const itemStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.92]) }],
  }));


  const icons = TAB_ICONS[routeName] ?? { filled: 'ellipsis-horizontal', outline: 'ellipsis-horizontal' };
  const badgeText = badge > 99 ? '99+' : String(badge);


  return (
    <Pressable
      className="flex-1 items-center justify-center"
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        pressed.value = withSpring(1, PRESS_SPRING);
        if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, PRESS_SPRING);
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={{ minHeight: 56 }}
    >
      <Animated.View style={[{ alignItems: 'center' }, itemStyle]}>

        {/* Pill + glyph + badge */}
        <View style={{ width: PILL_WIDTH, height: PILL_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: PILL_HEIGHT / 2, backgroundColor: colors.brandSoft },
              pillStyle,
            ]}
          />
          <Ionicons
            name={focused ? icons.filled : icons.outline}
            size={24}
            color={focused ? colors.brand : colors.inkFaint}
          />
          {badge > 0 ? (
            <View
              className="absolute items-center justify-center rounded-full bg-brand px-1"
              style={{ top: -2, right: 6, minWidth: 18, height: 18, borderWidth: 2, borderColor: colors.surface }}
              accessibilityLabel={badgeText}
            >
              <Text className="font-raleway-bold text-on-brand" style={{ fontSize: 10, lineHeight: 12 }}>
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          className={focused ? 'mt-1 font-raleway-bold text-brand' : 'mt-1 font-raleway-medium text-ink-faint'}
          style={{ fontSize: 11 }}
          numberOfLines={1}
        >
          {label}
        </Text>

      </Animated.View>
    </Pressable>
  );
}







// -----------------------------------------------------------
// TabBar (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — the Tabs `tabBar` prop
// -----------------------------------------------------------

export default function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {

  const { colors } = useTheme();
  const { count: unreadCount } = useUnreadCount();


  // expo-router translates an `href: null` screen into
  // tabBarItemStyle { display: 'none' } (the href itself never
  // reaches the descriptor) — that is the hidden-tab signal
  const visibleRoutes = state.routes.filter(
    (route) => StyleSheet.flatten(descriptors[route.key].options.tabBarItemStyle)?.display !== 'none',
  );


  return (
    <View
      className="flex-row bg-surface"
      style={{
        paddingBottom: insets.bottom + 6,
        paddingTop: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.line,
      }}
      accessibilityRole="tablist"
    >
      {visibleRoutes.map((route) => {
        const focused = state.routes[state.index]?.key === route.key;
        const { options } = descriptors[route.key];
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;

        // react-navigation's contract: emit tabPress first so
        // listeners (scroll-to-top, guards) can preventDefault
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TabItem
            key={route.key}
            routeName={route.name}
            label={label}
            focused={focused}
            badge={route.name === 'messages' ? unreadCount : 0}
            onPress={onPress}
            onLongPress={onLongPress}
          />
        );
      })}
    </View>
  );
}
