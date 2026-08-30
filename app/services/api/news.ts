// -----------------------------------------------------------
//  [*] API — news & polls
//
//  The /news feed mixes scraped faculty articles and user
//  posts (NewsPost.source tells them apart); likes, comments,
//  post creation and the per-post poll live under the same
//  prefix.
//
//  Poll edge cases handled HERE so screens stay simple:
//  fetchPoll resolves null only for a real 404 (post has no
//  poll), rethrows every other failure, and serves concurrent
//  and repeat mounts from one shared promise (see the poll
//  request cache below); votePollApi treats the backend's 409
//  ("already voted for this option") as a no-op success and
//  hands back freshly fetched poll state.
//
//  Comment `time` is the raw created_at ISO stamp — screens
//  MUST format it locally via services/format.ts before
//  display.
//
//  Split into:
//
//    NewsFeedResponse     — one feed page
//    CommentResponse      — a single comment
//    CommentsListResponse — one comments page
//    LikeResponse         — like toggle result
//    ShareResponse        — share-recording result
//    PollResponse         — poll with options + own vote
//    NewsPostDetail       — single post + the viewer's liked
//    fetchNewsFeed        — paged feed, optional source filter
//    fetchNewsPost        — single post by id
//    toggleLikeApi        — like/unlike a post
//    sharePostApi         — record a completed share
//    fetchComments        — paged comments of a post
//    addCommentApi        — append a comment
//    createPost           — publish a user post
//    poll request cache   — one shared request per post
//    clearPollCache       — auth-change purge of poll answers
//    fetchPoll            — poll of a post, null on 404 only
//    createPollApi        — attach a poll to an own post
//    votePollApi          — cast a vote, 409 → no-op success
// -----------------------------------------------------------

// Shared client core
import { api, ApiError, request } from './client';

// Domain types
import type { NewsPost } from '@/types';







// -----------------------------------------------------------
// NewsFeedResponse
// -----------------------------------------------------------
//
// Used by:
//   - fetchNewsFeed (below)
//   - services/api/social.ts — fetchUserPosts shares the shape
//   - app/(main)/tabs/news.tsx — the feed
//   - app/(main)/profile/index.tsx — a user's posts
// -----------------------------------------------------------

export interface NewsFeedResponse {
  posts: NewsPost[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}







// -----------------------------------------------------------
// CommentResponse
// -----------------------------------------------------------
//
// `time` is the raw created_at ISO stamp — display code MUST
// format it via services/format.ts (see the file header).
//
// Used by:
//   - CommentsListResponse, fetchComments, addCommentApi (below)
//   - app/(main)/news-comments/index.tsx — the comments list
//   - app/(main)/news-post/index.tsx — inline comments
// -----------------------------------------------------------

export interface CommentResponse {
  id: string;
  text: string;
  time: string;
  userName: string;
  userAvatar?: string | null;
  userId: string;
}







// -----------------------------------------------------------
// CommentsListResponse
// -----------------------------------------------------------
//
// Used by:
//   - fetchComments (below)
//   - app/(main)/news-comments/index.tsx — paging state
// -----------------------------------------------------------

export interface CommentsListResponse {
  comments: CommentResponse[];
  total: number;
  page: number;
  perPage: number;
}







// -----------------------------------------------------------
// LikeResponse
// -----------------------------------------------------------
//
// Used by:
//   - toggleLikeApi (below)
//   - app/(main)/tabs/news.tsx — optimistic-like reconcile
// -----------------------------------------------------------

export interface LikeResponse {
  liked: boolean;
  likes: number;
}







// -----------------------------------------------------------
// ShareResponse
// -----------------------------------------------------------
//
// Used by:
//   - sharePostApi (below)
//   - app/(main)/tabs/news.tsx — share-count reconcile
// -----------------------------------------------------------

export interface ShareResponse {
  shares: number;
}







// -----------------------------------------------------------
// PollResponse
// -----------------------------------------------------------
//
// Used by:
//   - fetchPoll, createPollApi, votePollApi (below)
//   - components/news/PollWidget.tsx — render + vote state
//   - app/(main)/create-post/index.tsx — poll creation result
// -----------------------------------------------------------

export interface PollResponse {
  id: string;
  postId: string;
  title: string;
  endDate: string | null;
  totalVotes: number;
  createdAt: string;
  userVote: string | null;
  options: { id: string; text: string; votes: number }[];
}







// -----------------------------------------------------------
// NewsPostDetail
// -----------------------------------------------------------
//
// The single-post response: NewsPost plus the viewer's liked
// flag (false for guests), so the article screen seeds its
// heart from the load instead of guessing.
//
// Used by:
//   - fetchNewsPost (below)
//   - app/(main)/news-post/index.tsx — initial like state
// -----------------------------------------------------------

export interface NewsPostDetail extends NewsPost {
  liked: boolean;
}







// -----------------------------------------------------------
// fetchNewsFeed
// -----------------------------------------------------------
//
//   fetchNewsFeed()                — first page, all sources
//   fetchNewsFeed(2, 20, 'vu.lt')  — page 2, one source only
//
// The optional signal aborts the request in flight — useFeed
// passes one so a superseded filter switch stops downloading
// instead of finishing a page nobody will render (a canceled
// request rejects with ApiError code 'canceled').
//
// Used by:
//   - app/(main)/tabs/news.tsx — the feed
// -----------------------------------------------------------

export const fetchNewsFeed = (
  page = 1,
  perPage = 20,
  source?: NonNullable<NewsPost['source']>,
  signal?: AbortSignal,
) =>
  request(
    api.get<NewsFeedResponse>('/news', {
      params: { page, per_page: perPage, ...(source ? { source } : {}) },
      signal,
    }),
  );







// -----------------------------------------------------------
// fetchNewsPost
// -----------------------------------------------------------
//
// The response carries the viewer's `liked` flag (false for
// guests) — the detail screen initialises its heart from it.
//
// Used by:
//   - app/(main)/news-post/index.tsx — post detail
// -----------------------------------------------------------

export const fetchNewsPost = (postId: string) =>
  request(api.get<NewsPostDetail>(`/news/${encodeURIComponent(postId)}`));







// -----------------------------------------------------------
// toggleLikeApi
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/news.tsx — the feed's like button
// -----------------------------------------------------------

export const toggleLikeApi = (postId: string) =>
  request(api.post<LikeResponse>(`/news/${encodeURIComponent(postId)}/like`));







// -----------------------------------------------------------
// sharePostApi
// -----------------------------------------------------------
//
// Records a share the OS sheet reported as completed — the
// endpoint is auth-optional, matching guest sharing. Returns
// the fresh share count for the caller's reconcile patch.
//
// Used by:
//   - app/(main)/tabs/news.tsx — after a completed share
// -----------------------------------------------------------

export const sharePostApi = (postId: string) =>
  request(api.post<ShareResponse>(`/news/${encodeURIComponent(postId)}/share`));







// -----------------------------------------------------------
// fetchComments
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/news-comments/index.tsx — the comments screen
//   - app/(main)/news-post/index.tsx — inline comment preview
// -----------------------------------------------------------

export const fetchComments = (postId: string, page = 1, perPage = 20) =>
  request(
    api.get<CommentsListResponse>(`/news/${encodeURIComponent(postId)}/comments`, {
      params: { page, per_page: perPage },
    }),
  );







// -----------------------------------------------------------
// addCommentApi
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/news-comments/index.tsx — the composer
//   - app/(main)/news-post/index.tsx — inline composer
// -----------------------------------------------------------

export const addCommentApi = (postId: string, text: string) =>
  request(api.post<CommentResponse>(`/news/${encodeURIComponent(postId)}/comments`, { text }));







// -----------------------------------------------------------
// createPost
// -----------------------------------------------------------
//
// image_url must be the RELATIVE path from uploadImageApi —
// the backend stores it verbatim and screens resolve it with
// getUploadUrl at render time.
//
// Used by:
//   - app/(main)/create-post/index.tsx — publish
// -----------------------------------------------------------

export const createPost = (params: {
  content: string;
  title?: string;
  image_url?: string;
  is_public?: boolean;
}) => request(api.post<NewsPost>('/news', params));







// -----------------------------------------------------------
// Poll request cache
// -----------------------------------------------------------
//
// Every PollWidget mount used to fire its own GET — a feed of
// poll cards meant one request per card, re-issued on every
// remount. Fetches inside the TTL now share one in-flight (or
// settled) promise per post; a failed fetch evicts itself so
// the next mount retries, and voting or attaching a poll
// invalidates the entry because its counts just changed.
//
// The key is the post id ALONE, and a poll answer is viewer-
// dependent (userVote) — so the cache must die with the auth
// context: AuthContext purges it via clearPollCache on every
// login and logout, or a fresh login inside the TTL would see
// the guest's votable options and the next guest a logged-out
// user's own vote.
//
// Used by:
//   - fetchPoll (below) — read-through
//   - createPollApi / votePollApi (below) — invalidation
//   - clearPollCache (below) — auth-change purge
// -----------------------------------------------------------

const POLL_CACHE_TTL = 30_000;

const pollCache = new Map<
  string,
  { promise: Promise<PollResponse | null>; timestamp: number }
>();







// -----------------------------------------------------------
// clearPollCache
// -----------------------------------------------------------
//
// Drops every cached poll answer — they carry the previous
// viewer's userVote (see the poll request cache above), so
// the session transitions must not let one outlive its auth
// context. In-memory and synchronous; cannot fail.
//
// Used by:
//   - context/AuthContext.tsx — session establish + teardown
// -----------------------------------------------------------

export function clearPollCache(): void {
  pollCache.clear();
}







// -----------------------------------------------------------
// fetchPoll
// -----------------------------------------------------------
//
// Resolves null ONLY when the backend answers 404 (the post
// simply has no poll). Timeouts, auth failures and server
// errors rethrow, so a poll post shows an error state instead
// of silently rendering without its poll. Requests inside the
// cache TTL share one promise (see the poll request cache).
//
// Used by:
//   - votePollApi (below) — refetch after a duplicate vote
//   - components/news/PollWidget.tsx — initial load
// -----------------------------------------------------------

export function fetchPoll(postId: string): Promise<PollResponse | null> {
  const cached = pollCache.get(postId);
  if (cached && Date.now() - cached.timestamp < POLL_CACHE_TTL) return cached.promise;


  const promise = (async () => {
    try {
      return await request(api.get<PollResponse>(`/news/${encodeURIComponent(postId)}/poll`));
    } catch (err) {
      // 404 means "no poll" — a real answer worth keeping;
      // every other failure evicts itself so the next mount
      // retries against the backend instead of replaying it
      if (err instanceof ApiError && err.status === 404) return null;
      pollCache.delete(postId);
      throw err;
    }
  })();


  pollCache.set(postId, { promise, timestamp: Date.now() });
  return promise;
}







// -----------------------------------------------------------
// createPollApi
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/create-post/index.tsx — attach a poll on publish
// -----------------------------------------------------------

export async function createPollApi(
  postId: string,
  title: string,
  options: string[],
  endDate?: string,
): Promise<PollResponse> {
  const poll = await request(
    api.post<PollResponse>(`/news/${encodeURIComponent(postId)}/poll`, {
      title,
      options,
      ...(endDate ? { end_date: endDate } : {}),
    }),
  );

  // A cached "no poll yet" answer is stale the moment the
  // poll exists
  pollCache.delete(postId);
  return poll;
}







// -----------------------------------------------------------
// votePollApi
// -----------------------------------------------------------
//
// The backend answers 409 when the user re-taps the option
// they already voted for — treated here as a no-op success:
// the poll is refetched and returned so the widget still gets
// authoritative state. Every other failure rethrows.
//
// Used by:
//   - components/news/PollWidget.tsx — option tap
// -----------------------------------------------------------

export async function votePollApi(postId: string, optionId: string): Promise<PollResponse> {
  // The counts are about to change — a cached pre-vote answer
  // must not outlive the vote (this also makes the 409 refetch
  // below hit the backend, not the cache)
  pollCache.delete(postId);

  try {
    return await request(
      api.post<PollResponse>(`/news/${encodeURIComponent(postId)}/poll/vote`, {
        option_id: optionId,
      }),
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const poll = await fetchPoll(postId);
      if (poll) return poll;
    }
    throw err;
  }
}
