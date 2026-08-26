// -----------------------------------------------------------
//  [*] News — Create post
//
//  The community composer: optional title, content, optional
//  image and optional poll. Pushed from the news feed and
//  deep-linkable, so the whole screen sits behind
//  LoginRequiredOverlay — the backend rejects anonymous
//  POST /news anyway.
//
//  Publishing is a three-step flow with per-step failure
//  handling:
//    1. image upload — the RELATIVE upload.url is what gets
//       persisted as image_url (clients resolve it with
//       getUploadUrl at render time, so it survives host
//       changes); failure stops before the post exists;
//    2. the post itself — failure toasts and keeps the form;
//    3. the poll — the post already exists at this point, so
//       a failure keeps the user ON the screen with a
//       retry / continue-without-poll choice instead of
//       discarding the composed poll behind an info toast.
//
//  Split into (root component last):
//
//    AuthorRow        — avatar + display name + role line
//    ImageAttachment  — picker row, or preview with remove
//    PollForm         — question + 2–10 option fields
//    PollRetryPanel   — step-3 failure: retry or continue
//    CreatePostScreen — the form and flow (default export)
// -----------------------------------------------------------

// Auth gate and the signed-in author
import { useAuth } from '@/context/AuthContext';
import LoginRequiredOverlay from '@/components/LoginRequiredOverlay';

// The three publish steps
import { createPollApi, createPost, uploadImageApi } from '@/services/api';

// UI kit, toast and JS-side colors
import { Avatar, Button, Input, Screen } from '@/components/ui';
import { showToast } from '@/context/NetworkContext';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

// Navigation, keyboard offset and the bottom inset
import { useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Image picking
import * as ImagePicker from 'expo-image-picker';

// Form state and primitives
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

// The author's shape for AuthorRow
import type { User } from '@/types';


// Backend contract: a poll carries 2–10 options
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 10;

// These roles publish as the faculty, not as themselves
const STAFF_ROLES: readonly User['role'][] = ['admin', 'curator', 'teacher'];







// -----------------------------------------------------------
// AuthorRow
// -----------------------------------------------------------
//
// Who the post will be published as: staff roles show the
// faculty badge instead of a personal @username.
//
// Used by:
//   - CreatePostScreen (below)
// -----------------------------------------------------------

function AuthorRow({ user, isStaff }: { user: User; isStaff: boolean }) {

  const { t } = useTranslation();


  return (
    <View className="mb-lg flex-row items-center gap-md">
      <Avatar uri={user.avatarUrl} name={user.displayName} size={40} />
      <View>
        <Text className="font-raleway-bold text-base text-ink">{user.displayName}</Text>
        <Text className="font-raleway text-xs text-ink-soft">
          {isStaff ? t('createPost.facultyBadge') : '@' + user.username}
        </Text>
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// ImageAttachment
// -----------------------------------------------------------
//
// Without an asset: the "add image" row. With one: the local
// preview (the picker's file URI — nothing is uploaded until
// publish) and a scrim-backed remove chip.
//
// Used by:
//   - CreatePostScreen (below)
// -----------------------------------------------------------

interface ImageAttachmentProps {
  asset: ImagePicker.ImagePickerAsset | null;
  onPick: () => void;
  onRemove: () => void;
}

function ImageAttachment({ asset, onPick, onRemove }: ImageAttachmentProps) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  if (asset) {
    return (
      <View className="mb-md overflow-hidden rounded-md border border-line">
        <Image source={{ uri: asset.uri }} className="h-48 w-full" resizeMode="cover" />
        <Pressable
          className="absolute right-sm top-sm h-8 w-8 items-center justify-center rounded-full bg-scrim"
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('createPost.removeImage')}
        >
          <Ionicons name="close" size={18} color={colors.onBrand} />
        </Pressable>
      </View>
    );
  }


  return (
    <Pressable
      className="mb-md min-h-12 flex-row items-center gap-sm rounded-md border border-line-strong px-md py-sm"
      onPress={onPick}
      accessibilityRole="button"
      accessibilityLabel={t('createPost.addImage')}
    >
      <Ionicons name="image-outline" size={20} color={colors.inkSoft} />
      <Text className="font-raleway-medium text-sm text-ink-soft">{t('createPost.addImage')}</Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// PollForm
// -----------------------------------------------------------
//
// The poll draft: question plus option rows. The h-12 side
// columns (number disc, remove button) match the Input field
// height, so they stay centered on the field regardless of the
// Input container's own bottom margin.
//
// Used by:
//   - CreatePostScreen (below)
// -----------------------------------------------------------

interface PollFormProps {
  title: string;
  options: string[];
  onChangeTitle: (text: string) => void;
  onChangeOption: (index: number, text: string) => void;
  onAddOption: () => void;
  onRemoveOption: (index: number) => void;
}

function PollForm({
  title,
  options,
  onChangeTitle,
  onChangeOption,
  onAddOption,
  onRemoveOption,
}: PollFormProps) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="mb-md rounded-md border border-line bg-surface p-md">

      <Input
        label={t('createPost.pollQuestion')}
        placeholder={t('createPost.pollQuestionPlaceholder')}
        value={title}
        onChangeText={onChangeTitle}
        maxLength={200}
      />

      <Text className="mb-xs font-raleway-medium text-sm text-ink">
        {t('createPost.pollOptions')}
      </Text>

      {/* Bounded at MAX_POLL_OPTIONS — .map, not a FlatList case */}
      {options.map((option, index) => (
        <View key={index} className="flex-row items-start gap-sm">

          <View className="h-12 w-6 justify-center">
            <View className="h-6 w-6 items-center justify-center rounded-full border border-line-strong">
              <Text className="font-raleway text-xs text-ink-faint">{index + 1}</Text>
            </View>
          </View>

          <Input
            containerClassName="flex-1"
            placeholder={t('createPost.pollOptionPlaceholder', { n: index + 1 })}
            value={option}
            onChangeText={(text) => onChangeOption(index, text)}
            maxLength={100}
          />

          {options.length > MIN_POLL_OPTIONS && (
            <Pressable
              className="h-12 w-8 items-center justify-center"
              onPress={() => onRemoveOption(index)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('createPost.pollRemoveOption')}
            >
              <Ionicons name="close-circle" size={22} color={colors.inkFaint} />
            </Pressable>
          )}
        </View>
      ))}

      {options.length < MAX_POLL_OPTIONS && (
        <Pressable
          className="min-h-12 flex-row items-center gap-xs"
          onPress={onAddOption}
          accessibilityRole="button"
          accessibilityLabel={t('createPost.pollAddOption')}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
          <Text className="font-raleway-medium text-sm text-brand">
            {t('createPost.pollAddOption')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}







// -----------------------------------------------------------
// PollRetryPanel
// -----------------------------------------------------------
//
// Replaces the form when the post was published but attaching
// the poll failed: the composed question is shown so the user
// knows what a retry would send, next to a retry button and a
// continue-without-poll exit. The post itself is already live —
// there is nothing left to edit here.
//
// Used by:
//   - CreatePostScreen (below)
// -----------------------------------------------------------

interface PollRetryPanelProps {
  pollTitle: string;
  retrying: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}

function PollRetryPanel({ pollTitle, retrying, onRetry, onDiscard }: PollRetryPanelProps) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="rounded-md border border-warning bg-warning-soft p-md">

      <View className="mb-sm flex-row items-center gap-sm">
        <Ionicons name="alert-circle-outline" size={22} color={colors.warning} />
        <Text className="flex-1 font-raleway-bold text-base text-ink">
          {t('createPost.pollError')}
        </Text>
      </View>

      <Text className="mb-md font-raleway text-sm text-ink-soft">{pollTitle}</Text>

      <View className="gap-sm">
        <Button title={t('common.tryAgain')} onPress={onRetry} loading={retrying} />
        <Button
          title={t('createPost.pollDiscard')}
          variant="ghost"
          onPress={onDiscard}
          disabled={retrying}
        />
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// CreatePostScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /create-post, pushed from
//     the news feed's compose button
// -----------------------------------------------------------

export default function CreatePostScreen() {

  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();


  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);


  const [showPoll, setShowPoll] = useState(false);
  const [pollTitle, setPollTitle] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);


  // Step-3 failure state: the post with this id is already
  // live, only its poll is missing — drives PollRetryPanel
  const [pollFailedPostId, setPollFailedPostId] = useState<string | null>(null);
  const [retryingPoll, setRetryingPoll] = useState(false);


  // Return-key chaining: title advances into the content field
  const contentRef = useRef<TextInput>(null);


  const isStaff = !!user && STAFF_ROLES.includes(user.role);
  const validPollOptions = pollOptions
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  const isPollValid =
    !showPoll || (pollTitle.trim().length > 0 && validPollOptions.length >= MIN_POLL_OPTIONS);


  const updatePollOption = (index: number, text: string) => {
    setPollOptions((prev) => prev.map((option, i) => (i === index ? text : option)));
  };


  const addPollOption = () => {
    setPollOptions((prev) =>
      prev.length < MAX_POLL_OPTIONS ? [...prev, ''] : prev,
    );
  };


  const removePollOption = (index: number) => {
    setPollOptions((prev) =>
      prev.length > MIN_POLL_OPTIONS ? prev.filter((_, i) => i !== index) : prev,
    );
  };


  // Switching the poll off also clears its draft, so a
  // reopened section never resurrects stale options
  const togglePoll = () => {
    if (showPoll) {
      setPollTitle('');
      setPollOptions(['', '']);
    }
    setShowPoll((visible) => !visible);
  };


  // launchImageLibraryAsync can reject (permissions, platform
  // quirks) — an onPress handler must not leak the rejection
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]) {
        setImageAsset(result.assets[0]);
      }
    } catch {
      showToast('error', t('createPost.imagePickError'));
    }
  };


  const attachPoll = (postId: string) => createPollApi(postId, pollTitle.trim(), validPollOptions);


  // The three-step publish flow from the file header
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
      // Step 1 — image; a failure here stops before the post exists
      let imageUrl: string | undefined;
      if (imageAsset) {
        try {
          const upload = await uploadImageApi(
            imageAsset.uri,
            imageAsset.fileName || undefined,
            imageAsset.mimeType || undefined,
          );
          // RELATIVE path on purpose — the backend stores it
          // verbatim and every client resolves it with
          // getUploadUrl at render time
          imageUrl = upload.url;
        } catch {
          showToast('error', t('createPost.imageUploadError'));
          return;
        }
      }

      // Step 2 — the post
      const post = await createPost({
        content: trimmedContent,
        title: title.trim() || undefined,
        image_url: imageUrl,
      });

      // Step 3 — the poll; the post is live now, so a failure
      // switches to retry-in-place instead of navigating away
      if (showPoll) {
        try {
          await attachPoll(post.id);
        } catch {
          showToast('info', t('createPost.pollError'));
          setPollFailedPostId(post.id);
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


  const retryPoll = async () => {
    if (!pollFailedPostId) return;

    setRetryingPoll(true);
    try {
      await attachPoll(pollFailedPostId);
      showToast('success', t('createPost.pollRetrySuccess'));
      router.back();
    } catch {
      showToast('error', t('createPost.pollError'));
    } finally {
      setRetryingPoll(false);
    }
  };


  // The post is already published — leaving just drops the poll
  const discardPoll = () => {
    router.back();
  };


  return (
    <LoginRequiredOverlay
      headerTitle={t('createPost.title')}
      icon="create-outline"
      message={t('createPost.loginRequired')}
      hint={t('createPost.loginRequiredHint')}
    >
      <Screen>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={headerHeight}
        >
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-md"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >

            {pollFailedPostId ? (
              <PollRetryPanel
                pollTitle={pollTitle.trim()}
                retrying={retryingPoll}
                onRetry={retryPoll}
                onDiscard={discardPoll}
              />
            ) : (
              <>
                {user && <AuthorRow user={user} isStaff={isStaff} />}

                <Input
                  label={t('createPost.titleLabel')}
                  placeholder={t('createPost.titlePlaceholder')}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={200}
                  onSubmitEditing={() => contentRef.current?.focus()}
                />

                <Input
                  ref={contentRef}
                  label={t('createPost.contentLabel')}
                  placeholder={t('createPost.contentPlaceholder')}
                  value={content}
                  onChangeText={setContent}
                  multiline
                  maxLength={5000}
                  style={{ minHeight: 120 }}
                />

                <ImageAttachment
                  asset={imageAsset}
                  onPick={pickImage}
                  onRemove={() => setImageAsset(null)}
                />

                {/* Poll toggle — switching off clears the draft */}
                <Pressable
                  className={`mb-md min-h-12 flex-row items-center gap-sm rounded-md border px-md py-sm ${
                    showPoll ? 'border-brand bg-brand-soft' : 'border-line-strong'
                  }`}
                  onPress={togglePoll}
                  accessibilityRole="button"
                  accessibilityLabel={t('createPost.addPoll')}
                  accessibilityState={{ expanded: showPoll }}
                >
                  <Ionicons
                    name={showPoll ? 'stats-chart' : 'stats-chart-outline'}
                    size={20}
                    color={showPoll ? colors.brand : colors.inkSoft}
                  />
                  <Text
                    className={`flex-1 font-raleway-medium text-sm ${
                      showPoll ? 'text-brand' : 'text-ink-soft'
                    }`}
                  >
                    {t('createPost.addPoll')}
                  </Text>
                  {showPoll && <Ionicons name="close-circle" size={20} color={colors.brand} />}
                </Pressable>

                {showPoll && (
                  <PollForm
                    title={pollTitle}
                    options={pollOptions}
                    onChangeTitle={setPollTitle}
                    onChangeOption={updatePollOption}
                    onAddOption={addPollOption}
                    onRemoveOption={removePollOption}
                  />
                )}

                <Button
                  title={t('createPost.submit')}
                  onPress={handleSubmit}
                  loading={submitting}
                  disabled={!content.trim() || !isPollValid}
                  size="lg"
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </LoginRequiredOverlay>
  );
}
