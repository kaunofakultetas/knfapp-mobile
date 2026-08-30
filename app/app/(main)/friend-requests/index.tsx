// -----------------------------------------------------------
//  [*] Social — Friend requests screen
//
//  Incoming friendship requests as a FlatList of rows with an
//  accept / decline pair. Route /(main)/friend-requests — the
//  native stack header carries the title.
//
//  Each row tracks its own in-flight action in a Map keyed by
//  request id (with a ref twin for the synchronous guard), so
//  two rows can process in parallel, a double tap cannot
//  double-submit, and the spinner sits on whichever button
//  actually fired — the old shared flag let a finished row
//  clear another row's spinner mid-request. A 404/409 from
//  accept/decline means the request was withdrawn or handled
//  in another session: the row is dropped and the list resyncs
//  silently instead of toasting a misleading error.
//
//  Refetches happen in place: the full-screen spinner shows
//  on the first load and while an ErrorState retry is in
//  flight; focus returns and pull-to-refresh run silently
//  behind the shown rows (only the pull gesture itself drives
//  the RefreshControl spinner). Logged out the body is a login
//  prompt carrying a returnTo route back here.
//
//  Split into (root component last):
//
//    RequestAction        — which button of a row is running
//    RequestRow           — avatar, names, accept / decline
//    FriendRequestsScreen — the page itself (default export)
// -----------------------------------------------------------

// Session state and toasts
import { useAuth } from '@/context/AuthContext';
import { showToast, useNetwork } from '@/context/NetworkContext';

// The requests list as a one-page feed + friendship endpoints
import { useFeed } from '@/hooks/useFeed';
import {
  ApiError,
  acceptFriendRequest,
  fetchFriendRequests,
  rejectFriendRequest,
  type FriendRequest,
} from '@/services/api';

// UI kit and theming
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  Screen,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// The current location, params included, for the login round trip
import { useReturnHref } from '@/hooks/useReturnHref';

// Navigation, i18n and primitives
import { useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// Which button of a row is mid-request; a row absent from the
// in-flight map is idle
type RequestAction = 'accept' | 'reject';







// -----------------------------------------------------------
// RequestRow
// -----------------------------------------------------------
//
// One incoming request: the person (tappable → their profile)
// and the accept / decline pair. While either action is in
// flight BOTH buttons lock and the fired one carries the
// spinner, so a slow request never looks like a dead button.
// The buttons' spoken labels carry the requester's name — a
// column of bare "Accept"/"Decline" stops is unnavigable.
// Memoized so a list re-render touches only rows whose props
// actually moved.
//
// Used by:
//   - FriendRequestsScreen (below)
// -----------------------------------------------------------

const RequestRow = memo(function RequestRow({
  item,
  action,
  onOpen,
  onAccept,
  onReject,
}: {
  item: FriendRequest;
  action: RequestAction | null;
  onOpen: (item: FriendRequest) => void;
  onAccept: (item: FriendRequest) => void;
  onReject: (item: FriendRequest) => void;
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

      {/* Both lock while one runs — the fired one spins */}
      <Button
        title={t('friendRequests.accept')}
        onPress={() => onAccept(item)}
        size="sm"
        fullWidth={false}
        loading={action === 'accept'}
        disabled={action !== null}
        accessibilityLabel={t('friendRequests.acceptLabel', { name: item.displayName })}
      />
      <Button
        title={t('friendRequests.reject')}
        onPress={() => onReject(item)}
        variant="secondary"
        size="sm"
        fullWidth={false}
        loading={action === 'reject'}
        disabled={action !== null}
        accessibilityLabel={t('friendRequests.rejectLabel', { name: item.displayName })}
      />

    </View>
  );
});







// -----------------------------------------------------------
// FriendRequestsScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /(main)/friend-requests
// -----------------------------------------------------------

export default function FriendRequestsScreen() {

  const { isAuthenticated } = useAuth();
  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const returnTo = useReturnHref();
  const insets = useSafeAreaInsets();


  // The unpaginated endpoint wrapped as a one-page feed — buys
  // the first-load-only spinner, silent refresh and setItems
  // for row removal; logged out resolves empty with no request
  const feed = useFeed<FriendRequest>(
    async () => {
      if (!isAuthenticated) return { items: [], hasMore: false };
      const { requests } = await fetchFriendRequests('received');
      return { items: requests, hasMore: false };
    },
    { deps: [isAuthenticated] },
  );


  // Per-row in-flight action for rendering, plus a ref twin so
  // a second tap in the same frame is rejected synchronously —
  // state alone commits too late to stop a double submit
  const [inFlight, setInFlight] = useState<Map<string, RequestAction>>(new Map());
  const inFlightRef = useRef(new Set<string>());


  // Pull-to-refresh owns this flag ALONE — focus refetches and
  // error retries also raise feed.refreshing, and those must
  // not spin the pull control by themselves
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const handleRefresh = async () => {
    setPullRefreshing(true);
    await feed.refresh();
    setPullRefreshing(false);
  };


  // Silent in-place refetch when the screen regains focus; the
  // first focus rides the mount load and is skipped. useFeed's
  // refresh has a stable identity, so the dep never re-fires
  // this mid-focus
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      void feed.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- feed.refresh is a stable useFeed callback; depping the feed object would refire every render
    }, [feed.refresh]),
  );


  const setRowAction = useCallback((id: string, action: RequestAction | null) => {
    setInFlight((previous) => {
      const next = new Map(previous);
      if (action) next.set(id, action);
      else next.delete(id);
      return next;
    });
  }, []);


  // Accept and decline share one shape; the row leaves the
  // list only after the server confirms. A 404/409 means the
  // request is already gone — drop the row and resync silently
  const handleAction = useCallback(
    async (item: FriendRequest, action: RequestAction) => {
      if (inFlightRef.current.has(item.id)) return;
      inFlightRef.current.add(item.id);
      setRowAction(item.id, action);

      try {
        if (action === 'accept') await acceptFriendRequest(item.id);
        else await rejectFriendRequest(item.id);
        feed.setItems((items) => items.filter((request) => request.id !== item.id));
      } catch (err) {
        const gone =
          err instanceof ApiError &&
          err.code === 'http' &&
          (err.status === 404 || err.status === 409);
        if (gone) {
          feed.setItems((items) => items.filter((request) => request.id !== item.id));
          void feed.refresh();
        } else {
          showToast(
            'error',
            t(action === 'accept' ? 'friendRequests.acceptError' : 'friendRequests.rejectError'),
          );
        }
      } finally {
        inFlightRef.current.delete(item.id);
        setRowAction(item.id, null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feed.setItems/refresh are stable useFeed callbacks; the feed object itself is not
    [feed.setItems, feed.refresh, setRowAction, t],
  );


  // Stable row handlers — the memoized RequestRow re-renders
  // only when its own request or in-flight action changes
  const handleOpen = useCallback(
    (item: FriendRequest) =>
      router.push({ pathname: '/(main)/profile', params: { userId: item.userId } }),
    [router],
  );

  const handleAccept = useCallback(
    (item: FriendRequest) => void handleAction(item, 'accept'),
    [handleAction],
  );

  const handleReject = useCallback(
    (item: FriendRequest) => void handleAction(item, 'reject'),
    [handleAction],
  );

  const renderItem = useCallback(
    ({ item }: { item: FriendRequest }) => (
      <RequestRow
        item={item}
        action={inFlight.get(item.id) ?? null}
        onOpen={handleOpen}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    ),
    [inFlight, handleOpen, handleAccept, handleReject],
  );


  if (!isAuthenticated) {
    return (
      <Screen>
        <EmptyState
          icon="person-add-outline"
          title={t('friendRequests.loginRequired')}
          action={{
            label: t('settings.login'),
            onPress: () => router.push({ pathname: '/login', params: { returnTo } }),
          }}
        />
      </Screen>
    );
  }


  // The full spinner also covers an ErrorState retry in flight
  // — without the second clause the retry press changed
  // nothing on screen for the whole request
  if (feed.loading || (feed.error && feed.refreshing)) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (feed.error) {
    return (
      <Screen>
        <ErrorState
          message={t('friendRequests.loadError')}
          offline={!isConnected}
          onRetry={() => void feed.refresh()}
        />
      </Screen>
    );
  }


  return (
    <Screen>
      <FlatList
        data={feed.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          // Clears the home indicator on notched devices
          paddingBottom: insets.bottom + 24,
        }}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        ListEmptyComponent={
          <EmptyState icon="checkmark-circle-outline" title={t('friendRequests.empty')} />
        }
      />
    </Screen>
  );
}
