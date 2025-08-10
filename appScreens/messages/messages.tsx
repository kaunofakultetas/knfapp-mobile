import Header from '@/components/ui/Header';
import { MOCK_CONVERSATIONS } from '@/constants/Data';
import type { Conversation } from '@/types';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import ConversationRow from './components/ConversationRow';

export default function MessagesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // unified list (no segments)

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('conversations');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length === 0) {
            setConversations(MOCK_CONVERSATIONS);
            await AsyncStorage.setItem('conversations', JSON.stringify(MOCK_CONVERSATIONS));
          } else {
            setConversations(parsed);
          }
        } else {
          setConversations(MOCK_CONVERSATIONS);
          await AsyncStorage.setItem('conversations', JSON.stringify(MOCK_CONVERSATIONS));
        }
      } catch {
        setConversations(MOCK_CONVERSATIONS);
        await AsyncStorage.setItem('conversations', JSON.stringify(MOCK_CONVERSATIONS)).catch(() => {});
      }
    })();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('conversations');
          if (raw && mounted) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length === 0) {
              setConversations(MOCK_CONVERSATIONS);
              await AsyncStorage.setItem('conversations', JSON.stringify(MOCK_CONVERSATIONS));
            } else {
              setConversations(parsed);
            }
          }
        } catch {}
      })();
      return () => { mounted = false };
    }, [])
  );

  // Simulate incoming messages occasionally
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const raw = await AsyncStorage.getItem('conversations');
        const list: Conversation[] = raw ? JSON.parse(raw) : conversations;
        if (list.length === 0) return;
        const idx = Math.floor(Math.random() * list.length);
        const room = list[idx];
        const incoming = {
          id: Date.now().toString(),
          conversationId: room.id,
          senderId: 'u-system',
          senderName: t('messages.system'),
          text: t('messages.newMessage'),
          time: new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
        };
        const updated: Conversation = {
          ...room,
          messages: [...room.messages, incoming],
          unreadCount: (room.unreadCount || 0) + 1,
          lastUpdatedMs: Date.now(),
        };
        const next = list.map((r, i) => (i === idx ? updated : r));
        await AsyncStorage.setItem('conversations', JSON.stringify(next));
        setConversations(next);
      } catch {}
    }, 20000);
    return () => clearInterval(timer);
  }, [conversations, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh
    setTimeout(() => setRefreshing(false), 700);
  };
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = [...conversations].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.lastUpdatedMs || 0) - (a.lastUpdatedMs || 0);
    });
    // unified: no filter by type
    if (!q) return base;
    return base.filter((r) => r.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const handleChatPress = (conv: Conversation) => {
    router.push(`/(main)/chat-room?conversationId=${conv.id}&title=${encodeURIComponent(conv.title)}&type=${conv.type}`);
  };

  const handleNewChatPress = () => {
    router.push('/(main)/new-chat');
  };

  const togglePin = async (id: string) => {
    const next = conversations.map(r => r.id === id ? { ...r, pinned: !r.pinned } : r);
    setConversations(next);
    await AsyncStorage.setItem('conversations', JSON.stringify(next)).catch(() => {});
  };

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
            <Feather name='edit' size={24} color='#7B003F' />
          </Pressable>
        </View>
        {/* unified list (no segmented control) */}
      </View>

      <View className="px-2.5 flex-1">
        <View className="mt-2.5">
          {filtered.length > 0 ? (
            <FlatList
              data={filtered}
              renderItem={({ item }) => (
                <ConversationRow 
                  item={item} 
                  onPress={() => handleChatPress(item)} 
                  onLongPress={async () => {
                    const next = conversations.filter(r => r.id !== item.id);
                    setConversations(next);
                    await AsyncStorage.setItem('conversations', JSON.stringify(next)).catch(() => {});
                  }}
                  onTogglePin={() => togglePin(item.id)}
                  onDelete={async () => {
                    const next = conversations.filter(r => r.id !== item.id);
                    setConversations(next);
                    await AsyncStorage.setItem('conversations', JSON.stringify(next)).catch(() => {});
                  }}
                />
              )}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
          ) : (
            <View className="items-center justify-center flex-1">
              <Text className="font-bold text-2xl pb-7">{t('messages.noRoomsTitle')}</Text>
              <Text>{t('messages.noRoomsSubtitle')}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

