import { showToast } from '@/context/NetworkContext';
import { createConversation, searchUsersApi } from '@/services/api';
import type { SearchUserResult } from '@/services/api';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function NewChatScreen() {
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();

  // Debounced user search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setUsers([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await searchUsersApi(q);
        setUsers(resp.users);
      } catch {
        setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectedUsers = users.filter((u) => selectedUserIds.includes(u.id));

  const toggleUser = useCallback((id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const createChat = async () => {
    const title = name.trim();
    const isGroup =
      selectedUserIds.length > 1 ||
      (title.length > 0 && selectedUserIds.length >= 1);
    if (!isGroup && selectedUserIds.length !== 1) {
      showToast('error', t('newChat.selectOneUser'));
      return;
    }

    setCreating(true);
    try {
      const groupEmojis = ['💬', '👥', '📚', '🧑‍🏫', '🧪', '🖥️', '🧠'];
      await createConversation({
        participantIds: selectedUserIds,
        type: isGroup ? 'group' : 'direct',
        title: isGroup
          ? title ||
            selectedUsers
              .map((u) => u.displayName)
              .slice(0, 3)
              .join(', ')
          : undefined,
        avatarEmoji: isGroup
          ? groupEmojis[Math.floor(Math.random() * groupEmojis.length)]
          : undefined,
      });
      router.back();
    } catch {
      showToast('error', t('newChat.errorMessage'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View className="flex-1 bg-white p-lg">
      <Text className="text-2xl font-raleway-bold text-primary mb-md">
        {t('newChat.title')}
      </Text>

      <Text className="text-text-primary mb-xs font-raleway-medium">
        {t('newChat.searchUsers') || 'Search users'}
      </Text>
      <TextInput
        className="border border-border-light rounded-md px-md py-sm mb-sm font-raleway"
        placeholder={t('newChat.searchPlaceholder') || 'Type a name...'}
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCapitalize="none"
      />

      {selectedUserIds.length > 0 && (
        <View className="flex-row flex-wrap mb-sm">
          {selectedUsers.map((u) => (
            <Pressable
              key={u.id}
              onPress={() => toggleUser(u.id)}
              className="bg-primary/10 rounded-full px-3 py-1 mr-2 mb-1 flex-row items-center"
            >
              <Text className="text-primary text-sm font-raleway">{u.displayName}</Text>
              <Text className="text-primary ml-1 font-raleway">×</Text>
            </Pressable>
          ))}
        </View>
      )}

      {searching && <ActivityIndicator size="small" color="#7B003F" />}

      <FlatList
        data={users}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Pressable
            className="flex-row items-center py-2"
            onPress={() => toggleUser(item.id)}
          >
            <View
              className={`w-5 h-5 mr-3 rounded-sm border ${
                selectedUserIds.includes(item.id)
                  ? 'bg-primary border-primary'
                  : 'border-gray-400'
              }`}
            />
            <View>
              <Text className="text-base font-raleway-medium text-text-primary">{item.displayName}</Text>
              <Text className="text-xs text-text-secondary font-raleway">@{item.username}</Text>
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-gray-200" />}
        style={{ maxHeight: 220 }}
        ListEmptyComponent={
          searchQuery.length >= 1 && !searching ? (
            <Text className="text-text-secondary text-center py-4 font-raleway">
              {t('newChat.noResults') || 'No users found'}
            </Text>
          ) : null
        }
      />

      <Text className="text-text-primary mt-md mb-xs font-raleway-medium">
        {t('newChat.groupName') || 'Group name (optional)'}
      </Text>
      <TextInput
        className="border border-border-light rounded-md px-md py-sm font-raleway"
        placeholder={t('newChat.namePlaceholder')}
        value={name}
        onChangeText={setName}
        maxLength={60}
      />

      <Pressable
        className={`mt-lg px-lg py-sm rounded-md ${
          selectedUserIds.length >= 1 && !creating ? 'bg-primary' : 'bg-gray-300'
        }`}
        disabled={selectedUserIds.length < 1 || creating}
        onPress={createChat}
      >
        {creating ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="text-white text-center font-raleway-bold">{t('newChat.create')}</Text>
        )}
      </Pressable>
    </View>
  );
}
