import Header from '@/components/ui/Header';
import { MOCK_NEWS_POSTS, MOCK_POLL } from '@/constants/Data';
import type { NewsPost } from '@/types';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Image, Pressable, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


const ExamplePoll = () => {
  const { t } = useTranslation();
  return (
    <View className="mx-2.5 my-5 bg-gray-300 pb-2.5">
      <View className="w-full pb-5">
        {MOCK_POLL.options.map((option) => (
          <View
            key={option.id}
            className={`h-10 m-5 mb-0 rounded-lg border-2 border-solid flex-row items-center ${
              option.isSelected ? 'w-[90%] bg-accent border-primary' : 'bg-gray-400 border-gray-400'
            }`}
            style={{ width: `${Math.max(10, Math.round((option.votes / MOCK_POLL.totalVotes) * 100))}%` }}
          >
            <View className="flex-1 justify-center">
              <Text className="text-lg font-bold pl-2.5">{option.text}</Text>
            </View>
            {option.isSelected && (
              <View className="justify-center mr-5">
                <Ionicons name="checkmark-circle-outline" size={24} />
              </View>
            )}
          </View>
        ))}
      </View>
      
      <View className="bg-primary">
        <Text className="m-1.5 ml-2.5 text-white">2023 m. liepos 31 d.</Text>
      </View>

      <Text className="pt-2.5 px-2.5 text-xl">{t('news.pollTitle')}</Text>
    
      <View className="flex-1 flex-row pb-1 mt-2.5">
        <View className="flex-1 flex-row content-center ml-7">
          <FontAwesome name="heart-o" size={24} className="mr-2.5 self-center"/>
          <Text className="mt-1.5 text-lg">86</Text>
        </View>

        <View className="flex-1 flex-row content-center ml-7">
          <FontAwesome name="comment-o" size={24} className="mr-2.5 self-center" />
          <Text className="mt-1.5 text-lg">4</Text>
        </View>

        <View className="flex-1 flex-row content-center ml-7">
          <FontAwesome name="share-square-o" size={24} className="mr-2.5 self-center" />
          <Text className="mt-1.5 text-lg">2</Text>
        </View>
      </View>
    </View>
  );
};

export default function NewsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const defaultHeaderHeight = 56;
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<any>(null);
  const currentOffsetYRef = useRef(0);
  const snappingTopRef = useRef(false);
  const SNAP_TOP_THRESHOLD_PX = 12;
  const [isAtTop, setIsAtTop] = useState(true);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(defaultHeaderHeight);
  const clampedHeader = useMemo(() => Animated.diffClamp(scrollY, 0, measuredHeaderHeight), [scrollY, measuredHeaderHeight]);
  const headerTranslateY = clampedHeader.interpolate({ inputRange: [0, measuredHeaderHeight], outputRange: [0, -measuredHeaderHeight] });
  const [likedById, setLikedById] = useState<Record<string, boolean>>({});
  const [commentsCountById, setCommentsCountById] = useState<Record<string, number>>({});
  
  // Removed tab bar hide logic per request

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('news_likes');
        if (raw) setLikedById(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const entries = await Promise.all(
          MOCK_NEWS_POSTS.map(async (p) => {
            const raw = await AsyncStorage.getItem(`comments_${p.id}`);
            const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
            return [p.id, Array.isArray(arr) ? arr.length : 0] as const;
          })
        );
        setCommentsCountById(Object.fromEntries(entries));
      } catch {}
    })();
  }, []);

  const openPost = (id: string) => router.push(`/(main)/news-post?postId=${id}`);

  const toggleLike = (post: NewsPost) => {
    setLikedById((prev) => {
      const next = { ...prev, [post.id]: !prev[post.id] };
      AsyncStorage.setItem('news_likes', JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const onShare = async (post: NewsPost) => {
    try {
      await Share.share({
        title: post.title,
        message: `${post.title} — ${post.date}`,
      });
    } catch {}
  };

  return (
    <View className="flex-1 bg-white">
      {/* Fixed primary-colored top line under the notch */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: '#7B003F', zIndex: 3 }}
      />
      <Animated.View
        style={{ transform: [{ translateY: isAtTop ? 0 : (headerTranslateY as unknown as number) }], zIndex: 2, position: 'absolute', top: 0, left: 0, right: 0 }}
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
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              currentOffsetYRef.current = y;
              const atTop = y <= SNAP_TOP_THRESHOLD_PX;
              if (atTop !== isAtTop) setIsAtTop(atTop);
              // Keep animated value pinned when at/above top to prevent overshoot
              if (y <= 0) {
                try { scrollY.setValue(0); } catch {}
              }
            },
          }
        )}
        onScrollEndDrag={() => {
          const y = currentOffsetYRef.current;
          if (y <= SNAP_TOP_THRESHOLD_PX && !snappingTopRef.current) {
            snappingTopRef.current = true;
            // Hard reset to exact 0 to avoid header overshoot
            scrollViewRef.current?.getNode?.().scrollTo({ y: 0, animated: false });
            requestAnimationFrame(() => {
              try { scrollY.setValue(0); } catch {}
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
              try { scrollY.setValue(0); } catch {}
              snappingTopRef.current = false;
            });
          }
        }}
      >
        <ExamplePoll />
        {MOCK_NEWS_POSTS.map((post) => {
          const isLiked = !!likedById[post.id];
          const likeCount = post.likes + (isLiked ? 1 : 0);
          return (
          <Pressable key={post.id} onPress={() => openPost(post.id)}>
            <View className="mx-2.5 my-5 bg-gray-300 pb-2.5">
              {post.imageUrl ? (
                <Image className="w-full aspect-square" source={{ uri: post.imageUrl }} />
              ) : null}
              <View className="bg-primary">
                <Text className="m-1.5 ml-2.5 text-white">{post.date}</Text>
              </View>
              <Text className="pt-2.5 px-2.5 text-xl">{post.title}</Text>
              <View className="flex-1 flex-row justify-between px-7 pb-2 mt-2.5">
                <Pressable className="justify-center items-center" onPress={() => toggleLike(post)} hitSlop={8}>
                  <FontAwesome name={isLiked ? 'heart' : 'heart-o'} size={24} className="mt-1" color={isLiked ? '#E64164' : undefined} />
                  <Text className="mt-1.5 text-lg">{likeCount}</Text>
                </Pressable>
                <Pressable className="justify-center items-center" onPress={() => router.push(`/(main)/news-comments?postId=${post.id}`)} hitSlop={8}>
                  <FontAwesome name="comment-o" size={24} className="mt-1" />
                  <Text className="mt-1.5 text-lg">{commentsCountById[post.id] ?? post.comments}</Text>
                </Pressable>
                <Pressable className="justify-center items-center" onPress={() => onShare(post)} hitSlop={8}>
                  <FontAwesome name="share-square-o" size={24} className="mt-1" />
                  <Text className="mt-1.5 text-lg">{post.shares}</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        );})}
      </Animated.ScrollView>
    </View>
  );
}

