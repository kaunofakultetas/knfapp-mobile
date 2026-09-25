// -----------------------------------------------------------
//  [*] Activity — the in-app notification list
//
//  Likes, comments and friend requests on the viewer's own
//  things, grouped by @knf/socialengine ("Ona and 3 others
//  liked your post") and drawn by @knf/socialuikit's
//  NotificationRow. Landing marks everything read — the rows
//  flip at once, and the engine's unread signal zeroes the
//  drawer's badge with them; a tap opens what the row is
//  about — the post, the requests screen, the actor's
//  profile.
//
//  Every return to the screen re-reads the list SILENTLY: the
//  full-screen spinner belongs to the first load only (a
//  refresh behind shown rows keeps them on screen), the pull
//  gesture drives its own spinner, and the rows that arrived
//  meanwhile are marked read too once they land.
//
//  Logged out the screen is a login prompt (auth adds
//  features, never gates): the engine's hook reports the
//  transport, and a guest never asks the wire.
//
//  Split into (root component last):
//
//    destinationFor — row kind → the route it opens
//    ActivityScreen — the page itself (default export)
// -----------------------------------------------------------

// The viewer, connectivity and the login return path
// The shipping gate — features.json decides whether this
// module renders or shows the not-ready screen
import withFeature from '@/components/FeatureGate';

import { useAuth } from '@/context/AuthContext';
import { useNetwork } from '@/context/NetworkContext';
import { useReturnHref } from '@/hooks/useReturnHref';

// The engine's grouped activity + the kit's row
import { useNotifications, type NotificationGroup } from '@knf/socialengine';
import { FeedList, NotificationRow } from '@knf/socialuikit';

// Screen chrome
import { EmptyState, ErrorState, LoadingSpinner, Screen } from '@/components/ui';

// Navigation and rendering
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';







// -----------------------------------------------------------
// destinationFor
// -----------------------------------------------------------
//
// The backend keys like/comment rows on the POST id, request
// rows on the request id (the requests screen lists those),
// and an accepted request on nothing — the actor's profile is
// the natural place to land. Unknown kinds open nothing.
//
// Used by:
//   - ActivityScreen (below)
// -----------------------------------------------------------

function destinationFor(group: NotificationGroup): Href | null {
  switch (group.kind) {
    case 'like':
    case 'comment':
      return group.subjectId ? { pathname: '/(main)/news-post', params: { postId: group.subjectId } } : null;
    case 'connect_request':
      return '/(main)/friend-requests';
    case 'connect_accept':
      return group.actors[0] ? { pathname: '/(main)/profile', params: { userId: group.actors[0].id } } : null;
    default:
      return null;
  }
}







// -----------------------------------------------------------
// ActivityScreen (default export)
// -----------------------------------------------------------
//
// Wires useNotifications into the page: mark-all-read fires
// only once rows have LANDED (a failed load never claims a
// read), a skip-first focus effect silently refetches on
// return visits (through a ref — the callback must never
// close over a stale loading flag), the pull gesture owns its
// spinner, and the guard chain runs login prompt → spinner
// (nothing shown yet) → error-with-nothing → list, with taps
// routed through destinationFor.
//
// Used by:
//   - app/(main)/_layout.tsx — the 'activity/index' route
//   - components/Sidebar.tsx — the drawer entry with the badge
// -----------------------------------------------------------

function ActivityScreen() {

  const { isAuthenticated } = useAuth();
  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const router = useRouter();
  const returnTo = useReturnHref();


  const activity = useNotifications();


  // Every visit marks the list read — once the rows are on
  // screen, not while they load, so a failed load never claims
  // a read the viewer never saw; a return visit's refetch
  // landing runs it again for the rows that arrived meanwhile
  const { markAllRead, refresh, groups, loading, error } = activity;
  useEffect(() => {
    if (isAuthenticated && !loading && !error && groups.length > 0) void markAllRead();
    // Only the LANDED page matters, not every group change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, loading, error]);


  // A silent refetch when the screen regains focus; the first
  // focus rides the mount load. The refresh rides a ref, so the
  // callback never reads a flag frozen at mount
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      if (isAuthenticated) void refreshRef.current();
    }, [isAuthenticated]),
  );


  // The pull gesture's own spinner — the silent refetches never
  // spin it
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const handlePullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refreshRef.current();
    } finally {
      setPullRefreshing(false);
    }
  }, []);
  const onPullRefresh = useCallback(() => void handlePullRefresh(), [handlePullRefresh]);


  const open = useCallback(
    (group: NotificationGroup) => {
      const destination = destinationFor(group);
      if (destination) router.push(destination);
    },
    [router],
  );


  // Stable list callbacks — the kit's rows skip re-renders
  // while their group and these stay put
  const keyOfGroup = useCallback((group: NotificationGroup) => group.key, []);
  const renderGroup = useCallback(
    (group: NotificationGroup) => <NotificationRow notification={group} onPress={() => open(group)} />,
    [open],
  );


  if (!isAuthenticated) {
    return (
      <Screen>
        <EmptyState
          icon="notifications-outline"
          title={t('activity.loginRequired')}
          action={{
            label: t('settings.login'),
            onPress: () => router.push({ pathname: '/login', params: { returnTo } }),
          }}
        />
      </Screen>
    );
  }


  // The full spinner is for a list with nothing on it yet — a
  // refetch behind shown rows keeps them
  if (loading && groups.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (error && groups.length === 0) {
    return (
      <Screen>
        <ErrorState message={t('activity.loadError')} offline={!isConnected} onRetry={() => void refresh()} />
      </Screen>
    );
  }


  return (
    <Screen>
      <FeedList
        items={groups}
        keyOf={keyOfGroup}
        renderItem={renderGroup}
        hasMore={activity.hasMore}
        loadingMore={activity.loadingMore}
        onEndReached={activity.loadMore}
        refreshing={pullRefreshing}
        onRefresh={onPullRefresh}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title={t('activity.empty')} hint={t('activity.emptyHint')} />}
      />
    </Screen>
  );
}


// The gate wraps the export, so a disabled module's screen
// never mounts — see components/FeatureGate.tsx
export default withFeature('social', ActivityScreen);
