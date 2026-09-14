// -----------------------------------------------------------
//  [*] API — chat
//
//  REST side of messaging: conversations, message history,
//  reactions, pinning, read state and the people search that
//  starts a new chat. Live delivery (new_message, typing,
//  read receipts) is services/socket.ts — this module is what
//  loads history and what the composer posts through.
//
//  Timestamp contract: every `time` field here (ApiMessage,
//  MessageSearchResult, ApiConversation.lastMessage) is
//  preformatted SERVER-SIDE in UTC and is 2–3 h off in
//  Lithuania. Screens must IGNORE `time` and format the ISO
//  `createdAt` (or lastUpdatedMs) locally via
//  services/format.ts.
//
//  Reaction REST responses carry the authoritative
//  `reactions` array (wire shape — no bySelf) and the react
//  helpers resolve to it, so the acting client reconciles
//  immediately; the same state is also broadcast on the
//  'reaction_update' socket event, the cross-client path.
//
//  Split into:
//
//    ApiConversation       — one conversation-list row
//    ApiMessage            — one message of a conversation
//    ConversationsResponse — the conversation list
//    MessagesResponse      — one history page
//    SearchUserResult      — user search hit
//    MessageSearchResult   — in-conversation search hit
//    ApiReactionGroup      — wire shape of one emoji group
//    fetchConversations    — list all conversations
//    createConversation    — start a direct/group chat
//    fetchMessages         — paged history (newest first)
//    sendMessageApi        — post text and/or an image
//    reactToMessageApi     — set own reaction
//    removeReactionApi     — clear own reaction
//    togglePinApi          — pin/unpin a conversation
//    markConversationRead  — clear the unread counter
//    fetchTotalUnreadCount — badge total across conversations
//    deleteConversationApi — leave/delete a conversation
//    searchMessagesApi     — text search inside a conversation
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
// file header).
//
// Used by:
//   - ConversationsResponse (below)
//   - app/(main)/tabs/messages.tsx — conversation rows
//   - components/chat/ConversationRow.tsx — row rendering
// -----------------------------------------------------------

export interface ApiConversation {
  id: string;
  type: 'direct' | 'group';
  title: string;
  avatarEmoji?: string;
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
    // text | image | video | file | system — previews name the
    // kind when there is no text
    kind?: ApiMessageKind;
    time: string;
    senderId: string;
    senderName: string;
    // The last message was unsent — previews show a placeholder
    deleted?: boolean;
  };
}







// -----------------------------------------------------------
// ApiMessageKind
// -----------------------------------------------------------
//
// text | image | video | file | system — what a message row IS,
// so previews and bubbles can branch without sniffing fields.
//
// Used by:
//   - ApiConversation (above), ApiMessage, SendMessageExtra
// -----------------------------------------------------------

export type ApiMessageKind = 'text' | 'image' | 'video' | 'file' | 'system';







// -----------------------------------------------------------
// ApiAttachment
// -----------------------------------------------------------
//
// A document / video attachment as stored (migration v57).
//
// Used by:
//   - ApiMessage, SendMessageExtra (below)
// -----------------------------------------------------------

export interface ApiAttachment {
  url: string;
  name: string;
  size: number;
  mime: string;
}







// -----------------------------------------------------------
// ApiMedia
// -----------------------------------------------------------
//
// What a photo / video message knows about its frame (v58):
// natural size, duration in seconds, the poster's upload path.
//
// Used by:
//   - ApiMessage, SendMessageExtra (below)
// -----------------------------------------------------------

export interface ApiMedia {
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
}







// -----------------------------------------------------------
// ApiMessage
// -----------------------------------------------------------
//
// Format createdAt (ISO) for display and ignore `time` — see
// the file header. imageUrl is a relative upload path that
// screens resolve with getUploadUrl.
//
// Used by:
//   - MessagesResponse, sendMessageApi (below)
//   - hooks/chat/useChatMessages.ts — history + live merge
//   - app/(main)/chat-room/index.tsx — the message list
// -----------------------------------------------------------

export interface ApiMessage {
  id: string;
  // The sender's optimistic clientId, echoed back on own rows
  // so the app can adopt the matching temp bubble by id
  clientMsgId?: string | null;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
  imageUrl?: string | null;
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
  // Quoted message of a reply (null when not a reply); the
  // quote of an unsent message keeps the sender, loses content
  replyTo?: {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    imageUrl?: string | null;
    deleted: boolean;
    kind?: ApiMessageKind;
    fileName?: string | null;
  } | null;
  // Unsent by its sender — text/imageUrl arrive blank
  deleted?: boolean;
  kind?: ApiMessageKind;
  editedAt?: string | null;
  attachment?: ApiAttachment | null;
  media?: ApiMedia | null;
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
// MessagesResponse
// -----------------------------------------------------------
//
// One history page: hasMore says an older page exists past
// the cursor, while participants and conversation describe
// the whole room, not the page — they repeat identically on
// every page fetched.
//
// Used by:
//   - fetchMessages (below)
//   - hooks/chat/useChatMessages.ts — paging state
// -----------------------------------------------------------

export interface MessagesResponse {
  messages: ApiMessage[];
  hasMore: boolean;
  // Every member — the room header and intro card draw from it
  participants: { id: string; displayName: string; avatarUrl?: string | null }[];
  // The conversation row — type/title for rooms opened without
  // route params (push notifications)
  conversation: { id: string; type: 'direct' | 'group'; title?: string | null; avatarEmoji?: string | null } | null;
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
// fetchMessages
// -----------------------------------------------------------
//
//   fetchMessages(convId)          — latest page
//   fetchMessages(convId, beforeCreatedAt, 50, beforeId)
//     — the page older than the (stamp, id) cursor: the server
//       pages on created_at with the id as tiebreak, so pass
//       BOTH fields of the oldest loaded message — the id keeps
//       equal-stamp siblings from being skipped across a page
//       boundary (stamp-only still works, minus the tiebreak)
//
// Used by:
//   - hooks/chat/useChatMessages.ts — history + scroll-back
// -----------------------------------------------------------

export const fetchMessages = (convId: string, before?: string, limit = 50, beforeId?: string) =>
  request(
    api.get<MessagesResponse>(`/chat/conversations/${encodeURIComponent(convId)}/messages`, {
      params: {
        limit,
        ...(before ? { before } : {}),
        ...(before && beforeId ? { before_id: beforeId } : {}),
      },
    }),
  );







// -----------------------------------------------------------
// SendMessageExtra
// -----------------------------------------------------------
//
// The optional third rail of a send: an uploaded attachment,
// its media frame data, and the explicit kind.
//
// Used by:
//   - sendMessageApi (below) — the `extra` parameter
// -----------------------------------------------------------

export interface SendMessageExtra {
  // A document or a video (uploaded first — uploadFileApi)
  attachment?: ApiAttachment;
  // The frame size / duration / poster of a photo or video
  media?: ApiMedia;
  kind?: ApiMessageKind;
}







// -----------------------------------------------------------
// sendMessageApi
// -----------------------------------------------------------
//
// Text and image are both optional at the type level but the
// backend rejects an empty body — callers send at least one.
// imageUrl must be the RELATIVE path from uploadImageApi;
// replyToId quotes a message of the same conversation.
// clientMsgId is the optimistic temp's clientId — the backend
// stores it uniquely per sender and answers a repeat with the
// EXISTING row, so a timed-out-but-committed send that is
// retried never duplicates the message.
//
// Used by:
//   - hooks/chat/useChatComposer.ts — the send action
// -----------------------------------------------------------

export const sendMessageApi = (
  convId: string,
  text: string,
  imageUrl?: string,
  replyToId?: string,
  clientMsgId?: string,
  extra?: SendMessageExtra,
) =>
  request(
    api.post<{ message: ApiMessage }>(`/chat/conversations/${encodeURIComponent(convId)}/messages`, {
      ...(text ? { text } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}),
      ...(extra?.attachment ? { attachment: extra.attachment } : {}),
      ...(extra?.media ? { media: extra.media } : {}),
      ...(extra?.kind ? { kind: extra.kind } : {}),
    }),
  );







// -----------------------------------------------------------
// editMessageApi
// -----------------------------------------------------------
//
// The sender rewrites their own text; the backend stamps
// editedAt and broadcasts 'message_edited' to the room (the
// hook applies the echo like everyone else's).
//
// Used by:
//   - hooks/chat/useChatComposer.ts — edit mode
// -----------------------------------------------------------

export const editMessageApi = (convId: string, msgId: string, text: string) =>
  request(
    api.put<{ id: string; text: string; editedAt: string }>(
      `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(msgId)}`,
      { text },
    ),
  );







// -----------------------------------------------------------
// deleteMessageApi
// -----------------------------------------------------------
//
// "Unsend" — only the sender may call it (403 otherwise). The
// backend clears the content, keeps the row and broadcasts
// 'message_deleted'; the hook updates optimistically and
// reverts on failure.
//
// Used by:
//   - hooks/chat/useChatMessages.ts — deleteMessage
// -----------------------------------------------------------

export async function deleteMessageApi(convId: string, msgId: string): Promise<void> {
  await request(api.delete(`/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(msgId)}`));
}







// -----------------------------------------------------------
// ApiReactionGroup
// -----------------------------------------------------------
//
// One emoji group as the react endpoints and the socket's
// reaction_update carry it — NO bySelf on the wire; consumers
// recompute it from byUserIds and the session user id.
//
// Used by:
//   - reactToMessageApi, removeReactionApi (below)
//   - hooks/chat/useChatReactions.ts — applying the REST echo
// -----------------------------------------------------------

export interface ApiReactionGroup {
  emoji: string;
  count: number;
  byUserIds: string[];
}







// -----------------------------------------------------------
// reactToMessageApi
// -----------------------------------------------------------
//
// Resolves to the authoritative `reactions` array from the
// response body so the acting client reconciles at once; the
// 'reaction_update' socket event carries the same state to
// every other client.
//
// Used by:
//   - hooks/chat/useChatReactions.ts — set/replace own reaction
// -----------------------------------------------------------

export async function reactToMessageApi(
  convId: string,
  msgId: string,
  emoji: string,
): Promise<ApiReactionGroup[]> {
  const data = await request(
    api.post<{ reactions: ApiReactionGroup[] }>(
      `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(msgId)}/react`,
      { emoji },
    ),
  );
  return data.reactions;
}







// -----------------------------------------------------------
// removeReactionApi
// -----------------------------------------------------------
//
// Resolves to the authoritative `reactions` array, exactly
// like reactToMessageApi above.
//
// Used by:
//   - hooks/chat/useChatReactions.ts — clear own reaction
// -----------------------------------------------------------

export async function removeReactionApi(convId: string, msgId: string): Promise<ApiReactionGroup[]> {
  const data = await request(
    api.delete<{ reactions: ApiReactionGroup[] }>(
      `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(msgId)}/react`,
    ),
  );
  return data.reactions;
}







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
// markConversationRead
// -----------------------------------------------------------
//
// PUT /chat/conversations/<id>/read — advances the caller's
// read watermark (never backwards) and writes per-message
// receipts; 'messages_read' goes out only when something was
// actually new. Shares one 10-per-10 s budget with the
// socket's mark_read (429 beyond it).
//
// Used by:
//   - hooks/chat/useChatMessages.ts — on open and on new message
// -----------------------------------------------------------

export async function markConversationRead(convId: string): Promise<void> {
  await request(api.put(`/chat/conversations/${encodeURIComponent(convId)}/read`));
}







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
// -----------------------------------------------------------

export const searchUsersApi = (q: string) =>
  request(api.get<{ users: SearchUserResult[] }>('/chat/users/search', { params: { q } }));
