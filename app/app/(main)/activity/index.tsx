// -----------------------------------------------------------
//  [*] Activity — the in-app notification list
//
//  Likes, comments and friend requests on the viewer's own
//  things, grouped by @knf/socialengine ("Ona and 3 others
//  liked your post") and drawn by @knf/socialuikit's
//  NotificationRow. Opening the screen marks everything read
//  (the badge in the drawer zeroes through the engine's own
//  optimistic flip); a tap opens what the row is about — the
//  post, the requests screen, the actor's profile.
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
import { useCallback, useEffect } from 'react';
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
// Used by:
//   - app/(main)/_layout.tsx — the 'activity/index' route
//   - components/Sidebar.tsx — the drawer entry with the badge
// -----------------------------------------------------------

export default function ActivityScreen() {

  const { isAuthenticated } = useAuth();
  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const router = useRouter();
  const returnTo = useReturnHref();


  const activity = useNotifications();


  // Every visit marks the list read — once the rows are on
  // screen, not while they load, so a failed load never claims
  // a read the viewer never saw
  const { markAllRead, refresh, groups, loading, error } = activity;
  useEffect(() => {
    if (isAuthenticated && !loading && !error && groups.length > 0) void markAllRead();
    // Only the LANDED page matters, not every group change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, loading, error]);

  // A silent refetch when the screen regains focus (the first
  // focus rides the mount load)
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && !loading) void refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]),
  );


  const open = useCallback(
    (group: NotificationGroup) => {
      const destination = destinationFor(group);
      if (destination) router.push(destination);
    },
    [router],
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


  if (loading) {
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
        keyOf={(group) => group.key}
        renderItem={(group) => <NotificationRow notification={group} onPress={() => open(group)} />}
        hasMore={activity.hasMore}
        loadingMore={false}
        onEndReached={activity.loadMore}
        refreshing={false}
        onRefresh={() => void refresh()}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title={t('activity.empty')} hint={t('activity.emptyHint')} />}
      />
    </Screen>
  );
}
