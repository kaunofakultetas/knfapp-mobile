// -----------------------------------------------------------
//  [*] LoginRequiredOverlay — friendly auth prompt wrapper
//
//  Implements the "auth adds features, never gates" rule for
//  screens whose whole value needs an account: while logged
//  out the screen keeps its Header so the app doesn't look
//  broken, and the body becomes an invitation to log in
//  rather than a wall. Authenticated users get the children
//  untouched, and while the stored session is still being
//  restored a neutral spinner shows — flashing the sign-in
//  pitch at a signed-in user reads as being logged out.
//
//  The login button carries the current path WITH its query
//  params (useReturnHref) as ?returnTo= so the login screen
//  can send the user straight back here after signing in.
//  Pushed routes that already get a StackHeader from the
//  stack layout pass showHeader={false} so the overlay does
//  not stack a second burgundy bar.
// -----------------------------------------------------------

// Auth state and navigation
import { useAuth } from '@/context/AuthContext';
import { useReturnHref } from '@/hooks/useReturnHref';
import { useRouter } from 'expo-router';

// UI kit and theming
import { Button, Header } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';


// Screens pass a raw Ionicons glyph name — no mapping layer.
// showHeader defaults to true; pushed routes under the stack
// layout's own header pass false
interface LoginRequiredOverlayProps {
  headerTitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  hint: string;
  showHeader?: boolean;
  children: ReactNode;
}







// -----------------------------------------------------------
// LoginRequiredOverlay (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/messages.tsx — and any other screen
//     whose whole value needs an account
// -----------------------------------------------------------

export default function LoginRequiredOverlay({
  headerTitle,
  icon,
  message,
  hint,
  showHeader = true,
  children,
}: LoginRequiredOverlayProps) {

  const { isAuthenticated, hydrated } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const returnHref = useReturnHref();


  if (isAuthenticated) {
    return <>{children}</>;
  }


  // Session restore still running — a neutral shell, not the
  // sign-in pitch (see the file header)
  if (!hydrated) {
    return (
      <View className="flex-1 bg-canvas">
        {showHeader && <Header title={headerTitle} />}
        <View className="flex-1 items-center justify-center" accessibilityLiveRegion="polite">
          <ActivityIndicator
            size="large"
            color={colors.brand}
            accessibilityLabel={t('common.loading')}
          />
        </View>
      </View>
    );
  }


  return (
    <View className="flex-1 bg-canvas">
      {showHeader && <Header title={headerTitle} />}

      <View className="flex-1 items-center justify-center px-lg">

        {/* Decorative icon — hidden from assistive tech */}
        <View
          className="w-24 h-24 rounded-full bg-brand-soft items-center justify-center mb-lg"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name={icon} size={44} color={colors.brand} />
        </View>

        <Text className="text-xl font-raleway-bold text-ink mb-sm text-center leading-7">
          {message}
        </Text>
        <Text className="text-base font-raleway text-ink-soft mb-xl text-center leading-6 px-lg">
          {hint}
        </Text>

        {/* returnTo (path + query params) lets the login
            screen route back to this exact screen state */}
        <View className="w-full max-w-[240px]">
          <Button
            title={t('settings.login')}
            onPress={() => router.push({ pathname: '/login', params: { returnTo: returnHref } })}
          />
        </View>

      </View>
    </View>
  );
}
