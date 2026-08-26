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
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams } from 'expo-router';

// Screen primitives
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, RefreshControl, View } from 'react-native';


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
      className="flex-1"
      data={feed.items}
      keyExtractor={(comment) => comment.id}
      renderItem={({ item }) => <CommentRow comment={item} />}
      contentContainerClassName="flex-grow p-md"
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={feed.loadingMore ? <LoadingSpinner size="small" /> : null}
      ListEmptyComponent={
        <EmptyState icon="chatbubbles-outline" title={t('newsPost.noComments')} />
      }
      refreshControl={
        <RefreshControl
          refreshing={feed.refreshing}
          onRefresh={() => void feed.refresh()}
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

  const { postId } = useLocalSearchParams<{ postId: string }>();
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <CommentsBody feed={feed} />
        <CommentComposer onSubmit={handleSubmitComment} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
