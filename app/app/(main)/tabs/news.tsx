// -----------------------------------------------------------
//  [*] Tabs — News feed
//
//  The app's landing tab: faculty news and community posts
//  under a header — title plus ONE chips row — that scrolls
//  away with the content and slides back on any scroll up
//  (hooks/useCollapsibleHeader); only the brand band under
//  the status bar never moves. The chips row is the whole
//  navigation: source chips page the public scraped-plus-user
//  news feed (unfiltered 'Visos' has an offline cache), and
//  the 'Bendruomenė' chip switches to the social feed. Guests
//  get its public posts too — an account only ADDS the
//  friends-only rows — and the logged-out empty state doubles
//  as the login CTA.
//
//  Likes toggle optimistically: the tapped item is patched in
//  place through useFeed's setItems, reconciled with the
//  server's answer, and reverted to the captured previous
//  values (plus an error toast) on failure. Logged-out taps
//  get an info toast instead of a doomed request.
//
//  Only the unfiltered 'all' feed persists to the offline
//  cache — a filtered or community page would poison the
//  cached copy with a partial view — and its key is scoped to
//  the viewing account (guests share one), because the feed
//  is viewer-specific: it can carry rows and like state no
//  other account may read. The chip selection is a useFeed
//  dep, so every switch runs the full first-page spinner, the
//  list remounts scrolled to the top and the header is
//  revealed again.
//
//  Split into (root component last):
//
//    SourceChips    — the horizontal feed-chips row
//    EmptyFeed      — the mode-aware "nothing here" body
//    CreatePostFab  — the floating new-post button
//    NewsTab        — feed state + the FlatList (default export)
// -----------------------------------------------------------

// Screen chrome and shared list states
import CachedBanner from '@/components/CachedBanner';
import NewsCard from '@/components/news/NewsCard';
import { EmptyState, ErrorState, Header, LoadingSpinner, Screen } from '@/components/ui';

// Feed engine, auth, connectivity and theming
import { useAuth } from '@/context/AuthContext';
import { showToast, useNetwork } from '@/context/NetworkContext';
import useCollapsibleHeader from '@/hooks/useCollapsibleHeader';
import { useFeed, type FeedPage } from '@/hooks/useFeed';
import { useTheme } from '@/hooks/useTheme';

// Backend calls and the offline-cache contract
import {
  ApiError,
  fetchNewsFeed,
  fetchNewsPost,
  fetchSocialFeed,
  sharePostApi,
  toggleLikeApi,
  type SocialFeedPost,
} from '@/services/api';
import { cacheKeyNews, NEWS_CACHE_MAX_AGE } from '@/services/cache';

// Deep links for sharing app-native posts (no public web URL)
import * as Linking from 'expo-linking';

// Navigation and rendering
import { useReturnHref } from '@/hooks/useReturnHref';
import type { NewsPost } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type FlatList,
  type ListRenderItemInfo,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// The two views of the tab
type FeedMode = 'all' | 'community';

// '' means no source filter — the mixed feed; the rest is the
// NewsPost union so a backend source can't drift out of sync
// ('app' posts have no chip of their own)
type SourceFilter = '' | Exclude<NonNullable<NewsPost['source']>, 'app'>;

// One chip = one view of the tab: '' and the sources page the
// mixed news feed, 'community' switches to the social feed
type FeedSelection = SourceFilter | 'community';

// Chip row config; '' leads so "all" is the first chip and the
// community feed sits beside it — the row IS the navigation,
// there is no separate mode toggle above it
const FEED_CHIPS: { key: FeedSelection; labelKey: string }[] = [
  { key: '', labelKey: 'news.filterAll' },
  { key: 'community', labelKey: 'news.feedCommunity' },
  { key: 'knf.vu.lt', labelKey: 'news.sourceKnf' },
  { key: 'vu.lt', labelKey: 'news.sourceVu' },
  { key: 'faculty', labelKey: 'news.sourceFaculty' },
  { key: 'user', labelKey: 'news.sourceUser' },
];

// Community rows carry authorAvatar on top of NewsPost; plain
// news rows satisfy the same shape with it absent
type FeedPost = SocialFeedPost;

const PAGE_SIZE = 20;

// FAB shadow — '#000' is the sanctioned raw-hex exception
const FAB_SHADOW: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.25,
  shadowRadius: 6,
  elevation: 6,
};







// -----------------------------------------------------------
// SourceChips
// -----------------------------------------------------------
//
// The horizontal feed-chips row — the tab's entire navigation,
// on the burgundy header ground (white pill = active): source
// chips filter the news feed, the community chip switches
// feeds. A bounded row, so a plain horizontal ScrollView is
// fine — the FlatList rule is for unbounded lists. The caller
// passes the chips to show (guests don't get the 'user' chip —
// see NewsTab).
//
// Used by:
//   - NewsTab (below) — the header block, every mode
// -----------------------------------------------------------

function SourceChips({ filters, active, onSelect }: {
  filters: typeof FEED_CHIPS;
  active: FeedSelection;
  onSelect: (key: FeedSelection) => void;
}) {

  const { t } = useTranslation();


  return (
    <View className="bg-brand-header">
      {/* grow-0 shrink-0 is load-bearing: ScrollViews are
          flex-elastic by default, and the header bar's measured
          height (which pads the whole feed) must never depend
          on the space the bar happens to get — an elastic row
          once fed a re-measure oscillation here */}
      <ScrollView
        horizontal
        className="grow-0 shrink-0"
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row items-center gap-sm px-md py-2.5"
      >
        {filters.map(({ key, labelKey }) => {
          const selected = active === key;
          return (
            <Pressable
              key={key || 'all'}
              className={
                selected
                  ? 'rounded-full border border-on-brand bg-on-brand px-4 py-2'
                  : 'rounded-full border border-on-brand-wash px-4 py-2'
              }
              onPress={() => onSelect(key)}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t(labelKey)}
              accessibilityState={{ selected }}
            >
              <Text
                className={
                  selected
                    ? 'font-raleway-bold text-sm text-brand'
                    : 'font-raleway-bold text-sm text-on-brand opacity-80'
                }
              >
                {t(labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}







// -----------------------------------------------------------
// EmptyFeed
// -----------------------------------------------------------
//
// The mode-aware "nothing here" body: a login prompt for the
// logged-out community view, an invitation to post for an
// empty community, a plain empty state for the news feed.
//
// Used by:
//   - NewsTab (below) — FlatList ListEmptyComponent
// -----------------------------------------------------------

function EmptyFeed({ mode, authenticated, onLogin, onCreatePost }: {
  mode: FeedMode;
  authenticated: boolean;
  onLogin: () => void;
  onCreatePost: () => void;
}) {

  const { t } = useTranslation();


  if (mode === 'community' && !authenticated) {
    return (
      <EmptyState
        icon="people-outline"
        title={t('news.communityLoginTitle')}
        hint={t('news.communityLoginHint')}
        action={{ label: t('settings.login'), onPress: onLogin }}
      />
    );
  }


  if (mode === 'community') {
    return (
      <EmptyState
        icon="people-outline"
        title={t('news.emptyCommunity')}
        hint={t('news.emptyCommunityHint')}
        action={{ label: t('createPost.title'), onPress: onCreatePost }}
      />
    );
  }


  return <EmptyState icon="newspaper-outline" title={t('news.empty')} />;
}







// -----------------------------------------------------------
// CreatePostFab
// -----------------------------------------------------------
//
// The floating new-post button, bottom-right over the feed.
// Only mounted for authenticated users — guests browse, they
// don't publish.
//
// Used by:
//   - NewsTab (below)
// -----------------------------------------------------------

function CreatePostFab({ onPress }: { onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      className="absolute bottom-lg right-md h-14 w-14 items-center justify-center rounded-full bg-brand"
      style={({ pressed }) => [FAB_SHADOW, pressed && { backgroundColor: colors.brandStrong }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('news.a11yCreatePost')}
    >
      <Ionicons name="add" size={28} color={colors.onBrand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// NewsTab (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — the news tab
// -----------------------------------------------------------

export default function NewsTab() {

  const router = useRouter();
  const returnHref = useReturnHref();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const { isConnected } = useNetwork();
  const insets = useSafeAreaInsets();
  const header = useCollapsibleHeader();
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const listRef = useRef<FlatList<FeedPost>>(null);


  // Tapping the News tab while already on it jumps back to the
  // top and brings the header with it. The bar emits tabPress
  // to the focused tab instead of navigating, so a press from
  // ANOTHER tab (which switches here) is left alone — the reader
  // returns to where they were
  const { topOffset, reveal: revealHeader } = header;
  useEffect(() => {
    return navigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;
      listRef.current?.scrollToOffset({ offset: topOffset, animated: true });
      revealHeader();
    });
  }, [navigation, topOffset, revealHeader]);


  // One chip selection drives the feed; mode and source filter
  // are derived views of it
  const [selection, setSelection] = useState<FeedSelection>('');
  const feedMode: FeedMode = selection === 'community' ? 'community' : 'all';
  const sourceFilter: SourceFilter = selection === 'community' ? '' : selection;


  // The 'user' chip dies with the session: logging out while it
  // is active would keep the feed pinned to source=user — a
  // filter the guest branch of GET /news can never match — with
  // the chip itself hidden from guests, so nothing on screen
  // would explain the permanently empty feed
  useEffect(() => {
    if (!isAuthenticated && selection === 'user') setSelection('');
  }, [isAuthenticated, selection]);


  // The community endpoint serves guests its public posts —
  // an account only ADDS the friends-only rows, so the call is
  // made either way and the login prompt stays an empty-state
  // CTA, never a gate
  const fetchPage = async (page: number, signal?: AbortSignal): Promise<FeedPage<FeedPost>> => {
    if (feedMode === 'community') {
      const resp = await fetchSocialFeed(page, PAGE_SIZE, signal);
      return { items: resp.posts, hasMore: resp.hasMore };
    }
    const resp = await fetchNewsFeed(page, PAGE_SIZE, sourceFilter || undefined, signal);
    return { items: resp.posts, hasMore: resp.hasMore };
  };


  // Only the unfiltered 'all' feed caches, under a key scoped
  // to the viewing account (see file header); auth state is a
  // dep so both feeds reload right after signing in or out
  const feed = useFeed<FeedPost>(fetchPage, {
    cacheKey: selection === '' ? cacheKeyNews(user?.id ?? 'guest') : undefined,
    cacheMaxAge: NEWS_CACHE_MAX_AGE,
    deps: [selection, isAuthenticated],
    // Newest-first feed: a background refresh folds new posts
    // in at the top and never truncates the pages already read
    silentRefreshMode: 'merge',
  });


  // Latest refresh closure for the []-deps focus callback below
  // The RefreshControl spinner belongs to the PULL gesture
  // alone: the focus-return refresh reuses feed.refresh() too,
  // and binding the spinner to feed.refreshing made every
  // come-back from a post animate like a pull — content shoved
  // down and back up. This local flag is set only by the
  // gesture handler, so background refreshes stay invisible.
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const handlePullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await feed.refresh();
    } finally {
      setPullRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feed.refresh is a stable useFeed callback; the feed object itself is not
  }, [feed.refresh]);

  const refreshRef = useRef(feed.refresh);
  const feedRef = useRef(feed);
  useEffect(() => {
    refreshRef.current = feed.refresh;
    feedRef.current = feed;
  });


  // The post the reader last opened from this list — on the
  // way back it is re-fetched on its own, so its like/comment
  // counts (or its deletion) reach the row at ANY depth, not
  // just inside the page-1 window a refresh can see
  const lastOpenedRef = useRef<string | null>(null);


  // Re-focus refresh picks up what happened elsewhere (a fresh
  // create-post, likes from the article screen); the mount
  // load already covers the first focus. It MERGES rather than
  // replaces: coming back from a post 60 rows deep must land
  // on that post, not on a recent one — a replace shrank the
  // list to one page and the offset clamped onto whatever was
  // left. The opened post's own re-fetch runs after the merge
  // so the mutation fence cannot drop the merge's response
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      const opened = lastOpenedRef.current;
      lastOpenedRef.current = null;
      void refreshRef.current('merge').then(() => {
        if (!opened) return;
        fetchNewsPost(opened)
          .then((fresh) => {
            feedRef.current.setItems((items) =>
              items.map((item) => (item.id === opened ? { ...item, ...fresh } : item)),
            );
          })
          .catch((err: unknown) => {
            // Gone while it was open (deleted from the article
            // screen) — the row goes with it
            if (err instanceof ApiError && err.status === 404) {
              feedRef.current.setItems((items) => items.filter((item) => item.id !== opened));
            }
          });
      });
    }, []),
  );


  // In-place patch door for the optimistic like/share updates
  const patchPost = useCallback(
    (id: string, patch: Partial<FeedPost>) => {
      feed.setItems((items) =>
        items.map((post) => (post.id === id ? { ...post, ...patch } : post)),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- feed.setItems is a stable useFeed callback; the feed object itself is not
    [feed.setItems],
  );


  // One like toggle per post at a time — a double-tap must
  // not race two requests whose answers land out of order
  const likesInFlightRef = useRef<Set<string>>(new Set());


  // Optimistic like: capture the previous values, patch,
  // reconcile with the server's answer, revert EXACTLY (and
  // toast) on failure
  const toggleLike = useCallback(
    (post: FeedPost) => {
      if (!isAuthenticated) {
        showToast('info', t('news.loginToLike'));
        return;
      }
      if (likesInFlightRef.current.has(post.id)) return;
      likesInFlightRef.current.add(post.id);

      const wasLiked = !!post.liked;
      const previousLikes = post.likes;
      patchPost(post.id, { liked: !wasLiked, likes: previousLikes + (wasLiked ? -1 : 1) });

      toggleLikeApi(post.id)
        .then((resp) => patchPost(post.id, { liked: resp.liked, likes: resp.likes }))
        .catch(() => {
          patchPost(post.id, { liked: wasLiked, likes: previousLikes });
          showToast('error', t('news.likeError'));
        })
        .finally(() => {
          likesInFlightRef.current.delete(post.id);
        });
    },
    [isAuthenticated, t, patchPost],
  );


  // The native share sheet — NewsCard hides its share action
  // on web builds without navigator.share, so this only runs
  // where a sheet exists. Scraped articles share their web
  // address; app-native posts have none, so a body excerpt
  // plus the app deep link goes out instead — a bare (often
  // backend-truncated) title alone helps no recipient. A
  // completed share (not a dismissal) is recorded backend-side
  // with an optimistic bump reconciled against the returned
  // count; a dismissal rejects on some platforms (AbortError
  // on web), so only other rejections toast.
  const sharePost = useCallback(
    async (post: FeedPost) => {
      try {
        // A backend-defaulted title is just the body's first 80
        // chars — then the excerpt alone carries the text once
        const titleIsExcerpt = !!post.content && post.content.startsWith(post.title);
        const snippet = post.content
          ? post.content.length > 200
            ? `${post.content.slice(0, 200)}…`
            : post.content
          : '';
        const result = await Share.share(
          post.sourceUrl
            ? {
                title: post.title,
                message: `${post.title}\n${post.sourceUrl}`,
                url: post.sourceUrl,
              }
            : {
                title: post.title,
                message: [
                  titleIsExcerpt ? '' : post.title,
                  snippet,
                  Linking.createURL('/news-post', { queryParams: { postId: post.id } }),
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
        );
        if (result.action === Share.dismissedAction) return;

        patchPost(post.id, { shares: post.shares + 1 });
        sharePostApi(post.id)
          .then((resp) => patchPost(post.id, { shares: resp.shares }))
          .catch(() => patchPost(post.id, { shares: post.shares }));
      } catch (err) {
        if ((err as { name?: string } | null)?.name !== 'AbortError') {
          showToast('error', t('common.error'));
        }
      }
    },
    [patchPost, t],
  );


  // Every switch reloads from the top, so the header comes
  // back with it
  const selectChip = (key: FeedSelection) => {
    if (key === selection) return;
    setSelection(key);
    header.reveal();
  };


  // Stable render function so the FlatList doesn't hand every
  // row a fresh renderItem per feed render (NewsCard itself is
  // memoized on its side)
  const renderPost = useCallback(
    ({ item }: ListRenderItemInfo<FeedPost>) => {
      // Scraped articles have no profile behind the author line
      const authorId =
        item.source !== 'knf.vu.lt' && item.source !== 'vu.lt' ? item.authorId : undefined;

      return (
        <NewsCard
          post={item}
          liked={!!item.liked}
          likeCount={item.likes}
          showAvatar={feedMode === 'community'}
          onPress={() => {
            lastOpenedRef.current = item.id;
            router.push({ pathname: '/(main)/news-post', params: { postId: item.id } });
          }}
          onToggleLike={() => toggleLike(item)}
          onOpenComments={() => {
            lastOpenedRef.current = item.id;
            router.push({ pathname: '/(main)/news-comments', params: { postId: item.id } });
          }}
          onShare={() => void sharePost(item)}
          onOpenAuthor={
            authorId
              ? () => router.push({ pathname: '/(main)/profile', params: { userId: authorId } })
              : undefined
          }
        />
      );
    },
    [feedMode, router, toggleLike, sharePost],
  );


  // Guests never see their own 'user' chip filled — the feed
  // has no personal posts to show them, so the chip is hidden
  // (the community chip stays: that feed serves guests its
  // public posts)
  const visibleChips = isAuthenticated
    ? FEED_CHIPS
    : FEED_CHIPS.filter(({ key }) => key !== 'user');


  return (
    <Screen>

      {/* Brand band under the status bar — never collapses */}
      <View className="bg-brand-header" style={{ height: insets.top }} />

      {/* The header floats OVER the list (rendered after it, so
          it stacks on top) and scrolls away with the content by
          pure translation — the list makes room for it through
          the hook's listProps (an iOS content inset, so the
          pull-to-refresh spinner lands in the gap under the
          pinned bar) or content padding elsewhere.
          overflow-hidden clips the bar as it slides up behind
          the brand band. */}
      <View className="flex-1 overflow-hidden">

      {/* Body — spinner / error / the virtualized feed. The list
          unmounts during a deps reload, so a mode or filter
          switch always starts back at the top. A retry from the
          error state shows the spinner too — ErrorState's button
          gives no feedback of its own. */}
      {feed.loading || (feed.error && feed.refreshing) ? (
        <View className="flex-1 items-center justify-center" style={{ paddingTop: header.barHeight }}>
          <LoadingSpinner />
        </View>
      ) : feed.error ? (
        <View className="flex-1" style={{ paddingTop: header.barHeight }}>
          <ErrorState message={t('news.loadError')} offline={!isConnected} onRetry={() => void feed.refresh()} />
        </View>
      ) : (
        <Animated.FlatList
          {...header.listProps}
          ref={listRef}
          data={feed.items}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          onScroll={header.scrollHandler}
          scrollEventThrottle={16}
          // A merge refresh may prepend new posts above the
          // reader: keep the first visible row anchored so the
          // viewport never moves under them (the new rows wait
          // above, one scroll-up away)
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          contentContainerStyle={{ flexGrow: 1, paddingTop: header.contentPaddingTop + 8, paddingBottom: 96 }}
          refreshControl={
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={() => void handlePullRefresh()}
              tintColor={colors.brand}
              colors={[colors.brand]}
              progressBackgroundColor={colors.surface}
              // Android draws its spinner at the frame top, which
              // the overlay bar would cover, so it is pushed below
              // the bar. iOS must NOT get this: it places the
              // native control through the content inset already,
              // and a manual offset breaks that integration
              progressViewOffset={Platform.OS === 'android' ? header.barHeight : undefined}
            />
          }
          onEndReached={feed.loadMore}
          onEndReachedThreshold={0.4}
          // Windowing tuned for tall image cards (the MessageList
          // pattern) — the defaults keep ~10 viewports of decoded
          // covers mounted on either side of the visible area
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={9}
          ListEmptyComponent={
            <EmptyFeed
              mode={feedMode}
              authenticated={isAuthenticated}
              onLogin={() =>
                router.push({ pathname: '/login', params: { returnTo: returnHref } })
              }
              onCreatePost={() => router.push('/(main)/create-post')}
            />
          }
          ListFooterComponent={feed.loadingMore ? <LoadingSpinner size="small" /> : null}
        />
      )}

      {/* The overlay header — title and the chips row slide
          away as ONE block with the scroll and slide back down
          over the feed on any scroll up; the offline banner
          rides along so it never hides behind the bar. */}
      <Animated.View style={header.barStyle}>
        <View onLayout={header.onBarLayout}>
          <Header title={t('news.title')} inset={false} />
          <SourceChips filters={visibleChips} active={selection} onSelect={selectChip} />
          {feed.cachedAt ? <CachedBanner cachedAt={feed.cachedAt} /> : null}
        </View>
      </Animated.View>

      </View>

      {isAuthenticated ? (
        <CreatePostFab onPress={() => router.push('/(main)/create-post')} />
      ) : null}

    </Screen>
  );
}
