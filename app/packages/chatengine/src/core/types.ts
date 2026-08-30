// -----------------------------------------------------------
//  [*] chatengine — types
//
//  The engine's domain model: what a conversation's rows look
//  like once an adapter has mapped its backend's wire shape.
//  Every hook reads and writes THIS shape, every adapter
//  produces it, and any UI that is structurally compatible
//  with it (chatuikit's KitMessage is) renders it unchanged.
//
//  Split into:
//
//    ChatMessageKind / ChatFile / ChatVideo — what a row carries
//    ChatReaction / ChatReplyRef            — the row's parts
//    ChatMessage                            — one row
//    ChatUser / Participant / ConversationMeta
//    TEMP_ID_PREFIX / isTempId              — optimistic rows
// -----------------------------------------------------------


// text | image | video | file | system. Absent on the wire means
// "text, or image when imageUrl is set"
// 'custom' carries a host-defined payload (`custom`) that the UI
// renders through its own slot; any other kind a newer backend
// invents reaches the UI unchanged and renders as unsupported
export type ChatMessageKind = 'text' | 'image' | 'video' | 'file' | 'audio' | 'system' | 'custom';

export type ChatMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

// A document attachment (kind 'file')
export interface ChatFile {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
}

// A video attachment (kind 'video'): the stored clip, its poster
// (an uploaded frame), the local poster while an own send is
// still uploading, and the duration in seconds
export interface ChatVideo {
  uri: string;
  thumbnailUri?: string;
  localThumbnailUri?: string;
  duration?: number;
  size?: number;
  mimeType?: string;
  name?: string;
}

// A voice note (kind 'audio'): the stored clip and its length.
// The uri is local on an optimistic row still uploading
export interface ChatAudio {
  uri: string;
  duration?: number;
  size?: number;
  mimeType?: string;
  name?: string;
  // Amplitude bars (0..1, at most 64) the player draws
  waveform?: number[] | null;
}

// The card of the first URL in a message's text, unfurled by
// the backend after the send (never by the client — a link must
// not beacon every reader to a stranger's host). imageUrl is a
// stored reference like any photo
export interface ChatLinkPreview {
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageUrl?: string | null;
  imagePreview?: string | null;
}

export interface ChatReaction {
  emoji: string;
  count: number;
  // Whether the CURRENT user is in byUserIds — the engine
  // recomputes it on every ingest, adapters may leave it false
  bySelf: boolean;
  byUserIds: string[];
}

// The quoted message inside a reply — a snapshot the backend
// joins in, not a live reference. `deleted` is true when the
// quoted message was since unsent; text/image are blank then
export interface ChatReplyRef {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
  deleted: boolean;
  kind?: ChatMessageKind;
  fileName?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
  imageUrl?: string;
  // ISO timestamp (the adapter's job is to hand over something
  // parseStamp() reads — see core/time.ts)
  createdAt: string;
  isOwn: boolean;
  status: ChatMessageStatus;
  // Ids of members who have read an OWN message (the sender's
  // own id included) — receipts accumulate here so a group
  // bubble only claims 'read' once every other member has read
  readBy?: string[];
  reactions: ChatReaction[];
  replyTo?: ChatReplyRef;
  // Unsent by its sender — content is blank, a placeholder renders
  deleted?: boolean;
  // The optimistic temp id an own message was born with — kept
  // on the server row after the swap so a list row keeps its key
  clientId?: string;
  // The picked asset's local uri, shown until the uploaded image
  // is cached (own photo sends only)
  localImageUri?: string;
  kind?: ChatMessageKind;
  // ISO stamp of the sender's last edit
  editedAt?: string | null;
  file?: ChatFile;
  video?: ChatVideo;
  audio?: ChatAudio;
  // Natural pixel size of the photo / video frame
  mediaSize?: { width: number; height: number };
  // A 'custom' message's payload — opaque to the engine
  custom?: unknown;
  // Null until the backend's unfurl lands (an 'updated' event)
  linkPreview?: ChatLinkPreview | null;
  // Several photos in one message (2+). Each url is a stored
  // path once sent — or the picked asset's local uri on an
  // optimistic row still uploading
  gallery?: ChatGalleryItem[] | null;
  // The photo's / poster's ~14px micro copy (a data URI) — the
  // blur every reader draws before the bytes
  mediaPreview?: string | null;
  // Re-sent from another room — the mark is the only trace
  forwarded?: boolean;
  // Disappearing messages: the hard-delete deadline stamped at
  // send; clients drop the row by their own clock too
  expiresAt?: string | null;
  // Pinned by a member (any member may pin / unpin)
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  // Own optimistic rows only: the running upload's fraction
  // (0..1) while the bytes go up
  uploadProgress?: number;
}

// One photo of a multi-photo message
export interface ChatGalleryItem {
  url: string;
  width?: number | null;
  height?: number | null;
  // The ~14px micro copy shown while the tile downloads
  preview?: string | null;
}

// The signed-in user as the engine needs them: for optimistic
// rows, echo dedupe and bySelf flags
export interface ChatUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

// A conversation member as the history page lists them
export interface Participant {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

// The conversation row — type/title for a room opened without
// its own metadata (a push notification)
export interface ConversationMeta {
  id: string;
  type: 'direct' | 'group';
  title?: string | null;
  avatarEmoji?: string | null;
  // Disappearing messages: the room's window (null/absent = off)
  messageTtlSeconds?: number | null;
}

// A reaction group as backends broadcast it (no viewer-relative
// bySelf — the engine derives that)
export interface ReactionGroup {
  emoji: string;
  count: number;
  byUserIds: string[];
}


// Optimistic rows only exist client-side; their ids carry this
// prefix so the echo dedupe and the resync merge can tell them
// from server rows
export const TEMP_ID_PREFIX = 'temp-';

export const isTempId = (id: string): boolean => id.startsWith(TEMP_ID_PREFIX);
