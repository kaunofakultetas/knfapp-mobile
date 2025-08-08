import { MOCK_NEWS_POSTS } from '@/constants/Data';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

type Comment = { id: string; text: string; time: string };

export default function NewsPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { t } = useTranslation();

  const post = MOCK_NEWS_POSTS.find((p) => p.id === postId) || {
    id: '0',
    title: 'Naujienos straipsnis',
    date: 'Data nežinoma',
    imageUrl: '',
    author: '',
    likes: 0,
    comments: 0,
    shares: 0,
    content: 'Straipsnio turinys nerasta.'
  };

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
    const next = [...comments, c];
    setComments(next);
    setNewComment('');
    await AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
  };

  return (
    <ScrollView className="flex-1 bg-white">
      <View>
        {post.imageUrl ? (
          <Image source={{ uri: post.imageUrl }} className="w-full h-[250px]" resizeMode="cover" />
        ) : null}
        
        <View className="bg-primary p-2.5">
          <Text className="text-white text-sm">{post.date}</Text>
        </View>

        <Text className="text-2xl font-bold text-gray-800 p-5 pb-2.5">{post.title}</Text>
        
        <Text className="text-base leading-6 text-gray-800 p-5 pt-0">{post.content}</Text>
      </View>

      <View className="px-5 pb-5">
        <Text className="text-lg font-raleway-bold mb-sm">{t('newsPost.commentsTitle')}</Text>
        {comments.length === 0 ? (
          <Text className="text-gray-600">{t('newsPost.noComments')}</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} className="bg-gray-100 rounded-md p-sm mb-sm">
              <Text className="text-sm text-gray-800">{c.text}</Text>
              <Text className="text-xs text-gray-500 mt-1">{c.time}</Text>
            </View>
          ))
        )}
        <View className="flex-row items-center mt-sm">
          <TextInput
            className="flex-1 border border-gray-300 rounded-md px-sm py-xs mr-sm"
            placeholder={t('newsPost.inputPlaceholder')}
            value={newComment}
            onChangeText={setNewComment}
            maxLength={300}
          />
          <Pressable onPress={addComment} disabled={!newComment.trim()} className={`px-md py-xs rounded-md ${newComment.trim() ? 'bg-primary' : 'bg-gray-300'}`}>
            <Text className="text-white">{t('common.send')}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

