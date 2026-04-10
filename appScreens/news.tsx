import CachedBanner from '@/components/CachedBanner';
import Header from '@/components/ui/Header';
import PollWidget from '@/components/PollWidget';
import { MOCK_NEWS_POSTS } from '@/constants/Data';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { fetchNewsFeed, getUploadUrl, NewsFeedResponse, toggleLikeApi } from '@/services/api';
import { cacheGet, cacheSet, CACHE_KEY_NEWS, NEWS_CACHE_MAX_AGE } from '@/services/cache';
import type { NewsPost } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  RefreshControl,
  Share,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: string }) {
  const { t } = useTranslation();
  if (!source) return null;
  const labelKeys: Record<string, string> = {
    'knf.vu.lt': 'news.sourceKnf',
    'vu.lt': 'news.sourceVu',
    faculty: 'news.sourceFaculty',
    app: 'news.sourceApp',
    user: 'news.sourceUser',
  };
  const label = labelKeys[source] ? t(labelKeys[source]) : source;
  return (
    <View className="absolute top-2.5 right-2.5 bg-primary/85 px-2.5 py-1 rounded-md">
      <Text className="text-white text-xs font-raleway-bold">{label}</Text>
    </View>
  );
}

// ── Format ISO date to Lithuanian display ───────────────────────────────────

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function NewsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const defaultHeaderHeight = 56;
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<any>(null);
  const currentOffsetYRef = useRef(0);
  const snappingTopRef = useRef(false);
  const SNAP_TOP_THRESHOLD_PX = 12;
  const [isAtTop, setIsAtTop] = useState(true);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(defaultHeaderHeight);
  const clampedHeader = useMemo(
    () => Animated.diffClamp(scrollY, 0, measuredHeaderHeight),
    [scrollY, measuredHeaderHeight],
  );
  const headerTranslateY = clampedHeader.interpolate({
    inputRange: [0, measuredHeaderHeight],
    outputRange: [0, -measuredHeaderHeight],
  });

  // ── State: posts from API (or fallback mock) ──────────────────────────────
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likedById, setLikedById] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const hasLiveData = useRef(false);
  const likedByIdRef = useRef(likedById);
  likedByIdRef.current = likedById;

  const applyPosts = useCallback((incoming: NewsPost[], append: boolean) => {
    const likes: Record<string, boolean> = {};
    const counts: Record<string, number> = {};
    incoming.forEach((p) => {
      if (p.liked !== undefined) likes[p.id] = p.liked;
      counts[p.id] = p.likes;
    });
    if (append) {
      setPosts((prev) => [...prev, ...incoming]);
      setLikedById((prev) => ({ ...prev, ...likes }));
      setLikeCounts((prev) => ({ ...prev, ...counts }));
    } else {
      setPosts(incoming);
      setLikedById(likes);
      setLikeCounts(counts);
    }
  }, []);

  const loadPosts = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        const resp = await fetchNewsFeed(pageNum, 20);
        applyPosts(resp.posts, append);
        setPage(pageNum);
        setHasMore(resp.hasMore);
        setCachedAt(null); // Live data — clear cached indicator
        hasLiveData.current = true;

        // Cache first page for offline use
        if (pageNum === 1 && !append) {
          cacheSet(CACHE_KEY_NEWS, resp);
        }
      } catch {
        // API unreachable — try offline cache, then mock data
        if (!append && pageNum === 1) {
          if (!hasLiveData.current) {
            // First load failed — try cached data, then fall back to mock
            const cached = await cacheGet<NewsFeedResponse>(CACHE_KEY_NEWS, NEWS_CACHE_MAX_AGE);
            if (cached) {
              applyPosts(cached.data.posts, false);
              setHasMore(false);
              setCachedAt(cached.cachedAt);
            } else {
              setPosts(MOCK_NEWS_POSTS);
              setHasMore(false);
            }
          } else {
            // Refresh failed — keep current data, show toast
            showToast('error', t('toast.networkError'), t('toast.networkErrorHint'));
          }
        }
      }
    },
    [applyPosts],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadPosts(1);
      setLoading(false);
    })();
  }, [loadPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts(1);
    setRefreshing(false);
  }, [loadPosts]);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await loadPosts(page + 1, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, page, loadPosts]);

  const openPost = (id: string) => router.push(`/(main)/news-post?postId=${id}`);

  const toggleLike = useCallback(async (post: NewsPost) => {
    const wasLiked = !!likedByIdRef.current[post.id];
    // Optimistic update
    setLikedById((prev) => ({ ...prev, [post.id]: !wasLiked }));
    setLikeCounts((prev) => ({
      ...prev,
      [post.id]: (prev[post.id] ?? post.likes) + (wasLiked ? -1 : 1),
    }));

    try {
      const resp = await toggleLikeApi(post.id);
      setLikedById((prev) => ({ ...prev, [post.id]: resp.liked }));
      setLikeCounts((prev) => ({ ...prev, [post.id]: resp.likes }));
    } catch {
      // Revert on failure
      setLikedById((prev) => ({ ...prev, [post.id]: wasLiked }));
      setLikeCounts((prev) => ({
        ...prev,
        [post.id]: (prev[post.id] ?? post.likes) + (wasLiked ? 1 : -1),
      }));
    }
  }, []);

  const onShare = async (post: NewsPost) => {
    try {
      const url = post.sourceUrl || '';
      await Share.share({
        title: post.title,
        message: url ? `${post.title}\n${url}` : `${post.title} — ${post.date}`,
        url: url || undefined,
      });
    } catch {}
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-background-secondary">
      {/* Fixed primary-colored top line under the notch */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: '#7B003F',
          zIndex: 3,
        }}
      />
      <Animated.View
        style={{
          transform: [{ translateY: isAtTop ? 0 : (headerTranslateY as unknown as number) }],
          zIndex: 2,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
        }}
        onLayout={(e: any) => {
          const layout = (e && (e as any).nativeEvent && (e as any).nativeEvent.layout) || {};
          const h = Math.round((layout.height as number) ?? defaultHeaderHeight) || defaultHeaderHeight;
          if (h !== measuredHeaderHeight) setMeasuredHeaderHeight(h);
        }}
      >
        <Header title={t('news.title')} />
      </Animated.View>
      <Animated.ScrollView
        className="w-full bg-background-secondary"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: measuredHeaderHeight }}
        ref={scrollViewRef as any}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7B003F"
            colors={['#7B003F']}
            progressViewOffset={measuredHeaderHeight}
          />
        }
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              currentOffsetYRef.current = y;
              const atTop = y <= SNAP_TOP_THRESHOLD_PX;
              if (atTop !== isAtTop) setIsAtTop(atTop);
              if (y <= 0) {
                try {
                  scrollY.setValue(0);
                } catch {}
              }
            },
          },
        )}
        onScrollEndDrag={() => {
          const y = currentOffsetYRef.current;
          if (y <= SNAP_TOP_THRESHOLD_PX && !snappingTopRef.current) {
            snappingTopRef.current = true;
            const sv = scrollViewRef.current?.getNode?.() ?? scrollViewRef.current;
            sv?.scrollTo?.({ y: 0, animated: false });
            requestAnimationFrame(() => {
              try {
                scrollY.setValue(0);
              } catch {}
              snappingTopRef.current = false;
            });
          }
        }}
        onMomentumScrollEnd={() => {
          const y = currentOffsetYRef.current;
          if (y <= SNAP_TOP_THRESHOLD_PX && !snappingTopRef.current) {
            snappingTopRef.current = true;
            const sv = scrollViewRef.current?.getNode?.() ?? scrollViewRef.current;
            sv?.scrollTo?.({ y: 0, animated: false });
            requestAnimationFrame(() => {
              try {
                scrollY.setValue(0);
              } catch {}
              snappingTopRef.current = false;
            });
          }

          // Infinite scroll trigger
          if (hasMore && !loadingMore) {
            const nativeEvent = { contentSize: { height: 0 }, layoutMeasurement: { height: 0 }, contentOffset: { y: 0 } };
            // Simplified: trigger when near bottom
            if (y > 0) {
              // The real trigger is below
            }
          }
        }}
        onContentSizeChange={(_w: number, h: number) => {
          // Auto-load more when near bottom
          const scrollHeight = h;
          const yPos = currentOffsetYRef.current;
          if (scrollHeight > 0 && yPos > scrollHeight - 1500 && hasMore && !loadingMore) {
            onEndReached();
          }
        }}
      >
        {cachedAt && <CachedBanner cachedAt={cachedAt} />}
        {loading ? (
          <View className="items-center py-20">
            <ActivityIndicator size="large" color="#7B003F" />
          </View>
        ) : posts.length === 0 ? (
          <View className="items-center justify-center py-20 px-lg">
            <Ionicons name="newspaper-outline" size={48} color="#BDBDBD" />
            <Text className="text-text-secondary text-lg mt-md font-raleway-medium text-center">{t('news.empty', 'Naujienų nėra')}</Text>
          </View>
        ) : (
          <>
            {posts.map((post) => {
              const isLiked = !!likedById[post.id];
              const likeCount = likeCounts[post.id] ?? post.likes;
              return (
                <Pressable key={post.id} onPress={() => openPost(post.id)}>
                  <View className="mx-md my-sm bg-white rounded-xl overflow-hidden" style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 }}>
                    {post.imageUrl ? (
                      <View>
                        <Image className="w-full aspect-video" source={{ uri: getUploadUrl(post.imageUrl) }} resizeMode="cover" />
                        <SourceBadge source={post.source} />
                      </View>
                    ) : (
                      <View className="px-md pt-md">
                        <SourceBadge source={post.source} />
                      </View>
                    )}
                    <View className="px-md pt-3">
                      <Text className="text-xs text-primary font-raleway-semibold uppercase tracking-wide">{formatDate(post.date)}</Text>
                    </View>
                    <Text className="px-md pt-1.5 text-lg font-raleway-bold text-text-primary leading-6">{post.title}</Text>
                    {post.author ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          if (post.authorId && post.source !== 'knf.vu.lt' && post.source !== 'vu.lt') {
                            router.push(`/(main)/profile?userId=${post.authorId}`);
                          }
                        }}
                        disabled={!post.authorId || post.source === 'knf.vu.lt' || post.source === 'vu.lt'}
                      >
                        <Text className={`px-md pt-1 text-sm font-raleway ${post.authorId && post.source !== 'knf.vu.lt' && post.source !== 'vu.lt' ? 'text-primary font-raleway-medium' : 'text-text-secondary'}`}>
                          {post.author}
                        </Text>
                      </Pressable>
                    ) : null}
                    {post.postType === 'poll' && <PollWidget postId={post.id} />}
                    <View className="flex-row items-center justify-between px-md py-3 mt-2 border-t border-gray-100">
                      <Pressable
                        className="flex-row items-center gap-1.5"
                        onPress={() => toggleLike(post)}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={isLiked ? 'heart' : 'heart-outline'}
                          size={22}
                          color={isLiked ? '#E64164' : '#757575'}
                        />
                        <Text className={`text-sm font-raleway-medium ${isLiked ? 'text-accent' : 'text-text-secondary'}`}>{likeCount}</Text>
                      </Pressable>
                      <Pressable
                        className="flex-row items-center gap-1.5"
                        onPress={() =>
                          router.push(`/(main)/news-comments?postId=${post.id}`)
                        }
                        hitSlop={8}
                      >
                        <Ionicons name="chatbubble-outline" size={20} color="#757575" />
                        <Text className="text-sm text-text-secondary font-raleway-medium">{post.comments}</Text>
                      </Pressable>
                      <Pressable
                        className="flex-row items-center gap-1.5"
                        onPress={() => onShare(post)}
                        hitSlop={8}
                      >
                        <Ionicons name="share-outline" size={20} color="#757575" />
                        <Text className="text-sm text-text-secondary font-raleway-medium">{post.shares}</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            {loadingMore && (
              <View className="items-center py-5">
                <ActivityIndicator size="small" color="#7B003F" />
              </View>
            )}
            {hasMore && !loadingMore && (
              <Pressable onPress={onEndReached} className="items-center py-5">
                <Text className="text-primary font-bold">
                  {t('news.loadMore', 'Daugiau naujienų')}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </Animated.ScrollView>

      {/* FAB: Create Post (auth only) */}
      {isAuthenticated && (
        <Pressable
          className="absolute bottom-6 right-5 w-14 h-14 rounded-full bg-[#7B003F] items-center justify-center shadow-lg"
          style={{ elevation: 6, zIndex: 10 }}
          onPress={() => router.push('/(main)/create-post')}
        >
          <Ionicons name="add" size={28} color="white" />
        </Pressable>
      )}
    </View>
  );
}
