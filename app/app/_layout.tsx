// -----------------------------------------------------------
//  [*] App — root layout
//
//  The provider stack and navigation shell every route mounts
//  under: crash boundary > gestures > app settings > auth >
//  network > themed shell. The shell carries the nativewind
//  themeVars style, so every className token in the tree
//  resolves against the active scheme and switching theme is
//  a single style swap on one View.
//
//  The Raleway/SpaceMono font gate lives INSIDE the shell
//  (not above the providers, where the old layout had it)
//  because LoadingSpinner takes its tint from useTheme(),
//  which needs AppProvider mounted.
//
//  StatusBar is hard-set to light: the top of every screen is
//  the burgundy header or the brand splash, and in the dark
//  scheme light icons are right anyway.
//
//  Split into (root component last):
//
//    AppNavigation — nav theme, route stack, notification taps
//    ThemedShell   — theme vars wrapper, font gate, toast host
//    RootLayout    — the provider stack (default export)
// -----------------------------------------------------------

// Side-effect imports — reanimated must load early; the css
// import registers the semantic token classes (gesture handler
// loads through the GestureHandlerRootView import below)
import 'react-native-reanimated';
import '../global.css';

// Navigation shell
import { ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';

// Providers and theme plumbing
import { cssVariables, navigationThemes, palettes, themeVars } from '@/constants/theme';
import { AppProvider, useApp } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import { NetworkProvider } from '@/context/NetworkContext';

// Crash fallback and shell UI
import { ErrorFallback } from '@/components/ErrorFallback';
import { LoadingSpinner, toastConfig } from '@/components/ui';

// Notification taps deep-link into the app
import * as Notifications from 'expo-notifications';
import {
  getNotificationData,
  setupNotificationChannel,
} from '@/services/notifications';







// -----------------------------------------------------------
// AppNavigation
// -----------------------------------------------------------
//
// The route stack under the scheme-matched navigation theme.
// Also owns the notification-tap listener: chat messages open
// their conversation, news and admin announcements land on
// the news tab.
//
// Used by:
//   - ThemedShell (below)
// -----------------------------------------------------------

function AppNavigation() {
  const { scheme } = useApp();
  const router = useRouter();


  // Android needs its channel registered before any push can
  // display; taps are handled here so a cold-started app still
  // routes correctly once the stack exists
  useEffect(() => {
    setupNotificationChannel();

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = getNotificationData(response.notification);
        if (!data) return;

        if (data.type === 'chat_message' && data.conversationId) {
          // Title is unknown at tap time — the room screen
          // resolves it from the conversation itself
          router.push({
            pathname: '/(main)/chat-room',
            params: { conversationId: data.conversationId, title: '' },
          });
        } else if (data.type === 'news' || data.type === 'admin_announcement') {
          router.push('/(main)/tabs/news');
        }
      },
    );

    return () => subscription.remove();
  }, [router]);


  return (
    <ThemeProvider value={navigationThemes[scheme]}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}







// -----------------------------------------------------------
// ThemedShell
// -----------------------------------------------------------
//
// The wrapper View whose themeVars style feeds every semantic
// className token below it. Fonts gate here rather than above
// the providers so the spinner can resolve its brand tint;
// the Toast host sits beside the stack so toasts overlay any
// screen.
//
// Used by:
//   - RootLayout (below)
// -----------------------------------------------------------

function ThemedShell() {
  const { scheme } = useApp();
  const { t } = useTranslation();


  // react-native-web renders Modal into a portal outside this
  // View's DOM subtree, where the vars() style cannot be
  // inherited — drawer, sheets and viewers would paint
  // transparent. Mirroring the variables on the document root
  // gives portals the same palette. Native never reaches this.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    for (const [name, value] of Object.entries(cssVariables(palettes[scheme]))) {
      root.style.setProperty(name, value);
    }
  }, [scheme]);


  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    'Raleway-Regular': require('../assets/fonts/Raleway-Regular.ttf'),
    'Raleway-Medium': require('../assets/fonts/Raleway-Medium.ttf'),
    'Raleway-SemiBold': require('../assets/fonts/Raleway-SemiBold.ttf'),
    'Raleway-Bold': require('../assets/fonts/Raleway-Bold.ttf'),
  });


  return (
    <View style={themeVars[scheme]} className="flex-1 bg-canvas">
      {fontsLoaded ? (
        <AppNavigation />
      ) : (
        <LoadingSpinner text={t('common.loadingFonts')} overlay />
      )}
      <Toast config={toastConfig} />
    </View>
  );
}







// -----------------------------------------------------------
// RootLayout (default export)
// -----------------------------------------------------------
//
// Provider order matters: AppProvider first (settings feed
// the theme and language), then auth, then network — the
// network layer toasts in the active language and auth-aware
// screens sit below both.
//
// Used by:
//   - expo-router — the root layout route
// -----------------------------------------------------------

export default function RootLayout() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppProvider>
          <AuthProvider>
            <NetworkProvider>
              <ThemedShell />
            </NetworkProvider>
          </AuthProvider>
        </AppProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
