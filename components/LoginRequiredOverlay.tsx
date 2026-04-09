/**
 * Overlay shown when a screen requires authentication but the user is not logged in.
 * Displays a message, icon, and login button. Wraps children — shows overlay instead
 * of children when not authenticated.
 */
import { useAuth } from '@/context/AuthContext';
import Header from '@/components/ui/Header';
import { useRouter } from 'expo-router';
import React, { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

interface LoginRequiredOverlayProps {
  headerTitle: string;
  icon: string;
  message: string;
  hint: string;
  children: ReactNode;
}

export default function LoginRequiredOverlay({
  headerTitle,
  icon,
  message,
  hint,
  children,
}: LoginRequiredOverlayProps) {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <View className="flex-1 bg-white">
      <Header title={headerTitle} />
      <View className="flex-1 items-center justify-center p-lg">
        <Text className="text-5xl mb-md">{icon}</Text>
        <Text className="text-lg font-semibold text-gray-800 mb-sm text-center">
          {message}
        </Text>
        <Text className="text-sm text-gray-500 mb-lg text-center">
          {hint}
        </Text>
        <Pressable
          className="bg-[#7B003F] px-8 py-3 rounded-xl"
          onPress={() => router.push('/login')}
        >
          <Text className="text-white font-semibold">{t('settings.login')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
