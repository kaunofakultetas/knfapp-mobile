import { Button } from '@/components/ui';
import Header from '@/components/ui/Header';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

export default function SettingsScreen() {
  const { language, theme, notifications, setLanguage, setTheme, toggleNotifications, resetSettings } = useApp();
  const { isAuthenticated, user, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const handleToggleNotifications = useCallback(() => {
    if (notifications) {
      // Turning OFF -- unregister token from backend
      unregisterPushNotifications().catch(() => {});
    } else {
      // Turning ON -- register token with backend
      if (isAuthenticated) {
        registerForPushNotifications().catch(() => {});
      }
    }
    toggleNotifications();
  }, [notifications, isAuthenticated, toggleNotifications]);

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
    <View className="flex-1 bg-background-secondary">
      <Header title={t('settings.title')} />
      <View className="p-lg gap-md">

        {/* Account section */}
        <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mb-2">{t('settings.account')}</Text>
        {isAuthenticated && user ? (
          <View className="flex-row items-center justify-between bg-white rounded-xl p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <View className="flex-1">
              <Text className="text-base font-raleway-bold text-text-primary">{user.displayName}</Text>
              <Text className="text-sm text-text-secondary font-raleway mt-0.5">{user.email}</Text>
            </View>
            <Button title={t('settings.logout')} variant="outline" size="sm" onPress={handleLogout} />
          </View>
        ) : (
          <View className="bg-white rounded-xl p-4" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <Text className="text-sm text-text-secondary mb-3 font-raleway">{t('settings.guestMessage')}</Text>
            <Button
              title={t('settings.login')}
              variant="primary"
              size="sm"
              onPress={() => router.push('/login')}
            />
          </View>
        )}

        {/* Preferences section */}
        <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mb-2 mt-md">{t('settings.preferences', 'Nustatymai')}</Text>
        <View className="bg-white rounded-xl overflow-hidden" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
          <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-100">
            <View className="flex-1 flex-row items-start gap-2.5">
              <View className="mt-0.5">
                <Ionicons name="notifications-outline" size={20} color="#7B003F" />
              </View>
              <View className="flex-1 mr-3">
                <Text className="text-base font-raleway-medium">{t('settings.notifications')}</Text>
                <Text className="text-xs text-text-secondary font-raleway mt-1 leading-4">{t('settings.pushNotificationsDesc')}</Text>
              </View>
            </View>
            <Switch
              value={notifications}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#E0E0E0', true: '#C4607F' }}
              thumbColor={notifications ? '#7B003F' : '#FAFAFA'}
            />
          </View>

          <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100">
            <View className="flex-row items-center gap-2.5">
              <Ionicons name="color-palette-outline" size={20} color="#7B003F" />
              <Text className="text-base font-raleway">{t('settings.theme')}</Text>
            </View>
            <View className="flex-row gap-sm">
              <Button title={t('settings.light')} variant={theme === 'light' ? 'primary' : 'outline'} size="sm" onPress={() => setTheme('light')} />
              <Button title={t('settings.dark')} variant={theme === 'dark' ? 'primary' : 'outline'} size="sm" onPress={() => setTheme('dark')} />
            </View>
          </View>

          <View className="flex-row items-center justify-between px-4 py-3.5">
            <View className="flex-row items-center gap-2.5">
              <Ionicons name="language-outline" size={20} color="#7B003F" />
              <Text className="text-base font-raleway">{t('settings.language')}</Text>
            </View>
            <View className="flex-row gap-sm">
              <Button title="LT" variant={language === 'lt' ? 'primary' : 'outline'} size="sm" onPress={() => setLanguage('lt')} />
              <Button title="EN" variant={language === 'en' ? 'primary' : 'outline'} size="sm" onPress={() => setLanguage('en')} />
            </View>
          </View>
        </View>

        {/* Links section */}
        <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mb-2 mt-md">{t('settings.other', 'Kita')}</Text>
        <View className="bg-white rounded-xl overflow-hidden" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
          <Pressable
            className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-100"
            style={({ pressed }) => [pressed && { backgroundColor: '#F5F5F5' }]}
            onPress={() => router.push('/(main)/info')}
          >
            <View className="flex-row items-center gap-2.5">
              <Ionicons name="information-circle-outline" size={20} color="#7B003F" />
              <Text className="text-base font-raleway-medium">{t('info.title', 'Informacija')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#BDBDBD" />
          </Pressable>

          {/* Admin panel link (admin/curator only) */}
          {isAuthenticated && (user?.role === 'admin' || user?.role === 'curator') && (
            <Pressable
              className="flex-row items-center justify-between px-4 py-3.5"
              style={({ pressed }) => [pressed && { backgroundColor: '#F5F5F5' }]}
              onPress={() => router.push('/(main)/admin')}
            >
              <View className="flex-row items-center gap-2.5">
                <Ionicons name="shield-checkmark-outline" size={20} color="#7B003F" />
                <Text className="text-base font-raleway-medium">{t('admin.title', 'Administravimas')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#BDBDBD" />
            </Pressable>
          )}
        </View>

        <View className="mt-lg">
          <Button title={t('settings.resetDefaults')} variant="outline" onPress={resetSettings} />
        </View>
      </View>
    </View>
  );
}
