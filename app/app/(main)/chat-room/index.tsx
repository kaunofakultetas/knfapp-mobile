// -----------------------------------------------------------
//  [*] Chat room — one conversation
//
//  The messaging screen behind a conversation row, built on
//  the chatuikit: a grouped, time-stamped live feed with a
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
//  only screen concerns, each in its own small unit below:
//  the header, keyboard avoidance (iOS pads by the bare
//  keyboard height — no header offset, the frame reaches the
//  window bottom; Android leans on the window's own
//  adjustResize), the timeline built from the messages,
//  jump-to-quoted with its highlight, presence polling, the
//  long-press menu's open/close cycle, and which overlay is
//  open. Reaction-viewer rows and the image-viewer dataset
//  are DERIVED from live message state each render, so both
//  stay current while open.
//
//  The screen only has value with an account (a conversation
//  id implies one) — logged out it renders a friendly login
//  prompt instead of fetching into a 401.
//
//  Split into (root component last):
//
//    QUICK_EMOJI       — the tap-to-append emoji strip's set
//    PRESENCE_MS       — presence polling period
//    LoginPrompt       — logged-out body with a login action
//    MessageSearch     — debounced in-conversation search (overlay)
//    EmojiQuickRow     — emoji strip above the composer
//    MemeLibrary       — the meme tab: searched grid + push sheet
//    RoomHeaderRight   — the header's timer + search buttons
//    FeedFallback      — spinner / access-denied / load-error body
//    JumpOverlay       — spinner while a jump anchors history
//    ReactorsSheet     — who reacted with what, live
//    SeenBySheet       — who read an own group message
//    DisappearingSheet — the room's message-TTL picker
//    typingText        — the typers → "X rašo…" line
//    useMenuActions    — the long-press menu's host rows
//    usePresence       — the other party's online poll
//    useTimeline       — the kit's rows + the unread line
//    useImageViewer    — the fullscreen photo gallery
//    useJumpToMessage  — scroll-to-message with highlight
//    useContextMenu    — the long-press menu's target + close cycle
//    useForward        — the forward-to-room sheet
//    ChatRoom          — the room itself (hooks + feed)
//    ChatRoomScreen    — the auth / param gate (default export)
// -----------------------------------------------------------

// Chat data hooks — list/socket, sends, reactions, typing
import { useChatComposer, type UseChatComposerResult } from '@/hooks/chat/useChatComposer';
import { useVoiceRecorder } from '@/hooks/chat/useVoiceRecorder';
import { TEMP_ID_PREFIX, useChatMessages, type ParticipantProfile, type UseChatMessagesResult } from '@/hooks/chat/useChatMessages';
import { useChatReactions, type UseChatReactionsResult } from '@/hooks/chat/useChatReactions';
import { useTypingIndicator, type TypingUser } from '@/hooks/chat/useTypingIndicator';

// The messaging kit
import { forwardPayload, usePins, useRealtimeStatus, type UsePinsResult } from '@knf/chatengine';
import * as ImagePicker from 'expo-image-picker';

import {
  buildTimeline,
  Composer,
  ConnectionBanner,
  MemePicker,
  MessageContextMenu,
  MessageList,
  PinnedBanner,
  RoomHeaderTitle,
  useKitLabels,
  KitKeyboardAvoidingView,
  VideoPlayerModal,
  openHref,
  type ContextTarget,
  type KitMessage,
  type KitMessageAction,
  type MessageListHandle,
} from '@knf/chatuikit';

// Sheets outside the kit's scope
import ImageViewerModal, { type ViewerImage } from '@/components/chat/ImageViewerModal';
import MemePushSheet, { type PendingMeme } from '@/components/chat/MemePushSheet';
import OptionSheet, { type OptionRow } from '@/components/chat/OptionSheet';
import ReactionsViewer from '@/components/chat/ReactionsViewer';

// UI kit states + dialogs
import { confirmAction, EmptyState, ErrorState, LoadingSpinner } from '@/components/ui';
import { showToast, useNetwork } from '@/context/NetworkContext';

// Search + presence endpoints and render-time helpers
import { fetchConversations, fetchMemesApi, fetchOnlineStatus, getUploadUrl, pushMemeApi, reactToMessageApi, removeReactionApi, reportTarget, searchMessagesApi, type ApiMeme, type MessageSearchResult } from '@/services/api';
import { chatTransport } from '@/services/chatTransport';
import { activeLocale, formatDateTime } from '@/services/format';

// Session, theme and navigation
import { useAuth } from '@/context/AuthContext';
import { useReturnHref } from '@/hooks/useReturnHref';
import { useTheme } from '@/hooks/useTheme';
import { useIsFocused } from "expo-router/react-navigation";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

// Primitives
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  FlatList,
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

// How many render beats a jump waits for the anchored window's
// rows to land before giving up on the scroll
const JUMP_RENDER_RETRIES = 6;

// The translate function as the plain helpers below take it —
// i18next's own signature is far wider than what they call
type Translate = (key: string, opts?: Record<string, unknown>) => string;







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
// Android back and web Escape close the search before the
// screen: the overlay is mounted only while the search is
// open, so those handlers live exactly as long as it does.
//
// The debounce timer is cleared and in-flight responses are
// orphaned (sequence bump) on unmount, so closing the search
// can never repopulate stale results or set state after
// unmount.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function MessageSearch({
  conversationId,
  onSelect,
  onClose,
}: {
  conversationId: string;
  onSelect: (messageId: string) => void;
  // Android back / web Escape — the search closes, not the screen
  onClose: () => void;
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


  // The dismissal keys — the back gesture must not pop the room
  // while the overlay is up
  useEffect(() => {
    if (Platform.OS === 'android') {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onClose();
        return true;
      });
      return () => sub.remove();
    }
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    return undefined;
  }, [onClose]);


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
//   - ChatRoom (below)
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
// MemeLibrary
// -----------------------------------------------------------
//
// The composer's meme tab: an on-origin search (a small
// debounce spares the backend a request per keystroke) over
// the paged grid, and the push flow — pick a file, then name
// it in MemePushSheet, since the pusher's title and tags are
// what make a meme findable later. A picked tile closes the
// panel and sends the stored picture through the composer's
// no-upload path.
//
// Always mounted: the grid draws only while `open`, but the
// push sheet (a Modal) and the loaded page survive the panel
// being toggled, so a half-named push is never lost with it.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function MemeLibrary({
  open,
  onClose,
  sendStoredImage,
}: {
  open: boolean;
  onClose: () => void;
  // The composer's stored-image send — full optimistic path, no upload leg
  sendStoredImage: UseChatComposerResult['sendStoredImage'];
}) {

  const { t } = useTranslation();


  // The grid: the query, the loaded page and the newest-request
  // sequence — only the latest response may write state
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ApiMeme[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  const load = useCallback((q: string, offset: number) => {
    const seq = ++seqRef.current;
    setLoading(true);
    fetchMemesApi(q, offset)
      .then((resp) => {
        if (seq !== seqRef.current) return;
        setItems((prev) => (offset ? [...prev, ...resp.memes.filter((g) => !prev.some((p) => p.id === g.id))] : resp.memes));
        setHasMore(resp.hasMore);
      })
      .catch(() => {})
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => load(query, 0), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, query, load]);


  const pick = useCallback(
    (item: ApiMeme) => {
      onClose();
      void sendStoredImage(item.url, { width: item.width ?? undefined, height: item.height ?? undefined, preview: item.preview ?? undefined });
    },
    [onClose, sendStoredImage],
  );


  // The push is two steps: the picked file waits in `pending`
  // for its name, then goes up
  const [pending, setPending] = useState<PendingMeme | null>(null);
  const [adding, setAdding] = useState(false);
  const add = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPending({ uri: asset.uri, fileName: asset.fileName ?? undefined, mimeType: asset.mimeType ?? undefined });
  }, []);
  const confirm = useCallback(
    async (title: string, tags: string) => {
      const asset = pending;
      if (!asset) return;
      setAdding(true);
      try {
        const resp = await pushMemeApi(asset.uri, asset.fileName, asset.mimeType, title, tags);
        setItems((prev) => [resp.meme, ...prev]);
        setPending(null);
        showToast('success', t('chat.memeAdded'));
      } catch {
        showToast('error', t('common.error'));
      } finally {
        setAdding(false);
      }
    },
    [pending, t],
  );


  return (
    <>
      {open && (
        <MemePicker
          items={items.map((g) => ({ id: g.id, url: g.url, title: g.title, width: g.width, height: g.height, preview: g.preview }))}
          query={query}
          onQueryChange={setQuery}
          onPick={(item) => {
            const row = items.find((g) => g.id === item.id);
            if (row) pick(row);
          }}
          onAdd={() => void add()}
          adding={adding}
          loading={loading}
          onEndReached={() => {
            if (hasMore && !loading) load(query, items.length);
          }}
        />
      )}

      <MemePushSheet
        asset={pending}
        busy={adding}
        onCancel={() => setPending(null)}
        onConfirm={(title, tags) => void confirm(title, tags)}
      />
    </>
  );
}







// -----------------------------------------------------------
// RoomHeaderRight
// -----------------------------------------------------------
//
// The two buttons on the burgundy bar: the disappearing-
// messages timer (dimmed while the room has no window) and
// the search toggle, which turns into a close while the search
// overlay is up. Rendered through the navigator's headerRight
// slot, so it reads theme and language itself.
//
// Used by:
//   - ChatRoom (below) — navigation.setOptions
// -----------------------------------------------------------

function RoomHeaderRight({
  ttlActive,
  searchOpen,
  onOpenTtl,
  onToggleSearch,
}: {
  ttlActive: boolean;
  searchOpen: boolean;
  onOpenTtl: () => void;
  onToggleSearch: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Pressable
        onPress={onOpenTtl}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('chat.disappearing')}
      >
        <Ionicons name="timer-outline" size={22} color={colors.onBrand} style={ttlActive ? undefined : { opacity: 0.75 }} />
      </Pressable>
      <Pressable
        onPress={onToggleSearch}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={searchOpen ? t('chat.closeSearch') : t('chat.openSearch')}
      >
        <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}







// -----------------------------------------------------------
// FeedFallback
// -----------------------------------------------------------
//
// What stands in for the feed while there are no messages to
// show: the spinner during the first load, the access-denied
// state with a way back, or the load error with a retry. The
// denied state is terminal — membership is gone (401/403/404),
// so a retry can never win and only the way back is offered.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function FeedFallback({
  loading,
  error,
  onRetry,
  onBack,
}: {
  loading: boolean;
  error: UseChatMessagesResult['error'];
  onRetry: () => void;
  onBack: () => void;
}) {

  const { t } = useTranslation();


  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <LoadingSpinner text={t('common.loading')} />
      </View>
    );
  }


  if (error === 'denied') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title={t('chat.accessDenied')}
        action={{ label: t('common.back'), onPress: onBack }}
      />
    );
  }


  return <ErrorState message={t('chat.loadError')} onRetry={onRetry} />;
}







// -----------------------------------------------------------
// JumpOverlay
// -----------------------------------------------------------
//
// The spinner over the feed while a jump pages history in
// around its target; taps fall through to the feed beneath.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function JumpOverlay() {

  const { t } = useTranslation();


  return (
    <View
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30 }}
      pointerEvents="none"
      className="items-center justify-center"
    >
      <LoadingSpinner text={t('common.loading')} />
    </View>
  );
}







// -----------------------------------------------------------
// ReactorsSheet
// -----------------------------------------------------------
//
// Who reacted with what, for the tapped message. The rows are
// derived from LIVE message state, so the open sheet follows
// reaction_update events. Names resolve self → participants
// map → member profiles → a translated fallback; a raw user
// id is never rendered.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function ReactorsSheet({
  messageId,
  messages,
  participants,
  profiles,
  onClose,
}: {
  // Null keeps the sheet closed
  messageId: string | null;
  messages: KitMessage[];
  // senderId → displayName, from every loaded row
  participants: Record<string, string>;
  profiles: ParticipantProfile[];
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const { user } = useAuth();


  const rows = useMemo(() => {
    if (!messageId) return [];
    const message = messages.find((m) => m.id === messageId);
    if (!message) return [];
    return message.reactions
      .filter((r) => r.byUserIds.length > 0)
      .map((r) => ({
        emoji: r.emoji,
        names: r.byUserIds.map((uid) =>
          uid === user?.id
            ? user.displayName
            : participants[uid] ??
              profiles.find((p) => p.id === uid)?.displayName ??
              t('chat.unknownUser'),
        ),
      }));
  }, [messageId, messages, participants, profiles, user, t]);


  return <ReactionsViewer visible={messageId !== null} rows={rows} onClose={onClose} />;
}







// -----------------------------------------------------------
// SeenBySheet
// -----------------------------------------------------------
//
// Who read an own message: the receipt holders among the
// members, the sender aside. Read-only rows; an empty list
// says so instead of showing a bare sheet.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function SeenBySheet({
  messageId,
  messages,
  profiles,
  onClose,
}: {
  // Null keeps the sheet closed
  messageId: string | null;
  messages: KitMessage[];
  profiles: ParticipantProfile[];
  onClose: () => void;
}) {

  const { t } = useTranslation();


  const rows = useMemo<OptionRow[]>(() => {
    if (!messageId) return [];
    const m = messages.find((row) => row.id === messageId);
    if (!m) return [];
    const readers = new Set(m.readBy ?? []);
    return profiles
      .filter((p) => p.id !== m.senderId && readers.has(p.id))
      .map((p) => ({ id: p.id, label: p.displayName }));
  }, [messageId, messages, profiles]);


  return (
    <OptionSheet
      visible={messageId !== null}
      title={t('chat.seenBy')}
      rows={rows}
      emptyLabel={t('chat.seenByNone')}
      onClose={onClose}
    />
  );
}







// -----------------------------------------------------------
// DisappearingSheet
// -----------------------------------------------------------
//
// Disappearing messages: the room's window, one of four rows
// (off, 1 h, 24 h, 7 d), the current one marked. A pick closes
// the sheet first and then asks the transport; a refusal is
// only a toast — the room's meta stays the truth.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function DisappearingSheet({
  visible,
  convId,
  current,
  onClose,
}: {
  visible: boolean;
  convId: string;
  // The room's window in seconds; nothing / 0 is off
  current: number | null | undefined;
  onClose: () => void;
}) {

  const { t } = useTranslation();


  const rows = useMemo<OptionRow[]>(() => {
    const seconds = current ?? 0;
    return [
      { id: '0', label: t('chat.ttlOff'), active: !seconds },
      { id: '3600', label: t('chat.ttl1h'), active: seconds === 3600 },
      { id: '86400', label: t('chat.ttl24h'), active: seconds === 86400 },
      { id: '604800', label: t('chat.ttl7d'), active: seconds === 604800 },
    ];
  }, [current, t]);


  const pick = useCallback(
    (id: string) => {
      onClose();
      const seconds = Number(id) || null;
      void chatTransport.setMessageTtl?.(convId, seconds)?.catch(() => showToast('error', t('common.error')));
    },
    [convId, onClose, t],
  );


  return (
    <OptionSheet
      visible={visible}
      title={t('chat.disappearing')}
      rows={rows}
      onPick={pick}
      onClose={onClose}
    />
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
//   - ChatRoom (below)
// -----------------------------------------------------------

function typingText(users: TypingUser[], t: Translate): string | null {
  if (users.length === 0) return null;
  if (users.length === 1) return t('chat.typing', { name: users[0].displayName });
  return t('chat.typingMultiple', { names: users.map((u) => u.displayName).join(', ') });
}







// -----------------------------------------------------------
// useMenuActions
// -----------------------------------------------------------
//
//   const menuActions = useMenuActions({ t, pinsApi, isGroup, closeMenu, startEdit, onForward, onSeenBy })
//
// The long-press menu's host rows, appended after the kit's
// own react / reply / copy / unsend: Edit (own text, a caption
// counts — the composer takes the text over), Report (anyone
// else's message, confirmed first — a menu tap is not a
// complaint — then filed into the admin-reviewed ledger), Pin
// and Unpin (any member, when the transport offers pins),
// Forward, and Seen-by (own messages in groups). Temps, unsent
// rows and system rows never get a row that would act on a
// message the server does not know.
//
// Memoised on the catalog alone: closeMenu and startEdit ride
// in latest-refs, so neither a re-created closer nor the
// composer object (fresh each render) rebuilds every row —
// the rows reach the memoized list, and a fresh catalog would
// re-render every mounted bubble.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function useMenuActions({
  t,
  pinsApi,
  isGroup,
  closeMenu,
  startEdit,
  onForward,
  onSeenBy,
}: {
  t: Translate;
  pinsApi: UsePinsResult;
  isGroup: boolean;
  closeMenu: () => void;
  startEdit: (message: KitMessage) => void;
  onForward: (message: KitMessage) => void;
  onSeenBy: (messageId: string) => void;
}): KitMessageAction[] {

  const closeMenuRef = useRef(closeMenu);
  useEffect(() => {
    closeMenuRef.current = closeMenu;
  }, [closeMenu]);
  const startEditRef = useRef(startEdit);
  useEffect(() => {
    startEditRef.current = startEdit;
  }, [startEdit]);


  return useMemo<KitMessageAction[]>(
    () => [
      {
        id: 'edit',
        label: t('chat.edit'),
        icon: 'pencil-outline',
        visible: (m) => m.isOwn && !m.deleted && !!m.text && !m.id.startsWith(TEMP_ID_PREFIX) && (m.kind ?? 'text') !== 'system',
        onPress: (m) => {
          closeMenuRef.current();
          startEditRef.current(m);
        },
      },
      {
        id: 'report',
        label: t('chat.report'),
        icon: 'flag-outline',
        visible: (m) => !m.isOwn && !m.deleted && !m.id.startsWith(TEMP_ID_PREFIX),
        onPress: (m) => {
          closeMenuRef.current();
          void (async () => {
            const confirmed = await confirmAction({
              title: t('chat.reportTitle'),
              message: t('chat.reportConfirm'),
              confirmLabel: t('chat.report'),
              cancelLabel: t('common.cancel'),
              destructive: true,
            });
            if (!confirmed) return;
            try {
              await reportTarget('message', m.id, t('chat.reportReason'));
              showToast('success', t('chat.reported'));
            } catch {
              showToast('error', t('common.error'));
            }
          })();
        },
      },
      {
        id: 'pin',
        label: t('chat.pin'),
        icon: 'pin-outline',
        visible: (m) => pinsApi.supported && !m.pinnedAt && !m.deleted && !m.id.startsWith(TEMP_ID_PREFIX) && (m.kind ?? 'text') !== 'system',
        onPress: (m) => {
          closeMenuRef.current();
          void pinsApi.pin(m.id).catch(() => showToast('error', t('common.error')));
        },
      },
      {
        id: 'unpin',
        label: t('chat.unpin'),
        icon: 'pin',
        visible: (m) => pinsApi.supported && !!m.pinnedAt && !m.deleted && !m.id.startsWith(TEMP_ID_PREFIX),
        onPress: (m) => {
          closeMenuRef.current();
          void pinsApi.unpin(m.id).catch(() => showToast('error', t('common.error')));
        },
      },
      {
        id: 'forward',
        label: t('chat.forward'),
        icon: 'arrow-redo-outline',
        visible: (m) => !m.deleted && !m.id.startsWith(TEMP_ID_PREFIX) && (m.kind ?? 'text') !== 'system',
        onPress: (m) => {
          closeMenuRef.current();
          onForward(m);
        },
      },
      {
        id: 'seen-by',
        label: t('chat.seenBy'),
        icon: 'eye-outline',
        visible: (m) => isGroup && m.isOwn && !m.deleted && !m.id.startsWith(TEMP_ID_PREFIX),
        onPress: (m) => {
          closeMenuRef.current();
          onSeenBy(m.id);
        },
      },
    ],
    [t, pinsApi, isGroup, onForward, onSeenBy],
  );
}







// -----------------------------------------------------------
// usePresence
// -----------------------------------------------------------
//
//   const online = usePresence(counterpartId)
//
// Presence of the other party — polled only while this room
// is the focused screen (a room buried under the stack stays
// quiet) and skipped while the app is backgrounded. Keyed on
// the primitive id, not the profile object, so a resync's
// fresh array never restarts the poll; a failed poll (null)
// keeps the last known state instead of asserting offline.
// A group has no counterpart: no poll, and false.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function usePresence(counterpartId: string | undefined): boolean {

  const [online, setOnline] = useState(false);
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


  return online;
}







// -----------------------------------------------------------
// useTimeline
// -----------------------------------------------------------
//
//   const { timeline, unreadMarker } = useTimeline(chat.messages, chat.hasMore, unreadCount, labels)
//
// The kit's rows from the live list: grouped runs + time
// separators, the "new messages" line and the day labels. The
// day key ticks over at midnight — only while focused, and
// the immediate tick catches a midnight that passed while the
// room sat behind another screen — so "Today" becomes
// "Yesterday" in a room left open. hasMore rides along so the
// kit can suppress the false "pause" separator above the
// oldest LOADED message while older history still exists
// server-side.
//
// The unread stretch: the room opened with N unread, and the
// list is newest-first, so the Nth newest loaded row is the
// oldest unread one. Fixed once from the first loaded page —
// messages sent or received afterwards must not move the
// line. The marker is handed back for the list's own unread
// prop.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function useTimeline(messages: KitMessage[], hasMore: boolean, unreadCount: number, labels: ReturnType<typeof useKitLabels>) {

  const timelineLabels = useMemo(
    () => ({ today: labels.today, yesterday: labels.yesterday, locale: activeLocale() }),
    [labels],
  );


  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  useFocusEffect(
    useCallback(() => {
      const tick = () => {
        const next = new Date().toDateString();
        setDayKey((current) => (current === next ? current : next));
      };
      tick();
      const timer = setInterval(tick, DAY_TICK_MS);
      return () => clearInterval(timer);
    }, []),
  );


  const unreadMarkerRef = useRef<{ firstUnreadId: string; count: number } | null>(null);
  const [unreadMarker, setUnreadMarker] = useState<{ firstUnreadId: string; count: number } | null>(null);
  useEffect(() => {
    if (unreadMarkerRef.current || unreadCount <= 0 || messages.length === 0) return;
    const index = Math.min(unreadCount, messages.length) - 1;
    const marker = { firstUnreadId: messages[index].id, count: unreadCount };
    unreadMarkerRef.current = marker;
    setUnreadMarker(marker);
  }, [messages, unreadCount]);


  const timeline = useMemo(
    () =>
      buildTimeline(messages, timelineLabels, hasMore, {
        unreadFromId: unreadMarker?.firstUnreadId,
        unreadCount: unreadMarker?.count,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dayKey forces the relabel
    [messages, timelineLabels, hasMore, dayKey, unreadMarker],
  );


  return { timeline, unreadMarker };
}







// -----------------------------------------------------------
// useImageViewer
// -----------------------------------------------------------
//
//   const viewer = useImageViewer(chat.messages)
//   <MessageList onPressImage={viewer.openImage} onPressGalleryImage={viewer.openGalleryImage} … />
//   <ImageViewerModal visible={viewer.visible} images={viewer.images} initialIndex={Math.max(0, viewer.index)} onClose={viewer.close} />
//
// The fullscreen gallery's dataset and cursor. The images are
// chronological (list state is newest-first), resolved with
// getUploadUrl at render time and opened by MESSAGE id so
// duplicate URLs land on the right entry — `clientId ?? id`
// keeps an own send's entry stable across the temp → server
// id swap, and a refused foreign-origin URL (getUploadUrl →
// null) simply never enters. A gallery message contributes
// one entry per tile, keyed <rowKey>#<index>; local uris of a
// still-uploading send resolve to null and stay out (the kit
// disables those taps).
//
// The viewed photo can vanish under the open viewer (unsent):
// the viewer closes with a toast instead of silently jumping
// to the oldest photo.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function useImageViewer(messages: KitMessage[]) {

  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);


  const images = useMemo<ViewerImage[]>(() => {
    const rows: ViewerImage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.imageUrl && !m.deleted) {
        const uri = getUploadUrl(m.imageUrl);
        if (uri) rows.push({ id: m.clientId ?? m.id, uri });
      }
      if (m.gallery && !m.deleted) {
        m.gallery.forEach((item, index) => {
          const uri = getUploadUrl(item.url);
          if (uri) rows.push({ id: `${m.clientId ?? m.id}#${index}`, uri });
        });
      }
    }
    return rows;
  }, [messages]);
  const index = images.findIndex((img) => img.id === openId);
  useEffect(() => {
    if (openId !== null && index < 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the unsend that removed the photo is the event; the close rides it together with the toast
      setOpenId(null);
      showToast('info', t('chat.imageRemoved'));
    }
  }, [openId, index, t]);


  const openImage = useCallback((m: KitMessage) => setOpenId(m.clientId ?? m.id), []);
  const openGalleryImage = useCallback((m: KitMessage, tile: number) => setOpenId(`${m.clientId ?? m.id}#${tile}`), []);
  const close = useCallback(() => setOpenId(null), []);


  return { images, index, visible: openId !== null, openImage, openGalleryImage, close };
}







// -----------------------------------------------------------
// useJumpToMessage
// -----------------------------------------------------------
//
//   const listRef = useRef<MessageListHandle>(null)
//   const jump = useJumpToMessage(listRef, chat.jumpTo)
//   <MessageList ref={listRef} highlightedId={jump.highlightedId} onJumpFailed={jump.onJumpFailed} … />
//   jump.jumpToMessage(id)  — a search hit, a pin
//   jump.jumpToQuoted(m)    — the bubble's quote tap
//
// Jump to a message: scroll it into view and wash it for a
// beat. A hit beyond the loaded history is anchored by the
// engine in ONE round trip (the transport's around-window)
// behind the spinner overlay (`jumping`), then the fresh rows
// get a few beats to render before the scroll retries; only a
// truly missing message gets the toast. The kit reports its
// own give-up too (it ran out of scrollToIndex retries and
// landed near its estimate), so the reader hears why nothing
// is highlighted.
//
// The list ref is the room's (it also goes on the list): a
// ref handed back inside the result would mark the whole
// result as ref-like for the compiler-era hook lint.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function useJumpToMessage(listRef: RefObject<MessageListHandle | null>, jumpTo: UseChatMessagesResult['jumpTo']) {

  const { t } = useTranslation();


  // The wash: one timer, restarted by every jump, cleared on unmount
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlight = useCallback((targetId: string) => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightedId(targetId);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1500);
  }, []);
  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);


  const onJumpFailed = useCallback(() => showToast('info', t('chat.jumpFailed')), [t]);


  // One anchor at a time: the ref guards synchronously, the
  // state drives the overlay
  const [jumping, setJumping] = useState(false);
  const jumpingRef = useRef(false);
  const jumpToMessage = useCallback(
    async (targetId: string) => {
      if (listRef.current?.scrollToMessage(targetId)) {
        highlight(targetId);
        return;
      }

      if (jumpingRef.current) return;
      jumpingRef.current = true;
      setJumping(true);
      try {
        const outcome = await jumpTo(targetId);
        if (outcome !== 'missing') {
          for (let attempt = 0; attempt < JUMP_RENDER_RETRIES; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 80));
            if (listRef.current?.scrollToMessage(targetId)) {
              highlight(targetId);
              return;
            }
          }
        }
        showToast('info', t('chat.searchNotLoaded'));
      } finally {
        jumpingRef.current = false;
        setJumping(false);
      }
    },
    [highlight, jumpTo, t, listRef],
  );
  const jumpToQuoted = useCallback(
    (message: KitMessage) => {
      if (message.replyTo?.id) void jumpToMessage(message.replyTo.id);
    },
    [jumpToMessage],
  );


  return { jumping, highlightedId, jumpToMessage, jumpToQuoted, onJumpFailed };
}







// -----------------------------------------------------------
// useContextMenu
// -----------------------------------------------------------
//
//   const menu = useContextMenu(chat.messages, reactions, composer.setReplyTo)
//   <MessageList onLongPressMessage={menu.open} menuTargetId={menu.hiddenId} … />
//   <MessageContextMenu target={reactions.pickerOpen ? menu.target : null} onOpened={menu.onOpened} onClosed={menu.onClosed} … />
//
// The long-press menu's target and close cycle. The menu aims
// at the long-pressed message; the LIVE row is looked up each
// render (`message`, `target`) so reaction toggles reflect
// while the menu is open, and its own reaction (bySelf) is
// the ringed emoji. Optimistic bubbles have no server row
// yet: a sending one has no menu, a failed one can only be
// discarded (`isTemp`, `canAct`).
//
// The source row hides (`hiddenId`) once the floating copy is
// on screen and reappears when the close animation ends; a
// reply chosen in the menu (`replyTo`) is applied on close
// too, so the composer focuses after the Modal has given the
// window back. onClosed is the authoritative cleanup —
// however the menu went away, no stale target or open picker
// survives it.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function useContextMenu(messages: KitMessage[], reactions: UseChatReactionsResult, setReplyTo: UseChatComposerResult['setReplyTo']) {

  // The reactions hook returns a fresh object each render; the
  // stable members are what the memoised handlers depend on
  const { openPicker, closePicker } = reactions;
  const [target, setTarget] = useState<ContextTarget | null>(null);
  const [hiddenId, setHiddenId] = useState<string | null>(null);


  const message = target ? messages.find((m) => m.id === target.message.id) ?? null : null;
  const liveTarget = target && message ? { ...target, message } : null;
  const selectedEmoji = message?.reactions.find((r) => r.bySelf)?.emoji ?? null;
  const isTemp = !!message?.id.startsWith(TEMP_ID_PREFIX);
  const canAct = !!message && !isTemp && !message.deleted;


  const open = useCallback(
    (next: ContextTarget) => {
      // No 'sending' guard here — the list's canAct is where that
      // invariant is actually enforced, before the long-press
      // ever reaches this handler
      setTarget(next);
      openPicker(next.message.id);
    },
    [openPicker],
  );
  const close = useCallback(() => {
    setTarget(null);
    closePicker();
  }, [closePicker]);


  const pendingReplyRef = useRef<KitMessage | null>(null);
  const onOpened = useCallback((id: string) => setHiddenId(id), []);
  const onClosed = useCallback(() => {
    setHiddenId(null);
    setTarget(null);
    closePicker();
    if (pendingReplyRef.current) {
      setReplyTo(pendingReplyRef.current);
      pendingReplyRef.current = null;
    }
  }, [setReplyTo, closePicker]);
  const replyTo = useCallback(
    (m: KitMessage) => {
      pendingReplyRef.current = m;
      close();
    },
    [close],
  );


  return { message, target: liveTarget, selectedEmoji, isTemp, canAct, hiddenId, open, close, onOpened, onClosed, replyTo };
}







// -----------------------------------------------------------
// useForward
// -----------------------------------------------------------
//
//   const forward = useForward(convId)
//   forward.open(message)   — the menu row; fetches the room list
//   <OptionSheet visible={forward.target !== null} rows={forward.rooms} onPick={forward.pick} onClose={forward.close} … />
//
// Forward-to-room: the picker fetches the room list on open
// (fresh — rooms come and go) and the pick re-sends the
// content with the forwarded mark under a fresh nonce; the
// source room is left out of its own list. The rows start
// empty on every open, so the sheet shows its loading label
// rather than the previous list.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function useForward(convId: string) {

  const { t } = useTranslation();
  const [target, setTarget] = useState<KitMessage | null>(null);
  const [rooms, setRooms] = useState<OptionRow[]>([]);


  const open = useCallback((m: KitMessage) => {
    setTarget(m);
    setRooms([]);
    void fetchConversations()
      .then((resp) => {
        setRooms(
          resp.conversations
            .filter((c) => c.id !== convId)
            .map((c) => ({ id: c.id, label: c.title, detail: c.type === 'group' ? t('chat.groupChat') : undefined })),
        );
      })
      .catch(() => showToast('error', t('common.error')));
  }, [convId, t]);
  const pick = useCallback(
    (roomId: string) => {
      const message = target;
      setTarget(null);
      if (!message) return;
      const nonce = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      void chatTransport
        .sendMessage(roomId, forwardPayload(message, nonce))
        .then(() => showToast('success', t('chat.forwardSent')))
        .catch(() => showToast('error', t('common.error')));
    },
    [target, t],
  );
  const close = useCallback(() => setTarget(null), []);


  return { target, rooms, open, pick, close };
}







// -----------------------------------------------------------
// ChatRoom
// -----------------------------------------------------------
//
// The room itself. Mounts only for an authenticated user with
// a conversation id (the gate below guarantees both), so the
// data hooks never fetch, join a socket room or arm a presence
// poll for a guest. Wires the units above together and keeps
// only what is truly the screen's: which overlay or sheet is
// open, the header, the intro card, the typing line, and the
// menu's built-in deeds (copy, unsend, the direct react).
//
// Used by:
//   - ChatRoomScreen (below)
// -----------------------------------------------------------

function ChatRoom({ convId, type, unreadCount }: { convId: string; type?: string; unreadCount: number }) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation();
  const router = useRouter();
  const isFocused = useIsFocused();


  const labels = useKitLabels();
  // Read acknowledgements hold while the reader is scrolled up into
  // history — the list reports the newest-end state
  const [atLatest, setAtLatest] = useState(true);
  const chat = useChatMessages(convId, { atLatest });
  const composer = useChatComposer(convId, chat.setMessages, chat.messages);
  const reactions = useChatReactions(convId, chat.messages, chat.setMessages);
  // The member list lets the hook drop typing events from
  // non-members (client-side defence beside the backend's check)
  const { typingUsers } = useTypingIndicator(convId, chat.profiles);
  // The hooks return fresh objects each render; the stable members
  // are what the memoised rows may depend on
  const { setReplyTo } = composer;
  const voice = useVoiceRecorder(composer.attach);


  // The screen units: the menu's cycle, the jumps, the forward
  // sheet, the photo gallery and the timeline rows
  const menu = useContextMenu(chat.messages, reactions, setReplyTo);
  const { close: closeMenu } = menu;
  const listRef = useRef<MessageListHandle>(null);
  const jump = useJumpToMessage(listRef, chat.jumpTo);
  const forward = useForward(convId);
  const viewer = useImageViewer(chat.messages);
  const { timeline, unreadMarker } = useTimeline(chat.messages, chat.hasMore, unreadCount, labels);


  // The realtime door for the banner, and the room's pins
  const realtimeStatus = useRealtimeStatus();
  const { isConnected } = useNetwork();
  const pinsApi = usePins(convId);
  const connectionState = !isConnected ? ('offline' as const) : realtimeStatus === 'connecting' || realtimeStatus === 'reconnecting' ? ('connecting' as const) : null;
  const ttlActive = !!chat.conversation?.messageTtlSeconds;


  // Screen-owned panel state: which overlay, strip or sheet is
  // open — by flag, or by the message it aims at
  const [searchOpen, setSearchOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [memesOpen, setMemesOpen] = useState(false);
  const [ttlOpen, setTtlOpen] = useState(false);
  const [seenByMessageId, setSeenByMessageId] = useState<string | null>(null);
  const [reactorsMessageId, setReactorsMessageId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  // The video being played (one player at a time — see the kit's
  // VideoPlayerModal); resolved to a loadable URL at render time
  const [playingVideoUri, setPlayingVideoUri] = useState<string | null>(null);
  // Stable closers — the header effect and the overlays' own
  // effects key on them
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeMemes = useCallback(() => setMemesOpen(false), []);
  const openTtl = useCallback(() => setTtlOpen(true), []);


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
  const counterpartId = counterpart?.id;
  const roomTitle = chat.conversation?.title || counterpart?.displayName || t('chat.title');
  const roomAvatar = counterpart?.avatarUrl ? getUploadUrl(counterpart.avatarUrl) ?? undefined : undefined;
  // Group identity: the other members as a stacked pair
  const members = useMemo(
    () => others.map((p) => ({ name: p.displayName, uri: p.avatarUrl ? getUploadUrl(p.avatarUrl) ?? undefined : undefined })),
    [others],
  );
  const online = usePresence(counterpartId);


  // Mentions: the members feed the composer's @-strip (groups —
  // in a DM mentioning the only other person is noise) and the
  // bubbles' highlighted runs; a tapped mention or portrait
  // opens that member's profile
  const mentionCandidates = useMemo(() => others.map((p) => ({ id: p.id, name: p.displayName, avatarUrl: p.avatarUrl })), [others]);
  const mentionNames = useMemo(() => chat.profiles.map((p) => p.displayName), [chat.profiles]);
  const openMemberProfile = useCallback((userId: string) => {
    router.push({ pathname: '/(main)/profile', params: { userId } });
  }, [router]);
  const onPressMention = useCallback(
    (name: string) => {
      const member = chat.profiles.find((p) => p.displayName === name);
      if (member) openMemberProfile(member.id);
    },
    [chat.profiles, openMemberProfile],
  );
  const onPressAvatar = useCallback((m: KitMessage) => openMemberProfile(m.senderId), [openMemberProfile]);


  // Header: portrait + name + status on the burgundy bar, and
  // the timer + search buttons. A group shows its member count
  // only once the first page has named the members — never a
  // false "0 members"
  const subtitle = isGroup
    ? chat.profiles.length > 0
      ? t('chat.groupMembers', { count: chat.profiles.length })
      : undefined
    : online
      ? t('chat.online')
      : undefined;
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
        <RoomHeaderRight ttlActive={ttlActive} searchOpen={searchOpen} onOpenTtl={openTtl} onToggleSearch={toggleSearch} />
      ),
    });
  }, [navigation, roomTitle, subtitle, roomAvatar, isGroup, members, online, counterpartId, router, searchOpen, toggleSearch, ttlActive, openTtl]);


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


  // The menu's built-in deeds. copyText keeps a stable identity:
  // it reaches the memoized list as the copy accessibility
  // action, and a fresh arrow per keystroke would re-render
  // every mounted bubble
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
  // The bubble's accessibility react goes straight to the deed
  // as a direct toggle — the reaction_update echo reconciles
  // the UI
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
  // A failed temp is discarded outright; a server row asks first
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


  // The menu's host rows (Edit, Report, Pin, Forward, Seen-by)
  const menuActions = useMenuActions({
    t,
    pinsApi,
    isGroup,
    closeMenu,
    startEdit: composer.startEdit,
    onForward: forward.open,
    onSeenBy: setSeenByMessageId,
  });
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


  // The remaining taps on a bubble: the time reveal, the
  // reactors sheet, a video, a link
  const toggleTime = useCallback((m: KitMessage) => setRevealedId((current) => (current === m.id ? null : m.id)), []);
  const openReactors = useCallback((m: KitMessage) => setReactorsMessageId(m.id), []);
  const openVideo = useCallback((m: KitMessage) => {
    const uri = m.video?.uri ? getUploadUrl(m.video.uri) : null;
    if (uri) setPlayingVideoUri(uri);
  }, []);
  const openLink = useCallback(
    (href: string) => void openHref(href, () => showToast('error', t('info.linkError'))),
    [t],
  );
  // A search hit closes the overlay, then the feed scrolls
  const jumpFromSearch = (messageId: string) => {
    setSearchOpen(false);
    void jump.jumpToMessage(messageId);
  };
  // The denied state's way out — back if there is one, else the list
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(main)/tabs/messages'));


  return (
    <KitKeyboardAvoidingView style={{ backgroundColor: colors.surface }}>

      {/* The search overlays the feed so the feed keeps its scroll
          position and its mounted rows for the jump */}
      {searchOpen ? (
        <View
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20 }}
          className="bg-surface"
          accessibilityViewIsModal
        >
          <MessageSearch conversationId={convId} onSelect={jumpFromSearch} onClose={closeSearch} />
        </View>
      ) : null}

      {/* While the search overlays them, the feed + composer drop
          out of the accessibility tree like a real modal */}
      <View
        className="flex-1"
        accessibilityElementsHidden={searchOpen}
        importantForAccessibility={searchOpen ? 'no-hide-descendants' : 'auto'}
      >

        {/* The realtime door and the room's pins, above the feed */}
        <ConnectionBanner state={connectionState} />
        <PinnedBanner pins={pinsApi.pins} onPress={(m) => void jump.jumpToMessage(m.id)} />

        {/* Message area — the fallback while nothing is loaded yet,
            otherwise the feed (an empty conversation shows just
            the intro card) */}
        {chat.messages.length === 0 && (chat.loading || chat.error) ? (
          <FeedFallback loading={chat.loading} error={chat.error} onRetry={chat.retry} onBack={goBack} />
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
            hasNewer={chat.hasNewer}
            loadingNewer={chat.loadingNewer}
            onLoadNewer={chat.loadNewer}
            onReturnToLatest={chat.returnToLatest}
            missedCount={chat.missedWhileDetached}
            onJumpFailed={jump.onJumpFailed}
            revealedId={revealedId}
            highlightedId={jump.highlightedId}
            menuTargetId={menu.hiddenId}
            canAct={canAct}
            canReply={canReply}
            onPressMessage={toggleTime}
            onLongPressMessage={menu.open}
            onSwipeReply={swipeReply}
            onPressQuote={jump.jumpToQuoted}
            onPressReactions={openReactors}
            onPressImage={viewer.openImage}
            onPressGalleryImage={viewer.openGalleryImage}
            mentionNames={mentionNames}
            onPressMention={onPressMention}
            onPressAvatar={onPressAvatar}
            onPressVideo={openVideo}
            onAtLatestChange={setAtLatest}
            onRetry={composer.retryMessage}
            onPressLink={openLink}
            // Unfocused rooms keep quiet for the screen reader
            isFocused={isFocused}
            unread={unreadMarker}
            // Direct accessibility actions — no menu detour
            onCopy={copyText}
            onReact={reactDirect}
          />
        )}

        {emojiOpen && (
          <EmojiQuickRow onPick={(emoji) => composer.onChangeText(composer.text + emoji)} />
        )}

        {/* The meme tab stays mounted — its push sheet outlives the panel */}
        <MemeLibrary open={memesOpen} onClose={closeMemes} sendStoredImage={composer.sendStoredImage} />

        <Composer
          value={composer.text}
          onChangeText={composer.onChangeText}
          onSend={composer.sendMessage}
          onQuickLike={composer.sendQuickLike}
          onAttachMedia={() => void composer.attachMedia()}
          onAttachFile={() => void composer.attachFile()}
          onToggleEmoji={() => setEmojiOpen((open) => !open)}
          emojiOpen={emojiOpen}
          uploadingMedia={composer.uploadingMedia}
          uploadingFile={composer.uploadingFile}
          onStartRecording={() => void voice.start()}
          onStopRecording={voice.stop}
          onCancelRecording={voice.cancel}
          recording={voice.recording}
          onAttachCamera={() => void composer.attachCamera()}
          onToggleMemes={() => {
            setMemesOpen((open) => !open);
            setEmojiOpen(false);
          }}
          memesOpen={memesOpen}
          mentionCandidates={isGroup ? mentionCandidates : undefined}
          replyTo={
            composer.replyTo
              ? {
                  id: composer.replyTo.id,
                  senderId: composer.replyTo.senderId,
                  senderName: composer.replyTo.senderName,
                  text: composer.replyTo.text,
                  imageUrl: composer.replyTo.imageUrl,
                  deleted: !!composer.replyTo.deleted,
                  kind: composer.replyTo.kind,
                  fileName: composer.replyTo.file?.name,
                }
              : null
          }
          onCancelReply={() => setReplyTo(null)}
          editing={composer.editing}
          onCancelEdit={composer.cancelEdit}
          canSend={composer.canSend}
        />

      </View>

      {jump.jumping ? <JumpOverlay /> : null}

      <MessageContextMenu
        target={reactions.pickerOpen ? menu.target : null}
        reactionOptions={reactions.reactionOptions}
        selectedEmoji={menu.selectedEmoji}
        canReact={menu.canAct}
        canReply={menu.canAct}
        canDelete={menu.isTemp ? menu.message?.status === 'failed' : !!menu.message?.isOwn && !menu.message.deleted}
        onReact={(emoji) => {
          reactions.applyReaction(emoji);
          closeMenu();
        }}
        onClearReaction={() => {
          reactions.clearReaction();
          closeMenu();
        }}
        onReply={() => menu.message && menu.replyTo(menu.message)}
        onCopy={() => menu.message && void copyText(menu.message)}
        onDelete={() => menu.message && void unsend(menu.message)}
        onClose={closeMenu}
        onOpened={menu.onOpened}
        onClosed={menu.onClosed}
        actions={menuActions}
      />

      <ReactorsSheet
        messageId={reactorsMessageId}
        messages={chat.messages}
        participants={chat.participants}
        profiles={chat.profiles}
        onClose={() => setReactorsMessageId(null)}
      />

      <DisappearingSheet
        visible={ttlOpen}
        convId={convId}
        current={chat.conversation?.messageTtlSeconds}
        onClose={() => setTtlOpen(false)}
      />

      <OptionSheet
        visible={forward.target !== null}
        title={t('chat.forwardTitle')}
        rows={forward.rooms}
        emptyLabel={t('common.loading')}
        onPick={forward.pick}
        onClose={forward.close}
      />

      <SeenBySheet
        messageId={seenByMessageId}
        messages={chat.messages}
        profiles={chat.profiles}
        onClose={() => setSeenByMessageId(null)}
      />

      <ImageViewerModal
        visible={viewer.visible}
        images={viewer.images}
        initialIndex={Math.max(0, viewer.index)}
        onClose={viewer.close}
      />

      {/* One player at a time; mounted only while a video is open
          so the decoder is released on close */}
      {playingVideoUri ? (
        <VideoPlayerModal visible uri={playingVideoUri} onClose={() => setPlayingVideoUri(null)} />
      ) : null}

    </KitKeyboardAvoidingView>
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

  const { conversationId, type, unread } = useLocalSearchParams<{
    conversationId: string;
    type?: string;
    unread?: string;
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


  return <ChatRoom convId={convId} type={type} unreadCount={Number(unread) || 0} />;
}
