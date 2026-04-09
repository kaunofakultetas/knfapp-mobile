import { useAuth } from '@/context/AuthContext';
import { addCommentApi, CommentResponse, fetchComments } from '@/services/api';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';

export default function NewsCommentsScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    if (!postId) return;
    try {
      const data = await fetchComments(postId, 1, 50);
      setComments(data.comments);
    } catch {
      // leave empty
    }
  }, [postId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadComments();
      setLoading(false);
    })();
  }, [loadComments]);

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

  return (
    <View className="flex-1 bg-white">
      <View className="bg-primary px-lg py-md">
        <Text className="text-white text-2xl font-raleway-bold">
          {t('newsPost.commentsTitle', 'Komentarai')}
        </Text>
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B003F" />
        </View>
      ) : (
        <FlatList
          className="flex-1 p-lg"
          data={comments}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <View className="flex-row items-start mb-md">
              <View className="w-10 h-10 rounded-full bg-gray-300 mr-md items-center justify-center">
                <Text className="text-gray-600 font-bold">
                  {(item.userName || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View className="flex-1 bg-gray-100 rounded-md p-sm">
                <Text className="text-xs text-primary font-bold mb-0.5">{item.userName}</Text>
                <Text className="text-sm text-gray-800">{item.text}</Text>
                <Text className="text-xs text-gray-500 mt-1">{item.time}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text className="text-center text-gray-600 mt-lg">
              {t('newsPost.noComments', 'Dar nėra komentarų')}
            </Text>
          }
        />
      )}
      {isAuthenticated ? (
        <View className="flex-row items-center p-lg border-t border-gray-200">
          <TextInput
            className="flex-1 border border-gray-300 rounded-md px-sm py-xs mr-sm"
            placeholder={t('newsPost.inputPlaceholder', 'Įrašykite komentarą...')}
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
              <Text className="text-white">{t('common.send', 'Siųsti')}</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View className="p-lg border-t border-gray-200">
          <Text className="text-gray-400 text-sm text-center italic">
            {t('newsPost.loginToComment', 'Prisijunkite, kad galėtumėte komentuoti')}
          </Text>
        </View>
      )}
    </View>
  );
}
