// -----------------------------------------------------------
//  [*] Types — the app's domain shapes
//
//  The UI-side truth for news, users, auth, settings and chat.
//  Raw server responses are typed inside services/api/* next
//  to their endpoints; screens receive THESE shapes after the
//  api layer (or a chat hook) has mapped them, so a backend
//  rename touches one mapper, not every screen.
//
//  ChatMessage is the ONE message shape the chat feature
//  renders — api rows and socket payloads both map into it.
//  Backend `time` strings are UTC-preformatted and must be
//  ignored; display times always come from formatting
//  `createdAt` through services/format.ts.
//
//  Split into:
//
//    NewsPost                — a feed article / community post
//    User                    — the signed-in account shape
//    AuthState               — AuthContext reducer state
//    ThemeSetting            — the three-way theme choice
//    AppSettings             — device-local settings
//    LoginForm               — login screen field values
//    ConversationType        — direct chat or group chat
//    ConversationParticipant — a member of a conversation
//    Conversation            — a chat-list row (no messages)
//    ChatReaction            — one emoji group on a message
//    ChatMessage             — the unified UI message shape
// -----------------------------------------------------------







// -----------------------------------------------------------
// NewsPost
// -----------------------------------------------------------
//
// One card of the news feed — scraped faculty articles and
// user community posts share this shape; `source` tells them
// apart and drives the source badge.
//
// Used by:
//   - services/api/news.ts, services/api/social.ts — feed and
//     single-post responses
//   - app/(main)/tabs/news.tsx, app/(main)/news-post/
//   - components/news/NewsCard.tsx
// -----------------------------------------------------------

export interface NewsPost {
  id: string;
  title: string;
  content: string;
  date: string;
  imageUrl?: string;
  author?: string;
  authorId?: string;
  source?: 'knf.vu.lt' | 'vu.lt' | 'faculty' | 'user' | 'app';
  sourceUrl?: string;
  summary?: string;
  postType?: string;
  isPublic?: boolean;
  liked?: boolean;
  likes: number;
  comments: number;
  shares: number;
}







// -----------------------------------------------------------
// User
// -----------------------------------------------------------
//
// The account shape the backend returns from auth and profile
// endpoints. The student-card fields (studentNumber, group,
// program) are nullable — guests and teachers leave them
// empty.
//
// Used by:
//   - context/AuthContext.tsx — the session user
//   - services/api/auth.ts, social.ts, admin.ts
//   - app/(main)/tabs/id.tsx, app/(main)/profile/
// -----------------------------------------------------------

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: 'student' | 'teacher' | 'admin' | 'curator';
  invited?: boolean;
  studentNumber?: string | null;
  studyGroup?: string | null;
  studyProgram?: string | null;
}







// -----------------------------------------------------------
// AuthState
// -----------------------------------------------------------
//
// The AuthContext reducer state. `error` holds the backend's
// message text for http failures and null otherwise — screens
// translate the null case themselves, keeping the context
// language-free.
//
// Used by:
//   - context/AuthContext.tsx — reducer + context value
// -----------------------------------------------------------

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error?: string | null;
}







// -----------------------------------------------------------
// ThemeSetting
// -----------------------------------------------------------
//
// The persisted three-way choice; 'system' resolves against
// the OS scheme at render time (see context/AppContext.tsx).
//
// Used by:
//   - AppSettings (below)
//   - context/AppContext.tsx — setTheme action
//   - app/(main)/tabs/settings.tsx — the theme control
// -----------------------------------------------------------

export type ThemeSetting = 'light' | 'dark' | 'system';







// -----------------------------------------------------------
// AppSettings
// -----------------------------------------------------------
//
// Everything the user can change without an account —
// persisted to AsyncStorage under 'app_settings'.
//
// Used by:
//   - context/AppContext.tsx — reducer state + hydration
// -----------------------------------------------------------

export interface AppSettings {
  language: 'lt' | 'en';
  theme: ThemeSetting;
  notifications: boolean;
  pinnedTabs: string[];
}







// -----------------------------------------------------------
// LoginForm
// -----------------------------------------------------------
//
// Used by:
//   - app/login.tsx — the credential form state
// -----------------------------------------------------------

export interface LoginForm {
  username: string;
  password: string;
}







// -----------------------------------------------------------
// ConversationType
// -----------------------------------------------------------
//
// Used by:
//   - Conversation (below)
//   - services/api/chat.ts — create/list endpoints
//   - app/(main)/chat-room/, app/(main)/new-chat/ — route
//     params and header layout
// -----------------------------------------------------------

export type ConversationType = 'direct' | 'group';







// -----------------------------------------------------------
// ConversationParticipant
// -----------------------------------------------------------
//
// Used by:
//   - Conversation (below)
//   - app/(main)/chat-room/ — header member info
// -----------------------------------------------------------

export interface ConversationParticipant {
  id: string;
  displayName: string;
  avatarUrl?: string;
}







// -----------------------------------------------------------
// Conversation
// -----------------------------------------------------------
//
// A chat-list row. Messages are NOT embedded — the room
// screen pages them separately through services/api/chat.ts,
// so list refreshes stay cheap.
//
// Used by:
//   - services/api/chat.ts — conversation list responses
//   - app/(main)/tabs/messages.tsx
//   - components/chat/ConversationRow.tsx
// -----------------------------------------------------------

export interface Conversation {
  id: string;
  type: ConversationType;
  // For direct chats derived from the other participant; for
  // groups it is the group name
  title: string;
  participants: ConversationParticipant[];
  unreadCount?: number;
  lastUpdatedMs?: number;
  pinned?: boolean;
  avatarEmoji?: string;
}







// -----------------------------------------------------------
// ChatReaction
// -----------------------------------------------------------
//
// One emoji group under a message — the aggregate count plus
// `bySelf` for toggle state and `byUserIds` for the viewer
// sheet.
//
// Used by:
//   - ChatMessage (below)
//   - hooks/chat/useChatReactions.ts
//   - components/chat/ReactionsPicker.tsx, ReactionsViewer.tsx
// -----------------------------------------------------------

export interface ChatReaction {
  emoji: string;
  count: number;
  bySelf: boolean;
  byUserIds: string[];
}







// -----------------------------------------------------------
// ChatMessage
// -----------------------------------------------------------
//
// The unified UI message shape: api history rows, socket
// payloads and optimistic local sends all map into this
// before rendering. `status` covers the optimistic lifecycle
// ('sending' → 'sent' → …, 'failed' enables retry). Display
// time is formatted from `createdAt` (ISO) — never from the
// backend's preformatted `time` strings, which are UTC.
//
// Used by:
//   - services/api/chat.ts — the row → UI mapper
//   - hooks/chat/useChatMessages.ts, useChatComposer.ts
//   - components/chat/MessageBubble.tsx, MessageList.tsx
// -----------------------------------------------------------

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  imageUrl?: string;
  createdAt: string;
  isOwn: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  reactions: ChatReaction[];
}
