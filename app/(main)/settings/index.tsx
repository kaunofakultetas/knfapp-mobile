import { Button } from '@/components/ui';
import Header from '@/components/ui/Header';
import { useApp } from '@/context/AppContext';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Text, View } from 'react-native';

export default function SettingsScreen() {
  const { language, theme, notifications, setLanguage, setTheme, toggleNotifications, resetSettings } = useApp();
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-white">
      <Header title={t('settings.title')} />
      <View className="p-lg gap-md">

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

        <View className="mt-xl">
          <Button title={t('settings.resetDefaults')} variant="outline" onPress={resetSettings} />
        </View>
      </View>
    </View>
  );
}

