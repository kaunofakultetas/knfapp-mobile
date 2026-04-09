import PollWidget from '@/components/PollWidget';
import { useAuth } from '@/context/AuthContext';
import { addCommentApi, CommentResponse, fetchComments, fetchNewsPost } from '@/services/api';
import type { NewsPost } from '@/types';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function NewsPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const [post, setPost] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    try {
      const data = await fetchNewsPost(postId);
      setPost(data);
    } catch {
      // Fallback: show error state
      setPost(null);
    }
  }, [postId]);

  const loadComments = useCallback(async () => {
    if (!postId) return;
    try {
      const data = await fetchComments(postId, 1, 50);
      setComments(data.comments);
    } catch {
      // Leave empty
    }
  }, [postId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadPost(), loadComments()]);
      setLoading(false);
    })();
  }, [loadPost, loadComments]);

  const addComment = async () => {
    if (!newComment.trim() || !postId || submitting) return;
    setSubmitting(true);
    try {
      const c = await addCommentApi(postId, newComment.trim());
      setComments((prev) => [c, ...prev]);
      setNewComment('');
    } catch {
      // silently fail
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#7B003F" />
      </View>
    );
  }

  if (!post) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-gray-500 text-lg">{t('newsPost.notFound')}</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white">
      <View>
        {post.imageUrl ? (
          <Image source={{ uri: post.imageUrl }} className="w-full h-[250px]" resizeMode="cover" />
        ) : null}

        <View className="bg-primary p-2.5 flex-row justify-between items-center">
          <Text className="text-white text-sm">{formatDate(post.date)}</Text>
          {post.source ? (
            <Text className="text-white/80 text-xs">
              {post.source === 'knf.vu.lt' ? t('news.sourceKnf') : post.source === 'vu.lt' ? t('news.sourceVu') : post.source === 'faculty' ? t('news.sourceFaculty') : post.source}
            </Text>
          ) : null}
        </View>

        <Text className="text-2xl font-bold text-gray-800 p-5 pb-2.5">{post.title}</Text>
        {post.author ? (
          <Text className="px-5 pb-2 text-sm text-gray-500">{post.author}</Text>
        ) : null}
        <Text className="text-base leading-6 text-gray-800 p-5 pt-0">{post.content}</Text>

        {post.postType === 'poll' && <PollWidget postId={post.id} />}

        {post.sourceUrl ? (
          <Pressable className="px-5 pb-5" onPress={() => Linking.openURL(post.sourceUrl!)}>
            <Text className="text-primary underline text-sm">{t('newsPost.readMore')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="px-5 pb-5">
        <Text className="text-lg font-raleway-bold mb-sm">{t('newsPost.commentsTitle')}</Text>
        {comments.length === 0 ? (
          <Text className="text-gray-600">{t('newsPost.noComments')}</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} className="bg-gray-100 rounded-md p-sm mb-sm">
              <Text className="text-xs text-primary font-bold mb-0.5">{c.userName}</Text>
              <Text className="text-sm text-gray-800">{c.text}</Text>
              <Text className="text-xs text-gray-500 mt-1">{c.time}</Text>
            </View>
          ))
        )}
        {isAuthenticated ? (
          <View className="flex-row items-center mt-sm">
            <TextInput
              className="flex-1 border border-gray-300 rounded-md px-sm py-xs mr-sm"
              placeholder={t('newsPost.inputPlaceholder')}
              value={newComment}
              onChangeText={setNewComment}
              maxLength={300}
            />
            <Pressable
              onPress={addComment}
              disabled={!newComment.trim() || submitting}
              className={`px-md py-xs rounded-md ${newComment.trim() && !submitting ? 'bg-primary' : 'bg-gray-300'}`}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white">{t('common.send')}</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Text className="text-gray-400 text-sm mt-sm italic">
            {t('newsPost.loginToComment')}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
