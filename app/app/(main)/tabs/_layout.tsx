// -----------------------------------------------------------
//  [*] Main — the bottom tab bar
//
//  Six tabs: news, messages, schedule, id, map, settings.
//  News and messages are hard-pinned by AppContext; the other
//  four obey the pinned-tab setting through expo-router's
//  href — an unpinned tab gets href null, which removes it
//  from the bar and disables linking to it until re-pinned.
//
//  The bar itself is components/navigation/TabBar — glyphs,
//  the active pill, the unread badge and the safe-area
//  padding all live there; this layout only declares the
//  routes and their translated titles.
// -----------------------------------------------------------

// Navigation shell
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

// The custom bar
import TabBar from '@/components/navigation/TabBar';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// Pinned-tab visibility
import { useApp } from '@/context/AppContext';


// Module-level so the navigator sees one stable bar identity
const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;







// -----------------------------------------------------------
// MainTabsLayout (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — layout of the (main)/tabs route group
// -----------------------------------------------------------

export default function MainTabsLayout() {

  const { t } = useTranslation();
  const { pinnedTabs } = useApp();


  // Unpinned tabs disappear from the bar; news and messages
  // are hard-pinned by AppContext so they never take the null
  const tabHref = (key: string) => (pinnedTabs.includes(key) ? undefined : null);


  return (
    <Tabs tabBar={renderTabBar} screenOptions={{ headerShown: false, animation: 'shift' }}>
      <Tabs.Screen name="news" options={{ title: t('tabs.news') }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages') }} />
      <Tabs.Screen name="schedule" options={{ title: t('tabs.schedule'), href: tabHref('schedule') }} />
      <Tabs.Screen name="id" options={{ title: t('tabs.id'), href: tabHref('id') }} />
      <Tabs.Screen name="map" options={{ title: t('tabs.map'), href: tabHref('map') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), href: tabHref('settings') }} />
    </Tabs>
  );
}
