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
        name="new-chat/index" 
        options={{ 
          title: t('newChat.title'),
          headerBackTitle: t('common.back'),
        }} 
      />
      
      <Stack.Screen 
        name="news-comments/index" 
        options={{ 
          title: t('news.comments'),
          headerBackTitle: t('common.back'),
        }} 
      />
      
      <Stack.Screen 
        name="news-post/index" 
        options={{ 
          title: t('news.title'),
          headerBackTitle: t('common.back'),
        }} 
      />
      <Stack.Screen
        name="chat-room/index"
        options={{
          title: t('chat.title'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="profile/index"
        options={{
          title: t('profile.title'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="create-post/index"
        options={{
          title: t('profile.newPost'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="friends/index"
        options={{
          title: t('friends.title'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="friend-requests/index"
        options={{
          title: t('friendRequests.title'),
          headerBackTitle: t('common.back'),
        }}
      />
      <Stack.Screen
        name="admin/index"
        options={{
          title: t('admin.title', 'Administravimas'),
          headerBackTitle: t('common.back'),
        }}
      />
    </Stack>
  );
}
