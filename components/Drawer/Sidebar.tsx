import { useApp } from '@/context/AppContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

const ALL_ITEMS = [
  { key: 'news', icon: 'newspaper-outline', route: '/(main)/tabs/news' },
  { key: 'messages', icon: 'chatbubbles-outline', route: '/(main)/tabs/messages' },
  { key: 'schedule', icon: 'calendar-outline', route: '/(main)/tabs/schedule' },
  { key: 'map', icon: 'map-outline', route: '/(main)/tabs/map' },
  { key: 'id', icon: 'id-card-outline', route: '/(main)/tabs/id' },
  { key: 'settings', icon: 'settings-outline', route: '/(main)/tabs/settings' },
];

export default function Sidebar({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { pinnedTabs = [], setPinnedTabs } = useApp();
  const { t } = useTranslation();
  const hardPinned = new Set(['news', 'messages']);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const togglePinned = (key: string) => {
    const next = pinnedTabs.includes(key)
      ? pinnedTabs.filter((k) => k !== key)
      : [...pinnedTabs, key];
    setPinnedTabs(next);
  };

  const go = (route: string) => {
    onClose();
    router.push(route as any);
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <Pressable className="flex-1 bg-black/50" onPress={onClose}>
        <Pressable className="absolute left-0 top-0 bottom-0 w-[300px] bg-white" onPress={(e) => e.stopPropagation()}>
          <View className="bg-primary px-lg py-xl pt-2xl pb-lg">
            <Text className="text-white text-xs tracking-widest uppercase font-raleway-medium">Vilniaus universitetas</Text>
            <Text className="text-white text-2xl font-raleway-bold mt-1">{t('menu.title')}</Text>
            <Text className="text-white/60 font-raleway text-sm mt-1">{t('menu.subtitle')}</Text>
          </View>
          <View className="px-lg pt-lg pb-md">
            {ALL_ITEMS.map((it) => (
              <Pressable
                key={it.key}
                className="flex-row items-center justify-between py-3.5 border-b border-gray-100"
                onPress={() => go(it.route)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t(`tabs.${it.key}`)}
                style={({ pressed }) => [pressed && { opacity: 0.85, backgroundColor: '#F7F7F7' }]}
              >
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center">
                    <Ionicons name={it.icon as any} size={20} color="#7B003F" />
                  </View>
                  <Text className="text-text-primary font-raleway-medium ml-3 text-base">{t(`tabs.${it.key}`)}</Text>
                </View>
                {hardPinned.has(it.key) ? null : (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      togglePinned(it.key);
                    }}
                    accessibilityLabel={`Pin ${t(`tabs.${it.key}`)}`}
                    hitSlop={8}
                  >
                    <Ionicons name={pinnedTabs.includes(it.key) ? 'star' : 'star-outline'} size={22} color={pinnedTabs.includes(it.key) ? '#EAB308' : '#94A3B8'} />
                  </Pressable>
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

//

