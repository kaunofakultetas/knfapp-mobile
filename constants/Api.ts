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
} as const;
