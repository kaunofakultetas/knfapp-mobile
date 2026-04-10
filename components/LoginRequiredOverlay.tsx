/**
 * Overlay shown when a screen requires authentication but the user is not logged in.
 * Displays a message, icon, and login button. Wraps children — shows overlay instead
 * of children when not authenticated.
 */
import { useAuth } from '@/context/AuthContext';
import Header from '@/components/ui/Header';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  'chatbubbles-outline': 'chatbubbles-outline',
  'id-card-outline': 'id-card-outline',
  'lock-closed-outline': 'lock-closed-outline',
};

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

  // Map emoji strings to Ionicons names for consistent rendering
  const ionIconName: keyof typeof Ionicons.glyphMap =
    icon in ICON_MAP
      ? ICON_MAP[icon]
      : icon === '\u{1F4AC}' || icon === '\u{1F5E8}'
        ? 'chatbubbles-outline'
        : icon === '\u{1FAAA}'
          ? 'id-card-outline'
          : 'lock-closed-outline';

  return (
    <View className="flex-1 bg-background-secondary">
      <Header title={headerTitle} />
      <View className="flex-1 items-center justify-center px-lg">
        <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center mb-lg">
          <Ionicons name={ionIconName} size={44} color="#7B003F" />
        </View>
        <Text className="text-xl font-raleway-bold text-text-primary mb-sm text-center">
          {message}
        </Text>
        <Text className="text-sm text-text-secondary mb-xl text-center font-raleway leading-5 px-lg">
          {hint}
        </Text>
        <Pressable
          className="bg-primary py-4 rounded-xl w-full max-w-[220px] items-center"
          style={({ pressed }) => [pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/login')}
        >
          <Text className="text-white font-raleway-bold text-base">{t('settings.login')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
