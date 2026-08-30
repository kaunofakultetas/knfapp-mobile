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
import {
  ApiError,
  createPollApi,
  createPost,
  fetchNewsPost,
  updatePost,
  uploadImageApi,
  type NewsPostDetail,
} from '@/services/api';

// UI kit, toast, discard confirm and JS-side colors
import { Avatar, Button, confirmAction, Input, Screen } from '@/components/ui';
import { showToast } from '@/context/NetworkContext';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

// Navigation, keyboard offset and the bottom inset
import { useNavigation, useRouter } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Image picking
import * as ImagePicker from 'expo-image-picker';

// Form state and primitives
import { useLoad } from '@/hooks/useLoad';
import { useRouteParam } from '@/hooks/useRouteParam';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  Keyboard,
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

// A poll option keeps a stable id from creation, so React
// keys and the update/remove handlers never lean on the array
// index (index keys misdirect edits after a removal)
interface PollOptionDraft {
  id: string;
  text: string;
}

let pollOptionSeq = 0;
const makePollOption = (): PollOptionDraft => ({ id: `option-${++pollOptionSeq}`, text: '' });







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
  options: PollOptionDraft[];
  onChangeTitle: (text: string) => void;
  onChangeOption: (id: string, text: string) => void;
  onAddOption: () => void;
  onRemoveOption: (id: string) => void;
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
        <View key={option.id} className="flex-row items-start gap-sm">

          <View className="h-12 w-6 justify-center">
            <View className="h-6 w-6 items-center justify-center rounded-full border border-line-strong">
              <Text className="font-raleway text-xs text-ink-faint">{index + 1}</Text>
            </View>
          </View>

          <Input
            containerClassName="flex-1"
            placeholder={t('createPost.pollOptionPlaceholder', { n: index + 1 })}
            value={option.text}
            onChangeText={(text) => onChangeOption(option.id, text)}
            maxLength={100}
          />

          {options.length > MIN_POLL_OPTIONS && (
            <Pressable
              className="h-12 w-8 items-center justify-center"
              onPress={() => onRemoveOption(option.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('createPost.pollRemoveOptionN', { n: index + 1 })}
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
// uploadErrorKey
// -----------------------------------------------------------
//
// Maps the backend's known upload rejections (file too large,
// type not allowed, content not a real image) plus the upload
// timeout to their own translated messages instead of echoing
// the English backend string; anything unrecognized falls
// back to the generic upload error.
//
// Used by:
//   - CreatePostScreen (below) — step-1 failure toast
// -----------------------------------------------------------

function uploadErrorKey(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'timeout') return 'createPost.imageUploadTimeout';
    if (err.status === 413 || /too large/i.test(err.message)) return 'createPost.imageTooLarge';
    if (/type not allowed/i.test(err.message)) return 'createPost.imageTypeNotAllowed';
    if (/does not match/i.test(err.message)) return 'createPost.imageInvalidContent';
  }
  return 'createPost.imageUploadError';
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


  // ---- edit mode ------------------------------------------
  // ?editPostId reuses this screen as the post editor: the
  // post is loaded HERE (never passed through params — content
  // can be 5000 chars), title/content prefill once, and the
  // image and poll sections stay out of it — editing is text
  // only, the cover and any poll ride along unchanged.
  const editPostId = useRouteParam('editPostId');
  const editing = !!editPostId;

  const editLoad = useLoad<NewsPostDetail | null>(
    async () => (editPostId ? fetchNewsPost(editPostId) : null),
    [editPostId],
  );

  // What the fields held before any typing — the dirty check
  // and the leave guard compare against this, not against ''
  const editOriginalRef = useRef<{ title: string; content: string } | null>(null);


  const [showPoll, setShowPoll] = useState(false);
  const [pollTitle, setPollTitle] = useState('');
  const [pollOptions, setPollOptions] = useState<PollOptionDraft[]>(() => [
    makePollOption(),
    makePollOption(),
  ]);


  // Step-3 failure state: the post with this id is already
  // live, only its poll is missing — drives PollRetryPanel
  const [pollFailedPostId, setPollFailedPostId] = useState<string | null>(null);
  const [retryingPoll, setRetryingPoll] = useState(false);


  // Return-key chaining: title advances into the content field
  const contentRef = useRef<TextInput>(null);


  // Keyboard reveal — the form's flavour of the feed screens'
  // scroll compensation: a blind offset shift would scroll the
  // TITLE field away when it is the one focused, so instead the
  // focused input is measured against the keyboard's top edge
  // and the form scrolls only by the overlap. Matters most for
  // the poll question and option fields, which sit at the
  // bottom of the form.
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  // The reveal runs once on the keyboard event (best effort —
  // scrollTo clamps against the PRE-shrink viewport, so on a
  // short form it can no-op) and once more from the
  // ScrollView's onLayout, when the KAV's resize is real and
  // the clamp is correct.
  const pendingRevealRef = useRef<number | null>(null);

  const revealFocusedInput = useCallback((keyboardTop: number) => {
    const input = TextInput.State.currentlyFocusedInput();
    if (!input) return;
    input.measureInWindow((_x, y, _width, height) => {
      // 16pt of breathing room under the field's bottom edge
      const overlap = y + height + 16 - keyboardTop;
      if (overlap <= 0) return;
      scrollRef.current?.scrollTo({
        y: scrollOffsetRef.current + overlap,
        animated: true,
      });
    });
  }, []);

  const applyPendingReveal = useCallback(() => {
    const keyboardTop = pendingRevealRef.current;
    if (keyboardTop == null) return;
    pendingRevealRef.current = null;
    revealFocusedInput(keyboardTop);
  }, [revealFocusedInput]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        pendingRevealRef.current = event.endCoordinates.screenY;
        revealFocusedInput(event.endCoordinates.screenY);
      },
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      pendingRevealRef.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [revealFocusedInput]);


  // A successful upload outlives a failed publish — keyed on
  // the picked asset's URI, so a retry reuses the URL instead
  // of uploading (and orphaning) another copy; picking a
  // different image invalidates it naturally
  const uploadedImageRef = useRef<{ uri: string; url: string } | null>(null);


  const isStaff = !!user && STAFF_ROLES.includes(user.role);
  const validPollOptions = pollOptions
    .map((option) => option.text.trim())
    .filter((option) => option.length > 0);


  // Anything composed means leaving must ask first; once the
  // post is published (success or PollRetryPanel), there is no
  // draft left to lose. The ref mirror feeds the []-deps
  // listener below; allowLeaveRef lets the success exits pass.
  const navigation = useNavigation();
  const allowLeaveRef = useRef(false);
  const editDirty =
    !!editOriginalRef.current &&
    (title !== editOriginalRef.current.title || content !== editOriginalRef.current.content);
  const hasDraft = editing
    ? editDirty
    : !pollFailedPostId &&
      !!(
        content.trim() ||
        title.trim() ||
        imageAsset ||
        pollTitle.trim() ||
        pollOptions.some((option) => option.text.trim())
      );
  const hasDraftRef = useRef(hasDraft);
  useEffect(() => {
    hasDraftRef.current = hasDraft;
  });


  // Prefill once per edit target; a post that is not the
  // caller's own (or failed to load) bounces straight back —
  // the backend would 404 the save anyway, this just says so
  // before any typing is lost
  useEffect(() => {
    if (!editing || editOriginalRef.current) return;

    if (editLoad.error || (!editLoad.loading && !editLoad.data)) {
      showToast('error', t('createPost.error'));
      allowLeaveRef.current = true;
      router.back();
      return;
    }
    const post = editLoad.data;
    if (!post) return;

    if (!user || post.authorId !== user.id) {
      showToast('error', t('createPost.notYours'));
      allowLeaveRef.current = true;
      router.back();
      return;
    }

    editOriginalRef.current = { title: post.title ?? '', content: post.content ?? '' };
    setTitle(post.title ?? '');
    setContent(post.content ?? '');
  }, [editing, editLoad.data, editLoad.error, editLoad.loading, user, router, t]);


  // The stack registers this screen as "New post" — flip the
  // header the moment we know it is the editor instead
  useEffect(() => {
    if (editing) navigation.setOptions({ title: t('createPost.editTitle') });
  }, [editing, navigation, t]);


  // Back, the header arrow and gestures all funnel through
  // beforeRemove — a composed post is confirmed away, never
  // silently discarded
  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !hasDraftRef.current) return;
      event.preventDefault();
      void confirmAction({
        title: t('createPost.discardTitle'),
        message: t('createPost.discardMessage'),
        confirmLabel: t('createPost.discardConfirm'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      }).then((confirmed) => {
        if (confirmed) navigation.dispatch(event.data.action);
      });
    });
  }, [navigation, t]);


  // The success exits share one door: bypass the discard
  // confirm and survive a deep-linked mount with no back
  // stack to pop
  const leaveScreen = () => {
    allowLeaveRef.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/(main)/tabs/news');
  };


  const updatePollOption = (id: string, text: string) => {
    setPollOptions((prev) => prev.map((option) => (option.id === id ? { ...option, text } : option)));
  };


  const addPollOption = () => {
    setPollOptions((prev) =>
      prev.length < MAX_POLL_OPTIONS ? [...prev, makePollOption()] : prev,
    );
  };


  const removePollOption = (id: string) => {
    setPollOptions((prev) =>
      prev.length > MIN_POLL_OPTIONS ? prev.filter((option) => option.id !== id) : prev,
    );
  };


  // Switching the poll off also clears its draft, so a
  // reopened section never resurrects stale options
  const togglePoll = () => {
    if (showPoll) {
      setPollTitle('');
      setPollOptions([makePollOption(), makePollOption()]);
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

    // Edit mode: one PUT, no image step, no poll step. Title
    // rides along even when blank — the backend re-derives it
    // from the new content then, mirroring create
    if (editing && editPostId) {
      setSubmitting(true);
      try {
        await updatePost(editPostId, { title: title.trim(), content: trimmedContent });
        showToast('success', t('createPost.updateSuccess'));
        leaveScreen();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'timeout') {
          showToast('error', t('createPost.publishTimeout'));
        } else {
          showToast('error', t('createPost.error'));
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      // Step 1 — image; a failure here stops before the post
      // exists, and an asset already uploaded by an earlier
      // failed attempt is reused, not re-uploaded
      let imageUrl: string | undefined;
      if (imageAsset) {
        if (uploadedImageRef.current?.uri === imageAsset.uri) {
          imageUrl = uploadedImageRef.current.url;
        } else {
          try {
            const upload = await uploadImageApi(
              imageAsset.uri,
              imageAsset.fileName || undefined,
              imageAsset.mimeType || undefined,
              imageAsset.fileSize ?? undefined,
            );
            // RELATIVE path on purpose — the backend stores it
            // verbatim and every client resolves it with
            // getUploadUrl at render time
            imageUrl = upload.url;
            uploadedImageRef.current = { uri: imageAsset.uri, url: upload.url };
          } catch (err) {
            showToast('error', t(uploadErrorKey(err)));
            return;
          }
        }
      }

      // Step 2 — the post
      const post = await createPost({
        content: trimmedContent,
        title: title.trim() || undefined,
        image_url: imageUrl,
      });

      // Step 3 — the poll; the post is live now, so a failure
      // switches to retry-in-place instead of navigating away.
      // A 409 means the poll already exists server-side (an
      // earlier attempt landed) — that IS success.
      if (showPoll) {
        try {
          await attachPoll(post.id);
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) {
            showToast('info', t('createPost.pollError'));
            setPollFailedPostId(post.id);
            return;
          }
        }
      }

      showToast('success', t('createPost.success'));
      leaveScreen();
    } catch (err) {
      // A timeout cannot tell a lost request from a lost
      // response — the post may already exist server-side, so
      // warn before the user re-publishes a duplicate
      if (err instanceof ApiError && err.code === 'timeout') {
        showToast('error', t('createPost.publishTimeout'));
      } else {
        showToast('error', t('createPost.error'));
      }
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
      leaveScreen();
    } catch (err) {
      // 409 — the "failed" first attempt actually landed;
      // retrying forever against "already exists" helps nobody
      if (err instanceof ApiError && err.status === 409) {
        showToast('success', t('createPost.pollRetrySuccess'));
        leaveScreen();
        return;
      }
      showToast('error', t('createPost.pollError'));
    } finally {
      setRetryingPoll(false);
    }
  };


  // The post is already published — leaving just drops the poll
  const discardPoll = () => {
    leaveScreen();
  };


  return (
    // showHeader off: this route already gets the stack header
    // from (main)/_layout.tsx — the overlay's own bar would
    // stack a second burgundy header for logged-out visitors
    <LoginRequiredOverlay
      headerTitle={t('createPost.title')}
      showHeader={false}
      icon="create-outline"
      message={t('createPost.loginRequired')}
      hint={t('createPost.loginRequiredHint')}
    >
      <Screen>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={headerHeight}
        >
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName="p-md"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
            onScroll={(event) => {
              scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={32}
            onLayout={applyPendingReveal}
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

                {/* Editing is text-only: the cover and any poll
                    stay exactly as published */}
                {!editing && (
                <ImageAttachment
                  asset={imageAsset}
                  onPick={pickImage}
                  onRemove={() => setImageAsset(null)}
                />
                )}

                {/* Poll toggle — switching off clears the draft */}
                {!editing && (
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
                )}

                {!editing && showPoll && (
                  <PollForm
                    title={pollTitle}
                    options={pollOptions}
                    onChangeTitle={setPollTitle}
                    onChangeOption={updatePollOption}
                    onAddOption={addPollOption}
                    onRemoveOption={removePollOption}
                  />
                )}

                {/* Stays enabled on purpose: a tap with missing
                    content/poll fields fires handleSubmit's
                    explanatory toasts instead of a mute button */}
                <Button
                  title={t(editing ? 'createPost.saveChanges' : 'createPost.submit')}
                  onPress={handleSubmit}
                  loading={submitting || (editing && editLoad.loading)}
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
