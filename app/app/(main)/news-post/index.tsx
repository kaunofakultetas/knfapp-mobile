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
//    - the single-post response carries the viewer's `liked`
//      flag (false for guests — see services/api/news.ts), so
//      the heart is seeded from the load; the toggle is
//      optimistic with exact revert, and the server response
//      reconciles both flag and count;
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

// Shared news pieces — comment thread, cover defence, poll
import CommentComposer from '@/components/news/CommentComposer';
import CommentRow from '@/components/news/CommentRow';
import { resolveCoverUri } from '@/components/news/NewsCard';
import PollWidget from '@/components/news/PollWidget';

// UI kit and theming
import { Button, confirmAction, EmptyState, ErrorState, LoadingSpinner, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

// Data loading and the backend contract
import { useFeed } from '@/hooks/useFeed';
import { useLoad } from '@/hooks/useLoad';
import {
  deletePost,
  ApiError,
  addCommentApi,
  fetchComments,
  fetchNewsPost,
  toggleLikeApi,
  type CommentResponse,
  type NewsPostDetail,
} from '@/services/api';
import { formatDate } from '@/services/format';
import type { NewsPost } from '@/types';

// Auth gate for the like toggle + app-wide toasts and
// connectivity for the error flavour
import { useAuth } from '@/context/AuthContext';
import { showToast, useNetwork } from '@/context/NetworkContext';
import { stripScrapedPreamble } from '@/services/newsText';

// Route param, navigation and the stack-header offset
import { useRouteParam } from '@/hooks/useRouteParam';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';

// Screen primitives
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  type ListRenderItemInfo,
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
// with the accent token when liked and is seeded from the
// loaded post's viewer flag (see the file header). The like
// count rides inside the heart's accessibility label — a
// parent label swallows child text, so the bare count Text
// would otherwise be unreadable to screen readers.
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
        accessibilityLabel={`${t(liked ? 'newsPost.unlike' : 'newsPost.like')}, ${t('newsPost.likesCount', { count: likes })}`}
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


  // Untitled community posts get their opening text copied
  // into `title` server-side — when the rendered body still
  // starts with it, showing the title block would print the
  // same words twice (checked against the STRIPPED body, so a
  // scraped article whose preamble repeated the title keeps
  // its headline)
  const body = stripScrapedPreamble(post.content, post);
  const showTitle = !!post.title && !body.trim().startsWith(post.title.trim());

  // The feed card's cover defence, shared: own uploads resolve
  // against the API origin, scraped faculty covers pass as-is,
  // anything else drops the image block entirely — never a
  // blank 250pt box over an unresolvable uri
  const coverUri = resolveCoverUri(post);


  return (
    <View className="mb-sm">

      {coverUri ? (
        <Image
          source={{ uri: coverUri }}
          style={{ width: '100%', height: 250 }}
          contentFit="cover"
          transition={100}
          accessibilityIgnoresInvertColors
        />
      ) : null}

      <MetaBar post={post} />

      {showTitle ? (
        <Text className="px-md pt-md text-2xl font-raleway-bold leading-8 text-ink">
          {post.title}
        </Text>
      ) : null}
      {post.author ? (
        <Text className="px-md pt-xs font-raleway text-sm text-ink-soft">{post.author}</Text>
      ) : null}
      <Text className="px-md pt-sm font-raleway text-base leading-6 text-ink">
        {body}
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

  const postId = useRouteParam('postId');
  const { isAuthenticated, user } = useAuth();
  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();


  // Seeded from the loaded post's viewer flag (effect below);
  // likesOverride shadows post.likes once the user interacts
  const [liked, setLiked] = useState(false);
  const [likesOverride, setLikesOverride] = useState<number | null>(null);
  const [commentTotal, setCommentTotal] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);


  // 404 → null (deleted post, notFound state); any other
  // failure rethrows into useLoad's error → ErrorState + retry
  const postLoad = useLoad<NewsPostDetail | null>(async () => {
    if (!postId) return null;
    try {
      return await fetchNewsPost(postId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, [postId]);


  // The fetcher stashes the backend total here instead of
  // writing state — useFeed's sequence guard lives on the
  // caller side of the await, so a setState inside the adapter
  // would land even for superseded responses
  const commentTotalRef = useRef<number | null>(null);


  // One preview page; the total rides out through the ref so
  // the render can decide whether the ViewAllRow is needed
  const commentsFeed = useFeed<CommentResponse>(
    async (page) => {
      if (!postId) return { items: [], hasMore: false };
      const response = await fetchComments(postId, page, COMMENTS_PREVIEW);
      commentTotalRef.current = response.total;
      return {
        items: response.comments,
        hasMore: page * response.perPage < response.total,
      };
    },
    { deps: [postId] },
  );


  // Items only change behind useFeed's sequence guard, so
  // keying on them applies exactly the totals whose pages
  // actually committed — a dropped response's total stays in
  // the ref and never reaches state
  useEffect(() => {
    setCommentTotal(commentTotalRef.current);
  }, [commentsFeed.items]);


  // A postId change means a different article — the carried
  // like state and comment total belong to the previous one
  useEffect(() => {
    setLiked(false);
    setLikesOverride(null);
    commentTotalRef.current = null;
    setCommentTotal(null);
  }, [postId]);


  // The response carries the viewer's flag, so every (re)load
  // reseeds the heart with the server's truth
  useEffect(() => {
    if (postLoad.data) setLiked(postLoad.data.liked);
  }, [postLoad.data]);


  // ---- own-post actions -----------------------------------
  // Edit and delete live in the header, but only for the
  // author of a user/faculty post — scraped articles have no
  // author to act as, and acting on SOMEONE ELSE's post is the
  // backend's 404 anyway. Delete confirms first (same copy as
  // the profile list), then leaves the screen; the feed and
  // the profile both refresh on focus.
  const navigation = useNavigation();
  const router = useRouter();
  const ownPost =
    !!user &&
    !!postLoad.data &&
    postLoad.data.authorId === user.id &&
    (postLoad.data.source === 'user' || postLoad.data.source === 'faculty');

  const handleDelete = useCallback(async () => {
    if (!postId) return;
    const confirmed = await confirmAction({
      title: t('profile.deletePost'),
      message: t('profile.deletePostConfirm'),
      confirmLabel: t('profile.deletePost'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deletePost(postId);
      showToast('success', t('profile.postDeleted'));
      router.back();
    } catch {
      showToast('error', t('profile.deleteError'));
    }
  }, [postId, router, t]);

  const openEdit = useCallback(() => {
    if (!postId) return;
    router.push({ pathname: '/(main)/create-post', params: { editPostId: postId } });
  }, [postId, router]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: ownPost
        ? () => (
            <View className="flex-row items-center gap-lg">
              <Pressable
                onPress={openEdit}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('createPost.editTitle')}
              >
                <Ionicons name="pencil-outline" size={22} color={colors.onBrand} />
              </Pressable>
              <Pressable
                onPress={handleDelete}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('profile.deletePost')}
              >
                <Ionicons name="trash-outline" size={22} color={colors.onBrand} />
              </Pressable>
            </View>
          )
        : undefined,
    });
  }, [navigation, ownPost, openEdit, handleDelete, t, colors.onBrand]);


  // Returning from the edit screen must show the edited text —
  // the first focus is the mount itself, every later one is a
  // comeback worth a silent refetch
  const focusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true;
        return;
      }
      void postLoad.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- postLoad.refresh is a stable useLoad callback; the postLoad object itself is not
    }, [postLoad.refresh]),
  );


  // ---- keyboard scroll compensation -----------------------
  // Opening the composer shrinks the viewport (the KAV pads or
  // squeezes it), but the list stays anchored to its TOP — so
  // the comments the reader was just looking at slide under the
  // keyboard. Shifting the offset by exactly the height the
  // keyboard stole keeps that bottom region in view instead.
  // iOS compensates on willShow (rides the keyboard animation)
  // and discounts the home-indicator inset the KAV already
  // absorbs; Android's 'height' mode shrinks by the full
  // keyboard, so nothing is discounted there.
  const insets = useSafeAreaInsets();
  const commentsListRef = useRef<FlatList<CommentResponse>>(null);
  const scrollOffsetRef = useRef(0);

  const isFocusedScreenRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      isFocusedScreenRef.current = true;
      return () => {
        isFocusedScreenRef.current = false;
      };
    }, []),
  );

  // scrollToOffset clamps against the viewport AT CALL TIME —
  // and the KAV has not shrunk yet when the keyboard event
  // fires. A long article's target is in range anyway, but a
  // short page (a poll post with a few comments) clamps to ~0
  // and nothing moves. So the shift is recorded as pending and
  // re-applied from the list's onLayout, which fires exactly
  // when the resized viewport is real.
  const pendingLiftRef = useRef<{ offset: number; lift: number } | null>(null);

  const applyPendingLift = useCallback(() => {
    const pending = pendingLiftRef.current;
    if (!pending) return;
    pendingLiftRef.current = null;
    commentsListRef.current?.scrollToOffset({
      offset: pending.offset + pending.lift,
      animated: true,
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        // The listener is app-wide — a keyboard opened by the
        // screen pushed on top must not scroll this one
        if (!isFocusedScreenRef.current) return;
        const lift = event.endCoordinates.height - (Platform.OS === 'ios' ? insets.bottom : 0);
        if (lift <= 0) return;
        pendingLiftRef.current = { offset: scrollOffsetRef.current, lift };
        // Immediate best effort too — on a long article this
        // rides the keyboard animation instead of trailing it
        commentsListRef.current?.scrollToOffset({
          offset: scrollOffsetRef.current + lift,
          animated: true,
        });
      },
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      pendingLiftRef.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.bottom]);


  const likes = likesOverride ?? postLoad.data?.likes ?? 0;


  // One toggle at a time — a double-tap must not race two
  // requests whose answers can land out of order
  const likeInFlightRef = useRef(false);


  // Optimistic toggle with exact revert; the server response
  // is authoritative either way
  const handleToggleLike = async () => {
    if (!postId) return;
    if (!isAuthenticated) {
      showToast('info', t('newsPost.loginToLike'));
      return;
    }
    if (likeInFlightRef.current) return;
    likeInFlightRef.current = true;

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
    } finally {
      likeInFlightRef.current = false;
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


  // Scraped URLs are untrusted input — only https: may open
  // (no file:, javascript: or intent: smuggled into a scraped
  // page), and a malformed one toasts instead of rejecting
  // unhandled
  const handleOpenSource = async () => {
    const url = postLoad.data?.sourceUrl;
    if (!url) return;
    if (!/^https:\/\//i.test(url.trim())) {
      showToast('error', t('info.linkError'));
      return;
    }
    try {
      await Linking.openURL(url.trim());
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
      // The ref is bumped in lockstep — the items-keyed effect
      // fires on the prepend and would roll the +1 back to the
      // last fetched total otherwise
      if (commentTotalRef.current !== null) commentTotalRef.current += 1;
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


  // Stable render function so the list doesn't get a fresh
  // renderItem closure on every screen render
  const renderComment = useCallback(
    ({ item }: ListRenderItemInfo<CommentResponse>) => (
      <View className="px-md">
        <CommentRow comment={item} />
      </View>
    ),
    [],
  );


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
        <ErrorState
          message={t('newsPost.loadError')}
          offline={!isConnected}
          onRetry={postLoad.retry}
        />
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >

        {/* The article is the list header, so thread and
            article scroll as one virtualized surface */}
        <FlatList
          ref={commentsListRef}
          className="flex-1"
          data={commentsFeed.items}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={32}
          onLayout={applyPendingLift}
          keyExtractor={(comment) => comment.id}
          renderItem={renderComment}
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
