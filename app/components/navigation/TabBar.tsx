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
//  Unpinned tabs never render — visibility follows the app's
//  own pinnedTabs setting, the same source AppContext enforces
//  (the layout's href: null only blocks linking); the messages
//  tab carries the live unread badge from useUnreadCount. The
//  bar sits on the surface color with a hairline top rule and
//  pads itself for the home indicator, so it reads the same in
//  both schemes.
//
//  Split into (root component last):
//
//    TAB_ICONS — glyph pairs derived from the shared roster
//    TabItem   — one animated tab
//    TabBar    — the bar (default export)
// -----------------------------------------------------------

// The shared tab roster and the pinned-tab setting
import { TABS } from '@/constants/tabs';
import { useApp } from '@/context/AppContext';

// Unread badge and theme
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useTheme } from '@/hooks/useTheme';

// Navigation types and rendering
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';


type IoniconName = keyof typeof Ionicons.glyphMap;

// Glyph pairs keyed by route name, derived from the shared
// roster — a route without an entry falls back to a neutral
// ellipsis so a new tab still renders
const TAB_ICONS: Record<string, { filled: IoniconName; outline: IoniconName }> =
  Object.fromEntries(
    TABS.map((tab) => [tab.key, { filled: tab.iconFilled, outline: tab.icon }]),
  );

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

  const { t } = useTranslation();
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

  // The badge is visual only; its count rides the tab's own
  // label so screen readers hear "Žinutės, 3 neskaitytos
  // žinutės" as one element
  const a11yLabel = badge > 0 ? `${label}, ${t('tabs.messagesUnread', { count: badge })}` : label;


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
      accessibilityLabel={a11yLabel}
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
            color={focused ? colors.brand : colors.inkSoft}
          />
          {badge > 0 ? (
            <View
              className="absolute items-center justify-center rounded-full bg-brand px-1"
              style={{ top: -2, right: 6, minWidth: 18, height: 18, borderWidth: 2, borderColor: colors.surface }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {/* Fixed 18px badge — cap accessibility scaling
                  so the count cannot burst out of the dot */}
              <Text
                className="font-raleway-bold text-on-brand"
                style={{ fontSize: 10, lineHeight: 12 }}
                maxFontSizeMultiplier={1.2}
              >
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Tab-bar chrome cannot grow much — cap the label's
            accessibility scaling to keep the bar one line */}
        <Text
          className={focused ? 'mt-1 font-raleway-bold text-brand-text' : 'mt-1 font-raleway-medium text-ink-soft'}
          style={{ fontSize: 12 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          maxFontSizeMultiplier={1.2}
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
  const { pinnedTabs } = useApp();


  // Visibility comes from the app's own pinned-tab setting —
  // never from sniffing how expo-router happens to represent
  // `href: null` in the descriptors (an undocumented internal).
  // A hidden route can still be the focused one (opened from
  // the drawer while unpinned): keep it in the bar while it is,
  // so the reader never stands on a screen with no selected tab
  const visibleRoutes = state.routes.filter(
    (route) =>
      state.routes[state.index]?.key === route.key ||
      pinnedTabs.includes(route.name),
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
