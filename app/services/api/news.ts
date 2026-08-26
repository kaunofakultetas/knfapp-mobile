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
//  poll) and rethrows every other failure; votePollApi treats
//  the backend's 409 ("already voted for this option") as a
//  no-op success and hands back freshly fetched poll state.
//
//  Comment `time` strings are server-preformatted in UTC —
//  screens must ignore them and format locally instead
//  (services/format.ts).
//
//  Split into:
//
//    NewsFeedResponse     — one feed page
//    CommentResponse      — a single comment
//    CommentsListResponse — one comments page
//    LikeResponse         — like toggle result
//    PollResponse         — poll with options + own vote
//    fetchNewsFeed        — paged feed, optional source filter
//    fetchNewsPost        — single post by id
//    toggleLikeApi        — like/unlike a post
//    fetchComments        — paged comments of a post
//    addCommentApi        — append a comment
//    createPost           — publish a user post
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
// `time` is server-formatted UTC — display code formats its
// own timestamps instead (see the file header).
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
  userAvatar?: string;
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
// fetchNewsFeed
// -----------------------------------------------------------
//
//   fetchNewsFeed()                — first page, all sources
//   fetchNewsFeed(2, 20, 'vu.lt')  — page 2, one source only
//
// Used by:
//   - app/(main)/tabs/news.tsx — the feed
// -----------------------------------------------------------

export const fetchNewsFeed = (page = 1, perPage = 20, source?: string) =>
  request(
    api.get<NewsFeedResponse>('/news', {
      params: { page, per_page: perPage, ...(source ? { source } : {}) },
    }),
  );







// -----------------------------------------------------------
// fetchNewsPost
// -----------------------------------------------------------
//
// Backend quirk: unlike the feed, the single-post endpoint
// omits the viewer's `liked` flag — the detail screen should
// carry like state over from the feed item when it has one.
//
// Used by:
//   - app/(main)/news-post/index.tsx — post detail
// -----------------------------------------------------------

export const fetchNewsPost = (postId: string) =>
  request(api.get<NewsPost>(`/news/${postId}`));







// -----------------------------------------------------------
// toggleLikeApi
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/news.tsx — the feed's like button
// -----------------------------------------------------------

export const toggleLikeApi = (postId: string) =>
  request(api.post<LikeResponse>(`/news/${postId}/like`));







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
    api.get<CommentsListResponse>(`/news/${postId}/comments`, {
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
  request(api.post<CommentResponse>(`/news/${postId}/comments`, { text }));







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
// fetchPoll
// -----------------------------------------------------------
//
// Resolves null ONLY when the backend answers 404 (the post
// simply has no poll). Timeouts, auth failures and server
// errors rethrow, so a poll post shows an error state instead
// of silently rendering without its poll.
//
// Used by:
//   - votePollApi (below) — refetch after a duplicate vote
//   - components/news/PollWidget.tsx — initial load
// -----------------------------------------------------------

export async function fetchPoll(postId: string): Promise<PollResponse | null> {
  try {
    return await request(api.get<PollResponse>(`/news/${postId}/poll`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
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
  return request(
    api.post<PollResponse>(`/news/${postId}/poll`, {
      title,
      options,
      ...(endDate ? { end_date: endDate } : {}),
    }),
  );
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
  try {
    return await request(
      api.post<PollResponse>(`/news/${postId}/poll/vote`, { option_id: optionId }),
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const poll = await fetchPoll(postId);
      if (poll) return poll;
    }
    throw err;
  }
}
