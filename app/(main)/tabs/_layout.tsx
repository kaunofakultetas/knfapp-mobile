import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useApp } from '@/context/AppContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useTranslation } from 'react-i18next';

export default function MainTabsLayout() {
  const colorScheme = useColorScheme();
  const { pinnedTabs = [] } = useApp();
  const show = (key: string) => pinnedTabs.includes(key);
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarItemStyle: { flex: 1, flexBasis: 0 },
        tabBarStyle: Platform.select({ ios: { position: 'absolute' }, default: {} }),
      }}
    >
      <Tabs.Screen
        name="news"
        options={{
          title: t('tabs.news'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="newspaper.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="message.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="calendar" color={color} />,
          href: show('schedule') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="id"
        options={{
          title: t('tabs.id'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.crop.square" color={color} />,
          href: show('id') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tabs.map'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="map.fill" color={color} />,
          href: show('map') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="gearshape.fill" color={color} />,
          href: show('settings') ? undefined : null,
        }}
      />
    </Tabs>
  );
}