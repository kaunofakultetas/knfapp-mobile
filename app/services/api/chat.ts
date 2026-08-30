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
    time: string;
    senderId: string;
    senderName: string;
    // The last message was unsent — previews show a placeholder
    deleted?: boolean;
  };
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
  } | null;
  // Unsent by its sender — text/imageUrl arrive blank
  deleted?: boolean;
}







// -----------------------------------------------------------
// ConversationsResponse
// -----------------------------------------------------------
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

export const sendMessageApi = (convId: string, text: string, imageUrl?: string, replyToId?: string, clientMsgId?: string) =>
  request(
    api.post<{ message: ApiMessage }>(`/chat/conversations/${encodeURIComponent(convId)}/messages`, {
      ...(text ? { text } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}),
    }),
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
// Used by:
//   - app/(main)/tabs/messages.tsx — row pin action
// -----------------------------------------------------------

export const togglePinApi = (convId: string) =>
  request(api.put<{ pinned: boolean }>(`/chat/conversations/${encodeURIComponent(convId)}/pin`));







// -----------------------------------------------------------
// markConversationRead
// -----------------------------------------------------------
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
// Used by:
//   - hooks/useUnreadCount.ts — the messages tab badge
// -----------------------------------------------------------

export const fetchTotalUnreadCount = () =>
  request(api.get<{ unreadCount: number }>('/chat/unread-count'));







// -----------------------------------------------------------
// deleteConversationApi
// -----------------------------------------------------------
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
// fetchOnlineStatus
// -----------------------------------------------------------
//
// Fail-soft: presence is decoration, so any failure resolves
// to null and callers KEEP their previous map — a failed poll
// must never assert everyone offline. Ids go out in chunks of
// 200 (the endpoint's cap) and the maps are merged, so no id
// past the cap is silently dropped.
//
// Used by:
//   - app/(main)/tabs/messages.tsx — online dots on rows
//   - app/(main)/chat-room/index.tsx — the header presence dot
// -----------------------------------------------------------

export async function fetchOnlineStatus(
  userIds: string[],
): Promise<Record<string, boolean> | null> {
  try {
    const online: Record<string, boolean> = {};
    for (let i = 0; i < userIds.length; i += 200) {
      const data = await request(
        api.post<{ online: Record<string, boolean> }>('/chat/online-status', {
          userIds: userIds.slice(i, i + 200),
        }),
      );
      Object.assign(online, data.online);
    }
    return online;
  } catch {
    return null;
  }
}







// -----------------------------------------------------------
// searchUsersApi
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/new-chat/index.tsx — the people search box
// -----------------------------------------------------------

export const searchUsersApi = (q: string) =>
  request(api.get<{ users: SearchUserResult[] }>('/chat/users/search', { params: { q } }));
