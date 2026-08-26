// -----------------------------------------------------------
//  [*] Main — the bottom tab bar
//
//  Six tabs: news, messages, schedule, id, map, settings.
//  News and messages are hard-pinned by AppContext; the other
//  four obey the pinned-tab setting through expo-router's
//  href — an unpinned tab gets href null, which removes it
//  from the bar and disables linking to it until re-pinned.
//
//  The messages tab carries the live unread badge from
//  useUnreadCount; icons flip between the filled and -outline
//  Ionicons variant on focus, so the active tab reads by
//  shape as well as by tint. Tab-bar colors are JS props, so
//  they come from useTheme() and follow the scheme.
//
//  Split into (root component last):
//
//    makeTabIcon    — focus-aware Ionicons renderer factory
//    MainTabsLayout — the Tabs navigator (default export)
// -----------------------------------------------------------

// Navigation shell
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

// Tab-bar chrome — haptic buttons, glyphs, themed colors
import { Ionicons } from '@expo/vector-icons';
import { HapticTab } from '@/components/HapticTab';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// Pinned-tab visibility and the unread badge
import { useApp } from '@/context/AppContext';
import { useUnreadCount } from '@/hooks/useUnreadCount';


// Ionicons name union — keeps the filled/outline pairs typo-safe
type IoniconName = keyof typeof Ionicons.glyphMap;







// -----------------------------------------------------------
// makeTabIcon
// -----------------------------------------------------------
//
// Returns a tabBarIcon renderer that swaps the -outline glyph
// for the filled one while the tab is focused. Each renderer
// is built once at module level, so the navigator sees a
// stable component identity across re-renders.
//
// Used by:
//   - the per-tab icon constants (below)
// -----------------------------------------------------------

function makeTabIcon(filled: IoniconName, outline: IoniconName) {
  return function TabIcon({
    color,
    size,
    focused,
  }: {
    color: string;
    size: number;
    focused: boolean;
  }) {
    return <Ionicons name={focused ? filled : outline} size={size} color={color} />;
  };
}


// One renderer per tab — see makeTabIcon above
const NewsIcon = makeTabIcon('newspaper', 'newspaper-outline');
const MessagesIcon = makeTabIcon('chatbubbles', 'chatbubbles-outline');
const ScheduleIcon = makeTabIcon('calendar', 'calendar-outline');
const IdIcon = makeTabIcon('id-card', 'id-card-outline');
const MapIcon = makeTabIcon('map', 'map-outline');
const SettingsIcon = makeTabIcon('settings', 'settings-outline');







// -----------------------------------------------------------
// MainTabsLayout (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — layout of the (main)/tabs route group
// -----------------------------------------------------------

export default function MainTabsLayout() {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { pinnedTabs } = useApp();
  const { count: unreadCount } = useUnreadCount();


  // Unpinned tabs disappear from the bar; news and messages
  // are hard-pinned by AppContext so they never take the null
  const tabHref = (key: string) => (pinnedTabs.includes(key) ? undefined : null);


  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        animation: 'shift',
      }}
    >
      <Tabs.Screen
        name="news"
        options={{
          title: t('tabs.news'),
          tabBarIcon: NewsIcon,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: MessagesIcon,
          tabBarBadge:
            unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.brand,
            color: colors.onBrand,
            fontFamily: fonts.medium,
            fontSize: 10,
            minWidth: 18,
            height: 18,
            lineHeight: 18,
          },
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ScheduleIcon,
          href: tabHref('schedule'),
        }}
      />
      <Tabs.Screen
        name="id"
        options={{
          title: t('tabs.id'),
          tabBarIcon: IdIcon,
          href: tabHref('id'),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tabs.map'),
          tabBarIcon: MapIcon,
          href: tabHref('map'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: SettingsIcon,
          href: tabHref('settings'),
        }}
      />
    </Tabs>
  );
}
