// -----------------------------------------------------------
//  [*] App — not-found screen
//
//  The catch-all for unmatched routes — a stale deep link, a
//  mistyped web URL. The root layout hides the default stack
//  header (its white bar clashed with the hard-set light
//  StatusBar), so the screen renders its own brand top bar —
//  the same burgundy band every other screen wears — over the
//  kit's EmptyState: an icon, what happened, one line on why,
//  and a real button home.
//
//  The button REPLACES this route with '/', which re-runs the
//  entry redirect, so it lands on news or login as the session
//  decides — and a back press afterwards can never return to
//  the dead link.
// -----------------------------------------------------------

// The way home
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// The shared empty-state body
import { EmptyState } from '@/components/ui';







// -----------------------------------------------------------
// NotFoundScreen (default export)
// -----------------------------------------------------------
//
// Static apart from i18n: hand-rolls the 56px brand band (the
// stack header is hidden for this route) and hands the landing
// decision to the entry redirect instead of hard-coding a tab.
//
// Used by:
//   - expo-router — every unmatched route
// -----------------------------------------------------------

export default function NotFoundScreen() {

  const { t } = useTranslation();
  const router = useRouter();


  return (
    <View className="flex-1 bg-canvas">

      {/* The shared brand band — keeps the light status glyphs legible */}
      <SafeAreaView edges={['top']} className="bg-brand-header">
        <View className="flex-row items-center px-lg" style={{ height: 56 }}>
          <Text
            className="flex-1 font-raleway-bold text-xl text-on-brand"
            numberOfLines={1}
            accessibilityRole="header"
            // Fixed 56px chrome — the title may not outgrow it
            maxFontSizeMultiplier={1.6}
          >
            {t('notFound.title')}
          </Text>
        </View>
      </SafeAreaView>

      <EmptyState
        icon="compass-outline"
        title={t('notFound.heading')}
        hint={t('notFound.hint')}
        action={{ label: t('notFound.action'), onPress: () => router.replace('/') }}
      />

    </View>
  );
}
