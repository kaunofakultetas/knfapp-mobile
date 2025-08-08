// Navigation Types
export interface NavigationProps {
  navigation: any;
  route: any;
}

// Chat Types
export interface Message {
  id: string;
  text: string;
  time: string;
  user: string;
  isOwn?: boolean;
}

export interface ChatRoom {
  id: string;
  name: string;
  messages: Message[];
  unreadCount?: number;
  lastActivity?: string;
  lastUpdatedMs?: number;
  pinned?: boolean;
  memberCount?: number;
  avatarEmoji?: string;
}

// News Types
export interface NewsPost {
  id: string;
  title: string;
  content: string;
  date: string;
  imageUrl?: string;
  author?: string;
  likes: number;
  comments: number;
  shares: number;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  isSelected?: boolean;
}

export interface Poll {
  id: string;
  title: string;
  options: PollOption[];
  totalVotes: number;
  endDate?: string;
}

// User Types
export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: 'student' | 'teacher' | 'admin';
}

// Auth Types
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
}

// App State Types
export interface AppSettings {
  language: 'lt' | 'en';
  theme: 'light' | 'dark';
  notifications: boolean;
  pinnedTabs?: string[];
}

// Form Types
export interface LoginForm {
  username: string;
  password: string;
}

export interface FormField {
  value: string;
  error?: string;
  touched: boolean;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

// Component Props Types
export interface DrawerContentProps {
  navigation: any;
  state: any;
  descriptors: any;
}

export interface TabIconProps {
  focused: boolean;
  color: string;
  size?: number;
}

// Error Types
export interface AppError {
  code: string;
  message: string;
  details?: any;
}

// Loading States
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

// Routes
export type MainRoutes = {
  'tabs': undefined;
  // 'indoor-navigation': undefined; // removed
  'settings': undefined;
  'news-post': { postId: string };
  'chat-room': { id: string; name: string };
};

export type TabRoutes = {
  'news': undefined;
  'messages': undefined;
};