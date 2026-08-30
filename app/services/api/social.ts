// -----------------------------------------------------------
//  [*] API — social
//
//  Profiles, the friendship state machine (request → accept/
//  reject → unfriend), the community feed and a user's own
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
//    fetchSocialFeed     — paged community feed
//    fetchUserPosts      — paged posts of one user
//    deletePost          — delete an own post
//    updatePost          — edit an own post
//    blockUser           — block a user (severs friendship)
//    unblockUser         — lift an own block
//    BlockedUser         — one row of the block list
//    fetchBlockedUsers   — the caller's block list
//    reportTarget        — report a user / post / message
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';

// Feed page shape shared with the news module
import type { NewsFeedResponse } from './news';

// Domain types
import type { NewsPost, User, UserRole } from '@/types';







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
  avatarUrl?: string | null;
  role: UserRole;
  createdAt: string;
  postCount: number;
  friendCount: number;
  friendshipStatus: 'none' | 'friends' | 'request_sent' | 'request_received';
  blockedByMe: boolean;
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
  role: UserRole;
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
  role: UserRole;
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
  request(api.get<UserProfile>(`/social/profile/${encodeURIComponent(userId)}`));







// -----------------------------------------------------------
// updateProfile
// -----------------------------------------------------------
//
// avatar_url must be the RELATIVE path from uploadImageApi
// (resolved with getUploadUrl only at render time). Backend
// quirk: the response omits the `invited` trust flag — the
// Pick return type spells that out, so whole-object setUser
// assignments fail to compile: merge the result into the
// existing user instead of replacing it, or the flag is
// silently dropped.
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
}) =>
  request(
    api.put<
      Pick<
        User,
        | 'id'
        | 'username'
        | 'email'
        | 'displayName'
        | 'avatarUrl'
        | 'role'
        | 'studentNumber'
        | 'studyGroup'
        | 'studyProgram'
      >
    >('/social/profile', params),
  );







// -----------------------------------------------------------
// sendFriendRequest
// -----------------------------------------------------------
//
// status is 'accepted' (no id) when the other side had already
// asked — the backend auto-accepts instead of stacking two
// mirrored requests; callers must branch on it.
//
// Used by:
//   - app/(main)/profile/index.tsx — "add friend" action
// -----------------------------------------------------------

export const sendFriendRequest = (userId: string) =>
  request(
    api.post<{ id?: string; status: 'pending' | 'accepted' }>('/social/friends/request', {
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
  request(
    api.post<{ status: string }>(
      `/social/friends/requests/${encodeURIComponent(requestId)}/accept`,
    ),
  );







// -----------------------------------------------------------
// rejectFriendRequest
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/friend-requests/index.tsx — decline button
// -----------------------------------------------------------

export const rejectFriendRequest = (requestId: string) =>
  request(
    api.post<{ status: string }>(
      `/social/friends/requests/${encodeURIComponent(requestId)}/reject`,
    ),
  );







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
  request(api.delete<{ status: string }>(`/social/friends/${encodeURIComponent(userId)}`));







// -----------------------------------------------------------
// fetchSocialFeed
// -----------------------------------------------------------
//
// The community view of the news tab: every PUBLIC community
// post plus, when signed in, the viewer's own and their
// friends' non-public posts — guests get the public rows.
//
// The optional signal aborts the request in flight — useFeed
// passes one so a superseded mode switch stops downloading (a
// canceled request rejects with ApiError code 'canceled').
//
// Used by:
//   - app/(main)/tabs/news.tsx — community source
// -----------------------------------------------------------

export const fetchSocialFeed = (page = 1, perPage = 20, signal?: AbortSignal) =>
  request(
    api.get<SocialFeedResponse>('/social/feed', {
      params: { page, per_page: perPage },
      signal,
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
//   - app/(main)/profile/index.tsx — handleDeletePost
// -----------------------------------------------------------

export async function deletePost(postId: string): Promise<void> {
  await request(api.delete(`/social/posts/${encodeURIComponent(postId)}`));
}




// -----------------------------------------------------------
// updatePost
// -----------------------------------------------------------
//
// Edits the caller's own post (user or faculty source — the
// backend 404s anything else). Both fields ride together: a
// title stripped to empty makes the backend re-derive it from
// the new content, mirroring create.
//
// Used by:
//   - app/(main)/create-post/index.tsx — edit mode submit
// -----------------------------------------------------------

export async function updatePost(
  postId: string,
  params: { title: string; content: string },
): Promise<void> {
  await request(api.put(`/social/posts/${encodeURIComponent(postId)}`, params));
}




// -----------------------------------------------------------
// blockUser / unblockUser
// -----------------------------------------------------------
//
// Blocking is bidirectional in effect: neither side can start
// a conversation with, message (in a direct chat), friend-
// request or find the other in the chat user search until the
// blocker lifts it. The backend also severs an existing
// friendship and any pending request — unblocking restores
// none of that, contact is merely possible again. Unblock is
// idempotent, so a retried tap cannot error.
//
// Used by:
//   - app/(main)/profile/index.tsx — the block/unblock action
// -----------------------------------------------------------

export async function blockUser(userId: string): Promise<void> {
  await request(api.post('/social/blocks', { user_id: userId }));
}

export async function unblockUser(userId: string): Promise<void> {
  await request(api.delete(`/social/blocks/${encodeURIComponent(userId)}`));
}




// -----------------------------------------------------------
// BlockedUser + fetchBlockedUsers
// -----------------------------------------------------------
//
// The caller's own block list, newest first.
//
// Used by:
//   - nothing renders the list yet — the profile screen works
//     off profile.blockedByMe; the list waits on a settings
//     surface
// -----------------------------------------------------------

export interface BlockedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
  blockedAt: string;
}

export const fetchBlockedUsers = () =>
  request(api.get<{ blocked: BlockedUser[] }>('/social/blocks'));




// -----------------------------------------------------------
// reportTarget
// -----------------------------------------------------------
//
// Files a complaint into the admin-reviewed ledger. The
// target must exist server-side (404 otherwise) and reason is
// required — callers without a free-text field send a fixed
// localized line.
//
// Used by:
//   - app/(main)/profile/index.tsx — the report action
// -----------------------------------------------------------

export async function reportTarget(
  targetType: 'user' | 'post' | 'message',
  targetId: string,
  reason: string,
): Promise<void> {
  await request(
    api.post('/social/reports', {
      target_type: targetType,
      target_id: targetId,
      reason,
    }),
  );
}
