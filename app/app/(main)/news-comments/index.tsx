// -----------------------------------------------------------
//  [*] News — comments screen
//
//  The fully paginated thread of one post, reached from the
//  feed card's comment action and from the article screen's
//  "view all" row. The native stack header already titles the
//  screen (see (main)/_layout.tsx), so the old duplicate
//  in-screen burgundy bar is gone — the body is just the
//  FlatList of the social kit's comment rows and the kit's
//  pinned composer, both inside a KeyboardAvoidingView offset
//  by that header's height. The composer pads its own bottom
//  edge with the safe-area inset while the keyboard is down.
//
//  Paging is real now: useFeed appends the next backend page
//  on onEndReached (the old screen hardcoded page 1/50 and
//  posts with more comments silently truncated), pull-to-
//  refresh reloads page 1, and a failed load renders
//  ErrorState with retry instead of posing as "no comments".
//  A freshly sent comment is prepended server-confirmed; a
//  failed send toasts and the composer keeps the text.
//
//  Split into (root component last):
//
//    COMMENTS_PER_PAGE  — backend page size
//    toKitComment       — backend comment → the kit's row shape
//    CommentsBody       — spinner / error / list by feed state
//    NewsCommentsScreen — the screen itself (default export)
// -----------------------------------------------------------

// The social kit's comment row and pinned composer (the
// provider is mounted in the (main) layout)
import { CommentComposer, CommentRow, type KitComment } from '@knf/socialuikit';

// UI kit and theming
import { EmptyState, ErrorState, LoadingSpinner, RefreshSpinner, Screen } from '@/components/ui';

// Paginated feed engine and the backend contract
import { useFeed, type UseFeedResult } from '@knf/dataengine';
import { addCommentApi, fetchComments, type CommentResponse } from '@/services/api';

// Auth gates the composer and marks the viewer's own rows;
// app-wide error toasts
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// Route param, the login round-trip href and the stack-header
// offset
import { useReturnHref } from '@/hooks/useReturnHref';
import { useRouteParam } from '@/hooks/useRouteParam';
import { useHeaderHeight } from "expo-router/react-navigation";
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Screen primitives
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type ListRenderItemInfo,
  Platform,
  View,
} from 'react-native';


// Matches the backend's default page size — every
// onEndReached pulls one more page of this length
const COMMENTS_PER_PAGE = 20;

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
// CommentsBody
// -----------------------------------------------------------
//
// The three states of the thread area: the full spinner for
// the first load AND for a retry after an error (refresh
// during error would otherwise flash the empty state), the
// ErrorState with retry, or the paginated list itself.
//
// Used by:
//   - NewsCommentsScreen (below)
// -----------------------------------------------------------

function CommentsBody({ feed }: { feed: UseFeedResult<CommentResponse> }) {

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Spinner = pull gesture only; background refreshes (focus
  // return, network restore) reuse feed.refresh() silently
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


  // Keyboard scroll compensation — same mechanism as the
  // article screen: the KAV shrinks the viewport when the
  // composer focuses, but the list stays top-anchored, hiding
  // the comments the reader was just looking at. Shifting the
  // offset by the stolen height keeps them in view. The
  // listener is app-wide, so the focus ref keeps a keyboard
  // opened by a covering screen from scrolling this one.
  const listRef = useRef<FlatList<CommentResponse>>(null);
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

  // Recorded as pending and re-applied from onLayout: the KAV
  // has not shrunk when the keyboard event fires, so an
  // immediate scrollToOffset clamps to ~0 on a SHORT thread
  // and nothing moves (a long thread is in range either way)
  const pendingLiftRef = useRef<{ offset: number; lift: number } | null>(null);

  const applyPendingLift = useCallback(() => {
    const pending = pendingLiftRef.current;
    if (!pending) return;
    pendingLiftRef.current = null;
    listRef.current?.scrollToOffset({
      offset: pending.offset + pending.lift,
      animated: true,
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        if (!isFocusedScreenRef.current) return;
        const lift = event.endCoordinates.height - (Platform.OS === 'ios' ? insets.bottom : 0);
        if (lift <= 0) return;
        pendingLiftRef.current = { offset: scrollOffsetRef.current, lift };
        listRef.current?.scrollToOffset({
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


  // Stable render function so the list doesn't get a fresh
  // renderItem closure on every feed-state render — only a
  // viewer change (own-row wash) is worth a new one
  const viewerId = user?.id ?? null;
  const renderComment = useCallback(
    ({ item }: ListRenderItemInfo<CommentResponse>) => (
      <CommentRow comment={toKitComment(item, viewerId)} />
    ),
    [viewerId],
  );


  if (feed.loading || (feed.error && feed.refreshing)) {
    return (
      <View className="flex-1 justify-center">
        <LoadingSpinner />
      </View>
    );
  }


  if (feed.error) {
    return (
      <ErrorState
        message={t('newsPost.commentsLoadError')}
        onRetry={() => void feed.refresh()}
      />
    );
  }


  return (
    <FlatList
      ref={listRef}
      className="flex-1"
      data={feed.items}
      onScroll={(event) => {
        scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={32}
      onLayout={applyPendingLift}
      keyExtractor={(comment) => comment.id}
      renderItem={renderComment}
      contentContainerClassName="flex-grow py-sm"
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={feed.loadingMore ? <LoadingSpinner size="small" /> : null}
      ListEmptyComponent={
        <EmptyState icon="chatbubbles-outline" title={t('newsPost.noComments')} />
      }
      refreshControl={
        <RefreshSpinner
          refreshing={pullRefreshing}
          onRefresh={() => void handlePullRefresh()}
        />
      }
      keyboardShouldPersistTaps="handled"
    />
  );
}







// -----------------------------------------------------------
// NewsCommentsScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/_layout.tsx — route /news-comments?postId=
//     (pushed from the feed and from news-post's ViewAllRow)
// -----------------------------------------------------------

export default function NewsCommentsScreen() {

  const postId = useRouteParam('postId');
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const headerHeight = useHeaderHeight();
  const router = useRouter();
  const returnTo = useReturnHref();


  const feed = useFeed<CommentResponse>(
    async (page) => {
      if (!postId) return { items: [], hasMore: false };
      const response = await fetchComments(postId, page, COMMENTS_PER_PAGE);
      return {
        items: response.comments,
        hasMore: page * response.perPage < response.total,
      };
    },
    { deps: [postId] },
  );


  // Server-confirmed prepend; the composer keeps the text on
  // failure so the toast leaves a retry path
  const handleSubmitComment = async (text: string): Promise<boolean> => {
    if (!postId) return false;
    try {
      const created = await addCommentApi(postId, text);
      feed.setItems((current) => [created, ...current]);
      return true;
    } catch {
      showToast('error', t('newsPost.commentError'));
      return false;
    }
  };


  // The composer's sign-in button: login, then back to exactly
  // this thread — returnTo carries the query string, a bare
  // pathname would drop ?postId= and land on "not found"
  const openLogin = useCallback(() => {
    router.push({ pathname: '/login', params: { returnTo } });
  }, [returnTo, router]);


  // No postId means the route was reached without a post —
  // nothing to load, nothing to comment on
  if (!postId) {
    return (
      <Screen>
        <EmptyState icon="chatbubbles-outline" title={t('newsPost.notFound')} />
      </Screen>
    );
  }


  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <CommentsBody feed={feed} />
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
