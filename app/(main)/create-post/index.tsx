import { useAuth } from '@/context/AuthContext';
import { createPost } from '@/services/api';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function CreatePostScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isStaff = user?.role && ['admin', 'curator', 'teacher'].includes(user.role);

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      Alert.alert(t('createPost.contentRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await createPost({
        content: trimmedContent,
        title: title.trim() || undefined,
      });
      Alert.alert(t('createPost.success'));
      router.back();
    } catch {
      Alert.alert(t('createPost.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView className="flex-1 p-5" keyboardShouldPersistTaps="handled">
        {/* Author info */}
        <View className="flex-row items-center mb-5">
          <View className="w-10 h-10 rounded-full bg-[#7B003F] items-center justify-center mr-3">
            <Text className="text-lg text-white font-bold">
              {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View>
            <Text className="font-semibold text-gray-900">{user?.displayName}</Text>
            <Text className="text-xs text-gray-500">
              {isStaff ? 'Faculty' : '@' + user?.username}
            </Text>
          </View>
        </View>

        {/* Title input */}
        <Text className="text-sm font-medium text-gray-700 mb-1">
          {t('createPost.titleLabel')}
        </Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base text-gray-900"
          placeholder={t('createPost.titlePlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />

        {/* Content input */}
        <Text className="text-sm font-medium text-gray-700 mb-1">
          {t('createPost.contentLabel')}
        </Text>
        <TextInput
          className="border border-gray-200 rounded-xl px-4 py-3 mb-6 text-base text-gray-900 min-h-[160px]"
          placeholder={t('createPost.contentPlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          maxLength={5000}
        />

        {/* Submit */}
        <Pressable
          className={`py-3.5 rounded-xl items-center ${submitting || !content.trim() ? 'bg-gray-300' : 'bg-[#7B003F]'}`}
          onPress={handleSubmit}
          disabled={submitting || !content.trim()}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-semibold text-base">
              {t('createPost.submit')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
