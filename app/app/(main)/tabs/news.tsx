// -----------------------------------------------------------
//  [*] Tabs — News feed
//
//  The app's landing tab: faculty news and community posts
//  under a header whose title bar tucks away as the reader
//  scrolls down and glides back on any scroll up
//  (hooks/useCollapsibleHeader) — the feed-mode toggle and
//  the filter chips stay pinned because they ARE the feed's
//  navigation, and the brand band under the status bar never
//  moves. Two modes — 'all' is the public
//  scraped-plus-user feed with source filter chips and an
//  offline cache; 'community' is the friends-only social feed.
//  Community needs an account, but the mode stays visible
//  logged out: the adapter never calls the endpoint
//  anonymously and the empty feed becomes a login prompt
//  instead of a 401 error state.
//
//  Likes toggle optimistically: the tapped item is patched in
//  place through useFeed's setItems, reconciled with the
//  server's answer, and reverted to the captured previous
//  values (plus an error toast) on failure. Logged-out taps
//  get an info toast instead of a doomed request.
//
//  Only the unfiltered 'all' feed persists to the offline
//  cache — a filtered or community page would poison the
//  cached copy with a partial view. Mode and filter are
//  useFeed deps, so every switch runs the full first-page
//  spinner, the list remounts scrolled to the top and the
//  title bar is revealed again.
//
//  Split into (root component last):
//
//    FeedModeToggle — the all / community segment row
//    SourceChips    — horizontal source filter chips
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
  fetchNewsFeed,
  fetchSocialFeed,
  toggleLikeApi,
  type SocialFeedPost,
} from '@/services/api';
import { CACHE_KEY_NEWS, NEWS_CACHE_MAX_AGE } from '@/services/cache';

// Navigation and rendering
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ListRenderItemInfo,
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

// '' means no source filter — the mixed feed
type SourceFilter = '' | 'knf.vu.lt' | 'vu.lt' | 'faculty' | 'user';

// Chip row config; '' leads so "all" is the first chip
const SOURCE_FILTERS: { key: SourceFilter; labelKey: string }[] = [
  { key: '', labelKey: 'news.filterAll' },
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
// FeedModeToggle
// -----------------------------------------------------------
//
// The all / community segment row under the header: two
// equal-width tabs with a brand underline on the active one.
//
// Used by:
//   - NewsTab (below)
// -----------------------------------------------------------

function FeedModeToggle({ mode, onSelect }: {
  mode: FeedMode;
  onSelect: (mode: FeedMode) => void;
}) {

  const { t } = useTranslation();


  return (
    <View className="flex-row border-b border-line bg-surface px-md" accessibilityRole="tablist">
      {(['all', 'community'] as const).map((key) => {
        const selected = mode === key;
        const label = t(key === 'all' ? 'news.feedAll' : 'news.feedCommunity');
        return (
          <Pressable
            key={key}
            className={
              selected
                ? 'flex-1 items-center border-b-2 border-brand py-2.5'
                : 'flex-1 items-center border-b-2 border-transparent py-2.5'
            }
            onPress={() => onSelect(key)}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
          >
            <Text
              className={
                selected
                  ? 'font-raleway-bold text-sm text-brand'
                  : 'font-raleway-bold text-sm text-ink-soft'
              }
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}







// -----------------------------------------------------------
// SourceChips
// -----------------------------------------------------------
//
// Horizontal filter chips of the 'all' mode. A bounded row of
// five, so a plain horizontal ScrollView is fine — the
// FlatList rule is for unbounded lists.
//
// Used by:
//   - NewsTab (below) — only while mode is 'all'
// -----------------------------------------------------------

function SourceChips({ active, onSelect }: {
  active: SourceFilter;
  onSelect: (key: SourceFilter) => void;
}) {

  const { t } = useTranslation();


  return (
    <View className="border-b border-line bg-surface">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row items-center gap-sm px-md py-2.5"
      >
        {SOURCE_FILTERS.map(({ key, labelKey }) => {
          const selected = active === key;
          return (
            <Pressable
              key={key || 'all'}
              className={
                selected
                  ? 'rounded-full border border-brand bg-brand px-4 py-2'
                  : 'rounded-full border border-line-strong bg-surface-soft px-4 py-2'
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
                    ? 'font-raleway-bold text-sm text-on-brand'
                    : 'font-raleway-bold text-sm text-ink-soft'
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
  const pathname = usePathname();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const { isConnected } = useNetwork();
  const insets = useSafeAreaInsets();
  const header = useCollapsibleHeader();


  // Mode + filter drive the feed's deps; switching modes also
  // drops the filter so 'community' never carries one over
  const [feedMode, setFeedMode] = useState<FeedMode>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('');


  // The community endpoint is friends-only — logged out it is
  // never called, so the login prompt renders as an empty feed
  // instead of a 401 error state
  const fetchPage = async (page: number): Promise<FeedPage<FeedPost>> => {
    if (feedMode === 'community') {
      if (!isAuthenticated) return { items: [], hasMore: false };
      const resp = await fetchSocialFeed(page, PAGE_SIZE);
      return { items: resp.posts, hasMore: resp.hasMore };
    }
    const resp = await fetchNewsFeed(page, PAGE_SIZE, sourceFilter || undefined);
    return { items: resp.posts, hasMore: resp.hasMore };
  };


  // Only the unfiltered public feed caches (see file header);
  // auth state is a dep so the community feed loads right
  // after signing in
  const feed = useFeed<FeedPost>(fetchPage, {
    cacheKey: feedMode === 'all' && sourceFilter === '' ? CACHE_KEY_NEWS : undefined,
    cacheMaxAge: NEWS_CACHE_MAX_AGE,
    deps: [feedMode, sourceFilter, isAuthenticated],
  });


  // In-place patch door for the optimistic like updates
  const patchPost = (id: string, patch: Partial<FeedPost>) => {
    feed.setItems((items) =>
      items.map((post) => (post.id === id ? { ...post, ...patch } : post)),
    );
  };


  // Optimistic like: capture the previous values, patch,
  // reconcile with the server's answer, revert EXACTLY (and
  // toast) on failure
  const toggleLike = (post: FeedPost) => {
    if (!isAuthenticated) {
      showToast('info', t('news.loginToLike'));
      return;
    }

    const wasLiked = !!post.liked;
    const previousLikes = post.likes;
    patchPost(post.id, { liked: !wasLiked, likes: previousLikes + (wasLiked ? -1 : 1) });

    toggleLikeApi(post.id)
      .then((resp) => patchPost(post.id, { liked: resp.liked, likes: resp.likes }))
      .catch(() => {
        patchPost(post.id, { liked: wasLiked, likes: previousLikes });
        showToast('error', t('news.likeError'));
      });
  };


  // The native share sheet; dismissal rejects on some
  // platforms, hence the silent catch
  const sharePost = async (post: FeedPost) => {
    try {
      await Share.share({
        title: post.title,
        message: post.sourceUrl ? `${post.title}\n${post.sourceUrl}` : post.title,
        url: post.sourceUrl || undefined,
      });
    } catch {
      // Dismissed or unsupported — nothing to report
    }
  };


  // Every switch reloads from the top, so the title bar comes
  // back with it
  const selectMode = (mode: FeedMode) => {
    if (mode === feedMode) return;
    setFeedMode(mode);
    setSourceFilter('');
    header.reveal();
  };

  const selectFilter = (key: SourceFilter) => {
    setSourceFilter(key);
    header.reveal();
  };


  const renderPost = ({ item }: ListRenderItemInfo<FeedPost>) => {
    // Scraped articles have no profile behind the author line
    const authorId =
      item.source !== 'knf.vu.lt' && item.source !== 'vu.lt' ? item.authorId : undefined;

    return (
      <NewsCard
        post={item}
        liked={!!item.liked}
        likeCount={item.likes}
        showAvatar={feedMode === 'community'}
        onPress={() =>
          router.push({ pathname: '/(main)/news-post', params: { postId: item.id } })
        }
        onToggleLike={() => toggleLike(item)}
        onOpenComments={() =>
          router.push({ pathname: '/(main)/news-comments', params: { postId: item.id } })
        }
        onShare={() => void sharePost(item)}
        onOpenAuthor={
          authorId
            ? () => router.push({ pathname: '/(main)/profile', params: { userId: authorId } })
            : undefined
        }
      />
    );
  };


  return (
    <Screen>

      {/* Brand band under the status bar — never collapses */}
      <View className="bg-brand-header" style={{ height: insets.top }} />

      {/* The title bar tucks away on scroll; the rows below stay */}
      <Animated.View style={header.barStyle}>
        <Animated.View onLayout={header.onBarLayout} style={header.barContentStyle}>
          <Header title={t('news.title')} inset={false} />
        </Animated.View>
      </Animated.View>

      <FeedModeToggle mode={feedMode} onSelect={selectMode} />
      {feedMode === 'all' ? (
        <SourceChips active={sourceFilter} onSelect={selectFilter} />
      ) : null}

      {feed.cachedAt ? <CachedBanner cachedAt={feed.cachedAt} /> : null}

      {/* Body — spinner / error / the virtualized feed. The list
          unmounts during a deps reload, so a mode or filter
          switch always starts back at the top. */}
      {feed.loading ? (
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
        </View>
      ) : feed.error ? (
        <ErrorState message={t('news.loadError')} offline={!isConnected} onRetry={() => void feed.refresh()} />
      ) : (
        <Animated.FlatList
          data={feed.items}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          onScroll={header.scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 8, paddingBottom: 96 }}
          refreshControl={
            <RefreshControl
              refreshing={feed.refreshing}
              onRefresh={() => void feed.refresh()}
              tintColor={colors.brand}
              colors={[colors.brand]}
              progressBackgroundColor={colors.surface}
            />
          }
          onEndReached={feed.loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyFeed
              mode={feedMode}
              authenticated={isAuthenticated}
              onLogin={() =>
                router.push({ pathname: '/login', params: { returnTo: pathname } })
              }
              onCreatePost={() => router.push('/(main)/create-post')}
            />
          }
          ListFooterComponent={feed.loadingMore ? <LoadingSpinner size="small" /> : null}
        />
      )}

      {isAuthenticated ? (
        <CreatePostFab onPress={() => router.push('/(main)/create-post')} />
      ) : null}

    </Screen>
  );
}
