import Header from '@/components/ui/Header';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const ROLE_LABELS: Record<string, { lt: string; en: string }> = {
  student: { lt: 'Studentas', en: 'Student' },
  teacher: { lt: 'Dėstytojas', en: 'Teacher' },
  admin: { lt: 'Administratorius', en: 'Administrator' },
  curator: { lt: 'Kuratorius', en: 'Curator' },
};

export default function StudentIdTab() {
  const { user, isAuthenticated } = useAuth();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = i18n.language as 'lt' | 'en';

  if (!isAuthenticated || !user) {
    return (
      <View className="flex-1 bg-white">
        <Header title={t('id.title')} />
        <View className="flex-1 items-center justify-center p-lg">
          <Text className="text-5xl mb-md">🪪</Text>
          <Text className="text-lg font-semibold text-gray-800 mb-sm text-center">
            {t('id.loginRequired')}
          </Text>
          <Text className="text-sm text-gray-500 mb-lg text-center">
            {t('id.loginHint')}
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

  const roleLabel = ROLE_LABELS[user.role]?.[lang] || user.role;
  const payload = JSON.stringify({
    id: user.id,
    name: user.displayName,
    email: user.email,
    role: user.role,
    faculty: 'VU KNF',
  });

  return (
    <View className="flex-1 bg-white">
      <Header title={t('id.title')} />
      <View className="flex-1 items-center justify-center p-lg">
        {/* Card */}
        <View className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Card header */}
          <View className="bg-[#7B003F] px-5 py-4">
            <Text className="text-white text-xs tracking-widest uppercase">
              Vilniaus universitetas
            </Text>
            <Text className="text-white text-lg font-bold">
              Kauno fakultetas
            </Text>
          </View>

          {/* QR Code */}
          <View className="items-center py-6">
            <View className="p-4 bg-white rounded-xl">
              <QRCode value={payload} size={200} />
            </View>
          </View>

          {/* User info */}
          <View className="px-5 pb-5">
            <Text className="text-xl font-bold text-gray-900">
              {user.displayName}
            </Text>
            <Text className="text-sm text-[#7B003F] font-medium mt-1">
              {roleLabel}
            </Text>
            <View className="mt-3 pt-3 border-t border-gray-100">
              <Text className="text-xs text-gray-500">@{user.username}</Text>
              <Text className="text-xs text-gray-500">{user.email}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
