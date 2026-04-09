import Header from '@/components/ui/Header';
import { MOCK_NEWS_POSTS } from '@/constants/Data';
import { useAuth } from '@/context/AuthContext';
import { fetchNewsFeed, fetchPoll, toggleLikeApi, votePollApi, type PollResponse } from '@/services/api';
import type { NewsPost } from '@/types';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
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
  if (!source) return null;
  const labels: Record<string, string> = {
    'knf.vu.lt': 'KNF',
    'vu.lt': 'VU',
    faculty: 'Fakultetas',
    app: 'Programa',
    user: 'Vartotojas',
  };
  return (
    <View className="absolute top-2 right-2 bg-primary/80 px-2 py-0.5 rounded">
      <Text className="text-white text-xs font-bold">{labels[source] ?? source}</Text>
    </View>
  );
}

// ── Poll widget (connected to real API) ─────────────────────────────────────

function PollWidget({ postId }: { postId: string }) {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [poll, setPoll] = useState<PollResponse | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    fetchPoll(postId).then(setPoll);
  }, [postId]);

  if (!poll) return null;

  const handleVote = async (optionId: string) => {
    if (!isAuthenticated || voting) return;
    setVoting(true);
    try {
      const updated = await votePollApi(postId, optionId);
      setPoll(updated);
    } catch {
      // ignore
    } finally {
      setVoting(false);
    }
  };

  const hasVoted = !!poll.userVote;
  const total = poll.totalVotes || 1; // avoid div by zero

  return (
    <View className="mt-1 mx-2.5 mb-2">
      <Text className="font-semibold text-base mb-2 px-0.5">{poll.title}</Text>
      {poll.options.map((option) => {
        const isSelected = poll.userVote === option.id;
        const pct = hasVoted ? Math.round((option.votes / total) * 100) : 0;
        return (
          <Pressable
            key={option.id}
            className={`h-10 mb-2 rounded-lg border-2 flex-row items-center overflow-hidden ${
              isSelected
                ? 'border-[#7B003F] bg-[#7B003F]/10'
                : hasVoted
                  ? 'border-gray-300 bg-gray-100'
                  : 'border-gray-400 bg-gray-200'
            }`}
            onPress={() => handleVote(option.id)}
            disabled={voting}
          >
            {hasVoted && (
              <View
                className={`absolute left-0 top-0 bottom-0 ${isSelected ? 'bg-[#7B003F]/20' : 'bg-gray-200'}`}
                style={{ width: `${pct}%` }}
              />
            )}
            <View className="flex-1 flex-row items-center justify-between px-3 z-10">
              <Text className={`font-medium ${isSelected ? 'text-[#7B003F]' : 'text-gray-800'}`}>
                {option.text}
              </Text>
              {hasVoted && (
                <View className="flex-row items-center gap-1">
                  <Text className={`text-sm ${isSelected ? 'font-bold text-[#7B003F]' : 'text-gray-500'}`}>
                    {pct}%
                  </Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={16} color="#7B003F" />}
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
      <Text className="text-xs text-gray-500 mt-1">
        {t('news.pollVotes', { count: poll.totalVotes })}
      </Text>
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

  const loadPosts = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        const resp = await fetchNewsFeed(pageNum, 20);
        const incoming = resp.posts;
        // Seed like state from backend
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
        setPage(pageNum);
        setHasMore(resp.hasMore);
      } catch {
        // API unreachable — fall back to mock data on first load
        if (!append && pageNum === 1) {
          setPosts(MOCK_NEWS_POSTS);
          setHasMore(false);
        }
      }
    },
    [],
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
    // Optimistic update
    setLikedById((prev) => ({ ...prev, [post.id]: !prev[post.id] }));
    setLikeCounts((prev) => ({
      ...prev,
      [post.id]: (prev[post.id] ?? post.likes) + (likedById[post.id] ? -1 : 1),
    }));

    try {
      const resp = await toggleLikeApi(post.id);
      setLikedById((prev) => ({ ...prev, [post.id]: resp.liked }));
      setLikeCounts((prev) => ({ ...prev, [post.id]: resp.likes }));
    } catch {
      // Revert on failure
      setLikedById((prev) => ({ ...prev, [post.id]: !prev[post.id] }));
      setLikeCounts((prev) => ({
        ...prev,
        [post.id]: (prev[post.id] ?? post.likes) + (likedById[post.id] ? 1 : -1),
      }));
    }
  }, [likedById]);

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
    <View className="flex-1 bg-white">
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
        className="w-full bg-white"
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
            scrollViewRef.current?.getNode?.().scrollTo({ y: 0, animated: false });
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
            scrollViewRef.current?.getNode?.().scrollTo({ y: 0, animated: false });
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
        {loading ? (
          <View className="items-center py-20">
            <ActivityIndicator size="large" color="#7B003F" />
          </View>
        ) : posts.length === 0 ? (
          <View className="items-center py-20">
            <Text className="text-gray-500 text-lg">{t('news.empty', 'Naujienų nėra')}</Text>
          </View>
        ) : (
          <>
            {posts.map((post) => {
              const isLiked = !!likedById[post.id];
              const likeCount = likeCounts[post.id] ?? post.likes;
              return (
                <Pressable key={post.id} onPress={() => openPost(post.id)}>
                  <View className="mx-2.5 my-5 bg-gray-300 pb-2.5">
                    {post.imageUrl ? (
                      <View>
                        <Image className="w-full aspect-square" source={{ uri: post.imageUrl }} />
                        <SourceBadge source={post.source} />
                      </View>
                    ) : (
                      <SourceBadge source={post.source} />
                    )}
                    <View className="bg-primary">
                      <Text className="m-1.5 ml-2.5 text-white">{formatDate(post.date)}</Text>
                    </View>
                    <Text className="pt-2.5 px-2.5 text-xl">{post.title}</Text>
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
                        <Text className={`px-2.5 pt-1 text-sm ${post.authorId && post.source !== 'knf.vu.lt' && post.source !== 'vu.lt' ? 'text-[#7B003F] font-medium' : 'text-gray-600'}`}>
                          {post.author}
                        </Text>
                      </Pressable>
                    ) : null}
                    {post.postType === 'poll' && <PollWidget postId={post.id} />}
                    <View className="flex-1 flex-row justify-between px-7 pb-2 mt-2.5">
                      <Pressable
                        className="justify-center items-center"
                        onPress={() => toggleLike(post)}
                        hitSlop={8}
                      >
                        <FontAwesome
                          name={isLiked ? 'heart' : 'heart-o'}
                          size={24}
                          className="mt-1"
                          color={isLiked ? '#E64164' : undefined}
                        />
                        <Text className="mt-1.5 text-lg">{likeCount}</Text>
                      </Pressable>
                      <Pressable
                        className="justify-center items-center"
                        onPress={() =>
                          router.push(`/(main)/news-comments?postId=${post.id}`)
                        }
                        hitSlop={8}
                      >
                        <FontAwesome name="comment-o" size={24} className="mt-1" />
                        <Text className="mt-1.5 text-lg">{post.comments}</Text>
                      </Pressable>
                      <Pressable
                        className="justify-center items-center"
                        onPress={() => onShare(post)}
                        hitSlop={8}
                      >
                        <FontAwesome name="share-square-o" size={24} className="mt-1" />
                        <Text className="mt-1.5 text-lg">{post.shares}</Text>
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
