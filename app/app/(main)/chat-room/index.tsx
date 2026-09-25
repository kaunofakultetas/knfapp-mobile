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
//  the header, keyboard avoidance (the kit's avoiding view at
//  the screen root — no header offset, the frame reaches the
//  window bottom; iOS pads by the bare keyboard height, and
//  Android pads itself when edge-to-edge keeps the window from
//  resizing), the timeline built from the messages,
//  jump-to-quoted with its highlight, presence polling, the
//  long-press menu's open/close cycle, and which overlay is
//  open. Reaction-viewer rows and the image-viewer dataset
//  are DERIVED from live message state each render, so both
//  stay current while open. The generic room machinery — the
//  timeline hook, the jump-with-highlight, the context-menu
//  cycle and the emoji strip — lives in @knf/chatuikit; this
//  file hands it the app's toasts, the focus flag and the
//  engine's temp-id test.
//
//  The screen only has value with an account (a conversation
//  id implies one) — logged out it renders a friendly login
//  prompt instead of fetching into a 401.
//
//  Split into (root component last):
//
//    PRESENCE_MS       — presence polling period
//    LoginPrompt       — logged-out body with a login action
//    MessageSearch     — debounced in-conversation search (overlay)
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
//    useForward        — the forward-to-room sheet
//    ChatRoom          — the room itself (hooks + feed)
//    ChatRoomScreen    — the auth / param gate (default export)
// -----------------------------------------------------------

// Chat data hooks — list/socket, sends, reactions, typing
// The shipping gate — features.json decides whether this
// module renders or shows the not-ready screen
import withFeature from '@/components/FeatureGate';

import { useChatComposer, type UseChatComposerResult } from '@/hooks/chat/useChatComposer';
import { useVoiceRecorder } from '@/hooks/chat/useVoiceRecorder';
import { TEMP_ID_PREFIX, useChatMessages, type ParticipantProfile, type UseChatMessagesResult } from '@/hooks/chat/useChatMessages';
import { useChatReactions } from '@/hooks/chat/useChatReactions';
import { useImageViewer } from '@/hooks/chat/useImageViewer';
import { useTypingIndicator, type TypingUser } from '@/hooks/chat/useTypingIndicator';

// The messaging kit
import { forwardPayload, isTempId, sendFailureCode, useChatEngine, usePins, useRealtimeStatus, type UsePinsResult } from '@knf/chatengine';
import * as ImagePicker from 'expo-image-picker';

import {
  Composer,
  ConnectionBanner,
  EmojiQuickRow,
  MemePicker,
  MessageContextMenu,
  MessageList,
  PinnedBanner,
  RoomHeaderTitle,
  useContextMenu,
  useJumpToMessage,
  useKitLabels,
  useTimeline,
  KitKeyboardAvoidingView,
  VideoPlayerModal,
  openHref,
  type KitMessage,
  type KitMessageAction,
  type MessageListHandle,
} from '@knf/chatuikit';

// Sheets outside the kit's scope
import ImageViewerModal from '@/components/chat/ImageViewerModal';
import MemePushSheet, { type PendingMeme } from '@/components/chat/MemePushSheet';
import OptionSheet, { type OptionRow } from '@/components/chat/OptionSheet';
import ReactionsViewer from '@/components/chat/ReactionsViewer';

// UI kit states + dialogs
import { confirmAction, EmptyState, ErrorState, LoadingSpinner } from '@/components/ui';
import { showToast, useNetwork } from '@/context/NetworkContext';

// Search + presence endpoints and render-time helpers
import { apiErrorKey, deleteMemeApi, fetchConversations, fetchMemesApi, fetchOnlineStatus, getUploadUrl, pushMemeApi, reportTarget, searchMessagesApi, type ApiMeme, type MessageSearchResult } from '@/services/api';
import { chatTransport } from '@/services/chatTransport';
import { activeLocale, formatDateTime, formatRelativeAgo } from '@/services/format';

// Session, theme and navigation
import { useAuth } from '@/context/AuthContext';
import { useReturnHref } from '@/hooks/useReturnHref';
import { useRouteParam } from '@/hooks/useRouteParam';
import { useTheme } from '@/hooks/useTheme';
import { useIsFocused } from "expo-router/react-navigation";
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';

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
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';


// How often the other party's presence is refreshed while the
// room is open
const PRESENCE_MS = 30_000;

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
            accessibilityLabel={`${item.senderName}, ${formatDateTime(item.createdAt)}, ${item.text}`}
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
// MemeLibrary
// -----------------------------------------------------------
//
// The composer's meme tab: an on-origin search (a small
// debounce spares the backend a request per keystroke) over
// the paged grid, and the push flow — pick a file, then name
// it in MemePushSheet, since the pusher's title and tags are
// what make a meme findable later. A picked tile closes the
// panel and sends the stored picture through the composer's
// no-upload path. A failed first page shows the grid's error
// line with a retry (never a false "no memes yet"), and a
// meme the viewer pushed can be taken back — confirmed first,
// since the file leaves the library and every message that
// sent it (the backend refuses anyone else's).
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
  const { user } = useAuth();


  // The grid: the query, the loaded page, whether the first page
  // failed, and the newest-request sequence — only the latest
  // response may write state
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ApiMeme[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seqRef = useRef(0);
  const load = useCallback((q: string, offset: number) => {
    const seq = ++seqRef.current;
    setLoading(true);
    if (!offset) setFailed(false);
    fetchMemesApi(q, offset)
      .then((resp) => {
        if (seq !== seqRef.current) return;
        setItems((prev) => (offset ? [...prev, ...resp.memes.filter((g) => !prev.some((p) => p.id === g.id))] : resp.memes));
        setHasMore(resp.hasMore);
      })
      .catch(() => {
        // A failed first page says so; a failed next page keeps
        // the grid and simply stops paging for now
        if (seq !== seqRef.current) return;
        if (!offset) {
          setItems([]);
          setFailed(true);
        }
        setHasMore(false);
      })
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
    setPending({ uri: asset.uri, fileName: asset.fileName ?? undefined, mimeType: asset.mimeType ?? undefined, fileSize: asset.fileSize ?? undefined });
  }, []);
  const confirm = useCallback(
    async (title: string, tags: string) => {
      const asset = pending;
      if (!asset) return;
      setAdding(true);
      try {
        const resp = await pushMemeApi(asset.uri, asset.fileName, asset.mimeType, title, tags, asset.fileSize);
        setItems((prev) => [resp.meme, ...prev]);
        setPending(null);
        showToast('success', t('chat.memeAdded'));
      } catch (err) {
        // The backend's machine code (file_too_large, bad_file_type,
        // …) or the local size preflight — worded by the catalog,
        // never a bare "error"
        showToast('error', t(apiErrorKey(err)));
      } finally {
        setAdding(false);
      }
    },
    [pending, t],
  );


  // Taking back an own meme — asked first, then deleted and
  // dropped from the grid; the backend refuses anyone else's
  const remove = useCallback(
    async (item: { id: string }) => {
      const confirmed = await confirmAction({
        title: t('chat.removeMemeTitle'),
        message: t('chat.removeMemeConfirm'),
        confirmLabel: t('chat.removeMeme'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;
      try {
        await deleteMemeApi(item.id);
        setItems((prev) => prev.filter((g) => g.id !== item.id));
        showToast('success', t('chat.memeRemoved'));
      } catch (err) {
        showToast('error', t(apiErrorKey(err)));
      }
    },
    [t],
  );


  return (
    <>
      {open && (
        <MemePicker
          items={items.map((g) => ({ id: g.id, url: g.url, title: g.title, width: g.width, height: g.height, preview: g.preview, own: !!user && g.addedBy === user.id }))}
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
          error={failed}
          onRetry={() => load(query, 0)}
          onRemove={(item) => void remove(item)}
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
// the sheet first and then asks the transport — unless it is
// the window the room already has (the backend would answer
// with a no-op anyway); a refusal is only a toast — the room's
// meta stays the truth.
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
      if ((current ?? 0) === (seconds ?? 0)) return;
      void chatTransport.setMessageTtl?.(convId, seconds)?.catch(() => showToast('error', t('common.error')));
    },
    [convId, current, onClose, t],
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
//   const { online, lastSeenMs } = usePresence(counterpartId)
//
// Presence of the other party — polled only while this room
// is the focused screen (a room buried under the stack stays
// quiet) and skipped while the app is backgrounded. Keyed on
// the primitive id, not the profile object, so a resync's
// fresh array never restarts the poll; a failed poll (null)
// keeps the last known state instead of asserting offline.
// A group has no counterpart: no poll, false and null.
// lastSeenMs is the counterpart's last socket activity — the
// backend reveals it under the same relationship gate as the
// boolean, so null means "never seen or not yours to know".
// The minute tick re-renders so the "prieš X min" phrase in
// the header keeps aging while the room stays open.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function usePresence(counterpartId: string | undefined): { online: boolean; lastSeenMs: number | null } {

  const [online, setOnline] = useState(false);
  const [lastSeenMs, setLastSeenMs] = useState<number | null>(null);
  const [, setTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!counterpartId) return;
      let cancelled = false;
      const poll = async () => {
        if (AppState.currentState !== 'active') return;
        const presence = await fetchOnlineStatus([counterpartId]);
        if (cancelled || !presence) return;
        setOnline(!!presence.online[counterpartId]);
        const iso = presence.lastSeen[counterpartId];
        const ms = iso ? Date.parse(iso) : NaN;
        setLastSeenMs(Number.isFinite(ms) ? ms : null);
      };
      void poll();
      const timer = setInterval(() => void poll(), PRESENCE_MS);
      const ager = setInterval(() => setTick((n) => n + 1), 60_000);
      return () => {
        cancelled = true;
        clearInterval(timer);
        clearInterval(ager);
      };
    }, [counterpartId]),
  );


  return { online, lastSeenMs };
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
// source room is left out of its own list. `rooms` is null
// while the list loads (the sheet says "loading"), and an
// empty list then says there is nowhere to forward to — it
// once said "loading" forever. A failed fetch closes the
// sheet with a toast; a list that answers after the sheet
// was closed or reopened is dropped (sequence guard). A room
// with no title (a direct chat whose other side left) is
// listed under the same fallback name its row shows, and a
// refused send is worded by the engine's own triage (a
// blocked pair, a lost session…) through the host's notices.
//
// Used by:
//   - ChatRoom (below)
// -----------------------------------------------------------

function useForward(convId: string) {

  const { t } = useTranslation();
  const { notify } = useChatEngine();
  const [target, setTarget] = useState<KitMessage | null>(null);
  const [rooms, setRooms] = useState<OptionRow[] | null>(null);
  const openSeqRef = useRef(0);


  const open = useCallback((m: KitMessage) => {
    const seq = ++openSeqRef.current;
    setTarget(m);
    setRooms(null);
    void fetchConversations()
      .then((resp) => {
        if (seq !== openSeqRef.current) return;
        setRooms(
          resp.conversations
            .filter((c) => c.id !== convId)
            .map((c) => ({ id: c.id, label: c.title || t('messages.conversationFallback'), detail: c.type === 'group' ? t('chat.groupChat') : undefined })),
        );
      })
      .catch(() => {
        if (seq !== openSeqRef.current) return;
        setTarget(null);
        showToast('error', t('common.error'));
      });
  }, [convId, t]);
  const pick = useCallback(
    (roomId: string) => {
      const message = target;
      openSeqRef.current += 1;
      setTarget(null);
      if (!message) return;
      const nonce = `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      void chatTransport
        .sendMessage(roomId, forwardPayload(message, nonce))
        .then(() => showToast('success', t('chat.forwardSent')))
        .catch((err: unknown) => notify({ level: 'error', code: sendFailureCode(err) }));
    },
    [target, t, notify],
  );
  const close = useCallback(() => {
    openSeqRef.current += 1;
    setTarget(null);
  }, []);


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
// menu's built-in deeds (copy, unsend, the one-tap react).
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
  const menu = useContextMenu(chat.messages, reactions, setReplyTo, { isTemp: isTempId });
  const { close: closeMenu } = menu;
  const listRef = useRef<MessageListHandle>(null);
  const jump = useJumpToMessage(listRef, chat.jumpTo, {
    onMissing: () => showToast('info', t('chat.searchNotLoaded')),
    onJumpFailed: () => showToast('info', t('chat.jumpFailed')),
  });
  const forward = useForward(convId);
  const viewer = useImageViewer(chat.messages);
  const timelineLabels = useMemo(
    () => ({ today: labels.today, yesterday: labels.yesterday, locale: activeLocale() }),
    [labels],
  );
  const { timeline, unreadMarker } = useTimeline(chat.messages, chat.hasMore, unreadCount, timelineLabels, { isActive: isFocused });


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
  const { online, lastSeenMs } = usePresence(counterpartId);


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
  // false "0 members". A direct shows "Prisijungęs (-usi)"
  // live, else when the counterpart was last active — nothing
  // at all for a never-seen (or gated) account
  const subtitle = isGroup
    ? chat.profiles.length > 0
      ? t('chat.groupMembers', { count: chat.profiles.length })
      : undefined
    : online
      ? t('chat.online')
      : lastSeenMs
        ? t('chat.lastActive', { time: formatRelativeAgo(lastSeenMs) })
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
  // The bubble's accessibility React is a one-tap toggle through
  // the ENGINE — optimistic, parked offline and rolled back on a
  // refusal exactly like the long-press picker (it once called
  // the REST routes directly, so a screen-reader user offline
  // saw nothing and lost the reaction). Stable identity: it
  // reaches every memoised bubble as the React action
  const { toggleReaction } = reactions;
  const reactFromAction = useCallback(
    (message: KitMessage, emoji: string) => toggleReaction(message.id, emoji),
    [toggleReaction],
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
            onReact={reactFromAction}
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
        rows={forward.rooms ?? []}
        emptyLabel={forward.rooms === null ? t('common.loading') : t('chat.forwardNoRooms')}
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
        onViewChange={viewer.view}
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

function ChatRoomScreen() {

  // Every param through useRouteParam: a repeated ?conversationId
  // arrives as an ARRAY, which the old type cast let through as
  // "aaa,bbb" into cache keys, the socket room and request paths,
  // skipping the designed no-conversation state below
  const convId = useRouteParam('conversationId') ?? '';
  const type = useRouteParam('type');
  const unread = useRouteParam('unread');

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


// The gate wraps the export, so a disabled module's screen
// never mounts — see components/FeatureGate.tsx
export default withFeature('chat', ChatRoomScreen);
