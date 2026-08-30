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
//    UserRole                — the backend role enum
//    User                    — the signed-in account shape
//    AuthState               — AuthContext reducer state
//    ThemeSetting            — the three-way theme choice
//    AppSettings             — device-local settings
//    LoginForm               — login screen field values
//    ChatReplyRef            — the quoted message of a reply
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
  imageUrl?: string | null;
  author?: string | null;
  authorId?: string | null;
  source?: 'knf.vu.lt' | 'vu.lt' | 'faculty' | 'user' | 'app';
  sourceUrl?: string | null;
  summary?: string | null;
  postType?: 'article' | 'social' | 'announcement' | 'poll' | 'link';
  isPublic?: boolean;
  liked?: boolean;
  likes: number;
  comments: number;
  shares: number;
}







// -----------------------------------------------------------
// UserRole
// -----------------------------------------------------------
//
// The backend's role enum — ONE union for every user-shaped
// response, so a new role lands in a single place.
//
// Used by:
//   - User (below)
//   - services/api/chat.ts — SearchUserResult
//   - services/api/social.ts, services/api/admin.ts — user rows
// -----------------------------------------------------------

export type UserRole = 'student' | 'teacher' | 'admin' | 'curator';







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
  avatarUrl?: string | null;
  role: UserRole;
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
// Chat model
// -----------------------------------------------------------
//
// The conversation model is @knf/chatengine's — one shape from
// the transport to the bubbles (chatuikit's KitMessage is
// structurally the same). Re-exported under the app's names.
// -----------------------------------------------------------

export type {
  ChatFile,
  ChatLinkPreview,
  ChatMessage,
  ChatMessageKind,
  ChatReaction,
  ChatReplyRef,
  ChatVideo,
} from '@knf/chatengine';
