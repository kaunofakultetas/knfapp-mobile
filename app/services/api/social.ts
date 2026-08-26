// -----------------------------------------------------------
//  [*] API — social
//
//  Profiles, the friendship state machine (request → accept/
//  reject → unfriend), the friends-only feed and a user's own
//  posts. Friendship endpoints return the resulting status so
//  optimistic UI can reconcile without a refetch.
//
//  Split into:
//
//    UserProfile         — public profile + friendship status
//    FriendRequest       — one pending request row
//    Friend              — one friends-list row
//    SocialFeedPost      — NewsPost + author avatar
//    SocialFeedResponse  — one friends-feed page
//    fetchUserProfile    — profile by user id
//    updateProfile       — edit own profile
//    sendFriendRequest   — request friendship
//    fetchFriendRequests — pending requests, either direction
//    acceptFriendRequest — accept a request
//    rejectFriendRequest — decline a request
//    fetchFriends        — the friends list
//    unfriendUser        — remove a friendship
//    fetchSocialFeed     — paged friends-only feed
//    fetchUserPosts      — paged posts of one user
//    deletePost          — delete an own post
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';

// Feed page shape shared with the news module
import type { NewsFeedResponse } from './news';

// Domain types
import type { NewsPost, User } from '@/types';







// -----------------------------------------------------------
// UserProfile
// -----------------------------------------------------------
//
// friendshipStatus is from the VIEWER's perspective —
// 'request_sent' means the viewer already asked.
//
// Used by:
//   - fetchUserProfile (below)
//   - app/(main)/profile/index.tsx — header + action button
// -----------------------------------------------------------

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
  postCount: number;
  friendCount: number;
  friendshipStatus: 'none' | 'friends' | 'request_sent' | 'request_received';
}







// -----------------------------------------------------------
// FriendRequest
// -----------------------------------------------------------
//
// Used by:
//   - fetchFriendRequests (below)
//   - app/(main)/friend-requests/index.tsx — request rows
// -----------------------------------------------------------

export interface FriendRequest {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
}







// -----------------------------------------------------------
// Friend
// -----------------------------------------------------------
//
// Used by:
//   - fetchFriends (below)
//   - app/(main)/friends/index.tsx — friends-list rows
// -----------------------------------------------------------

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  friendsSince: string;
}







// -----------------------------------------------------------
// SocialFeedPost
// -----------------------------------------------------------
//
// Used by:
//   - SocialFeedResponse (below)
//   - app/(main)/tabs/news.tsx — community-feed cards
// -----------------------------------------------------------

export interface SocialFeedPost extends NewsPost {
  authorAvatar?: string;
}







// -----------------------------------------------------------
// SocialFeedResponse
// -----------------------------------------------------------
//
// Used by:
//   - fetchSocialFeed (below)
//   - app/(main)/tabs/news.tsx — community-feed paging
// -----------------------------------------------------------

export interface SocialFeedResponse {
  posts: SocialFeedPost[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}







// -----------------------------------------------------------
// fetchUserProfile
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/profile/index.tsx — profile load
// -----------------------------------------------------------

export const fetchUserProfile = (userId: string) =>
  request(api.get<UserProfile>(`/social/profile/${userId}`));







// -----------------------------------------------------------
// updateProfile
// -----------------------------------------------------------
//
// avatar_url must be the RELATIVE path from uploadImageApi
// (resolved with getUploadUrl only at render time). Backend
// quirk: the response omits the `invited` trust flag — merge
// the result into the existing user instead of replacing it,
// or the flag is silently dropped.
//
// Used by:
//   - app/(main)/tabs/id.tsx — student-card field edits
//   - app/(main)/profile/index.tsx — avatar/name edits
// -----------------------------------------------------------

export const updateProfile = (params: {
  display_name?: string;
  avatar_url?: string;
  student_number?: string | null;
  study_group?: string | null;
  study_program?: string | null;
}) => request(api.put<User>('/social/profile', params));







// -----------------------------------------------------------
// sendFriendRequest
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/profile/index.tsx — "add friend" action
// -----------------------------------------------------------

export const sendFriendRequest = (userId: string) =>
  request(
    api.post<{ id: string; status: string }>('/social/friends/request', {
      user_id: userId,
    }),
  );







// -----------------------------------------------------------
// fetchFriendRequests
// -----------------------------------------------------------
//
//   fetchFriendRequests()        — requests waiting on me
//   fetchFriendRequests('sent')  — requests I sent
//
// Used by:
//   - app/(main)/friend-requests/index.tsx — both tabs
//   - app/(main)/friends/index.tsx — pending-count badge
//   - app/(main)/profile/index.tsx — resolve request id to accept
// -----------------------------------------------------------

export const fetchFriendRequests = (direction: 'received' | 'sent' = 'received') =>
  request(
    api.get<{ requests: FriendRequest[] }>('/social/friends/requests', {
      params: { direction },
    }),
  );







// -----------------------------------------------------------
// acceptFriendRequest
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/friend-requests/index.tsx — accept button
//   - app/(main)/profile/index.tsx — accept from the profile
// -----------------------------------------------------------

export const acceptFriendRequest = (requestId: string) =>
  request(api.post<{ status: string }>(`/social/friends/requests/${requestId}/accept`));







// -----------------------------------------------------------
// rejectFriendRequest
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/friend-requests/index.tsx — decline button
// -----------------------------------------------------------

export const rejectFriendRequest = (requestId: string) =>
  request(api.post<{ status: string }>(`/social/friends/requests/${requestId}/reject`));







// -----------------------------------------------------------
// fetchFriends
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/friends/index.tsx — the friends list
// -----------------------------------------------------------

export const fetchFriends = () =>
  request(api.get<{ friends: Friend[] }>('/social/friends'));







// -----------------------------------------------------------
// unfriendUser
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/profile/index.tsx — remove-friend action
// -----------------------------------------------------------

export const unfriendUser = (userId: string) =>
  request(api.delete<{ status: string }>(`/social/friends/${userId}`));







// -----------------------------------------------------------
// fetchSocialFeed
// -----------------------------------------------------------
//
// Friends-only posts — the community view of the news tab.
//
// Used by:
//   - app/(main)/tabs/news.tsx — community source
// -----------------------------------------------------------

export const fetchSocialFeed = (page = 1, perPage = 20) =>
  request(
    api.get<SocialFeedResponse>('/social/feed', {
      params: { page, per_page: perPage },
    }),
  );







// -----------------------------------------------------------
// fetchUserPosts
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/profile/index.tsx — the profile post list
// -----------------------------------------------------------

export const fetchUserPosts = (userId: string, page = 1, perPage = 20) =>
  request(
    api.get<NewsFeedResponse>('/social/posts', {
      params: { user_id: userId, page, per_page: perPage },
    }),
  );







// -----------------------------------------------------------
// deletePost
// -----------------------------------------------------------
//
// Author-only server-side — the backend rejects deleting
// someone else's post.
//
// Used by:
//   - app/(main)/profile/index.tsx — own-post delete menu (planned)
// -----------------------------------------------------------

export async function deletePost(postId: string): Promise<void> {
  await request(api.delete(`/social/posts/${postId}`));
}
