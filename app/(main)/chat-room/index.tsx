import type { ChatRoom } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface Message {
  id: string;
  text: string;
  time: string;
  user: string;
  isOwn?: boolean;
  status?: 'sent' | 'read';
  liked?: boolean;
}

const MessageComponent = ({ item, onLongPress }: { item: Message; onLongPress: () => void }) => {
  return (
    <TouchableOpacity activeOpacity={0.85} onLongPress={onLongPress} className={`my-1 p-2.5 rounded-lg max-w-[80%] ${item.isOwn ? 'self-end bg-primary' : 'self-start bg-white border border-gray-200'}`}>
      {!item.isOwn && (
        <Text className="text-xs font-bold text-primary mb-1">{item.user}</Text>
      )}
      <Text className={`text-base ${item.isOwn ? 'text-white' : 'text-black'}`}>{item.text} {item.liked ? '❤️' : ''}</Text>
      <View className={`flex-row items-center mt-1 ${item.isOwn ? 'self-end' : ''}`}>
        <Text className={`text-xs ${item.isOwn ? 'text-white/70' : 'text-gray-500'}`}>{item.time}</Text>
        {item.isOwn && (
          <Ionicons name={item.status === 'read' ? 'checkmark-done' : 'checkmark'} size={14} color={item.status === 'read' ? 'white' : 'white'} style={{ marginLeft: 6 }} />
        )}
      </View>
    </TouchableOpacity>
  );
};

export default function ChatRoomScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello guys, welcome!',
      time: '07:50',
      user: 'Tomer',
      isOwn: false,
    },
    {
      id: '2',
      text: 'Sveiki, Pirmakursiai!',
      time: '09:30',
      user: 'Eglė',
      isOwn: false,
    },
    {
      id: '3',
      text: 'Labas! Ačiū už kvietimą!',
      time: '09:32',
      user: 'Tu',
      isOwn: true,
    },
  ]);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: false });
  }, []);

  // Mark room as read on enter
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('rooms');
        const rooms: ChatRoom[] = raw ? JSON.parse(raw) : [];
        const next = rooms.map((r) => (r.id === id ? { ...r, unreadCount: 0 } : r));
        await AsyncStorage.setItem('rooms', JSON.stringify(next));
      } catch {}
    })();
  }, [id]);

  const sendMessage = () => {
    if (newMessage.trim()) {
      const message: Message = {
        id: Date.now().toString(),
        text: newMessage.trim(),
        time: new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
        user: 'Tu',
        isOwn: true,
        status: 'sent',
      };
      
      setMessages(prev => [...prev, message]);
      setNewMessage('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'read' } : m));
      }, 1200);

      // Update last activity in rooms store
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('rooms');
          const rooms: ChatRoom[] = raw ? JSON.parse(raw) : [];
          const next = rooms.map((r) => (r.id === id ? { ...r, lastActivity: message.time } : r));
          await AsyncStorage.setItem('rooms', JSON.stringify(next));
        } catch {}
      })();
    }
  };

  const toggleReaction = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, liked: !m.liked } : m));
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-100"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <SafeAreaView className="flex-1">
        <FlatList
          className="flex-1 px-4 py-2.5"
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageComponent item={item} onLongPress={() => toggleReaction(item.id)} />
          )}
          showsVerticalScrollIndicator={false}
          ref={listRef}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
        <View className="flex-row items-end px-4 py-2.5 bg-white border-t border-gray-200" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <TextInput
            className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 mr-2.5 max-h-20 text-base"
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder={t('chat.inputPlaceholder')}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            className={`bg-primary rounded-full w-10 h-10 justify-center items-center ${!newMessage.trim() && 'bg-gray-200'}`}
            onPress={sendMessage}
            disabled={!newMessage.trim()}
          >
            <Ionicons name="send" size={20} color={newMessage.trim() ? 'white' : 'gray'} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

