// -----------------------------------------------------------
//  [*] Main — the bottom tab bar
//
//  The six tabs come from the shared roster in constants/tabs
//  — one table for this layout, the drawer and the bar. News
//  and messages are hard-pinned by AppContext; the other four
//  obey the pinned-tab setting through expo-router's href —
//  an unpinned tab gets href null, which disables linking to
//  it until re-pinned (the bar reads pinnedTabs itself).
//
//  The bar itself is components/navigation/TabBar — glyphs,
//  the active pill, the unread badge and the safe-area
//  padding all live there; this layout only declares the
//  routes and their translated titles.
// -----------------------------------------------------------

// Navigation shell
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

// The custom bar and the shared tab roster
import TabBar from '@/components/navigation/TabBar';
import { TABS } from '@/constants/tabs';
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


  // Unpinned tabs lose their link; hard-pinned surfaces never
  // take the null (AppContext keeps them in pinnedTabs anyway)
  const tabHref = (key: string) => (pinnedTabs.includes(key) ? undefined : null);


  return (
    <Tabs tabBar={renderTabBar} screenOptions={{ headerShown: false, animation: 'shift' }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.key}
          name={tab.key}
          options={{
            title: t(`tabs.${tab.key}`),
            ...(tab.hardPinned ? null : { href: tabHref(tab.key) }),
          }}
        />
      ))}
    </Tabs>
  );
}
