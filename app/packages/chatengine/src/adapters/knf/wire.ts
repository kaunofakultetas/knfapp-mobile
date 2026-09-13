// -----------------------------------------------------------
//  [*] chatengine — knf adapter: wire
//
//  The KNF backend's JSON shapes (backend/app/chat/routes.py,
//  events.py, uploads/routes.py) and their mapping into the
//  engine's domain types. REST rows and Socket.IO payloads
//  share the message shape; `time` is server-formatted UTC and
//  is dropped — the engine formats createdAt.
//
//  Split into:
//
//    Api* types      — the wire contract
//    toChatMessage   — ApiMessage → ChatMessage
//    mapReply / mapContent — the row's parts
//    toParticipant / toConversationMeta / toMessagesPage
// -----------------------------------------------------------

import type { MessagesPage } from '../../core/transport';
import type { ChatMessage, ChatMessageKind, ChatReplyRef, ConversationMeta, Participant, ReactionGroup } from '../../core/types';







// -----------------------------------------------------------
// ApiMessageKind
// -----------------------------------------------------------
//
// The wire's kind string — the same closed set as the domain's.
//
// Used by:
//   - ApiMessage / ApiReply (below) — the `kind` field
// -----------------------------------------------------------

export type ApiMessageKind = ChatMessageKind;







// -----------------------------------------------------------
// ApiAttachment
// -----------------------------------------------------------
//
// The stored file/video/voice reference on a row.
//
// Used by:
//   - ApiMessage (below) — the `attachment` field
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
// Pixel size, duration, poster and preview of a row's media.
//
// Used by:
//   - ApiMessage (below) — the `media` field
// -----------------------------------------------------------

export interface ApiMedia {
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
  preview?: string | null;
  waveform?: number[] | null;
}







// -----------------------------------------------------------
// ApiReply
// -----------------------------------------------------------
//
// The quoted-message snapshot the backend joins into a reply
// row.
//
// Used by:
//   - ApiMessage (below) — the `replyTo` field
//   - mapReply (below) — mapped into ChatReplyRef
// -----------------------------------------------------------

export interface ApiReply {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
  deleted: boolean;
  kind?: ApiMessageKind;
  fileName?: string | null;
}







// -----------------------------------------------------------
// ApiReactionGroup
// -----------------------------------------------------------
//
// One emoji group as the wire carries it — bySelf is the
// server's viewer-relative answer, kept optional.
//
// Used by:
//   - ApiMessage / ApiReactionUpdate (below)
//   - toReactionGroups (below) / rest.ts — reaction responses
// -----------------------------------------------------------

export interface ApiReactionGroup {
  emoji: string;
  count: number;
  byUserIds: string[];
  bySelf?: boolean;
}







// -----------------------------------------------------------
// ApiMessage
// -----------------------------------------------------------
//
// One message row as REST and Socket.IO both carry it.
//
// Used by:
//   - toChatMessage (below) — mapped into the domain row
//   - rest.ts / socket.ts — response and event payloads
// -----------------------------------------------------------

export interface ApiMessage {
  id: string;
  clientMsgId?: string | null;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string | null;
  imageUrl?: string | null;
  // Server-formatted UTC, kept on the wire for older builds — dropped by the mapping
  time: string;
  createdAt: string;
  isOwn?: boolean;
  status?: 'sent' | 'delivered' | 'read';
  readBy?: string[];
  reactions?: ApiReactionGroup[];
  replyTo?: ApiReply | null;
  deleted?: boolean;
  kind?: ApiMessageKind;
  editedAt?: string | null;
  attachment?: ApiAttachment | null;
  media?: ApiMedia | null;
  linkPreview?: ApiLinkPreview | null;
  gallery?: { url: string; width?: number | null; height?: number | null; preview?: string | null }[] | null;
  forwarded?: boolean;
  expiresAt?: string | null;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
}







// -----------------------------------------------------------
// ApiLinkPreview
// -----------------------------------------------------------
//
// The unfurled link card as the backend stores it.
//
// Used by:
//   - ApiMessage / ApiMessageUpdatedEvent (below and above)
// -----------------------------------------------------------

export interface ApiLinkPreview {
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageUrl?: string | null;
  imagePreview?: string | null;
}







// -----------------------------------------------------------
// ApiMessageUpdatedEvent
// -----------------------------------------------------------
//
// Socket.IO: the server patched a row after the send.
//
// Used by:
//   - socket.ts — the message_updated event payload
// -----------------------------------------------------------

export interface ApiMessageUpdatedEvent {
  conversationId: string;
  messageId: string;
  patch: { linkPreview?: ApiLinkPreview | null; pinnedAt?: string | null; pinnedBy?: string | null };
}







// -----------------------------------------------------------
// ApiConversationUpdatedEvent
// -----------------------------------------------------------
//
// Socket.IO: a room setting changed (the disappearing window).
//
// Used by:
//   - socket.ts — the conversation_updated event payload
// -----------------------------------------------------------

export interface ApiConversationUpdatedEvent {
  conversationId: string;
  patch: { messageTtlSeconds?: number | null };
}







// -----------------------------------------------------------
// ApiMessagesResponse
// -----------------------------------------------------------
//
// The history page envelope REST answers.
//
// Used by:
//   - toMessagesPage / toConversationMeta (below)
//   - rest.ts — fetchMessages' response type
// -----------------------------------------------------------

export interface ApiMessagesResponse {
  messages: ApiMessage[];
  hasMore: boolean;
  // Newer rows beyond the page — only an around / after window
  hasNewer?: boolean;
  participants: { id: string; displayName: string; avatarUrl?: string | null }[];
  conversation: { id: string; type: 'direct' | 'group'; title?: string | null; avatarEmoji?: string | null; messageTtlSeconds?: number | null } | null;
  // The server clock at the time of the page (v59)
  cursor?: string;
}







// -----------------------------------------------------------
// ApiChangesResponse
// -----------------------------------------------------------
//
// The change-feed answer: full changed rows plus the next
// cursor.
//
// Used by:
//   - rest.ts — fetchChanges' response type
// -----------------------------------------------------------

export interface ApiChangesResponse {
  messages: ApiMessage[];
  cursor: string;
}







// -----------------------------------------------------------
// ApiUploadResponse
// -----------------------------------------------------------
//
// What the uploads endpoint answers for one stored asset.
//
// Used by:
//   - rest.ts — upload's response type
// -----------------------------------------------------------

export interface ApiUploadResponse {
  url: string;
  filename: string;
  name?: string;
  size?: number;
  mime?: string;
  width?: number | null;
  height?: number | null;
  preview?: string | null;
}







// -----------------------------------------------------------
// ApiMessageDeletedEvent
// -----------------------------------------------------------
//
// Socket.IO: a sender unsent a row.
//
// Used by:
//   - socket.ts — the message_deleted event payload
// -----------------------------------------------------------

export interface ApiMessageDeletedEvent {
  conversationId: string;
  messageId: string;
}







// -----------------------------------------------------------
// ApiMessageEditedEvent
// -----------------------------------------------------------
//
// Socket.IO: a sender edited a row's text.
//
// Used by:
//   - socket.ts — the message_edited event payload
// -----------------------------------------------------------

export interface ApiMessageEditedEvent {
  conversationId: string;
  messageId: string;
  text: string;
  editedAt: string;
}







// -----------------------------------------------------------
// ApiReactionUpdate
// -----------------------------------------------------------
//
// Socket.IO: a row's full reaction state after a change.
//
// Used by:
//   - socket.ts — the reaction_update event payload
// -----------------------------------------------------------

export interface ApiReactionUpdate {
  conversationId: string;
  messageId: string;
  reactions: ApiReactionGroup[];
}







// -----------------------------------------------------------
// ApiTypingEvent
// -----------------------------------------------------------
//
// Socket.IO: someone started typing.
//
// Used by:
//   - socket.ts — the user_typing event payload
// -----------------------------------------------------------

export interface ApiTypingEvent {
  conversationId: string;
  userId: string;
  displayName: string;
}







// -----------------------------------------------------------
// ApiStopTypingEvent
// -----------------------------------------------------------
//
// Socket.IO: someone stopped typing.
//
// Used by:
//   - socket.ts — the user_stop_typing event payload
// -----------------------------------------------------------

export interface ApiStopTypingEvent {
  conversationId: string;
  userId: string;
}







// -----------------------------------------------------------
// ApiMessagesReadEvent
// -----------------------------------------------------------
//
// Socket.IO: a reader's receipts landed on a set of rows.
//
// Used by:
//   - socket.ts — the messages_read event payload
// -----------------------------------------------------------

export interface ApiMessagesReadEvent {
  conversationId: string;
  readerId: string;
  messageIds: string[];
}







// -----------------------------------------------------------
// mapReply
// -----------------------------------------------------------
//
// The quoted-message snapshot of a reply, or undefined when
// the row answers nothing.
//
// Used by:
//   - toChatMessage (below) — its only caller; nothing imports
//     the export at the moment
// -----------------------------------------------------------

export const mapReply = (reply: ApiReply | null | undefined): ChatReplyRef | undefined =>
  reply
    ? {
        id: reply.id,
        senderId: reply.senderId,
        senderName: reply.senderName,
        text: reply.text ?? '',
        imageUrl: reply.imageUrl || undefined,
        deleted: !!reply.deleted,
        kind: reply.kind,
        fileName: reply.fileName || undefined,
      }
    : undefined;







// -----------------------------------------------------------
// mapContent
// -----------------------------------------------------------
//
// A 'video' row's attachment is the video, its media the frame
// and the poster; a 'file' row's attachment is the document; a
// photo row only has the frame.
//
// Used by:
//   - toChatMessage (below) — its only caller; nothing imports
//     the export at the moment
// -----------------------------------------------------------

export const mapContent = (m: Pick<ApiMessage, 'kind' | 'editedAt' | 'attachment' | 'media'>): Pick<ChatMessage, 'kind' | 'editedAt' | 'file' | 'video' | 'audio' | 'mediaSize' | 'mediaPreview'> => {
  const kind = m.kind ?? undefined;
  const media = m.media ?? undefined;
  const mediaSize = media && media.width && media.height ? { width: media.width, height: media.height } : undefined;
  const attachment = m.attachment ?? undefined;
  return {
    kind,
    editedAt: m.editedAt ?? undefined,
    mediaSize,
    file: kind === 'file' && attachment ? { name: attachment.name, uri: attachment.url, size: attachment.size, mimeType: attachment.mime } : undefined,
    video:
      kind === 'video' && attachment
        ? { uri: attachment.url, thumbnailUri: media?.thumbnailUrl || undefined, duration: media?.duration ?? undefined, size: attachment.size, mimeType: attachment.mime, name: attachment.name }
        : undefined,
    audio:
      kind === 'audio' && attachment
        ? { uri: attachment.url, duration: media?.duration ?? undefined, size: attachment.size, mimeType: attachment.mime, name: attachment.name, waveform: media?.waveform ?? undefined }
        : undefined,
    mediaPreview: media?.preview ?? undefined,
  };
};







// -----------------------------------------------------------
// toReactionGroups
// -----------------------------------------------------------
//
// Reaction groups as broadcast — also maps a bare 'reactions'
// payload on its own, outside a full row.
//
// Used by:
//   - toChatMessage (below)
//   - rest.ts — setReaction / removeReaction responses
//   - index.ts — the socket's reaction_update events
// -----------------------------------------------------------

export const toReactionGroups = (groups: readonly ApiReactionGroup[] | null | undefined): ReactionGroup[] =>
  (groups ?? []).map((r) => ({ emoji: r.emoji, count: r.count ?? r.byUserIds.length, byUserIds: r.byUserIds ?? [] }));







// -----------------------------------------------------------
// toChatMessage
// -----------------------------------------------------------
//
// ApiMessage → ChatMessage, the whole row. isOwn / bySelf are
// left for the engine to derive from the viewer; the backend's
// own answers are kept where present.
//
// Used by:
//   - toMessagesPage (below)
//   - rest.ts — sends, the change feed, pins
//   - index.ts — the socket's new_message events
// -----------------------------------------------------------

export function toChatMessage(m: ApiMessage): ChatMessage {
  const isOwn = !!m.isOwn;
  return {
    id: m.id,
    clientId: m.clientMsgId || undefined,
    conversationId: m.conversationId,
    senderId: m.senderId,
    senderName: m.senderName,
    senderAvatar: m.senderAvatar || undefined,
    text: m.text ?? '',
    imageUrl: m.imageUrl || undefined,
    createdAt: m.createdAt,
    isOwn,
    status: m.status ?? (isOwn ? 'sent' : 'read'),
    readBy: m.readBy,
    reactions: toReactionGroups(m.reactions).map((r) => ({ ...r, bySelf: false })),
    replyTo: mapReply(m.replyTo),
    deleted: !!m.deleted,
    ...mapContent(m),
    linkPreview: m.linkPreview ?? undefined,
    gallery: m.gallery ?? undefined,
    forwarded: !!m.forwarded,
    expiresAt: m.expiresAt ?? undefined,
    pinnedAt: m.pinnedAt ?? undefined,
    pinnedBy: m.pinnedBy ?? undefined,
  };
}







// -----------------------------------------------------------
// toParticipant
// -----------------------------------------------------------
//
// One member row — an empty avatarUrl reads as "none".
//
// Used by:
//   - toMessagesPage (below) — its only caller; nothing
//     imports the export at the moment
// -----------------------------------------------------------

export const toParticipant = (p: { id: string; displayName: string; avatarUrl?: string | null }): Participant => ({
  id: p.id,
  displayName: p.displayName,
  avatarUrl: p.avatarUrl || undefined,
});







// -----------------------------------------------------------
// toConversationMeta
// -----------------------------------------------------------
//
// The conversation card, or null when the response carries
// none.
//
// Used by:
//   - toMessagesPage (below) — its only caller; nothing
//     imports the export at the moment
// -----------------------------------------------------------

export const toConversationMeta = (c: ApiMessagesResponse['conversation']): ConversationMeta | null =>
  c ? { id: c.id, type: c.type, title: c.title ?? null, avatarEmoji: c.avatarEmoji ?? null, messageTtlSeconds: c.messageTtlSeconds ?? null } : null;







// -----------------------------------------------------------
// toMessagesPage
// -----------------------------------------------------------
//
// The page envelope: rows, members, the conversation card and
// the change-feed cursor, mapped in one go.
//
// Used by:
//   - rest.ts — fetchMessages' response
// -----------------------------------------------------------

export function toMessagesPage(resp: ApiMessagesResponse): MessagesPage {
  return {
    messages: resp.messages.map(toChatMessage),
    hasMore: !!resp.hasMore,
    hasNewer: !!resp.hasNewer,
    participants: (resp.participants ?? []).map(toParticipant),
    conversation: toConversationMeta(resp.conversation),
    cursor: resp.cursor,
  };
}
