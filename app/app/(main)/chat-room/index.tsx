// -----------------------------------------------------------
//  [*] Chat room — one conversation
//
//  The messaging screen behind a conversation row, built on
//  the chatkit: a grouped, time-stamped live feed with a
//  typing bubble and an intro card, a composer that replies
//  (from the context menu or a swipe) and quick-likes, and the
//  long-press context menu with quick reactions, reply, copy
//  and unsend. A reactors sheet, a fullscreen image viewer
//  and an in-conversation search sit behind the header; the
//  header itself shows the other party's portrait and
//  presence. Opening the room (and every message that arrives
//  while it is open) marks the conversation read.
//
//  Data flows through the four chat hooks — useChatMessages
//  owns the list + socket room (+ unsend, member profiles),
//  useChatComposer the sends and the reply target,
//  useChatReactions the context-menu target and reaction
//  toggles, useTypingIndicator the typers. This file owns
//  only screen concerns: the header, keyboard avoidance (iOS
//  padding offset by the stack header; Android relies on
//  adjustResize), the timeline built from the messages,
//  jump-to-quoted with its highlight, presence polling, and
//  which overlay is open. Reaction-viewer rows and the
//  image-viewer dataset are DERIVED from live message state
//  each render, so both stay current while open.
//
//  The screen only has value with an account (a conversation
//  id implies one) — logged out it renders a friendly login
//  prompt instead of fetching into a 401.
//
//  Split into (root component last):
//
//    QUICK_EMOJI    — the tap-to-append emoji strip's set
//    PRESENCE_MS    — presence polling period
//    LoginPrompt    — logged-out body with a login action
//    MessageSearch  — debounced in-conversation search (overlay)
//    EmojiQuickRow  — emoji strip above the composer
//    typingText     — the typers → "X rašo…" line
//    ChatRoomScreen — the room itself (default export)
// -----------------------------------------------------------

// Chat data hooks — list/socket, sends, reactions, typing
import { useChatComposer } from '@/hooks/chat/useChatComposer';
import { TEMP_ID_PREFIX, useChatMessages } from '@/hooks/chat/useChatMessages';
import { useChatReactions } from '@/hooks/chat/useChatReactions';
import { useTypingIndicator, type TypingUser } from '@/hooks/chat/useTypingIndicator';

// The messaging kit
import {
  buildTimeline,
  Composer,
  MessageContextMenu,
  MessageList,
  RoomHeaderTitle,
  useKitLabels,
  type ContextTarget,
  type KitMessage,
  type MessageListHandle,
} from '@/chatkit';

// Sheets outside the kit's scope
import ImageViewerModal, { type ViewerImage } from '@/components/chat/ImageViewerModal';
import ReactionsViewer from '@/components/chat/ReactionsViewer';

// UI kit states + dialogs
import { confirmAction, EmptyState, ErrorState, LoadingSpinner } from '@/components/ui';
import { showToast } from '@/context/NetworkContext';

// Search + presence endpoints and render-time helpers
import { fetchOnlineStatus, getUploadUrl, searchMessagesApi, type MessageSearchResult } from '@/services/api';
import { activeLocale, formatDateTime } from '@/services/format';

// Session, theme and navigation
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, usePathname, useRouter } from 'expo-router';

// Primitives
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';


// The strip appends into the draft — reactions have their own
// set in useChatReactions
const QUICK_EMOJI = ['😀', '😂', '😍', '😮', '😢', '😡', '👍', '🙏', '🎉', '🔥', '❤️', '👏'];

// How often the other party's presence is refreshed while the
// room is open, and how often the day rolls over for the
// "Today" stamps
const PRESENCE_MS = 30_000;
const DAY_TICK_MS = 60_000;







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
// sender + full date-time. Tapping a result closes the search
// and the screen scrolls the loaded feed to that message (the
// kit's scrollToMessage); a hit older than the loaded history
// gets a toast instead.
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
  onSelect: (messageId: string) => void;
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
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        className="flex-1"
        contentContainerClassName="py-xs"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.id)}
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      className="border-t border-line bg-surface"
      contentContainerClassName="px-sm py-xs"
    >
      {QUICK_EMOJI.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => onPick(emoji)}
          accessibilityRole="button"
          accessibilityLabel={emoji}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-soft"
        >
          <Text style={{ fontSize: 24 }}>{emoji}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}







// -----------------------------------------------------------
// typingText
// -----------------------------------------------------------
//
// Formats the raw typer list from useTypingIndicator through
// the chat.typing keys — the hook stays language-free, the
// kit's TypingBubble just shows the line.
//
// Used by:
//   - ChatRoomScreen (below)
// -----------------------------------------------------------

function typingText(users: TypingUser[], t: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (users.length === 0) return null;
  if (users.length === 1) return t('chat.typing', { name: users[0].displayName });
  return t('chat.typingMultiple', { names: users.map((u) => u.displayName).join(', ') });
}







// -----------------------------------------------------------
// ChatRoomScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /chat-room
//     (params: conversationId, title, type)
// -----------------------------------------------------------

export default function ChatRoomScreen() {

  const { conversationId, title, type } = useLocalSearchParams<{
    conversationId: string;
    title?: string;
    type?: string;
  }>();
  const convId = conversationId ?? '';

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();


  const labels = useKitLabels();
  const chat = useChatMessages(convId);
  const composer = useChatComposer(convId, chat.setMessages, chat.messages);
  const reactions = useChatReactions(convId, chat.messages, chat.setMessages);
  const { typingUsers } = useTypingIndicator(convId);
  // The hooks return fresh objects each render; the stable members
  // are what the memoised rows may depend on
  const { openPicker, closePicker } = reactions;
  const { setReplyTo } = composer;


  // Screen-owned panel state
  const [searchOpen, setSearchOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [viewerImageId, setViewerImageId] = useState<string | null>(null);
  const [reactorsMessageId, setReactorsMessageId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<ContextTarget | null>(null);
  // The source row stays hidden until the menu's close animation ends
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const listRef = useRef<MessageListHandle>(null);


  // Group chats name senders; a direct chat has only one other
  // voice. The server's conversation row is the truth once the
  // first page lands (a room opened from a push notification has
  // no route params); the params are the pre-load placeholder
  const isGroup = chat.conversation ? chat.conversation.type === 'group' : type === 'group';
  const others = useMemo(() => chat.profiles.filter((p) => p.id !== user?.id), [chat.profiles, user?.id]);
  const counterpart = !isGroup ? others[0] : undefined;
  const roomTitle = chat.conversation?.title || counterpart?.displayName || title || t('chat.title');
  const roomAvatar = counterpart?.avatarUrl ? getUploadUrl(counterpart.avatarUrl) : undefined;
  // Group identity: the other members as a stacked pair
  const members = useMemo(
    () => others.map((p) => ({ name: p.displayName, uri: p.avatarUrl ? getUploadUrl(p.avatarUrl) : undefined })),
    [others],
  );


  // Presence of the other party, refreshed while the room is open
  const [online, setOnline] = useState(false);
  useEffect(() => {
    if (!counterpart) return;
    let cancelled = false;
    const poll = async () => {
      const map = await fetchOnlineStatus([counterpart.id]);
      if (!cancelled) setOnline(!!map[counterpart.id]);
    };
    void poll();
    const timer = setInterval(() => void poll(), PRESENCE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [counterpart]);


  // Header: portrait + name + status on the burgundy bar, and
  // the search toggle
  const subtitle = isGroup
    ? t('chat.groupMembers', { count: chat.profiles.length })
    : online
      ? t('chat.online')
      : undefined;
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  useEffect(() => {
    navigation.setOptions({
      title: roomTitle,
      headerTitle: () => (
        <RoomHeaderTitle title={roomTitle} subtitle={subtitle} avatarUrl={roomAvatar} isGroup={isGroup} members={members} online={online} />
      ),
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
  }, [navigation, roomTitle, subtitle, roomAvatar, isGroup, members, online, t, searchOpen, toggleSearch, colors.onBrand]);


  // The kit's rows: grouped runs + time separators. The day key
  // ticks over at midnight so "Today" becomes "Yesterday" in a
  // room left open
  const timelineLabels = useMemo(
    () => ({ today: labels.today, yesterday: labels.yesterday, locale: activeLocale() }),
    [labels],
  );
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useEffect(() => {
    const timer = setInterval(() => {
      const next = new Date().toDateString();
      setDayKey((current) => (current === next ? current : next));
    }, DAY_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey forces the relabel
  const timeline = useMemo(() => buildTimeline(chat.messages, timelineLabels), [chat.messages, timelineLabels, dayKey]);


  // The intro card closes the history once there is no older page
  const intro = useMemo(
    () => ({
      title: roomTitle,
      subtitle: isGroup ? t('chat.groupMembers', { count: chat.profiles.length }) : labels.conversationStart,
      avatarUrl: roomAvatar,
      isGroup,
      members,
    }),
    [roomTitle, roomAvatar, isGroup, members, chat.profiles.length, t, labels.conversationStart],
  );


  // Typing line for the kit's bubble; group chats also get the
  // first typist's portrait
  const typing = useMemo(() => {
    const label = typingText(typingUsers, t);
    if (!label) return null;
    const first = chat.profiles.find((p) => p.id === typingUsers[0]?.userId);
    return { label, name: first?.displayName ?? typingUsers[0]?.displayName, avatarUrl: first?.avatarUrl ? getUploadUrl(first.avatarUrl) : undefined };
  }, [typingUsers, chat.profiles, t]);


  // Image viewer dataset: chronological (list state is newest-
  // first), resolved with getUploadUrl at render time, opened
  // by MESSAGE id so duplicate URLs land on the right entry
  const viewerImages = useMemo<ViewerImage[]>(() => {
    const rows: ViewerImage[] = [];
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (m.imageUrl && !m.deleted) rows.push({ id: m.id, uri: getUploadUrl(m.imageUrl) });
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


  // The context menu aims at the long-pressed message; its own
  // reaction (bySelf) is the ringed emoji. The live message is
  // looked up so reaction toggles reflect while the menu is open
  const menuMessage = menuTarget ? chat.messages.find((m) => m.id === menuTarget.message.id) ?? null : null;
  const liveTarget = menuTarget && menuMessage ? { ...menuTarget, message: menuMessage } : null;
  const selectedEmoji = menuMessage?.reactions.find((r) => r.bySelf)?.emoji ?? null;

  // Optimistic bubbles have no server row yet: a sending one
  // has no menu, a failed one can only be discarded
  const menuIsTemp = !!menuMessage?.id.startsWith(TEMP_ID_PREFIX);
  const menuCanAct = !!menuMessage && !menuIsTemp && !menuMessage.deleted;
  const openMenu = useCallback(
    (target: ContextTarget) => {
      if (target.message.status === 'sending') return;
      setMenuTarget(target);
      openPicker(target.message.id);
    },
    [openPicker],
  );
  const closeMenu = useCallback(() => {
    setMenuTarget(null);
    closePicker();
  }, [closePicker]);
  // The source row hides once the floating copy is on screen and
  // reappears when the close animation ends; a reply chosen in
  // the menu is applied on close too, so the composer focuses
  // after the Modal has given the window back
  const pendingReplyRef = useRef<KitMessage | null>(null);
  const onMenuOpened = useCallback((id: string) => setHiddenId(id), []);
  const onMenuClosed = useCallback(() => {
    setHiddenId(null);
    if (pendingReplyRef.current) {
      setReplyTo(pendingReplyRef.current);
      pendingReplyRef.current = null;
    }
  }, [setReplyTo]);


  const replyTo = useCallback(
    (message: KitMessage) => {
      pendingReplyRef.current = message;
      closeMenu();
    },
    [closeMenu],
  );

  const copyText = async (message: KitMessage) => {
    closeMenu();
    await Clipboard.setStringAsync(message.text);
    showToast('success', t('chat.copied'));
  };

  const unsend = async (message: KitMessage) => {
    closeMenu();
    if (message.id.startsWith(TEMP_ID_PREFIX)) {
      composer.discardMessage(message.id);
      return;
    }
    const ok = await confirmAction({
      title: t('chat.delete'),
      message: t('chat.deleteConfirm'),
      confirmLabel: t('chat.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) chat.deleteMessage(message.id);
  };


  // Jump to a message (quoted original, search hit): scroll it
  // into view and wash it; a message outside the loaded history
  // gets a toast
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpToMessage = useCallback(
    (targetId: string) => {
      if (!listRef.current?.scrollToMessage(targetId)) {
        showToast('info', t('chat.searchNotLoaded'));
        return;
      }
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      setHighlightedId(targetId);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1500);
    },
    [t],
  );
  const jumpToQuoted = useCallback(
    (message: KitMessage) => {
      if (message.replyTo?.id) jumpToMessage(message.replyTo.id);
    },
    [jumpToMessage],
  );
  const jumpFromSearch = (messageId: string) => {
    setSearchOpen(false);
    jumpToMessage(messageId);
  };
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);


  const toggleTime = useCallback((m: KitMessage) => setRevealedId((current) => (current === m.id ? null : m.id)), []);
  const openReactors = useCallback((m: KitMessage) => setReactorsMessageId(m.id), []);
  const openImage = useCallback((m: KitMessage) => setViewerImageId(m.id), []);
  const openLink = useCallback((href: string) => void Linking.openURL(href).catch(() => {}), []);
  // Only rows the server knows can be replied to; the menu also
  // opens on a failed temp (to discard it)
  const canAct = useCallback(
    (m: KitMessage) => !m.id.startsWith(TEMP_ID_PREFIX) || m.status === 'failed',
    [],
  );
  const canReply = useCallback((m: KitMessage) => !m.id.startsWith(TEMP_ID_PREFIX) && !m.deleted, []);
  const swipeReply = useCallback(
    (m: KitMessage) => {
      if (m.id.startsWith(TEMP_ID_PREFIX) || m.deleted) return;
      setReplyTo(m);
    },
    [setReplyTo],
  );


  // Android back and web Escape close the search before the screen
  useEffect(() => {
    if (!searchOpen) return;
    if (Platform.OS === 'android') {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSearchOpen(false);
        return true;
      });
      return () => sub.remove();
    }
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setSearchOpen(false);
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    return undefined;
  }, [searchOpen]);


  if (!isAuthenticated) {
    return <LoginPrompt />;
  }


  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      // Android's adjustResize handles the keyboard by itself —
      // 'height' on top of it double-compensated and jumped
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >

      {/* The search overlays the feed so the feed keeps its scroll
          position and its mounted rows for the jump */}
      {searchOpen ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 }} className="bg-surface">
          <MessageSearch conversationId={convId} onSelect={jumpFromSearch} />
        </View>
      ) : null}

      {
        <>
          {/* Message area — loading / error / the feed (an empty
              conversation shows just the intro card) */}
          {chat.loading && chat.messages.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <LoadingSpinner text={t('common.loading')} />
            </View>
          ) : chat.error && chat.messages.length === 0 ? (
            <ErrorState message={t('chat.loadError')} onRetry={chat.retry} />
          ) : (
            <MessageList
              ref={listRef}
              items={timeline}
              typing={typing}
              isGroup={isGroup}
              showAvatars
              intro={intro}
              loadingOlder={chat.loadingOlder}
              hasMore={chat.hasMore}
              onLoadOlder={chat.loadOlder}
              revealedId={revealedId}
              highlightedId={highlightedId}
              menuTargetId={hiddenId}
              canAct={canAct}
              canReply={canReply}
              onPressMessage={toggleTime}
              onLongPressMessage={openMenu}
              onSwipeReply={swipeReply}
              onPressQuote={jumpToQuoted}
              onPressReactions={openReactors}
              onPressImage={openImage}
              onRetry={composer.retryMessage}
              onPressLink={openLink}
            />
          )}

          {emojiOpen && (
            <EmojiQuickRow onPick={(emoji) => composer.onChangeText(composer.text + emoji)} />
          )}

          <Composer
            value={composer.text}
            onChangeText={composer.onChangeText}
            onSend={composer.sendMessage}
            onQuickLike={composer.sendQuickLike}
            onAttachImage={() => void composer.attachImage()}
            onToggleEmoji={() => setEmojiOpen((open) => !open)}
            emojiOpen={emojiOpen}
            uploadingImage={composer.uploadingImage}
            replyTo={
              composer.replyTo
                ? {
                    id: composer.replyTo.id,
                    senderId: composer.replyTo.senderId,
                    senderName: composer.replyTo.senderName,
                    text: composer.replyTo.text,
                    imageUrl: composer.replyTo.imageUrl,
                    deleted: !!composer.replyTo.deleted,
                  }
                : null
            }
            onCancelReply={() => setReplyTo(null)}
          />
        </>
      }

      <MessageContextMenu
        target={reactions.pickerOpen ? liveTarget : null}
        reactionOptions={reactions.reactionOptions}
        selectedEmoji={selectedEmoji}
        canReact={menuCanAct}
        canReply={menuCanAct}
        canDelete={menuIsTemp ? menuMessage?.status === 'failed' : !!menuMessage?.isOwn && !menuMessage.deleted}
        onReact={(emoji) => {
          reactions.applyReaction(emoji);
          closeMenu();
        }}
        onClearReaction={() => {
          reactions.clearReaction();
          closeMenu();
        }}
        onReply={() => menuMessage && replyTo(menuMessage)}
        onCopy={() => menuMessage && void copyText(menuMessage)}
        onDelete={() => menuMessage && void unsend(menuMessage)}
        onClose={closeMenu}
        onOpened={onMenuOpened}
        onClosed={onMenuClosed}
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
