// -----------------------------------------------------------
//  [*] API — chat
//
//  REST side of messaging OUTSIDE a room: the conversation
//  list and its row actions, the unread badge, the people
//  search that starts a chat, presence, and the in-room
//  search. Everything a room does with its messages — history
//  pages, sends, edits, unsends, reactions, pins, read marks —
//  goes through @knf/chatengine's knf adapter
//  (packages/chatengine/src/adapters/knf/rest.ts via
//  services/chatTransport.ts); live delivery is
//  services/socket.ts.
//
//  Timestamp contract: every `time` field here
//  (MessageSearchResult, ApiConversation.lastMessage) is
//  preformatted SERVER-SIDE in UTC and is 2–3 h off in
//  Lithuania. Screens must IGNORE `time` and format the ISO
//  `createdAt` (or lastUpdatedMs) locally via
//  services/format.ts.
//
//  Split into:
//
//    ApiConversation       — one conversation-list row
//    ApiMessageKind        — what a message row IS
//    ApiSystemEvent        — what a system row narrates
//    ConversationsResponse — the conversation list
//    SearchUserResult      — user search hit
//    MessageSearchResult   — in-conversation search hit
//    fetchConversations    — list all conversations
//    createConversation    — start a direct/group chat
//    togglePinApi          — pin/unpin a conversation
//    fetchTotalUnreadCount — badge total across conversations
//    deleteConversationApi — leave/delete a conversation
//    searchMessagesApi     — text search inside a conversation
//    PresenceResult        — the merged presence maps
//    fetchOnlineStatus     — presence lookup, fail-soft
//    searchUsersApi        — find people for a new chat
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';

// The backend role enum — one union for every user shape
import type { UserRole } from '@/types';







// -----------------------------------------------------------
// ApiConversation
// -----------------------------------------------------------
//
// Sort/recency comes from lastUpdatedMs (epoch ms) — not from
// lastMessage.time, which is server-formatted UTC (see the
// file header). `title` is NULL for a direct chat whose other
// member left (nobody left to name it after) — every reader
// renders messages.conversationFallback then.
//
// Used by:
//   - ConversationsResponse (below)
//   - app/(main)/tabs/messages.tsx — conversation rows
//   - app/(main)/chat-room/index.tsx — the forward sheet
//   - components/chat/ConversationRow.tsx — row rendering
// -----------------------------------------------------------

export interface ApiConversation {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  avatarEmoji?: string | null;
  pinned: boolean;
  unreadCount: number;
  lastUpdatedMs: number;
  participants: { id: string; displayName: string; avatarUrl?: string | null }[];
  lastMessage?: {
    id: string;
    // Null for a photo-only message (socket echoes send null,
    // the REST list blanks it) — previews fall back either way
    text: string | null;
    imageUrl?: string | null;
    // What the row IS — previews name the kind when there is no
    // text (a voice note is "Voice message", never "Photo")
    kind?: ApiMessageKind;
    time: string;
    senderId: string;
    senderName: string;
    // The last message was unsent — previews show a placeholder
    deleted?: boolean;
    // A system line's event — the preview words it in the
    // reader's language; absent on other rows and old ones
    system?: ApiSystemEvent | null;
  };
}







// -----------------------------------------------------------
// ApiMessageKind
// -----------------------------------------------------------
//
// text | image | video | file | audio | system — what a
// message row IS, the backend's own closed set (the send
// route stores 'audio' for a voice note), so previews and
// bubbles can branch without sniffing fields.
//
// Used by:
//   - ApiConversation (above)
// -----------------------------------------------------------

export type ApiMessageKind = 'text' | 'image' | 'video' | 'file' | 'audio' | 'system';







// -----------------------------------------------------------
// ApiSystemEvent
// -----------------------------------------------------------
//
// What a 'system' row narrates, as a code plus parameters —
// 'group_created' {title}, 'left', 'ttl_on' {seconds},
// 'ttl_off' — so a reader's own language words it (the row's
// text is the backend's Lithuanian fallback).
//
// Used by:
//   - ApiConversation (above)
//   - components/chat/conversationList.ts — the preview line
// -----------------------------------------------------------

export interface ApiSystemEvent {
  event: string;
  title?: string;
  seconds?: number;
}







// -----------------------------------------------------------
// ConversationsResponse
// -----------------------------------------------------------
//
// Rows arrive pinned first, then newest activity, each one
// complete — participants, last message, unreadCount — so the
// tab renders from this single call, no follow-up fetches.
//
// Used by:
//   - fetchConversations (below)
//   - app/(main)/tabs/messages.tsx — list state
// -----------------------------------------------------------

export interface ConversationsResponse {
  conversations: ApiConversation[];
}







// -----------------------------------------------------------
// SearchUserResult
// -----------------------------------------------------------
//
// Rows arrive RANKED — exact username hit, display-name
// prefix, then the rest — with deactivated accounts and both
// halves of a block pair already excluded. Deliberately no
// email on the wire.
//
// Used by:
//   - searchUsersApi (below)
//   - app/(main)/new-chat/index.tsx — people picker rows
//   - components/social/FindPeopleView.tsx — Find people rows
// -----------------------------------------------------------

export interface SearchUserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: UserRole;
}







// -----------------------------------------------------------
// MessageSearchResult
// -----------------------------------------------------------
//
// `time` is the server's UTC-preformatted HH:MM — 2–3 h off
// in Lithuania; render createdAt through services/format.ts
// instead. isOwn is computed server-side, sparing the screen
// a senderId comparison.
//
// Used by:
//   - searchMessagesApi (below)
//   - app/(main)/chat-room/index.tsx — in-chat search results
// -----------------------------------------------------------

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
  // A disappearing message's deadline — a hit that lapses
  // while the results are open leaves them
  expiresAt?: string | null;
}







// -----------------------------------------------------------
// fetchConversations
// -----------------------------------------------------------
//
// GET /chat/conversations — everything the caller belongs to,
// in one response with no paging: the backend answers the
// whole tab in four set-based queries and the sort (pinned,
// then activity) is already applied.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — the conversation list
//   - app/(main)/chat-room/index.tsx — the forward sheet's
//     room list
// -----------------------------------------------------------

export const fetchConversations = () =>
  request(api.get<ConversationsResponse>('/chat/conversations'));







// -----------------------------------------------------------
// createConversation
// -----------------------------------------------------------
//
// The backend joins every participant's live sockets into
// the new room at creation, so online recipients receive the
// first messages immediately; offline ones get the push.
//
// Used by:
//   - app/(main)/new-chat/index.tsx — start chat
// -----------------------------------------------------------

export const createConversation = (params: {
  participantIds: string[];
  type: 'direct' | 'group';
  title?: string;
  avatarEmoji?: string;
}) => request(api.post<{ conversationId: string }>('/chat/conversations', params));







// -----------------------------------------------------------
// togglePinApi
// -----------------------------------------------------------
//
// Flips the CALLER's pin — pins live on the membership row,
// per user, not on the conversation. The backend flips with
// one atomic UPDATE (racing toggles both land) and answers
// the new {pinned}; a non-member gets 403.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — row pin action
// -----------------------------------------------------------

export const togglePinApi = (convId: string) =>
  request(api.put<{ pinned: boolean }>(`/chat/conversations/${encodeURIComponent(convId)}/pin`));







// -----------------------------------------------------------
// fetchTotalUnreadCount
// -----------------------------------------------------------
//
// One flat count over every membership — other people's
// messages newer than the caller's watermark, unsent ones
// excluded: the same definition as the per-row unreadCount,
// so the tab badge and the row badges always agree.
//
// Used by:
//   - hooks/useUnreadCount.ts — the messages tab badge
// -----------------------------------------------------------

export const fetchTotalUnreadCount = () =>
  request(api.get<{ unreadCount: number }>('/chat/unread-count'));







// -----------------------------------------------------------
// deleteConversationApi
// -----------------------------------------------------------
//
// A LEAVE, not a delete: the caller's membership (and their
// receipts/reactions) go, the others keep the history with
// the leaver's messages still attributed — only the last
// member's leave purges the room itself. 403 for a room the
// caller never joined, 404 for an unknown one.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — row delete action
// -----------------------------------------------------------

export async function deleteConversationApi(convId: string): Promise<void> {
  await request(api.delete(`/chat/conversations/${encodeURIComponent(convId)}`));
}







// -----------------------------------------------------------
// searchMessagesApi
// -----------------------------------------------------------
//
// Case-insensitive substring over the room's un-unsent rows,
// members only. A blank q (or one over 200 chars) is a 400;
// the newest `limit` hits come back in chronological order,
// and `total` SATURATES at the server's cap — that exact
// value means "this many or more", not an exact count.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — in-conversation search
// -----------------------------------------------------------

export const searchMessagesApi = (convId: string, q: string, limit = 20) =>
  request(
    api.get<{ messages: MessageSearchResult[]; total: number }>(
      `/chat/conversations/${encodeURIComponent(convId)}/messages/search`,
      { params: { q, limit } },
    ),
  );







// -----------------------------------------------------------
// PresenceResult
// -----------------------------------------------------------
//
// The merged presence maps a poll resolves to — online flags
// plus each counterpart's last socket activity.
//
// Used by:
//   - fetchOnlineStatus (below) — the return shape
// -----------------------------------------------------------

export interface PresenceResult {
  online: Record<string, boolean>;
  lastSeen: Record<string, string | null>;
}







// -----------------------------------------------------------
// fetchOnlineStatus
// -----------------------------------------------------------
//
// Fail-soft: presence is decoration, so any failure resolves
// to null and callers KEEP their previous maps — a failed poll
// must never assert everyone offline. Ids go out in chunks of
// 200 (the endpoint's cap) and the maps are merged, so no id
// past the cap is silently dropped. lastSeen carries the
// counterpart's last socket activity (ISO, or null when the
// backend's relationship gate withheld it) — the "buvo
// aktyvus (-i) prieš X" line under a direct chat's title.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — online dots on rows
//   - app/(main)/chat-room/index.tsx — the header presence
//     dot and the last-active line
// -----------------------------------------------------------

export async function fetchOnlineStatus(userIds: string[]): Promise<PresenceResult | null> {
  try {
    const online: Record<string, boolean> = {};
    const lastSeen: Record<string, string | null> = {};
    for (let i = 0; i < userIds.length; i += 200) {
      const data = await request(
        api.post<PresenceResult>('/chat/online-status', {
          userIds: userIds.slice(i, i + 200),
        }),
      );
      Object.assign(online, data.online);
      Object.assign(lastSeen, data.lastSeen ?? {});
    }
    return { online, lastSeen };
  } catch {
    return null;
  }
}







// -----------------------------------------------------------
// searchUsersApi
// -----------------------------------------------------------
//
// Substring match on username OR display name, capped at 20
// ranked rows. Under 2 chars the server answers an empty 200
// — never a 400 — so the picker may fire on every keystroke;
// what stops enumeration is the 120-per-5-min budget, which
// every call spends.
//
// Used by:
//   - app/(main)/new-chat/index.tsx — the people search box
//   - components/social/FindPeopleView.tsx — the friends
//     screen's Find people search
// -----------------------------------------------------------

export const searchUsersApi = (q: string) =>
  request(api.get<{ users: SearchUserResult[] }>('/chat/users/search', { params: { q } }));
