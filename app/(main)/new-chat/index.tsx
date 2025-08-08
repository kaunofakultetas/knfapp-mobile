import type { ChatRoom } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

export default function NewChatScreen() {
  const [name, setName] = useState('');
  const router = useRouter();
  const { t } = useTranslation();

  const createChat = async () => {
    const title = name.trim();
    if (!title) return;
    try {
      const raw = await AsyncStorage.getItem('rooms');
      const rooms: ChatRoom[] = raw ? JSON.parse(raw) : [];
      const now = Date.now();
      const newRoom: ChatRoom = {
        id: Date.now().toString(),
        name: title,
        messages: [],
        unreadCount: 0,
        lastActivity: new Date(now).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
        lastUpdatedMs: now,
        pinned: false,
        memberCount: Math.floor(Math.random() * 180) + 5,
        avatarEmoji: ['💬','👥','📚','🧑‍🏫','🧪','🖥️','🧠'][Math.floor(Math.random()*7)],
      };
      const next = [newRoom, ...rooms];
      await AsyncStorage.setItem('rooms', JSON.stringify(next));
      router.back();
    } catch (e) {
      Alert.alert(t('newChat.errorTitle'), t('newChat.errorMessage'));
    }
  };

  return (
    <View className="flex-1 bg-white p-lg">
      <Text className="text-2xl font-raleway-bold text-primary mb-md">{t('newChat.title')}</Text>
      <TextInput
        className="border border-gray-300 rounded-md px-md py-sm"
        placeholder={t('newChat.namePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={60}
      />
      <Pressable className={`mt-lg px-lg py-sm rounded-md ${name.trim() ? 'bg-primary' : 'bg-gray-300'}`} disabled={!name.trim()} onPress={createChat}>
        <Text className="text-white text-center">{t('newChat.create')}</Text>
      </Pressable>
    </View>
  );
}

