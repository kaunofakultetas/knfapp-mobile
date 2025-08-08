import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from 'react-error-boundary';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';

import { ErrorFallback } from '@/components/ErrorFallback';
import { LoadingSpinner } from '@/components/ui';
import { AppProvider, useApp } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useTranslation } from 'react-i18next';

function AppNavigation() {
  const { theme } = useApp();
  const navTheme = theme === 'dark' ? DarkTheme : DefaultTheme;
  const { t } = useTranslation();
  return (
    <ThemeProvider value={navTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    'Raleway-Regular': require('../assets/fonts/Raleway-Regular.ttf'),
    'Raleway-Medium': require('../assets/fonts/Raleway-Medium.ttf'),
    'Raleway-SemiBold': require('../assets/fonts/Raleway-SemiBold.ttf'),
    'Raleway-Bold': require('../assets/fonts/Raleway-Bold.ttf'),
  });

  if (!loaded) {
    return <LoadingSpinner text={t('common.loadingFonts')} overlay />;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppProvider>
          <AuthProvider>
            <AppNavigation />
          </AuthProvider>
        </AppProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
