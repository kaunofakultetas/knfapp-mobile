import { Stack } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';



export default function MainLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#7B003F',
        },
        headerTintColor: 'white',
        headerTitle: '',
      }}
    >
      <Stack.Screen
        name="tabs"
        options={{ headerShown: false }}
      />

      <Stack.Screen 
        name="new-chat" 
        options={{ 
          title: t('newChat.title'),
          headerBackTitle: t('common.back'),
        }} 
      />
      
      <Stack.Screen 
        name="news-post" 
        options={{ 
          title: t('news.title'),
          headerBackTitle: t('common.back'),
        }} 
      />
      <Stack.Screen 
        name="chat-room" 
        options={{ 
          title: t('chat.title'),
          headerBackTitle: t('common.back'),
        }} 
      />
    </Stack>
  );
}
