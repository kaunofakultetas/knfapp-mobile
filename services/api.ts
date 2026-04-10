/**
 * Centralized API client for knfapp-backend.
 *
 * Uses axios with automatic token injection from AsyncStorage.
 * All backend communication goes through this module.
 */

import { API_BASE_URL, API_ENDPOINTS } from '@/constants/Api';
import type { Conversation, NewsPost, User } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError } from 'axios';

// ── Axios instance ──────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject Bearer token from persisted auth state
api.interceptors.request.use(async (config) => {
  try {
    const raw = await AsyncStorage.getItem('auth');
    if (raw) {
      const { token } = JSON.parse(raw) as { token: string };
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // ignore — proceed without token
  }
  return config;
});

// ── Error helper ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function handleError(err: unknown): never {
  if (err instanceof AxiosError && err.response) {
    const msg =
      (err.response.data as { error?: string })?.error ||
      err.response.statusText ||
      'Request failed';
    throw new ApiError(msg, err.response.status, err.response.data);
  }
  if (err instanceof AxiosError && err.code === 'ECONNABORTED') {
    throw new ApiError('Request timed out', 0);
  }
  if (err instanceof AxiosError && !err.response) {
    throw new ApiError('Network error — is the server running?', 0);
  }
  throw err;
}

// ── Response types (match backend JSON) ─────────────────────────────────────

export interface NewsFeedResponse {
  posts: NewsPost[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface CommentResponse {
  id: string;
  text: string;
  time: string;
  userName: string;
  userAvatar?: string;
  userId: string;
}

export interface CommentsListResponse {
  comments: CommentResponse[];
  total: number;
  page: number;
  perPage: number;
}

export interface LikeResponse {
  liked: boolean;
  likes: number;
}

// ── Auth API ────────────────────────────────────────────────────────────────

export async function loginApi(username: string, password: string): Promise<AuthResponse> {
  try {
    const { data } = await api.post<AuthResponse>(API_ENDPOINTS.login, { username, password });
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function registerApi(params: {
  invitation_code?: string;
  username: string;
  password: string;
  display_name: string;
  email: string;
}): Promise<AuthResponse> {
  try {
    const { data } = await api.post<AuthResponse>(API_ENDPOINTS.register, params);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchMe(): Promise<User> {
  try {
    const { data } = await api.get<User>(API_ENDPOINTS.me);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export interface ValidateCodeResponse {
  valid: boolean;
  error?: string;
  role?: string;
  remainingUses?: number;
}

export async function validateInvitationCode(code: string): Promise<ValidateCodeResponse> {
  try {
    const { data } = await api.post<ValidateCodeResponse>(API_ENDPOINTS.validateCode, { code });
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function logoutApi(): Promise<void> {
  try {
    await api.post(API_ENDPOINTS.logout);
  } catch {
    // Best-effort — clear local state even if server call fails
  }
}

// ── News API ────────────────────────────────────────────────────────────────

export async function fetchNewsFeed(
  page = 1,
  perPage = 20,
  source?: string,
): Promise<NewsFeedResponse> {
  try {
    const params: Record<string, string | number> = { page, per_page: perPage };
    if (source) params.source = source;
    const { data } = await api.get<NewsFeedResponse>(API_ENDPOINTS.newsFeed, { params });
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchNewsPost(postId: string): Promise<NewsPost> {
  try {
    const { data } = await api.get<NewsPost>(API_ENDPOINTS.newsPost(postId));
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function toggleLikeApi(postId: string): Promise<LikeResponse> {
  try {
    const { data } = await api.post<LikeResponse>(API_ENDPOINTS.newsLike(postId));
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchComments(
  postId: string,
  page = 1,
  perPage = 20,
): Promise<CommentsListResponse> {
  try {
    const { data } = await api.get<CommentsListResponse>(API_ENDPOINTS.newsComments(postId), {
      params: { page, per_page: perPage },
    });
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function addCommentApi(postId: string, text: string): Promise<CommentResponse> {
  try {
    const { data } = await api.post<CommentResponse>(API_ENDPOINTS.newsComments(postId), { text });
    return data;
  } catch (err) {
    handleError(err);
  }
}

// ── Schedule API ────────────────────────────────────────────────────────────

export interface ScheduleLesson {
  id: string;
  title: string;
  teacher: string;
  room: string;
  timeStart: string; // "HH:MM"
  timeEnd: string;   // "HH:MM"
  dayOfWeek: number; // 0=Monday..6=Sunday
  group: string;
  semester: string;
}

export interface ScheduleResponse {
  lessons: ScheduleLesson[];
}

export async function fetchSchedule(
  day?: number,
  group?: string,
  semester?: string,
): Promise<ScheduleResponse> {
  try {
    const params: Record<string, string | number> = {};
    if (day !== undefined) params.day = day;
    if (group) params.group = group;
    if (semester) params.semester = semester;
    const { data } = await api.get<ScheduleResponse>(API_ENDPOINTS.schedule, { params });
    return data;
  } catch (err) {
    handleError(err);
  }
}

export interface ScheduleFiltersResponse {
  groups: string[];
  semesters: string[];
}

export async function fetchScheduleFilters(): Promise<ScheduleFiltersResponse> {
  try {
    const { data } = await api.get<ScheduleFiltersResponse>(API_ENDPOINTS.scheduleFilters);
    return data;
  } catch (err) {
    handleError(err);
  }
}

// ── Chat API ───────────────────────────────────────────────────────────────

export interface ApiConversation {
  id: string;
  type: 'direct' | 'group';
  title: string;
  avatarEmoji?: string;
  pinned: boolean;
  unreadCount: number;
  lastUpdatedMs: number;
  participants: { id: string; displayName: string; avatarUrl?: string }[];
  lastMessage?: {
    id: string;
    text: string;
    imageUrl?: string;
    time: string;
    senderId: string;
    senderName: string;
  };
}

export interface ApiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  imageUrl?: string;
  time: string;
  createdAt: string;
  isOwn: boolean;
  status?: 'sent' | 'delivered' | 'read';
  readBy?: string[];
  reactions: {
    emoji: string;
    count: number;
    bySelf: boolean;
    byUserIds: string[];
  }[];
}

export interface ConversationsResponse {
  conversations: ApiConversation[];
}

export interface MessagesResponse {
  messages: ApiMessage[];
  hasMore: boolean;
}

export interface SearchUserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
}

export async function fetchConversations(): Promise<ConversationsResponse> {
  try {
    const { data } = await api.get<ConversationsResponse>(API_ENDPOINTS.chatConversations);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function createConversation(params: {
  participantIds: string[];
  type: 'direct' | 'group';
  title?: string;
  avatarEmoji?: string;
}): Promise<{ conversationId: string }> {
  try {
    const { data } = await api.post<{ conversationId: string }>(
      API_ENDPOINTS.chatConversations,
      params,
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchMessages(
  convId: string,
  before?: string,
  limit = 50,
): Promise<MessagesResponse> {
  try {
    const params: Record<string, string | number> = { limit };
    if (before) params.before = before;
    const { data } = await api.get<MessagesResponse>(API_ENDPOINTS.chatMessages(convId), {
      params,
    });
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function sendMessageApi(
  convId: string,
  text: string,
  imageUrl?: string,
): Promise<{ message: ApiMessage }> {
  try {
    const body: Record<string, string> = {};
    if (text) body.text = text;
    if (imageUrl) body.imageUrl = imageUrl;
    const { data } = await api.post<{ message: ApiMessage }>(
      API_ENDPOINTS.chatMessages(convId),
      body,
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function reactToMessageApi(
  convId: string,
  msgId: string,
  emoji: string,
): Promise<void> {
  try {
    await api.post(API_ENDPOINTS.chatReact(convId, msgId), { emoji });
  } catch (err) {
    handleError(err);
  }
}

export async function removeReactionApi(convId: string, msgId: string): Promise<void> {
  try {
    await api.delete(API_ENDPOINTS.chatReact(convId, msgId));
  } catch (err) {
    handleError(err);
  }
}

export async function togglePinApi(convId: string): Promise<{ pinned: boolean }> {
  try {
    const { data } = await api.put<{ pinned: boolean }>(API_ENDPOINTS.chatPin(convId));
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function markConversationRead(convId: string): Promise<void> {
  try {
    await api.put(API_ENDPOINTS.chatRead(convId));
  } catch (err) {
    handleError(err);
  }
}

export async function fetchTotalUnreadCount(): Promise<{ unreadCount: number }> {
  try {
    const { data } = await api.get<{ unreadCount: number }>(API_ENDPOINTS.chatUnreadCount);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function deleteConversationApi(convId: string): Promise<void> {
  try {
    await api.delete(API_ENDPOINTS.chatDelete(convId));
  } catch (err) {
    handleError(err);
  }
}

export interface MessageSearchResult {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  imageUrl?: string;
  time: string;
  createdAt: string;
  isOwn: boolean;
}

export async function searchMessagesApi(
  convId: string,
  q: string,
  limit = 20,
): Promise<{ messages: MessageSearchResult[]; total: number }> {
  try {
    const { data } = await api.get<{ messages: MessageSearchResult[]; total: number }>(
      API_ENDPOINTS.chatMessageSearch(convId),
      { params: { q, limit } },
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchOnlineStatus(userIds: string[]): Promise<Record<string, boolean>> {
  try {
    const { data } = await api.post<{ online: Record<string, boolean> }>(
      API_ENDPOINTS.chatOnlineStatus,
      { userIds },
    );
    return data.online;
  } catch {
    return {};
  }
}

export async function searchUsersApi(q: string): Promise<{ users: SearchUserResult[] }> {
  try {
    const { data } = await api.get<{ users: SearchUserResult[] }>(API_ENDPOINTS.chatUserSearch, {
      params: { q },
    });
    return data;
  } catch (err) {
    handleError(err);
  }
}

// ── Social API ─────────────────────────────────────────────────────────────

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

export interface FriendRequest {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
}

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  friendsSince: string;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  try {
    const { data } = await api.get<UserProfile>(API_ENDPOINTS.socialProfile(userId));
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function updateProfile(params: {
  display_name?: string;
  avatar_url?: string;
  student_number?: string | null;
  study_group?: string | null;
  study_program?: string | null;
}): Promise<User> {
  try {
    const { data } = await api.put<User>(API_ENDPOINTS.socialProfileUpdate, params);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function sendFriendRequest(userId: string): Promise<{ id: string; status: string }> {
  try {
    const { data } = await api.post<{ id: string; status: string }>(
      API_ENDPOINTS.socialFriendRequest,
      { user_id: userId },
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchFriendRequests(
  direction: 'received' | 'sent' = 'received',
): Promise<{ requests: FriendRequest[] }> {
  try {
    const { data } = await api.get<{ requests: FriendRequest[] }>(
      API_ENDPOINTS.socialFriendRequests,
      { params: { direction } },
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function acceptFriendRequest(requestId: string): Promise<{ status: string }> {
  try {
    const { data } = await api.post<{ status: string }>(
      API_ENDPOINTS.socialFriendAccept(requestId),
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function rejectFriendRequest(requestId: string): Promise<{ status: string }> {
  try {
    const { data } = await api.post<{ status: string }>(
      API_ENDPOINTS.socialFriendReject(requestId),
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchFriends(): Promise<{ friends: Friend[] }> {
  try {
    const { data } = await api.get<{ friends: Friend[] }>(API_ENDPOINTS.socialFriends);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function unfriendUser(userId: string): Promise<{ status: string }> {
  try {
    const { data } = await api.delete<{ status: string }>(API_ENDPOINTS.socialUnfriend(userId));
    return data;
  } catch (err) {
    handleError(err);
  }
}

export interface SocialFeedPost extends NewsPost {
  authorAvatar?: string;
}

export interface SocialFeedResponse {
  posts: SocialFeedPost[];
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}

export async function fetchSocialFeed(
  page = 1,
  perPage = 20,
): Promise<SocialFeedResponse> {
  try {
    const { data } = await api.get<SocialFeedResponse>(API_ENDPOINTS.socialFeed, {
      params: { page, per_page: perPage },
    });
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function createPost(params: {
  content: string;
  title?: string;
  image_url?: string;
  is_public?: boolean;
}): Promise<NewsPost> {
  try {
    const { data } = await api.post<NewsPost>(API_ENDPOINTS.newsCreate, params);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchUserPosts(
  userId: string,
  page = 1,
  perPage = 20,
): Promise<NewsFeedResponse> {
  try {
    const { data } = await api.get<NewsFeedResponse>(API_ENDPOINTS.socialPosts, {
      params: { user_id: userId, page, per_page: perPage },
    });
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function deletePost(postId: string): Promise<void> {
  try {
    await api.delete(API_ENDPOINTS.socialPostDelete(postId));
  } catch (err) {
    handleError(err);
  }
}

// ── Poll API ──────────────────────────────────────────────────────────────────

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

export async function fetchPoll(postId: string): Promise<PollResponse | null> {
  try {
    const { data } = await api.get<PollResponse>(API_ENDPOINTS.newsPoll(postId));
    return data;
  } catch {
    return null; // No poll or error
  }
}

export async function createPollApi(
  postId: string,
  title: string,
  options: string[],
  endDate?: string,
): Promise<PollResponse> {
  try {
    const body: Record<string, unknown> = { title, options };
    if (endDate) body.end_date = endDate;
    const { data } = await api.post<PollResponse>(API_ENDPOINTS.newsPoll(postId), body);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function votePollApi(
  postId: string,
  optionId: string,
): Promise<PollResponse> {
  try {
    const { data } = await api.post<PollResponse>(API_ENDPOINTS.newsPollVote(postId), {
      option_id: optionId,
    });
    return data;
  } catch (err) {
    handleError(err);
  }
}

// ── Uploads API ──────────────────────────────────────────────────────────────

export interface UploadResponse {
  url: string;
  filename: string;
}

/**
 * Upload an image file to the backend.
 * Accepts a local file URI (from expo-image-picker) and uploads it as multipart/form-data.
 * Returns the server URL path for the uploaded image.
 */
export async function uploadImageApi(uri: string, filename?: string, mimeType?: string): Promise<UploadResponse> {
  try {
    const formData = new FormData();
    const name = filename || uri.split('/').pop() || 'photo.jpg';
    const type = mimeType || (name.endsWith('.png') ? 'image/png' : 'image/jpeg');

    // React Native FormData accepts this shape for file uploads
    formData.append('file', {
      uri,
      name,
      type,
    } as unknown as Blob);

    const { data } = await api.post<UploadResponse>(API_ENDPOINTS.upload, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000, // larger timeout for file uploads
    });
    return data;
  } catch (err) {
    handleError(err);
  }
}

/**
 * Convert a relative upload URL (/api/uploads/xxx.png) to a full URL.
 */
export function getUploadUrl(path: string): string {
  if (path.startsWith('http')) return path;
  // Strip /api prefix since API_BASE_URL already includes it
  const cleanPath = path.startsWith('/api/') ? path.slice(4) : path;
  return `${API_BASE_URL}${cleanPath}`;
}

// ── Admin API ──────────────────────────────────────────────────────────────

export interface AdminInvitation {
  id: string;
  code: string;
  role: string;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
  fullyUsed: boolean;
}

export interface AdminStats {
  users: number;
  posts: number;
  scrapedArticles: number;
  comments: number;
  activeInvitations: number;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
  createdAt: string;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  try {
    const { data } = await api.get<AdminStats>(API_ENDPOINTS.adminStats);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function fetchAdminInvitations(): Promise<{ invitations: AdminInvitation[] }> {
  try {
    const { data } = await api.get<{ invitations: AdminInvitation[] }>(API_ENDPOINTS.adminInvitations);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function createInvitation(params: {
  role?: string;
  max_uses?: number;
  expires_hours?: number;
}): Promise<AdminInvitation> {
  try {
    const { data } = await api.post<AdminInvitation>(API_ENDPOINTS.adminInvitations, params);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function revokeInvitation(codeId: string): Promise<void> {
  try {
    await api.delete(`${API_ENDPOINTS.adminInvitations}/${codeId}`);
  } catch (err) {
    handleError(err);
  }
}

export async function fetchAdminUsers(): Promise<{ users: AdminUser[] }> {
  try {
    const { data } = await api.get<{ users: AdminUser[] }>(API_ENDPOINTS.adminUsers);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function updateAdminUser(
  userId: string,
  updates: { role?: string; active?: boolean },
): Promise<AdminUser> {
  try {
    const { data } = await api.patch<AdminUser>(`${API_ENDPOINTS.adminUsers}/${userId}`, updates);
    return data;
  } catch (err) {
    handleError(err);
  }
}

// ── Info API ──────────────────────────────────────────────────────────────────

export interface InfoContact {
  name: string;
  phone?: string;
  email?: string;
  room?: string;
  position?: string;
}

export interface InfoContactCategory {
  category: string;
  items: InfoContact[];
}

export interface InfoLink {
  title: string;
  url: string;
  icon: string;
}

export interface InfoHours {
  place: string;
  address: string;
  schedule: string;
  note: string;
}

export interface InfoProgram {
  name: string;
  degree: string;
  duration: string;
}

export interface InfoFaq {
  q: string;
  a: string;
}

export interface InfoGeneralContact {
  address: string;
  phone: string;
  email: string;
}

export interface FacultyInfoResponse {
  contacts: InfoContactCategory[];
  links: InfoLink[];
  hours: InfoHours[];
  programs: InfoProgram[];
  faq: InfoFaq[];
  general_contact?: InfoGeneralContact;
}

export async function fetchFacultyInfo(lang: string = 'lt'): Promise<FacultyInfoResponse> {
  try {
    const { data } = await api.get<FacultyInfoResponse>(API_ENDPOINTS.info, {
      params: { lang },
    });
    return data;
  } catch (err) {
    handleError(err);
  }
}

// ── Push Notifications API ──────────────────────────────────────────────────

export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android' | 'web' | 'unknown' = 'unknown',
): Promise<{ registered: boolean; tokenId: string }> {
  try {
    const { data } = await api.post<{ registered: boolean; tokenId: string }>(
      API_ENDPOINTS.notificationsRegister,
      { token, platform },
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await api.delete(API_ENDPOINTS.notificationsRegister, { data: { token } });
  } catch {
    // Best-effort — don't throw if server rejects
  }
}

// ── Notification Channels API ──────────────────────────────────────────────

export type NotificationChannel = 'news' | 'chat' | 'schedule' | 'admin';

export interface NotificationChannelsResponse {
  channels: Record<NotificationChannel, boolean>;
}

export async function fetchNotificationChannels(): Promise<NotificationChannelsResponse> {
  try {
    const { data } = await api.get<NotificationChannelsResponse>(API_ENDPOINTS.notificationChannels);
    return data;
  } catch (err) {
    handleError(err);
  }
}

export async function updateNotificationChannels(
  channels: Partial<Record<NotificationChannel, boolean>>,
): Promise<NotificationChannelsResponse> {
  try {
    const { data } = await api.put<NotificationChannelsResponse>(
      API_ENDPOINTS.notificationChannels,
      { channels },
    );
    return data;
  } catch (err) {
    handleError(err);
  }
}

// ── Health ───────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    await api.get(API_ENDPOINTS.health);
    return true;
  } catch {
    return false;
  }
}

export default api;
