import Header from '@/components/ui/Header';
import { MOCK_CHAT_ROOMS } from '@/constants/Data';
import type { ChatRoom } from '@/types';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

// Using shared ChatRoom type from '@/types'

const ChatComponent = ({ item, onPress, onLongPress, onTogglePin, onDelete }: { item: ChatRoom; onPress: () => void; onLongPress: () => void; onTogglePin: () => void; onDelete: () => void }) => {
  const { t } = useTranslation();
  const lastMessage = item.messages[item.messages.length - 1];
  const renderRightActions = () => (
    <View className="flex-row h-full">
      <Pressable className="bg-gray-200 w-[70px] items-center justify-center" onPress={onTogglePin}>
        <Text>{item.pinned ? t('messages.unpin') : t('messages.pin')}</Text>
      </Pressable>
      <Pressable className="bg-danger w-[70px] items-center justify-center" onPress={onDelete}>
        <Text className="text-white">{t('messages.delete')}</Text>
      </Pressable>
    </View>
  );
  
  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false} friction={2}>
      <Pressable className="flex-row justify-between items-center rounded-md p-4 bg-white shadow-sm my-1" onPress={onPress} onLongPress={onLongPress}>
        <View className="w-11 h-11 rounded-full bg-gray-100 items-center justify-center mr-3">
          <Text className="text-xl">{item.avatarEmoji || '💬'}</Text>
        </View>

        <View className="flex-row justify-between flex-1">
          <View>
            <Text className="text-gray-800 text-lg font-bold">{item.name}</Text>
            <Text className="text-gray-800 text-sm opacity-70 mt-1.5" numberOfLines={1}>
              {lastMessage?.text ? lastMessage.text : t('messages.tapToStart')}
            </Text>
            {!!item.memberCount && (
              <Text className="text-[11px] text-gray-500 mt-0.5">{t('messages.members', { count: item.memberCount })}</Text>
            )}
          </View>
          <View className="items-end">
            <Text className="opacity-50 text-xs">
              {lastMessage?.time ? lastMessage.time : t('messages.now')}
            </Text>
            <Pressable className="mt-1" onPress={onTogglePin} hitSlop={8}>
              <Text className="text-xs" style={{ color: item.pinned ? '#7B003F' : '#757575' }}>{item.pinned ? t('messages.unpin') : t('messages.pin')}</Text>
            </Pressable>
            {item.unreadCount ? (
              <View className="bg-primary rounded-full mt-1 self-end px-2 py-0.5">
                <Text className="text-white text-xs">{item.unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
};

export default function MessagesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('rooms');
        if (raw) setRooms(JSON.parse(raw));
        else setRooms(MOCK_CHAT_ROOMS);
      } catch {
        setRooms(MOCK_CHAT_ROOMS);
      }
    })();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('rooms');
          if (raw && mounted) setRooms(JSON.parse(raw));
        } catch {}
      })();
      return () => { mounted = false };
    }, [])
  );

  // Simulate incoming messages occasionally
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const raw = await AsyncStorage.getItem('rooms');
        const list: ChatRoom[] = raw ? JSON.parse(raw) : rooms;
        if (list.length === 0) return;
        const idx = Math.floor(Math.random() * list.length);
        const room = list[idx];
          const incoming = {
          id: Date.now().toString(),
            text: t('messages.newMessage'),
            time: new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
            user: t('messages.system'),
        };
        const updated: ChatRoom = {
          ...room,
          messages: [...room.messages, incoming],
          unreadCount: (room.unreadCount || 0) + 1,
          lastActivity: incoming.time,
          lastUpdatedMs: Date.now(),
        };
        const next = list.map((r, i) => (i === idx ? updated : r));
        await AsyncStorage.setItem('rooms', JSON.stringify(next));
        setRooms(next);
      } catch {}
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh
    setTimeout(() => setRefreshing(false), 700);
  };
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...rooms].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.lastUpdatedMs || 0) - (a.lastUpdatedMs || 0);
    });
    if (!q) return base;
    return base.filter((r) => r.name.toLowerCase().includes(q));
  }, [rooms, query]);

  const handleChatPress = (room: ChatRoom) => {
    router.push(`/(main)/chat-room?id=${room.id}&name=${encodeURIComponent(room.name)}`);
  };

  const handleNewChatPress = () => {
    router.push('/(main)/new-chat');
  };

  const togglePin = async (id: string) => {
    const next = rooms.map(r => r.id === id ? { ...r, pinned: !r.pinned } : r);
    setRooms(next);
    await AsyncStorage.setItem('rooms', JSON.stringify(next)).catch(() => {});
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
      </View>

      <View className="px-2.5 flex-1">
        <View className="mt-2.5">
          {filtered.length > 0 ? (
            <FlatList
              data={filtered}
              renderItem={({ item }) => (
                <ChatComponent 
                  item={item} 
                  onPress={() => handleChatPress(item)} 
                  onLongPress={async () => {
                    const next = rooms.filter(r => r.id !== item.id);
                    setRooms(next);
                    await AsyncStorage.setItem('rooms', JSON.stringify(next)).catch(() => {});
                  }}
                  onTogglePin={() => togglePin(item.id)}
                  onDelete={async () => {
                    const next = rooms.filter(r => r.id !== item.id);
                    setRooms(next);
                    await AsyncStorage.setItem('rooms', JSON.stringify(next)).catch(() => {});
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

