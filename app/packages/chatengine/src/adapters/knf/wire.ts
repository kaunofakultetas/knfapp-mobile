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
//    toParticipant / toConversationMeta
// -----------------------------------------------------------

import type { MessagesPage } from '../../core/transport';
import type { ChatMessage, ChatMessageKind, ChatReplyRef, ConversationMeta, Participant, ReactionGroup } from '../../core/types';


export type ApiMessageKind = ChatMessageKind;

export interface ApiAttachment {
  url: string;
  name: string;
  size: number;
  mime: string;
}

export interface ApiMedia {
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
  preview?: string | null;
  waveform?: number[] | null;
}

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

export interface ApiReactionGroup {
  emoji: string;
  count: number;
  byUserIds: string[];
  bySelf?: boolean;
}

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

export interface ApiLinkPreview {
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageUrl?: string | null;
  imagePreview?: string | null;
}

// Socket.IO: the server patched a row after the send
export interface ApiMessageUpdatedEvent {
  conversationId: string;
  messageId: string;
  patch: { linkPreview?: ApiLinkPreview | null; pinnedAt?: string | null; pinnedBy?: string | null };
}

// Socket.IO: a room setting changed (the disappearing window)
export interface ApiConversationUpdatedEvent {
  conversationId: string;
  patch: { messageTtlSeconds?: number | null };
}

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

export interface ApiChangesResponse {
  messages: ApiMessage[];
  cursor: string;
}

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

// Socket.IO payloads
export interface ApiMessageDeletedEvent {
  conversationId: string;
  messageId: string;
}
export interface ApiMessageEditedEvent {
  conversationId: string;
  messageId: string;
  text: string;
  editedAt: string;
}
export interface ApiReactionUpdate {
  conversationId: string;
  messageId: string;
  reactions: ApiReactionGroup[];
}
export interface ApiTypingEvent {
  conversationId: string;
  userId: string;
  displayName: string;
}
export interface ApiStopTypingEvent {
  conversationId: string;
  userId: string;
}
export interface ApiMessagesReadEvent {
  conversationId: string;
  readerId: string;
  messageIds: string[];
}







// -----------------------------------------------------------
// mapReply / mapContent / toChatMessage
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

// A 'video' row's attachment is the video, its media the frame
// and the poster; a 'file' row's attachment is the document; a
// photo row only has the frame
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

export const toReactionGroups = (groups: readonly ApiReactionGroup[] | null | undefined): ReactionGroup[] =>
  (groups ?? []).map((r) => ({ emoji: r.emoji, count: r.count ?? r.byUserIds.length, byUserIds: r.byUserIds ?? [] }));

// isOwn / bySelf are left for the engine to derive from the
// viewer; the backend's own answers are kept where present
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

export const toParticipant = (p: { id: string; displayName: string; avatarUrl?: string | null }): Participant => ({
  id: p.id,
  displayName: p.displayName,
  avatarUrl: p.avatarUrl || undefined,
});

export const toConversationMeta = (c: ApiMessagesResponse['conversation']): ConversationMeta | null =>
  c ? { id: c.id, type: c.type, title: c.title ?? null, avatarEmoji: c.avatarEmoji ?? null, messageTtlSeconds: c.messageTtlSeconds ?? null } : null;

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
