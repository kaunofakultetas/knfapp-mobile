import { Link, Stack } from 'expo-router';
// Removed StyleSheet import; using NativeWind className instead

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTranslation } from 'react-i18next';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.oops') }} />
      <ThemedView className="flex-1 items-center justify-center p-md">
        <ThemedText type="title">{t('notFound.message')}</ThemedText>
        <Link href="/" className="mt-sm py-md">
          <ThemedText type="link">{t('notFound.goHome')}</ThemedText>
        </Link>
      </ThemedView>
    </>
  );
}

// Removed legacy StyleSheet-based styles; migrated to TailwindCSS classes
