import Header from '@/components/ui/Header';
import {
  deleteConversationApi,
  fetchConversations,
  togglePinApi,
} from '@/services/api';
import type { ApiConversation } from '@/services/api';
import type { Conversation } from '@/types';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';

import ConversationRow from './components/ConversationRow';

// Adapt ApiConversation to the Conversation shape ConversationRow expects
function toRowItem(c: ApiConversation): Conversation {
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    participants: c.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
    })),
    messages: c.lastMessage
      ? [
          {
            id: c.lastMessage.id,
            conversationId: c.id,
            senderId: c.lastMessage.senderId,
            senderName: c.lastMessage.senderName,
            text: c.lastMessage.text,
            time: c.lastMessage.time,
          },
        ]
      : [],
    unreadCount: c.unreadCount,
    lastUpdatedMs: c.lastUpdatedMs,
    pinned: c.pinned,
    avatarEmoji: c.avatarEmoji,
  };
}

export default function MessagesScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ApiConversation[]>([]);

  const loadConversations = useCallback(async () => {
    try {
      const resp = await fetchConversations();
      setConversations(resp.conversations);
    } catch {
      // API unavailable — keep current state
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on screen focus
  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...conversations].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.lastUpdatedMs || 0) - (a.lastUpdatedMs || 0);
    });
    if (!q) return base;
    return base.filter((r) => r.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const handleChatPress = (conv: ApiConversation) => {
    router.push(
      `/(main)/chat-room?conversationId=${conv.id}&title=${encodeURIComponent(conv.title)}&type=${conv.type}`,
    );
  };

  const handleNewChatPress = () => {
    router.push('/(main)/new-chat');
  };

  const togglePin = async (id: string) => {
    // Optimistic
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
    );
    togglePinApi(id).catch(() => {});
  };

  const deleteConv = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    deleteConversationApi(id).catch(() => {});
  };

  if (loading) {
    return (
      <View className="bg-white flex-1">
        <Header title={t('messages.title')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B003F" />
        </View>
      </View>
    );
  }

  return (
    <View className="bg-white flex-1 relative">
      <Header title={t('messages.title')} />
      <View className="px-lg py-md">
        <View className="flex-row items-center">
          <TextInput
            className="flex-1 bg-white border border-gray-300 text-gray-800 px-md py-xs rounded-md"
            placeholder={t('messages.searchPlaceholder')}
            placeholderTextColor="#757575"
            value={query}
            onChangeText={setQuery}
          />
          <Pressable className="ml-md" onPress={handleNewChatPress}>
            <Feather name="edit" size={24} color="#7B003F" />
          </Pressable>
        </View>
      </View>

      <View className="px-2.5 flex-1">
        <View className="mt-2.5">
          {filtered.length > 0 ? (
            <FlatList
              data={filtered}
              renderItem={({ item }) => (
                <ConversationRow
                  item={toRowItem(item)}
                  onPress={() => handleChatPress(item)}
                  onLongPress={() => deleteConv(item.id)}
                  onTogglePin={() => togglePin(item.id)}
                  onDelete={() => deleteConv(item.id)}
                />
              )}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            />
          ) : (
            <View className="items-center justify-center flex-1">
              <Text className="font-bold text-2xl pb-7">
                {t('messages.noRoomsTitle')}
              </Text>
              <Text>{t('messages.noRoomsSubtitle')}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
