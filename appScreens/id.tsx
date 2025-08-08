import Header from '@/components/ui/Header';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export default function StudentIdTab() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const payload = JSON.stringify({
    id: user?.id || '0',
    name: user?.displayName || t('id.studentFallback'),
    email: user?.email || 'student@vu.lt',
    faculty: 'VU KNF',
  });

  return (
    <View className="flex-1 bg-white">
      <Header title={t('id.title')} />
      <View className="flex-1 items-center justify-center p-lg">
      <View className="p-lg rounded-2xl bg-white shadow-md">
        <QRCode value={payload} size={220} />
      </View>
      <Text className="mt-lg text-gray-700">{user?.displayName || t('id.studentFallback')}</Text>
      <Text className="text-gray-500">{user?.email || 'student@vu.lt'}</Text>
      </View>
    </View>
  );
}

