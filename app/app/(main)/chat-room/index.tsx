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
//  pads by the bare keyboard height — no header offset, the
//  frame reaches the window bottom; Android leans on the
//  window's own adjustResize), the timeline built from the
//  messages,
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
//    ChatRoom       — the room itself (hooks + feed)
//    ChatRoomScreen — the auth / param gate (default export)
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
import { fetchOnlineStatus, getUploadUrl, reactToMessageApi, removeReactionApi, searchMessagesApi, type MessageSearchResult } from '@/services/api';
import { activeLocale, formatDateTime } from '@/services/format';

// Session, theme and navigation
import { useAuth } from '@/context/AuthContext';
import { useReturnHref } from '@/hooks/useReturnHref';
import { useTheme } from '@/hooks/useTheme';
import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

// Primitives
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
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

// How many older pages a jump-to-search-hit may pull before it
// gives up (the bail-out cap for very deep hits)
const JUMP_PAGE_CAP = 20;







// -----------------------------------------------------------
// LoginPrompt
// -----------------------------------------------------------
//
// The logged-out body: no fetches, no crash — an invitation to
// log in that routes back here through ?returnTo. The returnTo
// carries the full location (pathname + params), so the round
// trip reopens THIS conversation, not a bare empty room.
//
// Used by:
//   - ChatRoomScreen (below)
// -----------------------------------------------------------

function LoginPrompt() {

  const { t } = useTranslation();
  const router = useRouter();
  const returnTo = useReturnHref();


  return (
    <View className="flex-1 bg-canvas">
      <EmptyState
        icon="chatbubbles-outline"
        title={t('messages.loginRequired')}
        hint={t('messages.loginHint')}
        action={{
          label: t('settings.login'),
          onPress: () => router.push({ pathname: '/login', params: { returnTo } }),
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
// sender + full date-time. The count line honestly reports
// "shown of total" when the server holds more hits than the
// 30-row page, and a failed request renders an error + retry
// line — never a false "no results". Tapping a result closes
// the search and the screen scrolls the loaded feed to that
// message (the kit's scrollToMessage), paging older history
// in as needed.
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
  const [failed, setFailed] = useState(false);


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
    setFailed(false);
    try {
      const resp = await searchMessagesApi(conversationId, q, 30);
      if (seq !== seqRef.current) return;
      setResults(resp.messages);
      setTotal(resp.total);
    } catch {
      if (seq !== seqRef.current) return;
      setResults([]);
      setTotal(0);
      setFailed(true);
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
      setFailed(false);
      return;
    }

    // Searching flips on BEFORE the debounce timer, so the
    // summary can never claim "no results" for a query still
    // waiting to run
    setSearching(true);
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
        {failed && !searching ? (
          <Pressable
            onPress={() => void runSearch(query.trim())}
            accessibilityRole="button"
            accessibilityLabel={`${t('common.searchError')}. ${t('common.tryAgain')}`}
            className="ml-xs mt-xs flex-row items-center"
          >
            <Text className="font-raleway text-xs text-danger">{t('common.searchError')}</Text>
            <Text className="ml-sm font-raleway-medium text-xs text-brand">{t('common.tryAgain')}</Text>
          </Pressable>
        ) : showSummary ? (
          <Text
            accessible
            accessibilityLiveRegion="polite"
            className="ml-xs mt-xs font-raleway text-xs text-ink-soft"
          >
            {total > results.length
              ? t('chat.searchResultsOf', { shown: results.length, total })
              : total > 0
                ? t('chat.searchResults', { count: total })
                : t('chat.noSearchResults')}
          </Text>
        ) : null}
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
      // grow-0 shrink-0 is load-bearing: a ScrollView is flex-
      // elastic by default, and here it sat in a column next to
      // the flex-1 message list — so it grew to split the height
      // with it and opened a tall empty box between the strip
      // and the composer whenever the strip was shown
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      className="grow-0 shrink-0 border-t border-line bg-surface"
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
// ChatRoom
// -----------------------------------------------------------
//
// The room itself. Mounts only for an authenticated user with
// a conversation id (the gate below guarantees both), so the
// data hooks never fetch, join a socket room or arm a presence
// poll for a guest.
//
// Used by:
//   - ChatRoomScreen (below)
// -----------------------------------------------------------

function ChatRoom({ convId, type }: { convId: string; type?: string }) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const router = useRouter();
  const isFocused = useIsFocused();


  const labels = useKitLabels();
  const chat = useChatMessages(convId);
  const composer = useChatComposer(convId, chat.setMessages, chat.messages);
  const reactions = useChatReactions(convId, chat.messages, chat.setMessages);
  // The member list lets the hook drop typing events from
  // non-members (client-side defence beside the backend's check)
  const { typingUsers } = useTypingIndicator(convId, chat.profiles);
  // The hooks return fresh objects each render; the stable members
  // are what the memoised rows may depend on
  const { openPicker, closePicker } = reactions;
  const { setReplyTo } = composer;
  const { loadOlder } = chat;


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
  // no route params); the `type` param is only the pre-load
  // hint. The deep-linkable `title` param is deliberately NOT
  // trusted — the header waits for the room's own name rather
  // than paint an attacker-chosen one into the burgundy bar
  const isGroup = chat.conversation ? chat.conversation.type === 'group' : type === 'group';
  const others = useMemo(() => chat.profiles.filter((p) => p.id !== user?.id), [chat.profiles, user?.id]);
  const counterpart = !isGroup ? others[0] : undefined;
  const roomTitle = chat.conversation?.title || counterpart?.displayName || t('chat.title');
  const roomAvatar = counterpart?.avatarUrl ? getUploadUrl(counterpart.avatarUrl) ?? undefined : undefined;
  // Group identity: the other members as a stacked pair
  const members = useMemo(
    () => others.map((p) => ({ name: p.displayName, uri: p.avatarUrl ? getUploadUrl(p.avatarUrl) ?? undefined : undefined })),
    [others],
  );


  // Presence of the other party — polled only while this room is
  // the focused screen (a room buried under the stack stays
  // quiet) and skipped while the app is backgrounded. Keyed on
  // the primitive id, not the profile object, so a resync's
  // fresh array never restarts the poll; a failed poll (null)
  // keeps the last known state instead of asserting offline.
  const [online, setOnline] = useState(false);
  const counterpartId = counterpart?.id;
  useFocusEffect(
    useCallback(() => {
      if (!counterpartId) return;
      let cancelled = false;
      const poll = async () => {
        if (AppState.currentState !== 'active') return;
        const map = await fetchOnlineStatus([counterpartId]);
        if (!cancelled && map) setOnline(!!map[counterpartId]);
      };
      void poll();
      const timer = setInterval(() => void poll(), PRESENCE_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [counterpartId]),
  );


  // Header: portrait + name + status on the burgundy bar, and
  // the search toggle
  // A group shows its member count only once the first page has
  // named the members — never a false "0 members"
  const subtitle = isGroup
    ? chat.profiles.length > 0
      ? t('chat.groupMembers', { count: chat.profiles.length })
      : undefined
    : online
      ? t('chat.online')
      : undefined;
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  useEffect(() => {
    navigation.setOptions({
      title: roomTitle,
      headerTitle: () => (
        <RoomHeaderTitle
          title={roomTitle}
          subtitle={subtitle}
          avatarUrl={roomAvatar}
          isGroup={isGroup}
          members={members}
          online={online}
          // A direct chat's header opens the other party's profile
          // (the friends empty state promises this entry point)
          onPress={
            counterpartId
              ? () => router.push({ pathname: '/(main)/profile', params: { userId: counterpartId } })
              : undefined
          }
        />
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
  }, [navigation, roomTitle, subtitle, roomAvatar, isGroup, members, online, counterpartId, router, t, searchOpen, toggleSearch, colors.onBrand]);


  // The kit's rows: grouped runs + time separators. The day key
  // ticks over at midnight so "Today" becomes "Yesterday" in a
  // room left open
  const timelineLabels = useMemo(
    () => ({ today: labels.today, yesterday: labels.yesterday, locale: activeLocale() }),
    [labels],
  );
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useFocusEffect(
    useCallback(() => {
      // Ticks only while focused; the immediate tick catches a
      // midnight that passed while the room sat behind another
      // screen
      const tick = () => {
        const next = new Date().toDateString();
        setDayKey((current) => (current === next ? current : next));
      };
      tick();
      const timer = setInterval(tick, DAY_TICK_MS);
      return () => clearInterval(timer);
    }, []),
  );
  // hasMore rides along so the kit can suppress the false "pause"
  // separator above the oldest LOADED message while older history
  // still exists server-side
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey forces the relabel
  const timeline = useMemo(() => buildTimeline(chat.messages, timelineLabels, chat.hasMore), [chat.messages, timelineLabels, chat.hasMore, dayKey]);


  // The intro card closes the history once there is no older page
  const intro = useMemo(
    () => ({
      title: roomTitle,
      // A group with no loaded members yet falls back to the
      // conversation-start line rather than claiming "0 members"
      subtitle:
        isGroup && chat.profiles.length > 0
          ? t('chat.groupMembers', { count: chat.profiles.length })
          : labels.conversationStart,
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
    return { label, name: first?.displayName ?? typingUsers[0]?.displayName, avatarUrl: first?.avatarUrl ? getUploadUrl(first.avatarUrl) ?? undefined : undefined };
  }, [typingUsers, chat.profiles, t]);


  // Image viewer dataset: chronological (list state is newest-
  // first), resolved with getUploadUrl at render time, opened
  // by MESSAGE id so duplicate URLs land on the right entry
  const viewerImages = useMemo<ViewerImage[]>(() => {
    const rows: ViewerImage[] = [];
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      // clientId ?? id keeps an own send's viewer entry stable
      // across the temp → server id swap; a refused foreign-origin
      // URL (getUploadUrl → null) simply never enters the gallery
      if (m.imageUrl && !m.deleted) {
        const uri = getUploadUrl(m.imageUrl);
        if (uri) rows.push({ id: m.clientId ?? m.id, uri });
      }
    }
    return rows;
  }, [chat.messages]);
  const viewerIndex = viewerImages.findIndex((img) => img.id === viewerImageId);
  // The viewed photo can vanish under the open viewer (unsent):
  // close it instead of silently jumping to the oldest photo
  useEffect(() => {
    if (viewerImageId !== null && viewerIndex < 0) {
      setViewerImageId(null);
      showToast('info', t('chat.imageRemoved'));
    }
  }, [viewerImageId, viewerIndex, t]);


  // Reactors sheet rows — derived from LIVE message state, so
  // the open sheet follows reaction_update events. Names resolve
  // self → participants map → member profiles → a translated
  // fallback; a raw user id is never rendered
  const reactorRows = useMemo(() => {
    if (!reactorsMessageId) return [];
    const message = chat.messages.find((m) => m.id === reactorsMessageId);
    if (!message) return [];
    return message.reactions
      .filter((r) => r.byUserIds.length > 0)
      .map((r) => ({
        emoji: r.emoji,
        names: r.byUserIds.map((uid) =>
          uid === user?.id
            ? user.displayName
            : chat.participants[uid] ??
              chat.profiles.find((p) => p.id === uid)?.displayName ??
              t('chat.unknownUser'),
        ),
      }));
  }, [reactorsMessageId, chat.messages, chat.participants, chat.profiles, user, t]);


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
      // No 'sending' guard here — canAct (below) is where that
      // invariant is actually enforced, before the long-press
      // ever reaches this handler
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
    // Authoritative cleanup: however the menu went away, no
    // stale target or open picker may survive its close
    setHiddenId(null);
    setMenuTarget(null);
    closePicker();
    if (pendingReplyRef.current) {
      setReplyTo(pendingReplyRef.current);
      pendingReplyRef.current = null;
    }
  }, [setReplyTo, closePicker]);


  const replyTo = useCallback(
    (message: KitMessage) => {
      pendingReplyRef.current = message;
      closeMenu();
    },
    [closeMenu],
  );

  // Stable identity: this one reaches the memoized list as the
  // copy accessibility action, and a fresh arrow per keystroke
  // would re-render every mounted bubble
  const copyText = useCallback(
    async (message: KitMessage) => {
      closeMenu();
      try {
        await Clipboard.setStringAsync(message.text);
        showToast('success', t('chat.copied'));
      } catch {
        showToast('error', t('chat.copyError'));
      }
    },
    [closeMenu, t],
  );

  // The bubble's accessibility actions go straight to the deed:
  // copy through the clipboard path above, react as a direct
  // toggle — the reaction_update echo reconciles the UI
  const reactDirect = useCallback(
    (message: KitMessage, emoji: string) => {
      if (message.id.startsWith(TEMP_ID_PREFIX) || message.deleted) return;
      const live = chat.messages.find((m) => m.id === message.id);
      const own = live?.reactions.find((r) => r.bySelf);
      if (own?.emoji === emoji) {
        removeReactionApi(convId, message.id).catch(() => showToast('error', t('chat.reactionRemoveError')));
      } else {
        reactToMessageApi(convId, message.id, emoji).catch(() => showToast('error', t('chat.reactionAddError')));
      }
    },
    [chat.messages, convId, t],
  );

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
  // into view and wash it. A hit older than the loaded history
  // pages back (bounded by JUMP_PAGE_CAP) behind a spinner
  // overlay until the row exists; only a truly missing message
  // gets the toast.
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jumping, setJumping] = useState(false);
  const jumpingRef = useRef(false);
  const hasMoreRef = useRef(chat.hasMore);
  const messageCountRef = useRef(chat.messages.length);
  useEffect(() => {
    hasMoreRef.current = chat.hasMore;
    messageCountRef.current = chat.messages.length;
  }, [chat.hasMore, chat.messages.length]);
  const highlight = useCallback((targetId: string) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(targetId);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1500);
  }, []);
  // The kit ran out of scrollToIndex retries — it landed near its
  // estimate, so tell the reader why nothing is highlighted
  const onJumpFailed = useCallback(() => showToast('info', t('chat.jumpFailed')), [t]);
  const jumpToMessage = useCallback(
    async (targetId: string) => {
      if (listRef.current?.scrollToMessage(targetId)) {
        highlight(targetId);
        return;
      }

      // Page back until the row lands, history runs out, paging
      // stalls, or the cap hits
      if (jumpingRef.current) return;
      jumpingRef.current = true;
      setJumping(true);
      try {
        for (let page = 0; page < JUMP_PAGE_CAP; page++) {
          if (!hasMoreRef.current) break;
          const before = messageCountRef.current;
          await loadOlder();
          // A beat for the fresh page to render before retrying
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (listRef.current?.scrollToMessage(targetId)) {
            highlight(targetId);
            return;
          }
          if (messageCountRef.current === before) break;
        }
        showToast('info', t('chat.searchNotLoaded'));
      } finally {
        jumpingRef.current = false;
        setJumping(false);
      }
    },
    [highlight, loadOlder, t],
  );
  const jumpToQuoted = useCallback(
    (message: KitMessage) => {
      if (message.replyTo?.id) void jumpToMessage(message.replyTo.id);
    },
    [jumpToMessage],
  );
  const jumpFromSearch = (messageId: string) => {
    setSearchOpen(false);
    void jumpToMessage(messageId);
  };
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);


  const toggleTime = useCallback((m: KitMessage) => setRevealedId((current) => (current === m.id ? null : m.id)), []);
  const openReactors = useCallback((m: KitMessage) => setReactorsMessageId(m.id), []);
  const openImage = useCallback((m: KitMessage) => setViewerImageId(m.clientId ?? m.id), []);
  const openLink = useCallback(
    (href: string) => void Linking.openURL(href).catch(() => showToast('error', t('info.linkError'))),
    [t],
  );
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


  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      // iOS pads by the keyboard height with NO header offset:
      // this screen's layout frame reaches the window bottom, so
      // the KAV math is already complete — adding the classic
      // useHeaderHeight() offset floated the composer exactly one
      // header height above the keys (measured on device).
      // Android is inert: the window's own adjustResize does the
      // lifting there, and stacking a behavior on top double-lifts
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >

      {/* The search overlays the feed so the feed keeps its scroll
          position and its mounted rows for the jump */}
      {searchOpen ? (
        <View
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 }}
          className="bg-surface"
          accessibilityViewIsModal
        >
          <MessageSearch conversationId={convId} onSelect={jumpFromSearch} />
        </View>
      ) : null}

      {/* While the search overlays them, the feed + composer drop
          out of the accessibility tree like a real modal */}
      <View
        className="flex-1"
        accessibilityElementsHidden={searchOpen}
        importantForAccessibility={searchOpen ? 'no-hide-descendants' : 'auto'}
      >
        <>
          {/* Message area — loading / error / the feed (an empty
              conversation shows just the intro card) */}
          {chat.loading && chat.messages.length === 0 ? (
            <View className="flex-1 items-center justify-center">
              <LoadingSpinner text={t('common.loading')} />
            </View>
          ) : chat.error && chat.messages.length === 0 ? (
            chat.error === 'denied' ? (
              // Terminal: membership is gone (401/403/404), so a
              // retry can never win — offer the way back instead
              <EmptyState
                icon="lock-closed-outline"
                title={t('chat.accessDenied')}
                action={{
                  label: t('common.back'),
                  onPress: () =>
                    router.canGoBack() ? router.back() : router.replace('/(main)/tabs/messages'),
                }}
              />
            ) : (
              <ErrorState message={t('chat.loadError')} onRetry={chat.retry} />
            )
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
              onJumpFailed={onJumpFailed}
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
              // Unfocused rooms keep quiet for the screen reader
              isFocused={isFocused}
              // Direct accessibility actions — no menu detour
              onCopy={copyText}
              onReact={reactDirect}
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
      </View>

      {/* Spinner overlay while a jump pages older history in */}
      {jumping ? (
        <View
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30 }}
          pointerEvents="none"
          className="items-center justify-center"
        >
          <LoadingSpinner text={t('common.loading')} />
        </View>
      ) : null}

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
        initialIndex={Math.max(0, viewerIndex)}
        onClose={() => setViewerImageId(null)}
      />

    </KeyboardAvoidingView>
  );
}







// -----------------------------------------------------------
// ChatRoomScreen (default export)
// -----------------------------------------------------------
//
// The thin gate in front of the room: a spinner while the
// session hydrates, the login prompt for guests — WITHOUT
// ChatRoom's data hooks ever mounting, so a guest deep link
// costs no anonymous 401 fetch and no socket work — and an
// exit back to the list for a missing conversation id. Only
// conversationId and the `type` hint pass through; a deep
// link's `title` param is ignored (spoofable — the room
// resolves its own name from the conversation row).
//
// Used by:
//   - app/(main)/_layout.tsx — route /chat-room
//     (params: conversationId, type)
// -----------------------------------------------------------

export default function ChatRoomScreen() {

  const { conversationId, type } = useLocalSearchParams<{
    conversationId: string;
    type?: string;
  }>();
  const convId = conversationId ?? '';

  const { t } = useTranslation();
  const { isAuthenticated, hydrated } = useAuth();
  const router = useRouter();


  // Session still hydrating (cold start from a push): a spinner,
  // never a login-prompt flash at a signed-in user
  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <LoadingSpinner text={t('common.loading')} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginPrompt />;
  }

  // No conversation id (a stripped returnTo, a bad deep link):
  // an exit back to the list, never a composer aimed at nothing
  if (!convId) {
    return (
      <View className="flex-1 bg-canvas">
        <EmptyState
          icon="chatbubbles-outline"
          title={t('chat.noConversation')}
          hint={t('chat.noConversationHint')}
          action={{
            label: t('tabs.messages'),
            onPress: () => router.replace('/(main)/tabs/messages'),
          }}
        />
      </View>
    );
  }


  return <ChatRoom convId={convId} type={type} />;
}
