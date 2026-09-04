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
//  because its spinner takes the scheme's on-brand tint,
//  which needs AppProvider mounted. The native splash stays
//  up over the gate and drops once fonts load or fail.
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
import { ThemeProvider } from "expo-router/react-navigation";
import { useFonts } from 'expo-font';
import { router, Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';
import { ErrorBoundary } from 'react-error-boundary';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';

// Providers and theme plumbing
import { cssVariables, navigationThemes, palettes, themeVars } from '@/constants/theme';
import { AppProvider, useApp } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import { NetworkProvider } from '@/context/NetworkContext';

// The offline-first data layer: AsyncStorage carries the cache,
// NetworkProvider feeds its restore bus
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DataEngineProvider } from '@knf/dataengine';

// Crash fallback and shell UI
import { ErrorFallback } from '@/components/ErrorFallback';
import { ConfirmHost, toastConfig } from '@/components/ui';

// Root crashes land in the error trail the crash screen reports
import { logError } from '@/services/log';

// Notification taps deep-link into the app
import * as Notifications from 'expo-notifications';
import {
  getNotificationData,
  initNotifications,
  setupNotificationChannel,
} from '@/services/notifications';


// Keep the native splash up over the font gate so cold start
// shows one branded surface instead of a scrim flash; hidden
// by ThemedShell once the fonts settle either way
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden (fast refresh) — nothing left to cover
});







// -----------------------------------------------------------
// AppNavigation
// -----------------------------------------------------------
//
// The route stack under the scheme-matched navigation theme.
// Also owns the WARM notification-tap listener: chat messages
// open their conversation, news and admin announcements land
// on the news tab, schedule updates on the schedule tab.
// Cold-start taps are handled by app/index.tsx, which reads
// the last notification response inside its startup gate.
//
// Used by:
//   - ThemedShell (below)
// -----------------------------------------------------------

function AppNavigation() {
  const { scheme } = useApp();
  const router = useRouter();


  // Android needs its channel registered before any push can
  // display; the foreground presentation handler installs here
  // too, so nothing notification-flavored runs at module load
  useEffect(() => {
    initNotifications();
    setupNotificationChannel();

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = getNotificationData(response.notification);
        if (!data || !data.type) return;

        if ((data.type === 'chat_message' || data.type === 'chat_mention') && data.conversationId) {
          // Collapse to the messages tab first so repeated taps
          // reuse one shell and one room instance; the title is
          // unknown at tap time — the room resolves it itself
          router.dismissTo('/(main)/tabs/messages');
          router.push({
            pathname: '/(main)/chat-room',
            params: { conversationId: data.conversationId, title: '' },
          });
        } else if (data.type === 'news' || data.type === 'admin_announcement') {
          router.navigate('/(main)/tabs/news');
        } else if (data.type === 'schedule_update') {
          router.navigate('/(main)/tabs/schedule');
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
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
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


  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    'Raleway-Regular': require('../assets/fonts/Raleway-Regular.ttf'),
    'Raleway-Medium': require('../assets/fonts/Raleway-Medium.ttf'),
    'Raleway-SemiBold': require('../assets/fonts/Raleway-SemiBold.ttf'),
    'Raleway-Bold': require('../assets/fonts/Raleway-Bold.ttf'),
  });


  // A failed font load must not hang startup on the gate — the
  // stack mounts on the system fonts instead, and the native
  // splash drops once either outcome is in
  useEffect(() => {
    if (fontError) console.error('Font load failed:', fontError);
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {
        // Already hidden — nothing to do
      });
    }
  }, [fontsLoaded, fontError]);


  return (
    <View style={themeVars[scheme]} className="flex-1 bg-canvas">
      {fontsLoaded || fontError ? (
        <AppNavigation />
      ) : (
        // The same burgundy fill as the splash and the entry
        // redirect, so the launch sequence keeps one background
        <View
          className="flex-1 items-center justify-center bg-brand-header"
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator
            size="large"
            color={palettes[scheme].onBrand}
            accessibilityLabel={t('common.loadingFonts')}
          />
        </View>
      )}
      <Toast config={toastConfig} />
      {/* Web confirm dialogs — themed stand-in for the
          window.confirm fallback; presents nothing on native */}
      <ConfirmHost />
    </View>
  );
}







// -----------------------------------------------------------
// RootLayout (default export)
// -----------------------------------------------------------
//
// Provider order matters: AppProvider first (settings feed
// the theme and language), then the data engine (auth wipes
// its cache on logout, the network layer signals its restore
// bus — both sit inside it), then auth, then network — the
// network layer toasts in the active language and auth-aware
// screens sit below all of them.
//
// Used by:
//   - expo-router — the root layout route
// -----------------------------------------------------------

export default function RootLayout() {
  return (
    // Try Again resets to the entry redirect rather than
    // re-mounting the route that just crashed; the error and
    // its component stack go through logError — console in dev,
    // and into the ring buffer the crash-report mail attaches
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => router.replace('/')}
      onError={(error, info) => {
        logError('crash', error, info.componentStack ?? undefined);
      }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppProvider>
          <DataEngineProvider storage={AsyncStorage}>
            <AuthProvider>
              <NetworkProvider>
                <ThemedShell />
              </NetworkProvider>
            </AuthProvider>
          </DataEngineProvider>
        </AppProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
