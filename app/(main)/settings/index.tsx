import { Button } from '@/components/ui';
import Header from '@/components/ui/Header';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

export default function SettingsScreen() {
  const { language, theme, notifications, setLanguage, setTheme, toggleNotifications, resetSettings } = useApp();
  const { isAuthenticated, user, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      '',
      [
        { text: t('common.back'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: () => logout(),
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-white">
      <Header title={t('settings.title')} />
      <View className="p-lg gap-md">

        {/* Account section */}
        <Text className="text-lg font-bold text-primary mb-1">{t('settings.account')}</Text>
        {isAuthenticated && user ? (
          <View className="flex-row items-center justify-between bg-gray-50 rounded-lg p-3 mb-2">
            <View className="flex-1">
              <Text className="text-base font-bold">{user.displayName}</Text>
              <Text className="text-sm text-gray-500">{user.email}</Text>
            </View>
            <Button title={t('settings.logout')} variant="outline" size="sm" onPress={handleLogout} />
          </View>
        ) : (
          <View className="bg-gray-50 rounded-lg p-3 mb-2">
            <Text className="text-sm text-gray-500 mb-2">{t('settings.guestMessage')}</Text>
            <Button
              title={t('settings.login')}
              variant="primary"
              size="sm"
              onPress={() => router.push('/login')}
            />
          </View>
        )}

        <View className="flex-row items-center justify-between">
          <Text className="text-base">{t('settings.notifications')}</Text>
          <Switch value={notifications} onValueChange={toggleNotifications} />
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-base">{t('settings.theme')}</Text>
          <View className="flex-row gap-sm">
            <Button title={t('settings.light')} variant={theme === 'light' ? 'primary' : 'outline'} size="sm" onPress={() => setTheme('light')} />
            <Button title={t('settings.dark')} variant={theme === 'dark' ? 'primary' : 'outline'} size="sm" onPress={() => setTheme('dark')} />
          </View>
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-base">{t('settings.language')}</Text>
          <View className="flex-row gap-sm">
            <Button title="LT" variant={language === 'lt' ? 'primary' : 'outline'} size="sm" onPress={() => setLanguage('lt')} />
            <Button title="EN" variant={language === 'en' ? 'primary' : 'outline'} size="sm" onPress={() => setLanguage('en')} />
          </View>
        </View>

        {/* Faculty info link (visible to everyone) */}
        <Pressable
          className="flex-row items-center justify-between bg-gray-50 rounded-lg p-3 mt-2"
          onPress={() => router.push('/(main)/info')}
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="information-circle" size={20} color="#7B003F" />
            <Text className="text-base font-medium">{t('info.title', 'Informacija')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </Pressable>

        {/* Admin panel link (admin/curator only) */}
        {isAuthenticated && (user?.role === 'admin' || user?.role === 'curator') && (
          <Pressable
            className="flex-row items-center justify-between bg-gray-50 rounded-lg p-3 mt-2"
            onPress={() => router.push('/(main)/admin')}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="shield-checkmark" size={20} color="#7B003F" />
              <Text className="text-base font-medium">{t('admin.title', 'Administravimas')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#999" />
          </Pressable>
        )}

        <View className="mt-xl">
          <Button title={t('settings.resetDefaults')} variant="outline" onPress={resetSettings} />
        </View>
      </View>
    </View>
  );
}
