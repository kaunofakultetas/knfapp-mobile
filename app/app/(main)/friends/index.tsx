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
//  The same route with ?view=blocked is the viewer's
//  BLOCKED-USERS list: every account they blocked, each with
//  an unblock button (and a tap through to the profile shell
//  the owner of a block still sees). It is the one reliable
//  way back from a block — the people search hides blocked
//  accounts in both directions and a block severs the
//  friendship, so without it a block on someone never
//  messaged could only be undone by stumbling on them again
//  (KNF-142). The friends list links to it from a quiet row
//  under the friends, shown while the viewer has any block.
//
//  And ?view=search is FIND PEOPLE (components/social/
//  FindPeopleView.tsx): the directory search the new-chat
//  picker uses, each hit opening the profile where the friend
//  request lives. The friends list offers it from a row right
//  under the requests banner — before it, the screen had no
//  way to anyone who was not already a friend.
//
//  Both lists load via useLoad, so the full-screen spinner
//  shows only on the FIRST load; focus returns and
//  pull-to-refresh refetch silently behind the shown rows,
//  and a failed silent refresh keeps them instead of swapping
//  in an error. Logged out the body is a login prompt
//  carrying a returnTo route back here.
//
//  Split into (root component last):
//
//    FriendsData      — friends + pending + block counts
//    PendingBanner    — burgundy banner → friend requests
//    FindPeopleRow    — the door to the people search
//    FriendRow        — avatar, names, chat shortcut
//    BlockedEntryRow  — the quiet link to the blocked list
//    BlockedRow       — one blocked account + unblock
//    BlockedUsersView — the ?view=blocked list
//    FriendsListView  — the friends list
//    FriendsScreen    — the route: login gate + view switch
//                       (default export)
// -----------------------------------------------------------

// Session state
// The shipping gate — features.json decides whether this
// module renders or shows the not-ready screen
import withFeature from '@/components/FeatureGate';

import { useAuth } from '@/context/AuthContext';
import { showToast, useNetwork } from '@/context/NetworkContext';

// Single-shot loads of the lists and counts
import { useLoad } from '@knf/dataengine';
import {
  fetchBlockedUsers,
  fetchFriendRequests,
  fetchFriends,
  unblockUser,
  type BlockedUser,
  type Friend,
} from '@/services/api';

// The ?view=search body
import FindPeopleView from '@/components/social/FindPeopleView';

// UI kit and theming
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  RefreshSpinner,
  Screen,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// The current location, params included, for the login round
// trip, and the ?view= switch
import { useReturnHref } from '@/hooks/useReturnHref';
import { useRouteParam } from '@/hooks/useRouteParam';

// Navigation, i18n and primitives
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// The requests share one load cycle so the banner, the list
// and the blocked-users link can never disagree about
// freshness
interface FriendsData {
  friends: Friend[];
  pendingCount: number;
  blockedCount: number;
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
//   - FriendsListView (below) — FlatList header
// -----------------------------------------------------------

function PendingBanner({ count, onPress }: { count: number; onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  if (count === 0) return null;


  return (
    <Pressable
      className="flex-row items-center justify-between rounded-xl bg-brand p-md active:bg-brand-strong"
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
// FindPeopleRow
// -----------------------------------------------------------
//
// The friends list's way to anyone new: a quiet card under the
// requests banner that opens the ?view=search people search.
// Always shown — an empty friends list needs it most. 44pt
// and taller.
//
// Used by:
//   - FriendsListView (below) — FlatList header
// -----------------------------------------------------------

function FindPeopleRow({ onPress }: { onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      className="min-h-11 flex-row items-center justify-between rounded-xl border border-line bg-surface p-md active:bg-surface-soft"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('friends.findPeople')}
    >
      <View className="flex-row items-center gap-sm">
        <Ionicons name="search" size={20} color={colors.brandText} />
        <Text className="font-raleway-medium text-base text-ink">{t('friends.findPeople')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
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
//   - FriendsListView (below)
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
// BlockedEntryRow
// -----------------------------------------------------------
//
// The friends list's quiet door to the blocked-users view —
// a muted row under the friends, rendered only while the
// viewer has blocked anyone (the count rides the friends
// load). 44pt tall on its own.
//
// Used by:
//   - FriendsListView (below) — FlatList footer
// -----------------------------------------------------------

function BlockedEntryRow({ count, onPress }: { count: number; onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  if (count === 0) return null;


  return (
    <Pressable
      className="mt-md min-h-11 flex-row items-center justify-between py-sm"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('friends.blockedEntry', { count })}
    >
      <View className="flex-row items-center gap-sm">
        <Ionicons name="ban-outline" size={18} color={colors.inkSoft} />
        <Text className="font-raleway-medium text-sm text-ink-soft">
          {t('friends.blockedEntry', { count })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// BlockedRow
// -----------------------------------------------------------
//
// One blocked account: the person (tappable → the profile
// shell the owner of a block still sees, whose own unblock
// button works too) and the unblock button, its spoken label
// carrying the name. Memoized like the friend rows.
//
// Used by:
//   - BlockedUsersView (below)
// -----------------------------------------------------------

const BlockedRow = memo(function BlockedRow({
  item,
  busy,
  onOpen,
  onUnblock,
}: {
  item: BlockedUser;
  busy: boolean;
  onOpen: (item: BlockedUser) => void;
  onUnblock: (item: BlockedUser) => void;
}) {

  const { t } = useTranslation();


  return (
    <View className="flex-row items-center gap-sm border-b border-line py-sm">

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

      <Button
        title={t('friends.unblock')}
        onPress={() => onUnblock(item)}
        variant="secondary"
        size="sm"
        fullWidth={false}
        loading={busy}
        disabled={busy}
        accessibilityLabel={t('friends.unblockLabel', { name: item.displayName })}
      />

    </View>
  );
});







// -----------------------------------------------------------
// BlockedUsersView
// -----------------------------------------------------------
//
// The ?view=blocked list: the explanation first (what a block
// does, that unblocking restores no friendship), then one row
// per blocked account, newest block first as the server
// sorts them. An unblock is confirmed by the server before
// the row leaves (a failure toasts and keeps it); the per-row
// ref twin rejects a same-frame double tap. The stack header
// is retitled to the blocked-users title while this view
// shows.
//
// Used by:
//   - FriendsScreen (below)
// -----------------------------------------------------------

function BlockedUsersView() {

  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();


  useEffect(() => {
    navigation.setOptions({ title: t('friends.blockedTitle') });
  }, [navigation, t]);


  const { data, loading, error, refresh, retry } = useLoad<BlockedUser[]>(async () => {
    const { blocked } = await fetchBlockedUsers();
    return blocked;
  }, []);


  // Rows the viewer unblocked here — gone from the list at once
  // (the next refetch no longer carries them anyway)
  const [unblocked, setUnblocked] = useState<Set<string>>(new Set());
  const rows = (data ?? []).filter((row) => !unblocked.has(row.id));


  // Pull spinner only; silent refetch on every return (an
  // unblock from a profile shell must drop its row here)
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };
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


  // Per-row in-flight unblock, with the synchronous ref twin
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const busyRef = useRef(new Set<string>());
  const setRowBusy = useCallback((id: string, on: boolean) => {
    setBusy((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleUnblock = useCallback(
    async (item: BlockedUser) => {
      if (busyRef.current.has(item.id)) return;
      busyRef.current.add(item.id);
      setRowBusy(item.id, true);
      try {
        await unblockUser(item.id);
        setUnblocked((previous) => new Set(previous).add(item.id));
        showToast('success', t('profile.unblocked'));
      } catch {
        showToast('error', t('profile.actionError'));
      } finally {
        busyRef.current.delete(item.id);
        setRowBusy(item.id, false);
      }
    },
    [setRowBusy, t],
  );

  const handleOpen = useCallback(
    (item: BlockedUser) => router.push({ pathname: '/(main)/profile', params: { userId: item.id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: BlockedUser }) => (
      <BlockedRow item={item} busy={busy.has(item.id)} onOpen={handleOpen} onUnblock={(row) => void handleUnblock(row)} />
    ),
    [busy, handleOpen, handleUnblock],
  );


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
        <ErrorState message={t('friends.blockedLoadError')} offline={!isConnected} onRetry={retry} />
      </Screen>
    );
  }


  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <Text className="mb-sm mt-md font-raleway text-sm leading-5 text-ink-soft">{t('friends.blockedHint')}</Text>
        }
        renderItem={renderItem}
        refreshControl={<RefreshSpinner refreshing={refreshing} onRefresh={() => void handleRefresh()} />}
        ListEmptyComponent={<EmptyState icon="shield-checkmark-outline" title={t('friends.blockedEmpty')} />}
      />
    </Screen>
  );
}







// -----------------------------------------------------------
// FriendsListView
// -----------------------------------------------------------
//
// One useLoad fetches friends, the pending count and the
// block count together (the block count is best-effort — a
// failed read hides the link, it never fails the list); a
// skip-first-focus effect refetches silently on every
// return, and the local `refreshing` flag exists only so the
// pull spinner never reflects those silent refreshes. Row
// handlers are useCallback-stable to keep memoized rows
// cheap.
//
// Used by:
//   - FriendsScreen (below)
// -----------------------------------------------------------

function FriendsListView() {

  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();


  const { data, loading, error, refresh, retry } = useLoad<FriendsData>(async () => {
    const [friendsResponse, requestsResponse, blockedResponse] = await Promise.all([
      fetchFriends(),
      fetchFriendRequests('received'),
      fetchBlockedUsers().catch(() => ({ blocked: [] as BlockedUser[] })),
    ]);
    return {
      friends: friendsResponse.friends,
      pendingCount: requestsResponse.requests.length,
      blockedCount: blockedResponse.blocked.length,
    };
  }, []);


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
          <View className="gap-sm pb-sm pt-md">
            <PendingBanner
              count={data?.pendingCount ?? 0}
              onPress={() => router.push('/(main)/friend-requests')}
            />
            <FindPeopleRow
              onPress={() => router.push({ pathname: '/(main)/friends', params: { view: 'search' } })}
            />
          </View>
        }
        renderItem={renderItem}
        refreshControl={
          <RefreshSpinner
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={t('friends.empty')}
            hint={t('friends.emptyHint')}
          />
        }
        ListFooterComponent={
          <BlockedEntryRow
            count={data?.blockedCount ?? 0}
            onPress={() => router.push({ pathname: '/(main)/friends', params: { view: 'blocked' } })}
          />
        }
      />
    </Screen>
  );
}







// -----------------------------------------------------------
// FriendsScreen (default export)
// -----------------------------------------------------------
//
// The route itself: logged out, the login prompt (with the
// returnTo round trip, the view param included); signed in,
// ?view=blocked picks the blocked-users list, ?view=search
// the people search, and anything else the friends list.
// Each view owns its loads.
//
// Used by:
//   - app/(main)/_layout.tsx — route /(main)/friends
//   - app/(main)/profile/index.tsx — the own profile's
//     friends stat
// -----------------------------------------------------------

function FriendsScreen() {

  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const returnTo = useReturnHref();
  const view = useRouteParam('view');


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


  if (view === 'blocked') return <BlockedUsersView />;
  if (view === 'search') return <FindPeopleView />;
  return <FriendsListView />;
}


// The gate wraps the export, so a disabled module's screen
// never mounts — see components/FeatureGate.tsx
export default withFeature('social', FriendsScreen);
