// -----------------------------------------------------------
//  [*] API — news & polls
//
//  The /news feed mixes scraped faculty articles and user
//  posts (NewsPost.source tells them apart); likes, comments,
//  post creation and attaching a poll live under the same
//  prefix. Reading and voting a poll is NOT here any more —
//  @knf/socialengine's KNF adapter owns those routes (and the
//  404 → "no poll" / 409 → duplicate-vote edge cases), and
//  components/news/PollWidget.tsx reads them through usePoll.
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
//    ShareResponse        — share-recording result
//    PollResponse         — poll with options + own vote
//    NewsPostDetail       — single post + the viewer's liked
//    fetchNewsFeed        — paged feed, optional source filter
//    fetchNewsPost        — single post by id
//    sharePostApi         — record a completed share
//    fetchComments        — paged comments of a post
//    addCommentApi        — append a comment
//    createPost           — publish a user post
//    createPollApi        — attach a poll to an own post
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';

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
//   - createPollApi (below)
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
  return request(
    api.post<PollResponse>(`/news/${encodeURIComponent(postId)}/poll`, {
      title,
      options,
      ...(endDate ? { end_date: endDate } : {}),
    }),
  );
}
