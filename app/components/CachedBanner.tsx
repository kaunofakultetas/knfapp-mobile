// -----------------------------------------------------------
//  [*] CachedBanner — the "showing cached data" strip
//
//  A slim warning-toned strip shown above lists that fell
//  back to the offline cache, with a relative "updated X ago"
//  label. A 60-second interval bumps a counter purely to
//  re-render — formatRelative reads Date.now() at render time,
//  so without the tick the label would freeze on a screen
//  left open.
// -----------------------------------------------------------

// Relative-time label in the active language
import { formatRelative } from '@/services/format';

// JS-side palette for the icon tint
import { useTheme } from '@/hooks/useTheme';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';







// -----------------------------------------------------------
// CachedBanner (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/info/index.tsx
//   - the news, messages and schedule screens — whenever
//     their feed renders from cache
// -----------------------------------------------------------

export default function CachedBanner({ cachedAt }: { cachedAt: number }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  // The tick value itself is unused — bumping it each minute
  // re-renders the banner so the relative label keeps aging
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);


  return (
    <View className="flex-row items-center justify-center bg-warning-soft px-3 py-1.5 gap-1.5">
      <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
      <Text className="text-xs text-warning font-raleway-medium">
        {t('network.cachedData')} · {t('network.cachedAgo', { time: formatRelative(cachedAt) })}
      </Text>
    </View>
  );
}
