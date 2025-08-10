import { MOCK_USERS } from '@/constants/Data';
import type { Conversation, ConversationParticipant } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';

export default function NewChatScreen() {
  const [name, setName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const router = useRouter();
  const { t } = useTranslation();

  const selectedUsers = useMemo(() => MOCK_USERS.filter(u => selectedUserIds.includes(u.id)), [selectedUserIds]);

  const toggleUser = (id: string) => {
    setSelectedUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const createChat = async () => {
    const title = name.trim();
    const isGroup = selectedUserIds.length > 1 || (title.length > 0 && selectedUserIds.length >= 1);
    if (!isGroup && selectedUserIds.length !== 1) {
      Alert.alert(t('newChat.errorTitle'), t('newChat.selectOneUser') || 'Select one person to start a direct chat');
      return;
    }
    try {
      const raw = await AsyncStorage.getItem('conversations');
      const list: Conversation[] = raw ? JSON.parse(raw) : [];
      const now = Date.now();
      const participants: ConversationParticipant[] = [
        { id: 'self', displayName: 'Tu' },
        ...MOCK_USERS.filter(u => selectedUserIds.includes(u.id)),
      ];
      const conv: Conversation = {
        id: `c-${now}`,
        type: isGroup ? 'group' : 'direct',
        title: isGroup ? (title || participants.filter(p => p.id !== 'self').map(p => p.displayName).slice(0, 3).join(', ')) : (participants.find(p => p.id !== 'self')?.displayName || 'Direct'),
        participants,
        messages: [],
        unreadCount: 0,
        lastUpdatedMs: now,
        pinned: false,
        avatarEmoji: isGroup ? ['💬','👥','📚','🧑‍🏫','🧪','🖥️','🧠'][Math.floor(Math.random()*7)] : undefined,
      };
      const next = [conv, ...list];
      await AsyncStorage.setItem('conversations', JSON.stringify(next));
      router.back();
    } catch (e) {
      Alert.alert(t('newChat.errorTitle'), t('newChat.errorMessage'));
    }
  };

  return (
    <View className="flex-1 bg-white p-lg">
      <Text className="text-2xl font-raleway-bold text-primary mb-md">{t('newChat.title')}</Text>
      <Text className="text-gray-800 mb-sm">{t('newChat.selectPeople') || 'Select people'}</Text>
      <FlatList
        data={MOCK_USERS}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable className="flex-row items-center py-2" onPress={() => toggleUser(item.id)}>
            <View className={`w-5 h-5 mr-3 rounded-sm border ${selectedUserIds.includes(item.id) ? 'bg-primary border-primary' : 'border-gray-400'}`} />
            <Text className="text-base">{item.displayName}</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-gray-200" />}
        style={{ maxHeight: 220 }}
      />
      <Text className="text-gray-800 mt-md mb-xs">{t('newChat.groupName') || 'Group name (optional)'}</Text>
      <TextInput
        className="border border-gray-300 rounded-md px-md py-sm"
        placeholder={t('newChat.namePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={60}
      />
      <Pressable className={`mt-lg px-lg py-sm rounded-md ${(selectedUserIds.length >= 1) ? 'bg-primary' : 'bg-gray-300'}`} disabled={selectedUserIds.length < 1} onPress={createChat}>
        <Text className="text-white text-center">{t('newChat.create')}</Text>
      </Pressable>
    </View>
  );
}

