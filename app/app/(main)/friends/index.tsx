// -----------------------------------------------------------
//  [*] Social — Friends screen
//
//  The signed-in user's friends: a pending-requests banner
//  (properly pluralized — the lt catalog carries _one/_few/
//  _other forms) linking to /(main)/friend-requests, rows that
//  open profiles, and a 44pt chat shortcut per row that passes
//  prefillUserId/prefillName so new-chat starts with the
//  friend already selected. Route /(main)/friends — the native
//  stack header carries the title.
//
//  The friends list and the pending count load together via
//  useLoad, so the full-screen spinner shows only on the FIRST
//  load; focus returns and pull-to-refresh refetch silently
//  behind the shown rows, and a failed silent refresh keeps
//  them instead of swapping in an error. Logged out the body
//  is a login prompt carrying a returnTo route back here.
//
//  Split into (root component last):
//
//    FriendsData   — friends + pending count, fetched together
//    PendingBanner — burgundy banner → friend requests
//    FriendRow     — avatar, names, chat shortcut
//    FriendsScreen — the page itself (default export)
// -----------------------------------------------------------

// Session state
import { useAuth } from '@/context/AuthContext';
import { useNetwork } from '@/context/NetworkContext';

// Single-shot load of the list + pending count
import { useLoad } from '@knf/dataengine';
import { fetchFriendRequests, fetchFriends, type Friend } from '@/services/api';

// UI kit and theming
import {
  Avatar,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  Screen,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// The current location, params included, for the login round trip
import { useReturnHref } from '@/hooks/useReturnHref';

// Navigation, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// Both requests share one load cycle so the banner and the
// list can never disagree about freshness
interface FriendsData {
  friends: Friend[];
  pendingCount: number;
}







// -----------------------------------------------------------
// PendingBanner
// -----------------------------------------------------------
//
// The burgundy call-to-action above the list: how many
// requests wait and a tap through to the requests screen.
// Renders nothing when the count is zero.
//
// Used by:
//   - FriendsScreen (below) — FlatList header
// -----------------------------------------------------------

function PendingBanner({ count, onPress }: { count: number; onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  if (count === 0) return null;


  return (
    <Pressable
      className="mb-sm mt-md flex-row items-center justify-between rounded-xl bg-brand p-md"
      style={({ pressed }) => (pressed ? { backgroundColor: colors.brandStrong } : undefined)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('friends.pendingRequests', { count })}
    >
      <View className="flex-row items-center gap-sm">
        <Ionicons name="person-add" size={20} color={colors.onBrand} />
        <Text className="font-raleway-bold text-on-brand">
          {t('friends.pendingRequests', { count })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onBrand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// FriendRow
// -----------------------------------------------------------
//
// One friend: the name area opens the profile, the trailing
// 44pt circle jumps straight into a chat with them. A FLAT
// row of sibling Pressables (the friend-requests layout) —
// nesting the chat button inside a pressable row collapsed it
// into the row's single screen-reader stop; as siblings both
// actions get their own focus. Memoized so a list re-render
// touches only rows whose props actually moved.
//
// Used by:
//   - FriendsScreen (below)
// -----------------------------------------------------------

const FriendRow = memo(function FriendRow({
  item,
  onOpen,
  onChat,
}: {
  item: Friend;
  onOpen: (friend: Friend) => void;
  onChat: (friend: Friend) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="flex-row items-center border-b border-line py-sm">

      <Pressable
        className="flex-1 flex-row items-center"
        onPress={() => onOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={item.displayName}
      >
        <Avatar uri={item.avatarUrl} name={item.displayName} size={48} />
        <View className="ml-sm flex-1">
          <Text className="font-raleway-bold text-base text-ink" numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text className="font-raleway text-xs text-ink-soft" numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
      </Pressable>

      {/* w-11 = 44pt — the minimum touch target on its own */}
      <Pressable
        className="h-11 w-11 items-center justify-center rounded-full bg-surface-soft"
        onPress={() => onChat(item)}
        accessibilityRole="button"
        accessibilityLabel={t('messages.newMessage')}
      >
        <Ionicons name="chatbubble-outline" size={20} color={colors.ink} />
      </Pressable>

    </View>
  );
});







// -----------------------------------------------------------
// FriendsScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /(main)/friends
// -----------------------------------------------------------

export default function FriendsScreen() {

  const { isAuthenticated } = useAuth();
  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const returnTo = useReturnHref();
  const insets = useSafeAreaInsets();


  // Logged out resolves empty without a request; logging in or
  // out re-runs the load through the deps
  const { data, loading, error, refresh, retry } = useLoad<FriendsData>(async () => {
    if (!isAuthenticated) return { friends: [], pendingCount: 0 };
    const [friendsResponse, requestsResponse] = await Promise.all([
      fetchFriends(),
      fetchFriendRequests('received'),
    ]);
    return {
      friends: friendsResponse.friends,
      pendingCount: requestsResponse.requests.length,
    };
  }, [isAuthenticated]);


  // useLoad's refresh is silent — this flag drives only the
  // pull-to-refresh indicator
  const [refreshing, setRefreshing] = useState(false);


  // Silent in-place refetch on every return to the screen
  // (friendships change on profiles); the first focus rides
  // the mount load and is skipped. useLoad's refresh has a
  // stable identity, so the dep never re-fires this mid-focus
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      void refresh();
    }, [refresh]),
  );


  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };


  // Stable row handlers — the memoized FriendRow re-renders
  // only when its own friend row changes
  const handleOpen = useCallback(
    (friend: Friend) =>
      router.push({ pathname: '/(main)/profile', params: { userId: friend.id } }),
    [router],
  );

  const handleChat = useCallback(
    (friend: Friend) =>
      router.push({
        pathname: '/(main)/new-chat',
        params: { prefillUserId: friend.id, prefillName: friend.displayName },
      }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Friend }) => (
      <FriendRow item={item} onOpen={handleOpen} onChat={handleChat} />
    ),
    [handleOpen, handleChat],
  );


  if (!isAuthenticated) {
    return (
      <Screen>
        <EmptyState
          icon="people-outline"
          title={t('friends.loginRequired')}
          action={{
            label: t('settings.login'),
            onPress: () => router.push({ pathname: '/login', params: { returnTo } }),
          }}
        />
      </Screen>
    );
  }


  if (loading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (error) {
    return (
      <Screen>
        <ErrorState message={t('friends.loadError')} offline={!isConnected} onRetry={retry} />
      </Screen>
    );
  }


  return (
    <Screen>
      <FlatList
        data={data?.friends ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          // Clears the home indicator on notched devices
          paddingBottom: insets.bottom + 24,
        }}
        ListHeaderComponent={
          <PendingBanner
            count={data?.pendingCount ?? 0}
            onPress={() => router.push('/(main)/friend-requests')}
          />
        }
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={t('friends.empty')}
            hint={t('friends.emptyHint')}
          />
        }
      />
    </Screen>
  );
}
