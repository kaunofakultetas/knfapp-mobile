// -----------------------------------------------------------
//  [*] Tabs — Messages
//
//  The conversations list. Messaging needs an account, so the
//  whole tab sits behind LoginRequiredOverlay; signed in, the
//  list loads through useFeed with an offline first page
//  (user-scoped cacheKeyConversations + CachedBanner) and refreshes
//  silently on every re-focus — that is also what clears the
//  unread badge of a chat the user just left.
//
//  Realtime: a registry-backed new_message subscription
//  patches the affected conversation in place from the socket
//  payload (preview, server-stamped age, unread bump for
//  foreign senders) — the sort memo then reorders by itself. A
//  message for a conversation the list doesn't know yet
//  (just-created chat) falls back to ONE debounced full
//  refetch; conversations the user just deleted/left are
//  remembered in a ref-held Set so their trailing echoes don't
//  refetch them back. A status banner shows reconnecting/
//  disconnected/unauthorized states; tapping the disconnected
//  one retries the connect, the unauthorized one clears the
//  dead session.
//
//  Presence polling is sequenced after data: the online map
//  refetches only when the SET of direct-chat participants
//  changes (pin/unread patches don't re-trigger it) plus every
//  30 s while the tab is focused and the app foregrounded.
//
//  Pin toggles (swipe action or row long-press) and deletes
//  (swipe action, confirmAction-guarded) are optimistic with
//  an exact revert and an error toast on failure.
//
//  Split into (root component last):
//
//    SocketBanner  — reconnecting/disconnected strip
//    SearchRow     — search field + new-chat button
//    FilterTabs    — all/people/groups chips with unread pills
//    Conversations — the signed-in screen body
//    Messages      — login gate wrapper (default export)
// -----------------------------------------------------------

// Login gate and the offline-copy strip
import CachedBanner from '@/components/CachedBanner';
import LoginRequiredOverlay from '@/components/LoginRequiredOverlay';

// Row rendering
import ConversationRow from '@/components/chat/ConversationRow';

// UI kit
import {
  EmptyState,
  ErrorState,
  Header,
  LoadingSpinner,
  RefreshSpinner,
  Screen,
  confirmAction,
} from '@/components/ui';

// Auth, theming and toast feedback
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { useTheme } from '@/hooks/useTheme';

// Feed engine and realtime plumbing
import { useFeed } from '@knf/dataengine';
import { useSocketStatus } from '@/hooks/useSocketStatus';
import {
  connectSocket,
  leaveConversation,
  onMessageDeleted,
  onNewMessage,
  type SocketMessage,
  type SocketStatus,
} from '@/services/socket';

// Server-stamp parsing for socket patches (zoneless-UTC shape)
import { parseStamp } from '@knf/chatuikit';

// Conversations REST API and its offline cache key
import {
  deleteConversationApi,
  fetchConversations,
  fetchOnlineStatus,
  togglePinApi,
  type ApiConversation,
} from '@/services/api';
import { emitSessionInvalid } from '@/services/api/session-events';
import { getActiveConversation } from '@/hooks/chat/activeConversation';
import { cacheKeyConversations, CONVERSATIONS_CACHE_MAX_AGE } from '@/services/cacheKeys';

// Diacritic-folding search normaliser shared with the map
import { foldForSearch } from '@/services/format';

// Navigation, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';


type FilterTab = 'all' | 'people' | 'groups';

// Static keys so the catalog stays greppable
const TAB_LABEL_KEYS: Record<FilterTab, string> = {
  all: 'messages.all',
  people: 'messages.people',
  groups: 'messages.groups',
};

const FILTER_TABS: FilterTab[] = ['all', 'people', 'groups'];

// How long a non-connected socket state may last before the
// banner shows
const BANNER_GRACE_MS = 8000;







// -----------------------------------------------------------
// SocketBanner
// -----------------------------------------------------------
//
// Connection state strip under the header: a warning-toned
// spinner line while (re)connecting, a danger-toned tappable
// line when disconnected — the tap retries connectSocket() —
// and a danger-toned "sign in again" line when the server
// rejected the handshake — the tap drops the dead session
// through the shared session-invalidation channel. Connected
// renders nothing. Live regions plus explicit announcements
// keep screen readers informed of the transitions.
//
// Used by:
//   - Conversations (below)
// -----------------------------------------------------------

function SocketBanner({ status }: { status: SocketStatus }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  // The strip waits out the connect handshake — a fresh open
  // spends a few seconds 'connecting' and must not flash red.
  // ONE timer per outage: it starts on the first transition
  // away from 'connected' and only a return to 'connected'
  // clears it — mid-outage flips (reconnecting ↔ disconnected)
  // must not restart the grace period
  const [settled, setSettled] = useState(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (status === 'connected') {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      setSettled(false);
      return;
    }
    if (graceTimerRef.current) return;
    graceTimerRef.current = setTimeout(() => {
      graceTimerRef.current = null;
      setSettled(true);
    }, BANNER_GRACE_MS);
  }, [status]);
  useEffect(
    () => () => {
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    },
    [],
  );


  // A rejected handshake is definitive — it skips the grace
  // wait; the disconnect strip still waits it out. (String
  // compare: the 'unauthorized' member joins SocketStatus with
  // the socket service's session-invalidation half.)
  const showUnauthorized = (status as string) === 'unauthorized';
  const showDisconnected = status === 'disconnected' && settled;


  // iOS has no live regions — announce the high-value states
  useEffect(() => {
    if (showUnauthorized) {
      AccessibilityInfo.announceForAccessibility(t('messages.sessionExpired'));
    } else if (showDisconnected) {
      AccessibilityInfo.announceForAccessibility(t('messages.disconnected'));
    }
  }, [showUnauthorized, showDisconnected, t]);


  if (showUnauthorized) {
    return (
      <Pressable
        className="flex-row items-center justify-center border-b border-line bg-danger-soft px-md py-sm"
        onPress={() => emitSessionInvalid()}
        hitSlop={8}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('messages.sessionExpired')}
        accessibilityLiveRegion="polite"
      >
        <Ionicons name="key-outline" size={14} color={colors.danger} />
        <Text className="ml-sm font-raleway-medium text-xs text-danger">
          {t('messages.sessionExpired')}
        </Text>
      </Pressable>
    );
  }


  if (status === 'connected' || !settled) return null;


  if (status === 'disconnected') {
    return (
      <Pressable
        className="flex-row items-center justify-center border-b border-line bg-danger-soft px-md py-sm"
        onPress={() => void connectSocket()}
        hitSlop={8}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('messages.disconnected')}
        accessibilityLiveRegion="polite"
      >
        <Ionicons name="cloud-offline-outline" size={14} color={colors.danger} />
        <Text className="ml-sm font-raleway-medium text-xs text-danger">
          {t('messages.disconnected')}
        </Text>
      </Pressable>
    );
  }


  return (
    <View
      className="flex-row items-center justify-center border-b border-line bg-warning-soft px-md py-sm"
      accessible
      accessibilityLabel={t('messages.reconnecting')}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="small" color={colors.warning} />
      <Text className="ml-sm font-raleway-medium text-xs text-warning">
        {t('messages.reconnecting')}
      </Text>
    </View>
  );
}







// -----------------------------------------------------------
// SearchRow
// -----------------------------------------------------------
//
// The title-filter field plus the round new-chat button. The
// input sits at the very top of the list area, so it can never
// end up behind the keyboard.
//
// Used by:
//   - Conversations (below)
// -----------------------------------------------------------

function SearchRow({
  query,
  onChangeQuery,
  onNewChat,
}: {
  query: string;
  onChangeQuery: (next: string) => void;
  onNewChat: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="bg-surface px-md pb-sm pt-md">
      <View className="flex-row items-center">

        <View className="flex-1 flex-row items-center rounded-full bg-surface-soft px-sm py-sm">
          <Ionicons name="search" size={18} color={colors.inkFaint} />
          <TextInput
            className="ml-sm flex-1 font-raleway text-base text-ink"
            placeholder={t('messages.searchPlaceholder')}
            placeholderTextColor={colors.inkFaint}
            value={query}
            onChangeText={onChangeQuery}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={t('messages.searchPlaceholder')}
          />
        </View>

        <Pressable
          className="ml-md h-11 w-11 items-center justify-center rounded-full bg-brand-soft"
          onPress={onNewChat}
          accessibilityRole="button"
          accessibilityLabel={t('messages.newMessage')}
        >
          <Ionicons name="create-outline" size={20} color={colors.brand} />
        </Pressable>

      </View>
    </View>
  );
}







// -----------------------------------------------------------
// FilterTabs
// -----------------------------------------------------------
//
// The all/people/groups chip row. People and groups chips
// carry their unread totals as pills capped at 99+ — inverted
// colors on the active chip so the pill stays readable on the
// brand fill.
//
// Used by:
//   - Conversations (below)
// -----------------------------------------------------------

function FilterTabs({
  active,
  counts,
  onChange,
}: {
  active: FilterTab;
  counts: Record<FilterTab, number>;
  onChange: (tab: FilterTab) => void;
}) {

  const { t } = useTranslation();


  return (
    <View className="flex-row border-b border-line bg-surface px-md pb-sm">
      {FILTER_TABS.map((tab) => {
        const isActive = active === tab;
        const badge = counts[tab];
        const badgeLabel = badge > 99 ? '99+' : String(badge);

        // The pill is spelled into the chip's own label — the
        // parent label would otherwise swallow the count
        const a11yLabel =
          badge > 0
            ? `${t(TAB_LABEL_KEYS[tab])}, ${t('messages.unreadCount', { count: badge })}`
            : t(TAB_LABEL_KEYS[tab]);

        return (
          <Pressable
            key={tab}
            className={`mr-sm flex-row items-center rounded-full px-md py-sm ${
              isActive ? 'bg-brand' : 'bg-surface-soft'
            }`}
            onPress={() => onChange(tab)}
            hitSlop={4}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={a11yLabel}
          >
            <Text
              className={`text-sm ${
                isActive ? 'font-raleway-bold text-on-brand' : 'font-raleway text-ink-soft'
              }`}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </Text>
            {badge > 0 && (
              <View
                className={`ml-xs items-center justify-center rounded-full px-xs ${
                  isActive ? 'bg-on-brand' : 'bg-brand'
                }`}
                style={{ height: 18, minWidth: 18 }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text
                  className={`font-raleway-bold text-xs ${
                    isActive ? 'text-brand' : 'text-on-brand'
                  }`}
                >
                  {badgeLabel}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}







// -----------------------------------------------------------
// Conversations
// -----------------------------------------------------------
//
// The signed-in screen body — all list state lives here (see
// the file header for the realtime/presence/optimistic-update
// story). Rendered only when authenticated, so no fetch ever
// fires for guests.
//
// Used by:
//   - Messages (below)
// -----------------------------------------------------------

function Conversations() {

  const router = useRouter();
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const socketStatus = useSocketStatus();
  const userId = user?.id ?? null;


  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});


  // The endpoint returns every conversation at once — a single
  // "page" with the offline copy handled by the feed engine.
  // The cache key is user-scoped (privacy: the next account
  // must never see this one's previews) and the auth dep bumps
  // the feed's sequence on logout, so an in-flight fetch can't
  // re-write the wiped cache
  const feed = useFeed<ApiConversation>(
    async () => {
      const response = await fetchConversations();
      return { items: response.conversations, hasMore: false };
    },
    {
      cacheKey: cacheKeyConversations(userId ?? 'guest'),
      cacheMaxAge: CONVERSATIONS_CACHE_MAX_AGE,
      deps: [isAuthenticated],
    },
  );
  const { setItems, refresh } = feed;

  // The RefreshControl spinner belongs to the PULL gesture
  // alone — the focus-return and reconnect refreshes reuse the
  // same feed.refresh(), and binding the spinner to
  // feed.refreshing made every come-back from a conversation
  // animate like a pull (content shoved down, then up)
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const handlePullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refresh();
    } finally {
      setPullRefreshing(false);
    }
  }, [refresh]);


  // Mirror of the list for async flows (socket existence check,
  // delete index capture) without stale closures
  const conversationsRef = useRef<ApiConversation[]>([]);
  useEffect(() => {
    conversationsRef.current = feed.items;
  }, [feed.items]);


  // Conversations the user just deleted/left — their trailing
  // socket echoes must not read as "unknown conversation" and
  // refetch the row straight back into the list
  const removedIdsRef = useRef<Set<string>>(new Set());


  // One debounced full refetch for socket messages in unknown
  // conversations — a burst collapses into a single request
  // (refresh is identity-stable, so these callbacks hold)
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) return;
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      void refresh();
    }, 800);
  }, [refresh]);


  // Realtime: patch the affected conversation from the payload.
  // The cancelled flag covers cleanup racing the awaited
  // connect; the registry keeps the handler valid across
  // reconnects. The tab stays mounted under a pushed chat-room,
  // so the open room's own messages arrive here too — those are
  // skipped via the active-conversation id (the room marks them
  // read as they land), and the focus refresh reconciles with
  // the server on the way back.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let unsubscribeDeleted: (() => void) | undefined;

    void (async () => {
      // Best-effort connect — the subscription below works
      // regardless once the socket comes up
      try {
        await connectSocket();
      } catch {
        // Ignored — see comment above
      }
      if (cancelled) return;

      unsubscribe = onNewMessage((message: SocketMessage) => {
        // Trailing echo of a conversation the user just
        // deleted/left — not an unknown chat, no refetch
        if (removedIdsRef.current.has(message.conversationId)) return;

        const known = conversationsRef.current.some(
          (conversation) => conversation.id === message.conversationId,
        );
        if (!known) {
          scheduleRefetch();
          return;
        }

        // Own outgoing messages echo back too — never unread,
        // and neither is a message for the room currently being
        // read (the room acknowledges it via mark_read on this
        // same event). The age comes from the SERVER stamp, not
        // the device clock — a skewed clock would pin the row
        // to the top
        setItems((current) =>
          current.map((conversation) =>
            conversation.id === message.conversationId
              ? {
                  ...conversation,
                  lastUpdatedMs:
                    parseStamp(message.createdAt)?.getTime() ?? conversation.lastUpdatedMs,
                  unreadCount:
                    message.senderId === userId ||
                    message.conversationId === getActiveConversation()
                      ? conversation.unreadCount
                      : conversation.unreadCount + 1,
                  lastMessage: {
                    id: message.id,
                    text: message.text,
                    imageUrl: message.imageUrl,
                    time: message.time,
                    senderId: message.senderId,
                    senderName: message.senderName,
                  },
                }
              : conversation,
          ),
        );
      });

      // An unsent last message flips its preview to the placeholder
      unsubscribeDeleted = onMessageDeleted(({ conversationId, messageId }) => {
        setItems((current) =>
          current.map((conversation) =>
            conversation.id === conversationId && conversation.lastMessage?.id === messageId
              ? {
                  ...conversation,
                  lastMessage: { ...conversation.lastMessage, text: '', imageUrl: undefined, deleted: true },
                }
              : conversation,
          ),
        );
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribeDeleted?.();
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, [userId, scheduleRefetch, setItems]);


  // Re-focus refresh clears the unread count of the chat the
  // user just left; the mount load already covers first focus
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      void refresh();
    }, [refresh]),
  );


  // Other-participant ids of direct chats — the presence
  // polling target, sorted so the key below is order-stable
  const directUserIds = useMemo(() => {
    if (!userId) return [] as string[];
    const ids = new Set<string>();
    for (const conversation of feed.items) {
      if (conversation.type !== 'direct') continue;
      for (const participant of conversation.participants) {
        if (participant.id !== userId) ids.add(participant.id);
      }
    }
    return [...ids].sort();
  }, [feed.items, userId]);


  const directIdsRef = useRef(directUserIds);
  useEffect(() => {
    directIdsRef.current = directUserIds;
  }, [directUserIds]);


  // Presence polls are sequenced (useFeed's seqRef pattern) and
  // fail-soft: a stale answer overtaken by the next tick is
  // dropped, and a failed poll (null) keeps the previous dots
  // instead of asserting everyone offline
  const presenceSeqRef = useRef(0);
  const refreshOnlineStatus = useCallback(async () => {
    const ids = directIdsRef.current;
    if (ids.length === 0) return;
    const seq = ++presenceSeqRef.current;
    const online = await fetchOnlineStatus(ids);
    if (seq !== presenceSeqRef.current) return;
    if (online) setOnlineMap(online);
  }, []);


  // Sequenced after load: runs only when the participant SET
  // changes (first data arrival, new/removed chats) — pin and
  // unread patches don't re-trigger it
  const directIdsKey = directUserIds.join(',');
  useEffect(() => {
    if (directIdsKey) void refreshOnlineStatus();
  }, [directIdsKey, refreshOnlineStatus]);


  // Keep presence fresh while the tab is actually visible AND
  // the app is foregrounded — navigation focus survives
  // backgrounding, and on Android JS timers keep firing for a
  // pocketed phone, so the interval must stop with the app and
  // restart (with one immediate poll) on return
  useFocusEffect(
    useCallback(() => {
      let interval: ReturnType<typeof setInterval> | null = null;
      const start = () => {
        if (!interval) interval = setInterval(() => void refreshOnlineStatus(), 30_000);
      };
      const stop = () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      };

      if (AppState.currentState === 'active') start();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void refreshOnlineStatus();
          start();
        } else {
          stop();
        }
      });

      return () => {
        stop();
        subscription.remove();
      };
    }, [refreshOnlineStatus]),
  );


  // Tab filter + title search + sort (pinned first, newest
  // activity next) — socket patches re-sort through this memo.
  // Query and titles fold diacritics, so "rysiai" finds "Ryšiai"
  const visible = useMemo(() => {
    const q = foldForSearch(query.trim());
    let list = feed.items;
    if (activeTab === 'people') list = list.filter((c) => c.type === 'direct');
    else if (activeTab === 'groups') list = list.filter((c) => c.type === 'group');
    if (q) list = list.filter((c) => foldForSearch(c.title).includes(q));

    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.lastUpdatedMs || 0) - (a.lastUpdatedMs || 0);
    });
  }, [feed.items, query, activeTab]);


  // Unread totals for the chip pills
  const tabCounts = useMemo<Record<FilterTab, number>>(() => {
    let people = 0;
    let groups = 0;
    for (const conversation of feed.items) {
      if (conversation.type === 'direct') people += conversation.unreadCount || 0;
      else groups += conversation.unreadCount || 0;
    }
    return { all: 0, people, groups };
  }, [feed.items]);


  const isOnline = useCallback(
    (conversation: ApiConversation): boolean => {
      if (conversation.type !== 'direct' || !userId) return false;
      const other = conversation.participants.find((p) => p.id !== userId);
      return other ? onlineMap[other.id] === true : false;
    },
    [onlineMap, userId],
  );


  const openChat = useCallback(
    (conversation: ApiConversation) => {
      router.push({
        pathname: '/(main)/chat-room',
        params: {
          conversationId: conversation.id,
          title: conversation.title,
          type: conversation.type,
          // The room draws its "new messages" line from this —
          // captured now, before opening the room clears it
          unread: String(conversation.unreadCount ?? 0),
        },
      });
    },
    [router],
  );


  const openNewChat = useCallback(() => {
    router.push('/(main)/new-chat');
  }, [router]);


  // Optimistic pin with exact revert; the server's answer wins
  // when it lands (double-taps race the requests)
  const togglePin = useCallback(
    async (conversation: ApiConversation) => {
      const wasPinned = conversation.pinned;
      setItems((current) =>
        current.map((c) => (c.id === conversation.id ? { ...c, pinned: !wasPinned } : c)),
      );
      try {
        const { pinned } = await togglePinApi(conversation.id);
        setItems((current) =>
          current.map((c) => (c.id === conversation.id ? { ...c, pinned } : c)),
        );
      } catch {
        setItems((current) =>
          current.map((c) => (c.id === conversation.id ? { ...c, pinned: wasPinned } : c)),
        );
        showToast('error', t('messages.actionError'));
      }
    },
    [setItems, t],
  );


  // Confirmed removal, optimistic with the removed row put back
  // at its old index on failure. The copy tells the truth per
  // type: leaving a group loses the history for good (no
  // self-rejoin), deleting a direct chat removes only the
  // caller's copy — the other participant keeps theirs
  const deleteConversation = useCallback(
    async (conversation: ApiConversation) => {
      const isGroup = conversation.type === 'group';
      const confirmed = await confirmAction({
        title: isGroup ? t('messages.leaveGroupTitle') : t('messages.deleteTitle'),
        message: isGroup ? t('messages.leaveGroupConfirm') : t('messages.deleteDirectConfirm'),
        confirmLabel: isGroup ? t('messages.leaveGroup') : t('messages.delete'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;

      const index = conversationsRef.current.findIndex((c) => c.id === conversation.id);
      setItems((current) => current.filter((c) => c.id !== conversation.id));
      try {
        await deleteConversationApi(conversation.id);
        // Membership is really gone — leave the socket room and
        // ignore its trailing echoes. (This is the list screen
        // after server-side removal, not an in-room leave.)
        removedIdsRef.current.add(conversation.id);
        leaveConversation(conversation.id);
      } catch {
        setItems((current) => {
          const next = [...current];
          next.splice(Math.min(Math.max(index, 0), next.length), 0, conversation);
          return next;
        });
        showToast('error', t('messages.actionError'));
      }
    },
    [setItems, t],
  );


  // Stable renderItem over memoized rows: per-keystroke query
  // renders re-run the filter, not every ConversationRow
  const renderItem = useCallback(
    ({ item }: { item: ApiConversation }) => (
      <ConversationRow
        item={item}
        currentUserId={userId ?? undefined}
        isOnline={isOnline(item)}
        onPress={openChat}
        onTogglePin={togglePin}
        onDelete={deleteConversation}
      />
    ),
    [userId, isOnline, openChat, togglePin, deleteConversation],
  );


  // Search-aware empty copy, then per-tab copy; only the full
  // "no conversations at all" state carries the CTA
  const renderEmpty = () => {
    const q = query.trim();
    if (q) {
      return <EmptyState icon="search-outline" title={t('messages.noResults', { query: q })} />;
    }
    if (activeTab === 'people') {
      return <EmptyState icon="person-outline" title={t('messages.noPeopleTitle')} />;
    }
    if (activeTab === 'groups') {
      return <EmptyState icon="people-outline" title={t('messages.noGroupsTitle')} />;
    }
    return (
      <EmptyState
        icon="chatbubble-outline"
        title={t('messages.noRoomsTitle')}
        hint={t('messages.noRoomsSubtitle')}
        action={{ label: t('messages.newMessage'), onPress: openNewChat }}
      />
    );
  };


  if (feed.loading) {
    return (
      <Screen>
        <Header title={t('messages.title')} />
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  return (
    <Screen>
      <Header title={t('messages.title')} />
      <SocketBanner status={socketStatus} />
      {feed.cachedAt !== null && <CachedBanner cachedAt={feed.cachedAt} />}
      <SearchRow query={query} onChangeQuery={setQuery} onNewChat={openNewChat} />
      <FilterTabs active={activeTab} counts={tabCounts} onChange={setActiveTab} />

      {feed.error ? (
        feed.refreshing ? (
          // Retry in flight — visible progress instead of a
          // frozen ErrorState (the news-comments pattern)
          <View className="flex-1 items-center justify-center">
            <LoadingSpinner />
          </View>
        ) : (
          <ErrorState
            message={t('messages.loadError')}
            onRetry={() => void refresh()}
          />
        )
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 24,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshSpinner
              refreshing={pullRefreshing}
              onRefresh={() => void handlePullRefresh()}
            />
          }
          ListEmptyComponent={renderEmpty()}
        />
      )}
    </Screen>
  );
}







// -----------------------------------------------------------
// Messages (default export)
// -----------------------------------------------------------
//
// The login gate: guests get the friendly overlay, signed-in
// users get Conversations — whose hooks then only ever run
// with an account present.
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — the Messages tab route
// -----------------------------------------------------------

export default function Messages() {

  const { t } = useTranslation();


  return (
    <LoginRequiredOverlay
      headerTitle={t('messages.title')}
      icon="chatbubbles-outline"
      message={t('messages.loginRequired')}
      hint={t('messages.loginHint')}
    >
      <Conversations />
    </LoginRequiredOverlay>
  );
}
