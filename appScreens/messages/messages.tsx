import CachedBanner from '@/components/CachedBanner';
import Header from '@/components/ui/Header';
import { useAuth } from '@/context/AuthContext';
import { useNetworkRestore } from '@/hooks/useNetworkRestore';
import { useSocketStatus } from '@/hooks/useSocketStatus';
import {
  deleteConversationApi,
  fetchConversations,
  fetchOnlineStatus,
  togglePinApi,
} from '@/services/api';
import type { ApiConversation } from '@/services/api';
import { cacheGet, cacheSet, CACHE_KEY_CONVERSATIONS, CONVERSATIONS_CACHE_MAX_AGE } from '@/services/cache';
import { connectSocket, onNewMessage, type SocketMessage } from '@/services/socket';
import type { Conversation } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import ConversationRow from './components/ConversationRow';

type FilterTab = 'all' | 'people' | 'groups';

// Adapt ApiConversation to the Conversation shape ConversationRow expects
function toRowItem(c: ApiConversation): Conversation {
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    participants: c.participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
    })),
    messages: c.lastMessage
      ? [
          {
            id: c.lastMessage.id,
            conversationId: c.id,
            senderId: c.lastMessage.senderId,
            senderName: c.lastMessage.senderName,
            text: c.lastMessage.text,
            time: c.lastMessage.time,
          },
        ]
      : [],
    unreadCount: c.unreadCount,
    lastUpdatedMs: c.lastUpdatedMs,
    pinned: c.pinned,
    avatarEmoji: c.avatarEmoji,
  };
}

export default function MessagesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();

  const socketStatus = useSocketStatus();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});

  // Use ref to track conversations for online status polling
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const loadConversations = useCallback(async () => {
    try {
      const resp = await fetchConversations();
      setConversations(resp.conversations);
      setCachedAt(null);
      // Cache for offline use
      cacheSet(CACHE_KEY_CONVERSATIONS, resp.conversations);
    } catch {
      // API unavailable -- try offline cache if no data shown yet
      if (conversationsRef.current.length === 0) {
        const cached = await cacheGet<ApiConversation[]>(CACHE_KEY_CONVERSATIONS, CONVERSATIONS_CACHE_MAX_AGE);
        if (cached) {
          setConversations(cached.data);
          setCachedAt(cached.cachedAt);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch online status for direct chat participants
  const refreshOnlineStatus = useCallback(async () => {
    const currentConvs = conversationsRef.current;
    const directConvs = currentConvs.filter((c) => c.type === 'direct');
    if (directConvs.length === 0 || !user) return;

    // Collect unique other-participant IDs
    const userIds = new Set<string>();
    for (const conv of directConvs) {
      for (const p of conv.participants) {
        if (p.id !== user.id) userIds.add(p.id);
      }
    }

    if (userIds.size === 0) return;

    const status = await fetchOnlineStatus([...userIds]);
    setOnlineMap(status);
  }, [user]);

  // Reload on screen focus
  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations]),
  );

  // Refresh online status when conversations change
  useEffect(() => {
    if (conversations.length > 0) {
      refreshOnlineStatus();
    }
  }, [conversations, refreshOnlineStatus]);

  // Poll online status every 30s while screen is focused
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(refreshOnlineStatus, 30_000);
      return () => clearInterval(interval);
    }, [refreshOnlineStatus]),
  );

  // Connect socket and listen for new messages to update conversation list
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const sock = await connectSocket();
      if (!sock) return;

      unsub = onNewMessage((_data: SocketMessage) => {
        // Refresh conversation list when any new message arrives
        loadConversations();
      });
    })();

    return () => { unsub?.(); };
  }, [loadConversations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadConversations(), refreshOnlineStatus()]);
    setRefreshing(false);
  };

  // Auto-refresh when network is restored after being offline
  useNetworkRestore(loadConversations);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = [...conversations];

    // Apply tab filter
    if (activeTab === 'people') {
      base = base.filter((c) => c.type === 'direct');
    } else if (activeTab === 'groups') {
      base = base.filter((c) => c.type === 'group');
    }

    // Sort: pinned first, then by last activity
    base.sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.lastUpdatedMs || 0) - (a.lastUpdatedMs || 0);
    });

    if (!q) return base;
    return base.filter((r) => r.title.toLowerCase().includes(q));
  }, [conversations, query, activeTab]);

  // Compute counts for tab badges
  const tabCounts = useMemo(() => {
    const directUnread = conversations
      .filter((c) => c.type === 'direct')
      .reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    const groupUnread = conversations
      .filter((c) => c.type === 'group')
      .reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    return { people: directUnread, groups: groupUnread };
  }, [conversations]);

  /** Check if a participant in a direct chat is online. */
  const isConvOnline = useCallback((conv: ApiConversation): boolean => {
    if (conv.type !== 'direct' || !user) return false;
    const other = conv.participants.find((p) => p.id !== user.id);
    return other ? !!onlineMap[other.id] : false;
  }, [onlineMap, user]);

  const handleChatPress = (conv: ApiConversation) => {
    router.push(
      `/(main)/chat-room?conversationId=${conv.id}&title=${encodeURIComponent(conv.title)}&type=${conv.type}`,
    );
  };

  const handleNewChatPress = () => {
    router.push('/(main)/new-chat');
  };

  const togglePin = async (id: string) => {
    // Optimistic
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
    );
    togglePinApi(id).catch(() => {});
  };

  const deleteConv = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    deleteConversationApi(id).catch(() => {});
  };

  const tabs: { key: FilterTab; label: string; badge: number }[] = [
    { key: 'all', label: t('messages.all', 'Visi'), badge: 0 },
    { key: 'people', label: t('messages.people'), badge: tabCounts.people },
    { key: 'groups', label: t('messages.groups'), badge: tabCounts.groups },
  ];

  if (loading) {
    return (
      <View className="bg-background-secondary flex-1">
        <Header title={t('messages.title')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#7B003F" />
        </View>
      </View>
    );
  }

  return (
    <View className="bg-background-secondary flex-1 relative">
      <Header title={t('messages.title')} />
      {(socketStatus === 'reconnecting' || socketStatus === 'connecting') && (
        <View className="bg-amber-50 px-4 py-2 flex-row items-center justify-center border-b border-amber-200">
          <ActivityIndicator size="small" color="#d97706" />
          <Text className="text-amber-700 text-xs ml-2 font-raleway-medium">
            {t('messages.reconnecting')}
          </Text>
        </View>
      )}
      {socketStatus === 'disconnected' && (
        <Pressable
          className="bg-red-50 px-4 py-2 flex-row items-center justify-center border-b border-red-200"
          onPress={() => connectSocket()}
        >
          <Ionicons name="cloud-offline-outline" size={14} color="#dc2626" />
          <Text className="text-red-700 text-xs ml-2 font-raleway-medium">
            {t('messages.disconnected')}
          </Text>
        </Pressable>
      )}
      {cachedAt && <CachedBanner cachedAt={cachedAt} />}

      {/* Search bar + new chat button */}
      <View className="px-md pt-md pb-sm bg-white">
        <View className="flex-row items-center">
          <View className="flex-1 flex-row items-center bg-gray-50 rounded-lg px-3 py-2">
            <Ionicons name="search" size={18} color="#9E9E9E" />
            <TextInput
              className="flex-1 text-text-primary font-raleway text-base ml-2"
              placeholder={t('messages.searchPlaceholder')}
              placeholderTextColor="#9E9E9E"
              value={query}
              onChangeText={setQuery}
            />
          </View>
          <Pressable
            className="ml-md w-10 h-10 rounded-full bg-primary/10 items-center justify-center"
            onPress={handleNewChatPress}
          >
            <Ionicons name="create-outline" size={20} color="#7B003F" />
          </Pressable>
        </View>
      </View>

      {/* Filter tabs */}
      <View className="bg-white border-b border-gray-100">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                className={`mr-2 px-4 py-1.5 rounded-full flex-row items-center ${isActive ? 'bg-primary' : 'bg-gray-100'}`}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text className={`text-sm ${isActive ? 'font-raleway-bold text-white' : 'font-raleway text-text-secondary'}`}>
                  {tab.label}
                </Text>
                {tab.badge > 0 && (
                  <View className={`ml-1.5 min-w-[18px] h-[18px] rounded-full px-1 items-center justify-center ${isActive ? 'bg-white/30' : 'bg-primary'}`}>
                    <Text className={`text-[10px] font-raleway-bold ${isActive ? 'text-white' : 'text-white'}`}>
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View className="px-md flex-1">
        <View className="mt-sm flex-1">
          {filtered.length > 0 ? (
            <FlatList
              data={filtered}
              renderItem={({ item }) => (
                <ConversationRow
                  item={toRowItem(item)}
                  onPress={() => handleChatPress(item)}
                  onLongPress={() => deleteConv(item.id)}
                  onTogglePin={() => togglePin(item.id)}
                  onDelete={() => deleteConv(item.id)}
                  isOnline={isConvOnline(item)}
                  currentUserId={user?.id}
                />
              )}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
            />
          ) : (
            <View className="items-center justify-center flex-1 py-20">
              <Ionicons name="chatbubble-outline" size={48} color="#BDBDBD" />
              <Text className="font-raleway-bold text-xl text-text-primary mt-md">
                {activeTab === 'all'
                  ? t('messages.noRoomsTitle')
                  : activeTab === 'people'
                    ? t('messages.noPeopleTitle', 'Asmenini\u0173 pokalbi\u0173 n\u0117ra')
                    : t('messages.noGroupsTitle', 'Grupi\u0173 pokalbi\u0173 n\u0117ra')}
              </Text>
              <Text className="font-raleway text-text-secondary mt-sm text-center px-lg">
                {t('messages.noRoomsSubtitle')}
              </Text>
              <Pressable
                className="mt-lg bg-primary py-3 px-6 rounded-full flex-row items-center"
                onPress={handleNewChatPress}
              >
                <Ionicons name="add" size={18} color="white" />
                <Text className="text-white font-raleway-bold text-sm ml-1.5">
                  {t('messages.newMessage')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
