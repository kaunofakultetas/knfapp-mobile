// -----------------------------------------------------------
//  [*] Chat room — one conversation
//
//  The messaging screen behind a conversation row: inverted
//  live message list, composer with image attach and quick-👍,
//  long-press reactions with a reactors sheet, a fullscreen
//  image viewer and an in-conversation search behind the
//  header button. Opening the room (and every message that
//  arrives while it is open) marks the conversation read.
//
//  Data flows through the four chat hooks — useChatMessages
//  owns the list + socket room, useChatComposer the sends,
//  useChatReactions the picker, useTypingIndicator the "X
//  rašo…" banner. This file owns only screen concerns: the
//  header (title + search toggle), keyboard avoidance (iOS
//  padding offset by the stack header; Android relies on
//  adjustResize), and which modal is open. Reaction-viewer
//  rows and the image-viewer dataset are DERIVED from live
//  message state each render, so both stay current while open.
//
//  The screen only has value with an account (a conversation
//  id implies one) — logged out it renders a friendly login
//  prompt instead of fetching into a 401.
//
//  Split into (root component last):
//
//    QUICK_EMOJI    — the tap-to-append emoji strip's set
//    LoginPrompt    — logged-out body with a login action
//    MessageSearch  — debounced in-conversation search
//    EmojiQuickRow  — emoji strip above the composer
//    TypingBanner   — who-is-typing line above the composer
//    ChatRoomScreen — the room itself (default export)
// -----------------------------------------------------------

// Chat data hooks — list/socket, sends, reactions, typing
import { useChatComposer } from '@/hooks/chat/useChatComposer';
import { useChatMessages } from '@/hooks/chat/useChatMessages';
import { useChatReactions } from '@/hooks/chat/useChatReactions';
import { useTypingIndicator, type TypingUser } from '@/hooks/chat/useTypingIndicator';

// Chat UI pieces
import ImageViewerModal, { type ViewerImage } from '@/components/chat/ImageViewerModal';
import InputBar from '@/components/chat/InputBar';
import MessageList from '@/components/chat/MessageList';
import ReactionsPicker from '@/components/chat/ReactionsPicker';
import ReactionsViewer from '@/components/chat/ReactionsViewer';

// UI kit states
import { EmptyState, ErrorState, LoadingSpinner } from '@/components/ui';

// Search endpoint and render-time helpers
import { getUploadUrl, searchMessagesApi, type MessageSearchResult } from '@/services/api';
import { formatDateTime } from '@/services/format';

// Session, theme and navigation
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, usePathname, useRouter } from 'expo-router';

// Primitives
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';


// The strip appends into the draft — reactions have their own
// set in useChatReactions
const QUICK_EMOJI = ['😀', '😂', '😍', '😮', '😢', '😡', '👍', '🙏'];







// -----------------------------------------------------------
// LoginPrompt
// -----------------------------------------------------------
//
// The logged-out body: no fetches, no crash — an invitation to
// log in that routes back here through ?returnTo.
//
// Used by:
//   - ChatRoomScreen (below)
// -----------------------------------------------------------

function LoginPrompt() {

  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();


  return (
    <View className="flex-1 bg-canvas">
      <EmptyState
        icon="chatbubbles-outline"
        title={t('messages.loginRequired')}
        hint={t('messages.loginHint')}
        action={{
          label: t('settings.login'),
          onPress: () => router.push({ pathname: '/login', params: { returnTo: pathname } }),
        }}
      />
    </View>
  );
}







// -----------------------------------------------------------
// MessageSearch
// -----------------------------------------------------------
//
// The in-conversation search: a debounced (400 ms) query box
// with a result count line and tappable result rows showing
// sender + full date-time. Bubbles have variable heights, so
// jumping the inverted list to an arbitrary old message
// (scrollToIndex without getItemLayout) is not reliable —
// tapping a result therefore CLOSES the search back into the
// live conversation, and the hint line under the box says so.
//
// The debounce timer is cleared and in-flight responses are
// orphaned (sequence bump) on unmount, so closing the search
// can never repopulate stale results or set state after
// unmount.
//
// Used by:
//   - ChatRoomScreen (below)
// -----------------------------------------------------------

function MessageSearch({
  conversationId,
  onSelect,
}: {
  conversationId: string;
  onSelect: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);


  // Debounce timer + response sequence; the newest sequence is
  // the only one allowed to write state
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      seqRef.current += 1;
    },
    [],
  );


  const runSearch = async (q: string) => {
    const seq = ++seqRef.current;
    setSearching(true);
    try {
      const resp = await searchMessagesApi(conversationId, q, 30);
      if (seq !== seqRef.current) return;
      setResults(resp.messages);
      setTotal(resp.total);
    } catch {
      if (seq !== seqRef.current) return;
      setResults([]);
      setTotal(0);
    } finally {
      if (seq === seqRef.current) setSearching(false);
    }
  };


  const onQueryChange = (text: string) => {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = text.trim();
    if (!trimmed) {
      // Also orphans an in-flight response for the old query
      seqRef.current += 1;
      setResults([]);
      setTotal(0);
      setSearching(false);
      return;
    }

    timerRef.current = setTimeout(() => void runSearch(trimmed), 400);
  };


  const showSummary = query.trim().length > 0 && !searching;


  return (
    <View className="flex-1">

      {/* Query box + result count + the close-on-tap hint */}
      <View className="border-b border-line bg-surface px-sm py-sm">
        <View className="flex-row items-center rounded-lg bg-surface-soft px-sm py-xs">
          <Ionicons name="search" size={16} color={colors.inkFaint} />
          <TextInput
            className="ml-sm flex-1 font-raleway text-sm text-ink"
            placeholder={t('chat.searchPlaceholder')}
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel={t('chat.searchPlaceholder')}
            value={query}
            onChangeText={onQueryChange}
            autoFocus
          />
          {searching && <ActivityIndicator size="small" color={colors.brand} />}
        </View>
        {showSummary && (
          <Text className="ml-xs mt-xs font-raleway text-xs text-ink-soft">
            {total > 0
              ? t('chat.searchResults', { count: total })
              : t('chat.noSearchResults')}
          </Text>
        )}
        {showSummary && results.length > 0 && (
          <Text className="ml-xs mt-xs font-raleway text-xs text-ink-faint">
            {t('chat.searchJumpHint')}
          </Text>
        )}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerClassName="py-xs"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={onSelect}
            accessibilityRole="button"
            accessibilityLabel={`${item.senderName}, ${item.text}`}
            className={
              item.isOwn
                ? 'mx-sm my-xs rounded-xl bg-brand-soft p-sm'
                : 'mx-sm my-xs rounded-xl bg-surface p-sm'
            }
          >
            <View className="mb-xs flex-row items-center justify-between">
              <Text className="font-raleway-bold text-xs text-brand">{item.senderName}</Text>
              <Text className="font-raleway text-xs text-ink-soft">
                {formatDateTime(item.createdAt)}
              </Text>
            </View>
            <Text className="font-raleway text-sm text-ink">{item.text}</Text>
          </Pressable>
        )}
      />

    </View>
  );
}







// -----------------------------------------------------------
// EmojiQuickRow
// -----------------------------------------------------------
//
// The strip the composer's emoji button toggles — each tap
// appends into the draft (which also drives the typing emit).
//
// Used by:
//   - ChatRoomScreen (below)
// -----------------------------------------------------------

function EmojiQuickRow({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <View className="flex-row border-t border-line bg-surface px-sm py-xs">
      {QUICK_EMOJI.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => onPick(emoji)}
          accessibilityRole="button"
          accessibilityLabel={emoji}
          className="h-11 w-11 items-center justify-center"
        >
          <Text style={{ fontSize: 22 }}>{emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// TypingBanner
// -----------------------------------------------------------
//
// Formats the raw typer list from useTypingIndicator through
// the chat.typing keys — the hook stays language-free. Only
// rendered while someone is typing; the live region lets
// screen readers announce the change.
//
// Used by:
//   - ChatRoomScreen (below)
// -----------------------------------------------------------

function TypingBanner({ users }: { users: TypingUser[] }) {

  const { t } = useTranslation();


  const text =
    users.length === 1
      ? t('chat.typing', { name: users[0].displayName })
      : t('chat.typingMultiple', { names: users.map((u) => u.displayName).join(', ') });


  return (
    <View className="border-t border-line bg-canvas px-md py-xs" accessibilityLiveRegion="polite">
      <Text className="font-raleway text-xs italic text-ink-soft">{text}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// ChatRoomScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /chat-room
//     (params: conversationId, title)
// -----------------------------------------------------------

export default function ChatRoomScreen() {

  const { conversationId, title } = useLocalSearchParams<{
    conversationId: string;
    title?: string;
  }>();
  const convId = conversationId ?? '';

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();


  const chat = useChatMessages(convId);
  const composer = useChatComposer(convId, chat.setMessages);
  const reactions = useChatReactions(convId, chat.messages, chat.setMessages);
  const { typingUsers } = useTypingIndicator(convId);


  // Screen-owned modal/panel state
  const [searchOpen, setSearchOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [viewerImageId, setViewerImageId] = useState<string | null>(null);
  const [reactorsMessageId, setReactorsMessageId] = useState<string | null>(null);


  // Header: conversation title + the search toggle on the
  // burgundy bar (onBrand — the old brand-on-brand icon was
  // invisible)
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  useEffect(() => {
    navigation.setOptions({
      title: title || t('chat.title'),
      headerRight: () => (
        <Pressable
          onPress={toggleSearch}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? t('chat.closeSearch') : t('chat.openSearch')}
        >
          <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={colors.onBrand} />
        </Pressable>
      ),
    });
  }, [navigation, title, t, searchOpen, toggleSearch, colors.onBrand]);


  // Image viewer dataset: chronological (list state is newest-
  // first), resolved with getUploadUrl at render time, opened
  // by MESSAGE id so duplicate URLs land on the right entry
  const viewerImages = useMemo<ViewerImage[]>(() => {
    const rows: ViewerImage[] = [];
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (m.imageUrl) rows.push({ id: m.id, uri: getUploadUrl(m.imageUrl) });
    }
    return rows;
  }, [chat.messages]);
  const viewerIndex = Math.max(0, viewerImages.findIndex((img) => img.id === viewerImageId));


  // Reactors sheet rows — derived from LIVE message state, so
  // the open sheet follows reaction_update events; self is
  // named from the session (never a raw user id)
  const reactorRows = useMemo(() => {
    if (!reactorsMessageId) return [];
    const message = chat.messages.find((m) => m.id === reactorsMessageId);
    if (!message) return [];
    return message.reactions
      .filter((r) => r.byUserIds.length > 0)
      .map((r) => ({
        emoji: r.emoji,
        names: r.byUserIds.map((uid) =>
          uid === user?.id ? user.displayName : chat.participants[uid] ?? uid,
        ),
      }));
  }, [reactorsMessageId, chat.messages, chat.participants, user]);


  // The picker highlights the target's current own reaction
  // via bySelf — maintained by both the API mapping and the
  // optimistic updates
  const pickerTarget = chat.messages.find((m) => m.id === reactions.pickerTargetId);
  const isPicked = (emoji: string) =>
    !!pickerTarget?.reactions.some((r) => r.emoji === emoji && r.bySelf);


  if (!isAuthenticated) {
    return <LoginPrompt />;
  }


  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      // Android's adjustResize handles the keyboard by itself —
      // 'height' on top of it double-compensated and jumped
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >

      {searchOpen ? (
        <MessageSearch conversationId={convId} onSelect={() => setSearchOpen(false)} />
      ) : (
        <>
          {/* Message area — loading / error / empty / the list */}
          {chat.loading && chat.messages.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <LoadingSpinner text={t('common.loading')} />
            </View>
          ) : chat.error && chat.messages.length === 0 ? (
            <ErrorState message={t('chat.loadError')} onRetry={chat.retry} />
          ) : chat.messages.length === 0 ? (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title={t('chat.emptyTitle')}
              hint={t('chat.emptyHint')}
            />
          ) : (
            <MessageList
              messages={chat.messages}
              refreshing={chat.refreshing}
              onRefresh={() => void chat.refresh()}
              loadingOlder={chat.loadingOlder}
              hasMore={chat.hasMore}
              onLoadOlder={chat.loadOlder}
              onLongPress={(m) => reactions.openPicker(m.id)}
              onPressReactions={(m) => setReactorsMessageId(m.id)}
              onPressImage={(m) => setViewerImageId(m.id)}
              onRetry={composer.retryMessage}
            />
          )}

          {typingUsers.length > 0 && <TypingBanner users={typingUsers} />}

          {emojiOpen && (
            <EmojiQuickRow onPick={(emoji) => composer.onChangeText(composer.text + emoji)} />
          )}

          <InputBar
            value={composer.text}
            onChangeText={composer.onChangeText}
            onSend={composer.sendMessage}
            onQuickLike={composer.sendQuickLike}
            onAttachImage={() => void composer.attachImage()}
            onToggleEmoji={() => setEmojiOpen((open) => !open)}
            uploadingImage={composer.uploadingImage}
          />
        </>
      )}

      <ReactionsPicker
        visible={reactions.pickerOpen}
        options={reactions.reactionOptions}
        isSelected={isPicked}
        onPick={reactions.applyReaction}
        onClear={reactions.clearReaction}
        onClose={reactions.closePicker}
      />

      <ReactionsViewer
        visible={reactorsMessageId !== null}
        rows={reactorRows}
        onClose={() => setReactorsMessageId(null)}
      />

      <ImageViewerModal
        visible={viewerImageId !== null}
        images={viewerImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerImageId(null)}
      />

    </KeyboardAvoidingView>
  );
}
