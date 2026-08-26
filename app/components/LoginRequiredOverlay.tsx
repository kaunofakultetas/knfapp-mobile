// -----------------------------------------------------------
//  [*] LoginRequiredOverlay — friendly auth prompt wrapper
//
//  Implements the "auth adds features, never gates" rule for
//  screens whose whole value needs an account: while logged
//  out the screen keeps its Header so the app doesn't look
//  broken, and the body becomes an invitation to log in
//  rather than a wall. Authenticated users get the children
//  untouched.
//
//  The login button carries the current path as ?returnTo= so
//  the login screen can send the user straight back here
//  after signing in.
// -----------------------------------------------------------

// Auth state and navigation
import { useAuth } from '@/context/AuthContext';
import { usePathname, useRouter } from 'expo-router';

// UI kit and theming
import { Button, Header } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';


// Screens pass a raw Ionicons glyph name — no mapping layer
interface LoginRequiredOverlayProps {
  headerTitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  hint: string;
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
  children,
}: LoginRequiredOverlayProps) {

  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();


  if (isAuthenticated) {
    return <>{children}</>;
  }


  return (
    <View className="flex-1 bg-canvas">
      <Header title={headerTitle} />

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

        {/* returnTo lets the login screen route back here */}
        <View className="w-full max-w-[240px]">
          <Button
            title={t('settings.login')}
            onPress={() => router.push({ pathname: '/login', params: { returnTo: pathname } })}
          />
        </View>

      </View>
    </View>
  );
}
