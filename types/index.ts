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

// Next-gen Chats (supports direct and group conversations)
export type ConversationType = 'direct' | 'group';

export interface ConversationParticipant {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  time: string; // formatted time string for display
  status?: 'sent' | 'read';
  liked?: boolean;
  imageUrl?: string;
  reactions?: { emoji: string; count?: number; bySelf?: boolean; byUserIds?: string[] }[];
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string; // for direct, derived from the other participant; for group, group name
  participants: ConversationParticipant[];
  messages: ChatMessage[]; // kept inline for now (can be paginated later)
  unreadCount?: number;
  lastUpdatedMs?: number;
  pinned?: boolean;
  avatarEmoji?: string; // for group avatar placeholder
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
  'chat-room': { conversationId: string; title: string; type?: ConversationType };
};

export type TabRoutes = {
  'news': undefined;
  'messages': undefined;
};