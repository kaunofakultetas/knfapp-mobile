// -----------------------------------------------------------
//  [*] News — article screen
//
//  The full article behind a feed card: hero image, burgundy
//  date + source strip, body text, the poll for poll posts,
//  a source link, the social kit's like / comments / share
//  strip and the first page of comments over the kit's pinned
//  composer. Everything scrolls as ONE FlatList — the article
//  rides as ListHeaderComponent, so long threads stay
//  virtualized.
//
//  Load quirks handled here:
//    - a 404 from GET /news/<id> resolves to null and renders
//      the notFound empty state; every other failure keeps
//      ErrorState with retry — the old screen collapsed both
//      into a misleading "not found";
//    - the single-post response carries the viewer's `liked`
//      flag (false for guests — see services/api/news.ts); the
//      social engine's useLikeToggle layers the viewer's
//      optimistic shadow over that base row, so the heart is
//      right the instant it is tapped, tap spam coalesces, a
//      failure reverts to the last server-confirmed flag, and
//      a guest's tap routes to login (SocialEngineHost);
//    - comments show one page only; when the total says more
//      exist, a "view all" row links to /news-comments where
//      the fully paginated thread lives.
//
//  Split into (root component last):
//
//    SOURCE_KEYS      — source id → i18n label key
//    COMMENTS_PREVIEW — page size of the inline thread
//    toKitComment     — backend comment → the kit's row shape
//    MetaBar          — burgundy date + source strip
//    SourceLink       — "read at the source" external link
//    ActionBar        — the engine-backed like / comments / share strip
//    ArticleHeader    — the article as the list header
//    ViewAllRow       — link to the full comments screen
//    CommentsFallback — spinner / inline error / empty text
//    NewsPostScreen   — the screen itself (default export)
// -----------------------------------------------------------

// Shared news pieces — cover defence, poll
import { resolveCoverUri } from '@/components/news/NewsCard';
import PollWidget from '@/components/news/PollWidget';

// The social kit's rows and strip, and the engine's like hook
// (both providers are mounted in the (main) layout)
import { useLikeToggle } from '@knf/socialengine';
import { ActionRow, CommentComposer, CommentRow, type KitComment } from '@knf/socialuikit';

// UI kit and theming
import { Button, EmptyState, ErrorState, LoadingSpinner, RefreshSpinner, Screen, confirmAction } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

// Data loading and the backend contract
import { useFeed, useLoad } from '@knf/dataengine';
import {
  deletePost,
  ApiError,
  addCommentApi,
  fetchComments,
  fetchNewsPost,
  type CommentResponse,
  type NewsPostDetail,
} from '@/services/api';
import { formatDate } from '@/services/format';
import type { NewsPost } from '@/types';

// Auth gates the composer and marks the viewer's own comment
// rows; app-wide toasts and connectivity for the error flavour
import { useAuth } from '@/context/AuthContext';
import { showToast, useNetwork } from '@/context/NetworkContext';
import { stripScrapedPreamble } from '@/services/newsText';

// Route param, navigation, the login round-trip href and the
// stack-header offset
import { useReturnHref } from '@/hooks/useReturnHref';
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

// The backend comment row in the kit's vocabulary. `time` is
// the raw created_at stamp (naive UTC) — the kit's RelativeTime
// reads a zone-less stamp as UTC, so no reformatting here.
// isOwn paints the viewer's own comments with the brand wash;
// the backend has no comment deletion, so `deleted` never sets
const toKitComment = (comment: CommentResponse, viewerId: string | null): KitComment => ({
  id: comment.id,
  author: { id: comment.userId, displayName: comment.userName, avatarUrl: comment.userAvatar },
  text: comment.text,
  createdAt: comment.time,
  isOwn: viewerId !== null && comment.userId === viewerId,
});







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
// Feed-card parity on the detail screen: the kit's ActionRow
// (heart with the live tally, the comments tally, share)
// inside the article's ruled strip. The like state comes from
// the social engine — useLikeToggle merges the viewer's
// optimistic shadow over the loaded row, so `liked` and
// `likeCount` are already the view to draw and `toggle` is the
// coalesced request; a guest's tap is the engine's requireAuth
// (the login round-trip), never a transport call. The hook
// lives here rather than at the root because the row it needs
// only exists once the post has loaded, and this strip only
// mounts then.
//
// Used by:
//   - ArticleHeader (below)
// -----------------------------------------------------------

function ActionBar({
  post,
  commentCount,
  onPressComment,
  onShare,
}: {
  post: NewsPostDetail;
  commentCount: number;
  onPressComment: () => void;
  onShare: () => void;
}) {

  const { liked, likeCount, pending, toggle } = useLikeToggle({
    id: post.id,
    likedByMe: post.liked,
    likeCount: post.likes,
  });


  return (
    <View className="mt-md border-y border-line px-sm py-xs">
      <ActionRow
        likeCount={likeCount}
        commentCount={commentCount}
        likedByMe={liked}
        pendingLike={pending}
        onPressLike={toggle}
        onPressComment={onPressComment}
        onPressShare={onShare}
      />
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
  commentCount,
  onPressComment,
  onShare,
  onOpenSource,
}: {
  post: NewsPostDetail;
  commentCount: number;
  onPressComment: () => void;
  onShare: () => void;
  onOpenSource: () => void;
}) {

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

      <ActionBar
        post={post}
        commentCount={commentCount}
        onPressComment={onPressComment}
        onShare={onShare}
      />

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
  const returnTo = useReturnHref();


  // The backend total once a comments page has landed; null
  // until then (and reset on a post change) so the loaded
  // post's own count stands in for the strip's tally
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
  // comment total belongs to the previous one (the like state
  // is the engine's, keyed by post id, so it needs no reset)
  useEffect(() => {
    commentTotalRef.current = null;
    setCommentTotal(null);
  }, [postId]);


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


  // The strip's comments tally opens the fully paginated
  // thread — the same door as the ViewAllRow
  const openComments = useCallback(() => {
    if (!postId) return;
    router.push(`/(main)/news-comments?postId=${postId}`);
  }, [postId, router]);


  // The composer's sign-in button: login, then back to exactly
  // this article — returnTo carries the query string, a bare
  // pathname would drop ?postId= and land on "not found"
  const openLogin = useCallback(() => {
    router.push({ pathname: '/login', params: { returnTo } });
  }, [returnTo, router]);


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


  // One pull refreshes both resources; the refetched post is
  // the like count's only source of truth — the engine diffs
  // its shadow against the new base, so nothing to reset here
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([postLoad.refresh(), commentsFeed.refresh()]);
    setRefreshing(false);
  };


  // Stable render function so the list doesn't get a fresh
  // renderItem closure on every screen render — only a viewer
  // change (own-row wash) is worth a new one. The kit row pads
  // its own gutter, so no wrapper here
  const viewerId = user?.id ?? null;
  const renderComment = useCallback(
    ({ item }: ListRenderItemInfo<CommentResponse>) => (
      <CommentRow comment={toKitComment(item, viewerId)} />
    ),
    [viewerId],
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
              commentCount={commentTotal ?? post.comments}
              onPressComment={openComments}
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
            <RefreshSpinner
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
            />
          }
          keyboardShouldPersistTaps="handled"
        />

        {/* Guests see the kit's sign-in prompt instead of the
            field — auth adds the comment, never gates reading */}
        <CommentComposer
          canComment={isAuthenticated}
          onSubmit={handleSubmitComment}
          onPressSignIn={openLogin}
        />

      </KeyboardAvoidingView>
    </Screen>
  );
}
