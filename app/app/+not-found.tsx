// -----------------------------------------------------------
//  [*] App — not-found screen
//
//  The catch-all for unmatched routes: a stack header titled
//  via Stack.Screen (the root layout leaves +not-found's
//  header on) over a short message and a link home. The link
//  targets '/', which re-runs the entry redirect, so it lands
//  on news or login as appropriate.
// -----------------------------------------------------------

// Route options and the way home
import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';







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
    <>
      <Stack.Screen options={{ title: t('notFound.oops') }} />
      <View className="flex-1 items-center justify-center bg-canvas p-md">
        <Text className="font-raleway-bold text-xl text-ink">
          {t('notFound.message')}
        </Text>
        <Link href="/" className="mt-md py-md">
          <Text className="font-raleway-semibold text-base text-brand">
            {t('notFound.goHome')}
          </Text>
        </Link>
      </View>
    </>
  );
}
