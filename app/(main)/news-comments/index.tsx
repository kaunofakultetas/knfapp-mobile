import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

type Comment = { id: string; text: string; time: string };

export default function NewsCommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const storageKey = `comments_${postId}`;
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) setComments(JSON.parse(raw));
      } catch {}
    })();
  }, [storageKey]);

  const addComment = async () => {
    if (!newComment.trim()) return;
    const c: Comment = {
      id: Date.now().toString(),
      text: newComment.trim(),
      time: new Date().toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
    };
    const next = [c, ...comments];
    setComments(next);
    setNewComment('');
    await AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
  };

  return (
    <View className="flex-1 bg-white">
      <View className="bg-primary px-lg py-md">
        <Text className="text-white text-2xl font-raleway-bold">Komentarai</Text>
      </View>
      <FlatList
        className="flex-1 p-lg"
        data={comments}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View className="flex-row items-start mb-md">
            <View className="w-10 h-10 rounded-full bg-gray-300 mr-md" />
            <View className="flex-1 bg-gray-100 rounded-md p-sm">
              <Text className="text-sm text-gray-800">{item.text}</Text>
              <Text className="text-xs text-gray-500 mt-1">{item.time}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text className="text-center text-gray-600 mt-lg">Dar nėra komentarų</Text>}
      />
      <View className="flex-row items-center p-lg border-t border-gray-200">
        <TextInput
          className="flex-1 border border-gray-300 rounded-md px-sm py-xs mr-sm"
          placeholder="Įrašykite komentarą..."
          value={newComment}
          onChangeText={setNewComment}
          maxLength={300}
        />
        <Pressable onPress={addComment} disabled={!newComment.trim()} className={`px-md py-xs rounded-md ${newComment.trim() ? 'bg-primary' : 'bg-gray-300'}`}>
          <Text className="text-white">Siųsti</Text>
        </Pressable>
      </View>
    </View>
  );
}

