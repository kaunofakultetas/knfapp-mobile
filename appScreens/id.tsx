import Header from '@/components/ui/Header';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
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
      <View className="flex-1 bg-background-secondary">
        <Header title={t('id.title')} />
        <View className="flex-1 items-center justify-center px-lg">
          <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center mb-lg">
            <Ionicons name="id-card-outline" size={44} color="#7B003F" />
          </View>
          <Text className="text-xl font-raleway-bold text-text-primary mb-sm text-center">
            {t('id.loginRequired')}
          </Text>
          <Text className="text-sm text-text-secondary mb-xl text-center font-raleway leading-5 px-lg">
            {t('id.loginHint')}
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

  const roleLabel = ROLE_LABELS[user.role]?.[lang] || user.role;
  const payload = JSON.stringify({
    id: user.id,
    name: user.displayName,
    email: user.email,
    role: user.role,
    faculty: 'VU KNF',
  });

  return (
    <View className="flex-1 bg-background-secondary">
      <Header title={t('id.title')} />
      <View className="flex-1 items-center justify-center p-lg">
        {/* Card */}
        <View className="w-full max-w-sm bg-white rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 }}>
          {/* Card header */}
          <View className="bg-primary px-5 py-4">
            <Text className="text-white text-xs tracking-widest uppercase font-raleway-medium">
              Vilniaus universitetas
            </Text>
            <Text className="text-white text-lg font-raleway-bold">
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
            <Text className="text-xl font-raleway-bold text-text-primary">
              {user.displayName}
            </Text>
            <View className="flex-row items-center gap-2 mt-1">
              <View className="bg-primary/10 rounded-md px-2.5 py-0.5">
                <Text className="text-sm text-primary font-raleway-bold">
                  {roleLabel}
                </Text>
              </View>
            </View>
            <View className="mt-3 pt-3 border-t border-gray-100">
              <Text className="text-xs text-text-secondary font-raleway">@{user.username}</Text>
              <Text className="text-xs text-text-secondary font-raleway mt-0.5">{user.email}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
