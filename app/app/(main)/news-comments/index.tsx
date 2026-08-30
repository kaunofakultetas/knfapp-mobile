// -----------------------------------------------------------
//  [*] News — comments screen
//
//  The fully paginated thread of one post, reached from the
//  feed card's comment action and from the article screen's
//  "view all" row. The native stack header already titles the
//  screen (see (main)/_layout.tsx), so the old duplicate
//  in-screen burgundy bar is gone — the body is just the
//  FlatList and the shared pinned composer, both inside a
//  KeyboardAvoidingView offset by that header's height.
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
//    CommentsBody       — spinner / error / list by feed state
//    NewsCommentsScreen — the screen itself (default export)
// -----------------------------------------------------------

// Shared comment thread pieces
import CommentComposer from '@/components/news/CommentComposer';
import CommentRow from '@/components/news/CommentRow';

// UI kit and theming
import { EmptyState, ErrorState, LoadingSpinner, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Paginated feed engine and the backend contract
import { useFeed, type UseFeedResult } from '@/hooks/useFeed';
import { addCommentApi, fetchComments, type CommentResponse } from '@/services/api';

// App-wide error toasts
import { showToast } from '@/context/NetworkContext';

// Route param and the stack-header offset
import { useRouteParam } from '@/hooks/useRouteParam';
import { useHeaderHeight } from '@react-navigation/elements';
import { useFocusEffect } from 'expo-router';
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
  RefreshControl,
  View,
} from 'react-native';


// Matches the backend's default page size — every
// onEndReached pulls one more page of this length
const COMMENTS_PER_PAGE = 20;







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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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
  // renderItem closure on every feed-state render
  const renderComment = useCallback(
    ({ item }: ListRenderItemInfo<CommentResponse>) => <CommentRow comment={item} />,
    [],
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
      contentContainerClassName="flex-grow p-md"
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={feed.loadingMore ? <LoadingSpinner size="small" /> : null}
      ListEmptyComponent={
        <EmptyState icon="chatbubbles-outline" title={t('newsPost.noComments')} />
      }
      refreshControl={
        <RefreshControl
          refreshing={pullRefreshing}
          onRefresh={() => void handlePullRefresh()}
          tintColor={colors.brand}
          colors={[colors.brand]}
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
  const { t } = useTranslation();
  const headerHeight = useHeaderHeight();


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
        <CommentComposer onSubmit={handleSubmitComment} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
