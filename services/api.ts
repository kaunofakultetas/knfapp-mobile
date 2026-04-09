/**
 * Centralized API client for knfapp-backend.
 *
 * Uses axios with automatic token injection from AsyncStorage.
 * All backend communication goes through this module.
 */

import { API_BASE_URL, API_ENDPOINTS } from '@/constants/Api';
import type { NewsPost, User } from '@/types';
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
  invitation_code: string;
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
