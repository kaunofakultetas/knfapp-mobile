// -----------------------------------------------------------
//  [*] News — article screen
//
//  The full article behind a feed card: hero image, burgundy
//  date + source strip, body text, the poll for poll posts,
//  a source link, a like/share action row and the first page
//  of comments with the shared pinned composer. Everything
//  scrolls as ONE FlatList — the article rides as
//  ListHeaderComponent, so long threads stay virtualized.
//
//  Load quirks handled here:
//    - a 404 from GET /news/<id> resolves to null and renders
//      the notFound empty state; every other failure keeps
//      ErrorState with retry — the old screen collapsed both
//      into a misleading "not found";
//    - the single-post endpoint omits the viewer's `liked`
//      flag (see services/api/news.ts), so the heart renders
//      outline by default and liked state is UNKNOWN until
//      the first toggle — the toggle is optimistic, and the
//      server response reconciles both flag and count even
//      when the guess was wrong;
//    - comments show one page only; when the total says more
//      exist, a "view all" row links to /news-comments where
//      the fully paginated thread lives.
//
//  Split into (root component last):
//
//    SOURCE_KEYS      — source id → i18n label key
//    COMMENTS_PREVIEW — page size of the inline thread
//    MetaBar          — burgundy date + source strip
//    SourceLink       — "read at the source" external link
//    ActionBar        — like toggle + share row
//    ArticleHeader    — the article as the list header
//    ViewAllRow       — link to the full comments screen
//    CommentsFallback — spinner / inline error / empty text
//    NewsPostScreen   — the screen itself (default export)
// -----------------------------------------------------------

// Shared comment thread pieces
import CommentComposer from '@/components/news/CommentComposer';
import CommentRow from '@/components/news/CommentRow';
import PollWidget from '@/components/news/PollWidget';

// UI kit and theming
import { Button, EmptyState, ErrorState, LoadingSpinner, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

// Data loading and the backend contract
import { useFeed } from '@/hooks/useFeed';
import { useLoad } from '@/hooks/useLoad';
import {
  ApiError,
  addCommentApi,
  fetchComments,
  fetchNewsPost,
  getUploadUrl,
  toggleLikeApi,
  type CommentResponse,
} from '@/services/api';
import { formatDate } from '@/services/format';
import type { NewsPost } from '@/types';

// Auth gate for the like toggle + app-wide toasts
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// Route param, navigation and the stack-header offset
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useRouter } from 'expo-router';

// Screen primitives
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  Text,
  View,
} from 'react-native';


// Known scrape/user sources map to short translated labels;
// an unknown source renders its raw id instead
const SOURCE_KEYS: Record<string, string> = {
  'knf.vu.lt': 'news.sourceKnf',
  'vu.lt': 'news.sourceVu',
  faculty: 'news.sourceFaculty',
  user: 'news.sourceUser',
  app: 'news.sourceApp',
};

// One backend page of comments shown inline; more live behind
// the ViewAllRow on the dedicated comments screen
const COMMENTS_PREVIEW = 20;

// The like/share state and handlers flow down from the root,
// so every subcomponent stays a pure view of one screen state
interface ArticleActions {
  liked: boolean;
  likes: number;
  onToggleLike: () => void;
  onShare: () => void;
}







// -----------------------------------------------------------
// MetaBar
// -----------------------------------------------------------
//
// The burgundy strip under the hero image: localized article
// date on the left, the source label on the right.
//
// Used by:
//   - ArticleHeader (below)
// -----------------------------------------------------------

function MetaBar({ post }: { post: NewsPost }) {

  const { t } = useTranslation();


  const sourceKey = post.source ? SOURCE_KEYS[post.source] : undefined;


  return (
    <View className="flex-row items-center justify-between bg-brand-header px-md py-sm">
      <Text className="font-raleway-medium text-sm text-on-brand">
        {formatDate(post.date)}
      </Text>
      {post.source ? (
        <Text className="font-raleway text-xs text-on-brand">
          {sourceKey ? t(sourceKey) : post.source}
        </Text>
      ) : null}
    </View>
  );
}







// -----------------------------------------------------------
// SourceLink
// -----------------------------------------------------------
//
// The external "read at the source" link for scraped
// articles; opening happens in the root handler so a broken
// scraped URL toasts instead of rejecting unhandled.
//
// Used by:
//   - ArticleHeader (below)
// -----------------------------------------------------------

function SourceLink({ onPress }: { onPress: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      className="mx-md mt-md flex-row items-center gap-xs self-start"
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="link"
      accessibilityLabel={t('newsPost.openSource')}
    >
      <Ionicons name="open-outline" size={16} color={colors.brand} />
      <Text className="font-raleway-medium text-sm text-brand underline">
        {t('newsPost.openSource')}
      </Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// ActionBar
// -----------------------------------------------------------
//
// Feed-card parity on the detail screen: the heart toggle
// with the live count and the share action. The heart fills
// with the accent token when liked; outline is also the
// unknown-state default (see the file header).
//
// Used by:
//   - ArticleHeader (below)
// -----------------------------------------------------------

function ActionBar({ liked, likes, onToggleLike, onShare }: ArticleActions) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <View className="mt-md flex-row items-center gap-lg border-y border-line px-md py-sm">

      <Pressable
        className="flex-row items-center gap-xs"
        style={{ minHeight: 44 }}
        onPress={onToggleLike}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(liked ? 'newsPost.unlike' : 'newsPost.like')}
        accessibilityState={{ selected: liked }}
      >
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={22}
          color={liked ? colors.accent : colors.inkSoft}
        />
        <Text className="font-raleway-medium text-sm text-ink-soft">{likes}</Text>
      </Pressable>

      <Pressable
        className="flex-row items-center gap-xs"
        style={{ minHeight: 44 }}
        onPress={onShare}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('newsPost.share')}
      >
        <Ionicons name="share-social-outline" size={22} color={colors.inkSoft} />
        <Text className="font-raleway-medium text-sm text-ink-soft">
          {t('newsPost.share')}
        </Text>
      </Pressable>

    </View>
  );
}







// -----------------------------------------------------------
// ArticleHeader
// -----------------------------------------------------------
//
// The whole article as the FlatList header: hero image (full
// bleed — the list container carries no horizontal padding),
// MetaBar, title, author, body, poll, source link, ActionBar
// and the comments section title the thread scrolls under.
//
// Used by:
//   - NewsPostScreen (below) — ListHeaderComponent
// -----------------------------------------------------------

function ArticleHeader({
  post,
  onOpenSource,
  ...actions
}: ArticleActions & { post: NewsPost; onOpenSource: () => void }) {

  const { t } = useTranslation();


  return (
    <View className="mb-sm">

      {post.imageUrl ? (
        <Image
          source={{ uri: getUploadUrl(post.imageUrl) }}
          style={{ width: '100%', height: 250 }}
          contentFit="cover"
          transition={100}
          accessibilityIgnoresInvertColors
        />
      ) : null}

      <MetaBar post={post} />

      <Text className="px-md pt-md text-2xl font-raleway-bold leading-8 text-ink">
        {post.title}
      </Text>
      {post.author ? (
        <Text className="px-md pt-xs font-raleway text-sm text-ink-soft">{post.author}</Text>
      ) : null}
      <Text className="px-md pt-sm font-raleway text-base leading-6 text-ink">
        {post.content}
      </Text>

      {post.postType === 'poll' && (
        <View className="px-md pt-sm">
          <PollWidget postId={post.id} />
        </View>
      )}

      {post.sourceUrl ? <SourceLink onPress={onOpenSource} /> : null}

      <ActionBar {...actions} />

      <Text className="px-md pb-sm pt-md text-lg font-raleway-bold text-ink">
        {t('newsPost.commentsTitle')}
      </Text>

    </View>
  );
}







// -----------------------------------------------------------
// ViewAllRow
// -----------------------------------------------------------
//
// Shown after the inline thread when the backend total says
// more comments exist than the preview page holds — the only
// door from the article to the fully paginated
// /news-comments screen.
//
// Used by:
//   - NewsPostScreen (below) — ListFooterComponent
// -----------------------------------------------------------

function ViewAllRow({ postId, count }: { postId: string; count: number }) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();


  return (
    <Pressable
      className="mx-md mt-xs flex-row items-center justify-center gap-xs rounded-md border border-line bg-surface py-sm"
      style={{ minHeight: 44 }}
      onPress={() => router.push(`/(main)/news-comments?postId=${postId}`)}
      accessibilityRole="button"
      accessibilityLabel={t('newsPost.viewAllComments', { count })}
    >
      <Text className="font-raleway-medium text-sm text-brand">
        {t('newsPost.viewAllComments', { count })}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.brand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// CommentsFallback
// -----------------------------------------------------------
//
// What the thread area shows while it holds no comments:
// a small spinner while loading (and while retrying), an
// inline error row with retry — the article stays readable,
// so no full-screen ErrorState — or the noComments line.
//
// Used by:
//   - NewsPostScreen (below) — ListEmptyComponent
// -----------------------------------------------------------

function CommentsFallback({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {

  const { t } = useTranslation();


  if (loading) {
    return (
      <View className="py-sm">
        <LoadingSpinner size="small" />
      </View>
    );
  }


  if (error) {
    return (
      <View className="items-center gap-xs px-md py-sm">
        <Text className="font-raleway text-sm text-ink-soft">
          {t('newsPost.commentsLoadError')}
        </Text>
        <Button
          title={t('common.tryAgain')}
          onPress={onRetry}
          variant="ghost"
          size="sm"
          fullWidth={false}
        />
      </View>
    );
  }


  return (
    <Text className="px-md py-sm font-raleway text-sm text-ink-soft">
      {t('newsPost.noComments')}
    </Text>
  );
}







// -----------------------------------------------------------
// NewsPostScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /news-post?postId=
//     (pushed from the news feed and profile post lists)
// -----------------------------------------------------------

export default function NewsPostScreen() {

  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();


  // Liked is UNKNOWN until the first toggle (the endpoint
  // omits the flag) — false only means "render outline";
  // likesOverride shadows post.likes once the user interacts
  const [liked, setLiked] = useState(false);
  const [likesOverride, setLikesOverride] = useState<number | null>(null);
  const [commentTotal, setCommentTotal] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);


  // 404 → null (deleted post, notFound state); any other
  // failure rethrows into useLoad's error → ErrorState + retry
  const postLoad = useLoad<NewsPost | null>(async () => {
    if (!postId) return null;
    try {
      return await fetchNewsPost(postId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, [postId]);


  // One preview page; the total rides out through state so the
  // render can decide whether the ViewAllRow is needed
  const commentsFeed = useFeed<CommentResponse>(
    async (page) => {
      if (!postId) return { items: [], hasMore: false };
      const response = await fetchComments(postId, page, COMMENTS_PREVIEW);
      setCommentTotal(response.total);
      return {
        items: response.comments,
        hasMore: page * response.perPage < response.total,
      };
    },
    { deps: [postId] },
  );


  // A postId change means a different article — the carried
  // like state belongs to the previous one
  useEffect(() => {
    setLiked(false);
    setLikesOverride(null);
  }, [postId]);


  const likes = likesOverride ?? postLoad.data?.likes ?? 0;


  // Optimistic toggle with exact revert; the server response
  // is authoritative and corrects a wrong unknown-state guess
  const handleToggleLike = async () => {
    if (!postId) return;
    if (!isAuthenticated) {
      showToast('info', t('newsPost.loginToLike'));
      return;
    }

    const previousLiked = liked;
    const previousLikes = likes;
    setLiked(!previousLiked);
    setLikesOverride(previousLikes + (previousLiked ? -1 : 1));

    try {
      const response = await toggleLikeApi(postId);
      setLiked(response.liked);
      setLikesOverride(response.likes);
    } catch {
      setLiked(previousLiked);
      setLikesOverride(previousLikes);
      showToast('error', t('newsPost.likeError'));
    }
  };


  // Share works logged out too; the dismiss-rejection some
  // platforms throw is not an error worth surfacing
  const handleShare = async () => {
    const post = postLoad.data;
    if (!post) return;
    try {
      await Share.share({
        title: post.title,
        message: post.sourceUrl ? `${post.title}\n${post.sourceUrl}` : post.title,
        url: post.sourceUrl || undefined,
      });
    } catch {
      // User dismissed the share sheet
    }
  };


  // Scraped URLs are untrusted input — a malformed one toasts
  // instead of rejecting unhandled
  const handleOpenSource = async () => {
    const url = postLoad.data?.sourceUrl;
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      showToast('error', t('newsPost.openSourceError'));
    }
  };


  // Server-confirmed prepend; the composer keeps the text on
  // failure so the toast leaves a retry path
  const handleSubmitComment = async (text: string): Promise<boolean> => {
    if (!postId) return false;
    try {
      const created = await addCommentApi(postId, text);
      commentsFeed.setItems((current) => [created, ...current]);
      setCommentTotal((total) => (total === null ? total : total + 1));
      return true;
    } catch {
      showToast('error', t('newsPost.commentError'));
      return false;
    }
  };


  // One pull refreshes both resources; the like override is
  // dropped so the freshly fetched count becomes truth again
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([postLoad.refresh(), commentsFeed.refresh()]);
    setLikesOverride(null);
    setRefreshing(false);
  };


  if (!postId || (!postLoad.loading && !postLoad.error && !postLoad.data)) {
    return (
      <Screen>
        <EmptyState icon="newspaper-outline" title={t('newsPost.notFound')} />
      </Screen>
    );
  }


  if (postLoad.loading) {
    return (
      <Screen>
        <View className="flex-1 justify-center">
          <LoadingSpinner />
        </View>
      </Screen>
    );
  }


  if (postLoad.error || !postLoad.data) {
    return (
      <Screen>
        <ErrorState message={t('newsPost.loadError')} onRetry={postLoad.retry} />
      </Screen>
    );
  }


  const post = postLoad.data;
  const shownComments = commentsFeed.items.length;
  const showViewAll = commentTotal !== null && commentTotal > shownComments;

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >

        {/* The article is the list header, so thread and
            article scroll as one virtualized surface */}
        <FlatList
          className="flex-1"
          data={commentsFeed.items}
          keyExtractor={(comment) => comment.id}
          renderItem={({ item }) => (
            <View className="px-md">
              <CommentRow comment={item} />
            </View>
          )}
          contentContainerClassName="pb-md"
          ListHeaderComponent={
            <ArticleHeader
              post={post}
              liked={liked}
              likes={likes}
              onToggleLike={() => void handleToggleLike()}
              onShare={() => void handleShare()}
              onOpenSource={() => void handleOpenSource()}
            />
          }
          ListEmptyComponent={
            <CommentsFallback
              loading={commentsFeed.loading || commentsFeed.refreshing}
              error={commentsFeed.error}
              onRetry={() => void commentsFeed.refresh()}
            />
          }
          ListFooterComponent={
            showViewAll ? <ViewAllRow postId={postId} count={commentTotal} /> : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          keyboardShouldPersistTaps="handled"
        />

        <CommentComposer onSubmit={handleSubmitComment} />

      </KeyboardAvoidingView>
    </Screen>
  );
}
