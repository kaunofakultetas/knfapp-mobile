// -----------------------------------------------------------
//  [*] App — not-found screen
//
//  The catch-all for unmatched routes: the root layout hides
//  the default stack header (its white bar clashed with the
//  hard-set light StatusBar), so the screen renders its own
//  brand top bar — the same burgundy band every other screen
//  wears — over a short message and a link home. The link
//  targets '/', which re-runs the entry redirect, so it lands
//  on news or login as appropriate.
// -----------------------------------------------------------

// The way home
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';







// -----------------------------------------------------------
// NotFoundScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — every unmatched route
// -----------------------------------------------------------

export default function NotFoundScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-canvas">

      {/* The shared brand band — keeps the light status glyphs legible */}
      <SafeAreaView edges={['top']} className="bg-brand-header">
        <View className="flex-row items-center px-lg" style={{ height: 56 }}>
          <Text className="flex-1 font-raleway-bold text-xl text-on-brand" numberOfLines={1}>
            {t('notFound.oops')}
          </Text>
        </View>
      </SafeAreaView>

      <View className="flex-1 items-center justify-center p-md">
        <Text className="font-raleway-bold text-xl text-ink">
          {t('notFound.message')}
        </Text>
        <Link href="/" className="mt-md py-md">
          <Text className="font-raleway-semibold text-base text-brand">
            {t('notFound.goHome')}
          </Text>
        </Link>
      </View>

    </View>
  );
}
