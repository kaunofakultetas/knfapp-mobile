import { Button } from '@/components/ui';
import Header from '@/components/ui/Header';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import {
  fetchNotificationChannels,
  NotificationChannel,
  updateNotificationChannels,
} from '@/services/api';
import {
  registerForPushNotifications,
  unregisterPushNotifications,
} from '@/services/notifications';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';

// Channel metadata for display
const CHANNEL_META: {
  key: NotificationChannel;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
  descKey: string;
}[] = [
  { key: 'news', icon: 'newspaper-outline', labelKey: 'settings.channelNews', descKey: 'settings.channelNewsDesc' },
  { key: 'chat', icon: 'chatbubble-outline', labelKey: 'settings.channelChat', descKey: 'settings.channelChatDesc' },
  { key: 'schedule', icon: 'calendar-outline', labelKey: 'settings.channelSchedule', descKey: 'settings.channelScheduleDesc' },
  { key: 'admin', icon: 'megaphone-outline', labelKey: 'settings.channelAdmin', descKey: 'settings.channelAdminDesc' },
];

export default function SettingsScreen() {
  const { language, theme, notifications, setLanguage, setTheme, toggleNotifications, resetSettings } = useApp();
  const { isAuthenticated, user, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  // Notification channel preferences (per-topic opt-in)
  const [channels, setChannels] = useState<Record<NotificationChannel, boolean>>({
    news: true,
    chat: true,
    schedule: true,
    admin: true,
  });
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const channelUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load channel preferences from backend when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchNotificationChannels()
        .then((res) => {
          setChannels(res.channels);
          setChannelsLoaded(true);
        })
        .catch(() => {
          setChannelsLoaded(true); // Use defaults on error
        });
    } else {
      setChannelsLoaded(false);
    }
  }, [isAuthenticated]);

  const handleToggleChannel = useCallback(
    (channel: NotificationChannel) => {
      setChannels((prev) => {
        const updated = { ...prev, [channel]: !prev[channel] };

        // Debounced save to backend (300ms)
        if (channelUpdateTimer.current) clearTimeout(channelUpdateTimer.current);
        channelUpdateTimer.current = setTimeout(() => {
          updateNotificationChannels({ [channel]: updated[channel] }).catch(() => {});
        }, 300);

        return updated;
      });
    },
    [],
  );

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
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>

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
          <View className="bg-white rounded-xl p-5" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
            <View className="flex-row items-center gap-3 mb-3">
              <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                <Ionicons name="person-outline" size={20} color="#7B003F" />
              </View>
              <Text className="text-sm text-text-secondary flex-1 font-raleway leading-5">{t('settings.guestMessage')}</Text>
            </View>
            <Button
              title={t('settings.login')}
              variant="primary"
              size="md"
              fullWidth
              onPress={() => router.push('/login')}
            />
          </View>
        )}

        {/* Preferences section */}
        <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mb-2 mt-md">{t('settings.preferences', 'Nustatymai')}</Text>
        <View className="bg-white rounded-xl overflow-hidden" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
          <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-100">
            <View className="flex-1 flex-row items-center gap-2.5">
              <Ionicons name="notifications-outline" size={20} color="#7B003F" />
              <View className="flex-1 mr-3">
                <Text className="text-base font-raleway-medium">{t('settings.notifications')}</Text>
                <Text className="text-xs text-text-secondary font-raleway mt-0.5 leading-4">{t('settings.pushNotificationsDesc')}</Text>
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

        {/* Notification channels section (visible when authenticated and notifications enabled) */}
        {isAuthenticated && notifications && (
          <>
            <Text className="text-xs font-raleway-bold text-text-secondary uppercase tracking-widest mb-2 mt-md">
              {t('settings.notificationChannels')}
            </Text>
            <View
              className="bg-white rounded-xl overflow-hidden"
              style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}
            >
              {CHANNEL_META.map((ch, idx) => (
                <View
                  key={ch.key}
                  className={`flex-row items-center justify-between px-4 py-3.5 ${idx < CHANNEL_META.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <View className="flex-1 flex-row items-center gap-2.5">
                    <Ionicons name={ch.icon} size={18} color="#7B003F" />
                    <View className="flex-1 mr-3">
                      <Text className="text-sm font-raleway-medium">{t(ch.labelKey)}</Text>
                      <Text className="text-xs text-text-secondary font-raleway mt-0.5 leading-4">
                        {t(ch.descKey)}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={channels[ch.key]}
                    onValueChange={() => handleToggleChannel(ch.key)}
                    trackColor={{ false: '#E0E0E0', true: '#C4607F' }}
                    thumbColor={channels[ch.key] ? '#7B003F' : '#FAFAFA'}
                    disabled={!channelsLoaded}
                  />
                </View>
              ))}
            </View>
          </>
        )}

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

        <View className="mt-lg mb-lg">
          <Button title={t('settings.resetDefaults')} variant="outline" onPress={resetSettings} />
        </View>
      </ScrollView>
    </View>
  );
}
