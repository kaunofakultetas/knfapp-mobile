import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { createPollApi, createPost, uploadImageApi, getUploadUrl } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 10;

export default function CreatePostScreen() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Image state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  // Poll state
  const [showPoll, setShowPoll] = useState(false);
  const [pollTitle, setPollTitle] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const isStaff = user?.role && ['admin', 'curator', 'teacher'].includes(user.role);

  const updatePollOption = (index: number, text: string) => {
    setPollOptions((prev) => prev.map((o, i) => (i === index ? text : o)));
  };

  const addPollOption = () => {
    if (pollOptions.length < MAX_POLL_OPTIONS) {
      setPollOptions((prev) => [...prev, '']);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > MIN_POLL_OPTIONS) {
      setPollOptions((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const togglePoll = () => {
    if (showPoll) {
      // Clear poll state when hiding
      setPollTitle('');
      setPollOptions(['', '']);
    }
    setShowPoll(!showPoll);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setImageAsset(result.assets[0]);
    }
  };

  const removeImage = () => {
    setImageUri(null);
    setImageAsset(null);
  };

  const validPollOptions = pollOptions.filter((o) => o.trim().length > 0);
  const isPollValid = !showPoll || (pollTitle.trim().length > 0 && validPollOptions.length >= MIN_POLL_OPTIONS);

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      showToast('error', t('createPost.contentRequired'));
      return;
    }

    if (showPoll && !pollTitle.trim()) {
      showToast('error', t('createPost.pollTitleRequired'));
      return;
    }

    if (showPoll && validPollOptions.length < MIN_POLL_OPTIONS) {
      showToast('error', t('createPost.pollMinOptions'));
      return;
    }

    setSubmitting(true);
    try {
      // Upload image first if selected
      let imageUrl: string | undefined;
      if (imageAsset) {
        try {
          const upload = await uploadImageApi(
            imageAsset.uri,
            imageAsset.fileName || undefined,
            imageAsset.mimeType || undefined,
          );
          imageUrl = getUploadUrl(upload.url);
        } catch {
          showToast('error', t('createPost.imageUploadError'));
          setSubmitting(false);
          return;
        }
      }

      // Create the post
      const post = await createPost({
        content: trimmedContent,
        title: title.trim() || undefined,
        image_url: imageUrl,
      });

      // If poll is enabled, create poll on the new post
      if (showPoll && post.id) {
        try {
          await createPollApi(
            post.id,
            pollTitle.trim(),
            validPollOptions,
          );
        } catch {
          // Post was created but poll failed — still navigate back
          showToast('info', t('createPost.pollError'));
          router.back();
          return;
        }
      }

      showToast('success', t('createPost.success'));
      router.back();
    } catch {
      showToast('error', t('createPost.error'));
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
          <View className="w-10 h-10 rounded-full bg-primary items-center justify-center mr-3">
            <Text className="text-lg text-white font-raleway-bold">
              {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
          <View>
            <Text className="font-raleway-bold text-text-primary">{user?.displayName}</Text>
            <Text className="text-xs text-text-secondary font-raleway">
              {isStaff ? 'Faculty' : '@' + user?.username}
            </Text>
          </View>
        </View>

        {/* Title input */}
        <Text className="text-sm font-raleway-medium text-text-secondary mb-1">
          {t('createPost.titleLabel')}
        </Text>
        <TextInput
          className="border border-border-light rounded-xl px-4 py-3 mb-4 text-base text-text-primary font-raleway"
          placeholder={t('createPost.titlePlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />

        {/* Content input */}
        <Text className="text-sm font-raleway-medium text-text-secondary mb-1">
          {t('createPost.contentLabel')}
        </Text>
        <TextInput
          className="border border-border-light rounded-xl px-4 py-3 mb-4 text-base text-text-primary font-raleway min-h-[120px]"
          placeholder={t('createPost.contentPlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          maxLength={5000}
        />

        {/* Image attachment */}
        {imageUri ? (
          <View className="mb-4 rounded-xl overflow-hidden border border-border-light">
            <Image source={{ uri: imageUri }} className="w-full h-48" resizeMode="cover" />
            <Pressable
              className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
              onPress={removeImage}
            >
              <Ionicons name="close" size={18} color="white" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            className="flex-row items-center py-3 px-4 mb-4 rounded-xl border border-border-light"
            onPress={pickImage}
          >
            <Ionicons name="image-outline" size={20} color="#757575" />
            <Text className="ml-2 font-raleway-medium text-text-secondary">
              {t('createPost.addImage')}
            </Text>
          </Pressable>
        )}

        {/* Poll toggle */}
        <Pressable
          className={`flex-row items-center py-3 px-4 mb-4 rounded-xl border ${showPoll ? 'border-primary bg-primary/5' : 'border-border-light'}`}
          onPress={togglePoll}
        >
          <Ionicons
            name={showPoll ? 'stats-chart' : 'stats-chart-outline'}
            size={20}
            color={showPoll ? '#7B003F' : '#757575'}
          />
          <Text className={`ml-2 font-raleway-medium ${showPoll ? 'text-primary' : 'text-text-secondary'}`}>
            {t('createPost.addPoll')}
          </Text>
          {showPoll && (
            <Ionicons name="close-circle" size={18} color="#7B003F" style={{ marginLeft: 'auto' }} />
          )}
        </Pressable>

        {/* Poll form */}
        {showPoll && (
          <View className="mb-4 border border-border-light rounded-xl p-4 bg-background-secondary">
            <Text className="text-sm font-raleway-medium text-text-secondary mb-1">
              {t('createPost.pollQuestion')}
            </Text>
            <TextInput
              className="border border-border-light rounded-lg px-4 py-2.5 mb-3 text-base text-text-primary bg-white font-raleway"
              placeholder={t('createPost.pollQuestionPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={pollTitle}
              onChangeText={setPollTitle}
              maxLength={200}
            />

            <Text className="text-sm font-raleway-medium text-text-secondary mb-2">
              {t('createPost.pollOptions')}
            </Text>
            {pollOptions.map((option, index) => (
              <View key={index} className="flex-row items-center mb-2">
                <View className="w-6 h-6 rounded-full border-2 border-gray-300 items-center justify-center mr-2">
                  <Text className="text-xs text-gray-400">{index + 1}</Text>
                </View>
                <TextInput
                  className="flex-1 border border-border-light rounded-lg px-3 py-2 text-base text-text-primary bg-white font-raleway"
                  placeholder={t('createPost.pollOptionPlaceholder', { n: index + 1 })}
                  placeholderTextColor="#9CA3AF"
                  value={option}
                  onChangeText={(text) => updatePollOption(index, text)}
                  maxLength={100}
                />
                {pollOptions.length > MIN_POLL_OPTIONS && (
                  <Pressable onPress={() => removePollOption(index)} hitSlop={8} className="ml-2">
                    <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                  </Pressable>
                )}
              </View>
            ))}

            {pollOptions.length < MAX_POLL_OPTIONS && (
              <Pressable
                className="flex-row items-center py-2 mt-1"
                onPress={addPollOption}
              >
                <Ionicons name="add-circle-outline" size={20} color="#7B003F" />
                <Text className="ml-1.5 text-primary font-raleway-medium text-sm">
                  {t('createPost.pollAddOption')}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Submit */}
        <Pressable
          className={`py-3.5 rounded-xl items-center ${submitting || !content.trim() || !isPollValid ? 'bg-gray-300' : 'bg-primary'}`}
          onPress={handleSubmit}
          disabled={submitting || !content.trim() || !isPollValid}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-raleway-bold text-base">
              {t('createPost.submit')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
