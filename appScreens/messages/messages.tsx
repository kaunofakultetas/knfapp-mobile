import Header from '@/components/ui/Header';
import { useSocketStatus } from '@/hooks/useSocketStatus';
import {
  deleteConversationApi,
  fetchConversations,
  togglePinApi,
} from '@/services/api';
import type { ApiConversation } from '@/services/api';
import { connectSocket, onNewMessage, type SocketMessage } from '@/services/socket';
import type { Conversation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

  const socketStatus = useSocketStatus();
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

  // Connect socket and listen for new messages to update conversation list
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const sock = await connectSocket();
      if (!sock) return;

      unsub = onNewMessage((_data: SocketMessage) => {
        // Refresh conversation list when any new message arrives
        loadConversations();
      });
    })();

    return () => { unsub?.(); };
  }, [loadConversations]);

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
      <View className="bg-background-secondary flex-1">
        <Header title={t('messages.title')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B003F" />
        </View>
      </View>
    );
  }

  return (
    <View className="bg-background-secondary flex-1 relative">
      <Header title={t('messages.title')} />
      {(socketStatus === 'reconnecting' || socketStatus === 'connecting') && (
        <View className="bg-amber-50 px-4 py-2 flex-row items-center justify-center border-b border-amber-200">
          <ActivityIndicator size="small" color="#d97706" />
          <Text className="text-amber-700 text-xs ml-2 font-raleway-medium">
            {t('messages.reconnecting', 'Jungiamasi...')}
          </Text>
        </View>
      )}
      {socketStatus === 'disconnected' && (
        <Pressable
          className="bg-red-50 px-4 py-2 flex-row items-center justify-center border-b border-red-200"
          onPress={() => connectSocket()}
        >
          <Ionicons name="cloud-offline-outline" size={14} color="#dc2626" />
          <Text className="text-red-700 text-xs ml-2 font-raleway-medium">
            {t('messages.disconnected', 'Atsijungta — bakstelėkite jungti iš naujo')}
          </Text>
        </Pressable>
      )}
      <View className="px-md py-md bg-white border-b border-gray-100">
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center bg-gray-50 rounded-lg px-3 py-2">
            <Ionicons name="search" size={18} color="#9E9E9E" />
            <TextInput
              className="flex-1 text-text-primary font-raleway text-base ml-2"
              placeholder={t('messages.searchPlaceholder')}
              placeholderTextColor="#9E9E9E"
              value={query}
              onChangeText={setQuery}
            />
          </View>
          <Pressable
            className="ml-md w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
            onPress={handleNewChatPress}
          >
            <Ionicons name="create-outline" size={20} color="#7B003F" />
          </Pressable>
        </View>
      </View>

      <View className="px-md flex-1">
        <View className="mt-sm">
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
            <View className="items-center justify-center flex-1 py-20">
              <Ionicons name="chatbubble-outline" size={48} color="#BDBDBD" />
              <Text className="font-raleway-bold text-xl text-text-primary mt-md">
                {t('messages.noRoomsTitle')}
              </Text>
              <Text className="font-raleway text-text-secondary mt-sm text-center px-lg">{t('messages.noRoomsSubtitle')}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
