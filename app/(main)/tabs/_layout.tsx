import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
// Inlined TabBarBackground to avoid external small files
import { useApp } from '@/context/AppContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';





function TabBarBackground() {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} /> as any;
}

export function useBottomTabOverflow() {
  return useBottomTabBarHeight();
}




export default function MainTabsLayout() {
  const colorScheme = useColorScheme();
  const { pinnedTabs = [] } = useApp();
  const show = (key: string) => pinnedTabs.includes(key);
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={({ route, navigation }) => {
        const isFocused = navigation.getState().index === navigation.getState().routes.findIndex(r => r.name === route.name);
        return {
          headerShown: false,
          tabBarActiveTintColor: '#7B003F',
          tabBarInactiveTintColor: '#687076',
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground as any,
          tabBarItemStyle: { 
            flex: 1, 
            flexBasis: 0, 
            alignItems: 'center', 
            justifyContent: 'center',
            borderTopWidth: 3,
            borderTopColor: isFocused ? '#7B003F' : 'transparent',
          },
          tabBarStyle: Platform.select({
            ios: { position: 'absolute', backgroundColor: '#FFFFFF', borderTopColor: '#FFFFFF', borderTopWidth: 2 },
            default: { backgroundColor: '#FFFFFF', borderTopColor: '#FFFFFF', borderTopWidth: 2 },
          }),
          tabBarLabelStyle: { marginBottom: 6 },
          animation: 'shift',
        };
      }}
    >
      <Tabs.Screen
        name="news"
        options={{
          title: t('tabs.news'),
          tabBarIcon: ({ color, focused }) => <IconSymbol size={26} name={focused ? "newspaper.fill" : "newspaper"} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ color, focused }) => <IconSymbol size={26} name={focused ? "message.fill" : "message"} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ({ color, focused }) => <IconSymbol size={26} name={focused ? "calendar" : "calendar"} color={color} />,
          href: show('schedule') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="id"
        options={{
          title: t('tabs.id'),
          tabBarIcon: ({ color, focused }) => <IconSymbol size={26} name={focused ? "person.fill" : "person"} color={color} />,
          href: show('id') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tabs.map'),
          tabBarIcon: ({ color, focused }) => <IconSymbol size={26} name={focused ? "map.fill" : "map"} color={color} />,
          href: show('map') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, focused }) => <IconSymbol size={26} name={focused ? "gearshape.fill" : "gearshape"} color={color} />,
          href: show('settings') ? undefined : null,
        }}
      />
    </Tabs>
  );
}