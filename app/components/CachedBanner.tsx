// -----------------------------------------------------------
//  [*] CachedBanner — the "showing cached data" strip
//
//  A slim warning-toned strip shown above lists that fell
//  back to the offline cache, with a relative "updated X ago"
//  label. A 60-second interval bumps a counter purely to
//  re-render — formatRelativeAgo reads Date.now() at render
//  time, so without the tick the label would freeze on a
//  screen left open; returning from background bumps it too,
//  so the label never shows the pre-background age.
//
//  A screen reader hears the strip ONCE per stale-data episode
//  (a new cachedAt), announced on arrival. It used to be a live
//  region / alert — and every minute tick changed its text, so
//  TalkBack re-read the whole strip each minute for as long as
//  it stayed up.
// -----------------------------------------------------------

// Relative-time phrase in the active language
import { formatRelativeAgo } from '@/services/format';

// JS-side palette for the icon tint
import { useTheme } from '@/hooks/useTheme';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, AppState, Text, View } from 'react-native';







// -----------------------------------------------------------
// CachedBanner (default export)
// -----------------------------------------------------------
//
// Owns the re-render tick — a minute interval plus an AppState
// listener bump a throwaway counter so the "ago" label keeps
// aging — and the one announcement per cachedAt. The strip is
// a single accessibility element whose label is the visible
// text, the icon hidden from assistive tech.
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
  // re-renders the banner so the relative label keeps aging;
  // the interval is frozen while backgrounded, so a foreground
  // transition bumps it immediately to catch the label up
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTick((n) => n + 1);
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);


  const label = `${t('network.cachedData')} · ${t('network.cachedAgo', { time: formatRelativeAgo(cachedAt) })}`;


  // Announced once when the stale data arrives — deliberately
  // NOT per label change (see the file header)
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(label);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one announcement per cachedAt; the aging label must stay silent
  }, [cachedAt]);


  // One accessibility element whose label is the visible text;
  // the icon is decorative and stays hidden
  return (
    <View
      accessible
      accessibilityLabel={label}
      className="flex-row items-center justify-center bg-warning-soft px-3 py-1.5 gap-1.5"
    >
      <Ionicons
        name="cloud-offline-outline"
        size={14}
        color={colors.warning}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text className="text-xs text-warning font-raleway-medium">{label}</Text>
    </View>
  );
}
