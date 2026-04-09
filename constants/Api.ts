/**
 * API configuration for connecting to the knfapp-backend.
 *
 * In development, change API_BASE_URL to your local backend.
 * In production, this should point to the deployed API.
 */

// Default: localhost for development. Override with environment variable if available.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000/api";

export const API_ENDPOINTS = {
  // Health
  health: "/health",

  // Auth
  login: "/auth/login",
  register: "/auth/register",
  validateCode: "/auth/validate-code",
  me: "/auth/me",
  logout: "/auth/logout",

  // News
  newsFeed: "/news",
  newsPost: (id: string) => `/news/${id}`,
  newsLike: (id: string) => `/news/${id}/like`,
  newsComments: (id: string) => `/news/${id}/comments`,

  // Schedule
  schedule: "/schedule",

  // Admin
  adminInvitations: "/admin/invitations",
  adminUsers: "/admin/users",
  adminStats: "/admin/stats",

  // Scraper
  scraperStatus: "/scraper/status",
  scraperTrigger: "/scraper/trigger",

  // Chat
  chatConversations: "/chat/conversations",
  chatMessages: (convId: string) => `/chat/conversations/${convId}/messages`,
  chatReact: (convId: string, msgId: string) => `/chat/conversations/${convId}/messages/${msgId}/react`,
  chatPin: (convId: string) => `/chat/conversations/${convId}/pin`,
  chatRead: (convId: string) => `/chat/conversations/${convId}/read`,
  chatDelete: (convId: string) => `/chat/conversations/${convId}`,
  chatUserSearch: "/chat/users/search",

  // Social
  socialProfile: (userId: string) => `/social/profile/${userId}`,
  socialProfileUpdate: "/social/profile",
  socialFriendRequest: "/social/friends/request",
  socialFriendRequests: "/social/friends/requests",
  socialFriendAccept: (requestId: string) => `/social/friends/requests/${requestId}/accept`,
  socialFriendReject: (requestId: string) => `/social/friends/requests/${requestId}/reject`,
  socialFriends: "/social/friends",
  socialUnfriend: (userId: string) => `/social/friends/${userId}`,
  socialPosts: "/social/posts",
  socialPostUpdate: (postId: string) => `/social/posts/${postId}`,
  socialPostDelete: (postId: string) => `/social/posts/${postId}`,

  // News (create)
  newsCreate: "/news",

  // Polls
  newsPoll: (postId: string) => `/news/${postId}/poll`,
  newsPollVote: (postId: string) => `/news/${postId}/poll/vote`,
} as const;
