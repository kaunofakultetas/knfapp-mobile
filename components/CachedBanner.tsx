/**
 * Small banner shown when displaying cached (offline) data instead of live data.
 * Shows "Showing cached data" with a relative timestamp.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

function formatRelativeTime(cachedAt: number, language: string): string {
  const diffMs = Date.now() - cachedAt;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return language === 'lt' ? 'k\u0105 tik' : 'just now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${language === 'lt' ? 'val.' : 'h'}`;
  const days = Math.floor(hours / 24);
  return `${days} ${language === 'lt' ? 'd.' : 'd'}`;
}

export default function CachedBanner({ cachedAt }: { cachedAt: number }) {
  const { t, i18n } = useTranslation();
  const timeStr = formatRelativeTime(cachedAt, i18n.language);

  return (
    <View className="flex-row items-center justify-center bg-amber-100 px-3 py-1.5 gap-1.5">
      <Ionicons name="cloud-offline-outline" size={14} color="#92400e" />
      <Text className="text-xs text-amber-800 font-medium">
        {t('network.cachedData')} · {t('network.cachedAgo', { time: timeStr })}
      </Text>
    </View>
  );
}
