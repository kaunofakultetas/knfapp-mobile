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
//   - chatkit (reaction pills + action sheet), components/chat/ReactionsViewer.tsx
// -----------------------------------------------------------

export interface ChatReaction {
  emoji: string;
  count: number;
  bySelf: boolean;
  byUserIds: string[];
}







// -----------------------------------------------------------
// ChatReplyRef
// -----------------------------------------------------------
//
// The quoted message inside a reply bubble — a snapshot the
// backend joins in, not a live reference. `deleted` is true
// when the quoted message was since unsent; the text/image
// are blank then and the bubble shows the placeholder.
//
// Used by:
//   - ChatMessage (below)
//   - chatkit — the reply quote inside bubbles + the composer
//     reply strip
// -----------------------------------------------------------

export interface ChatReplyRef {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
  deleted: boolean;
  // What the quoted message carried (the quote line says
  // "Video" / the file's name when there is no text)
  kind?: ChatMessageKind;
  fileName?: string;
}

// text | image | video | file | system — see the backend's
// messages.kind (migration v57)
export type ChatMessageKind = 'text' | 'image' | 'video' | 'file' | 'system';

// A document attachment (kind 'file')
export interface ChatFile {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
}

// A video attachment (kind 'video'): the stored video path, its
// poster (an uploaded frame), the local poster while an own send
// is still uploading, and the duration in seconds
export interface ChatVideo {
  uri: string;
  thumbnailUri?: string;
  localThumbnailUri?: string;
  duration?: number;
  size?: number;
  mimeType?: string;
  name?: string;
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
//   - chatkit — MessageBubble, MessageList, timeline
// -----------------------------------------------------------

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
  imageUrl?: string;
  createdAt: string;
  isOwn: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  // Ids of members who have read an OWN message (the sender's
  // own id included) — receipts accumulate here so group
  // bubbles only claim 'read' once every other member has read
  readBy?: string[];
  reactions: ChatReaction[];
  // Present on replies; the composer builds it optimistically
  replyTo?: ChatReplyRef;
  // Unsent by its sender — text/image are blank, a placeholder renders
  deleted?: boolean;
  // The optimistic temp id an own message was born with — kept on
  // the server row after the swap so the list row keeps its key
  clientId?: string;
  // The picked asset's local uri, shown until the uploaded image
  // is cached (own photo sends only)
  localImageUri?: string;
  // See ChatMessageKind — absent means text / photo (by imageUrl)
  kind?: ChatMessageKind;
  // ISO stamp of the sender's last edit (the bubble marks it)
  editedAt?: string | null;
  file?: ChatFile;
  video?: ChatVideo;
  // Natural pixel size of the photo / video frame, so the bubble
  // is laid out at its final size before the bytes arrive
  mediaSize?: { width: number; height: number };
}
