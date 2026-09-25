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
//    ChatSystemEvent                        — a 'system' row's event
//    ChatReaction / ChatReplyRef            — the row's parts
//    ChatMessage                            — one row
//    ChatUser / Participant / ConversationMeta
//    TEMP_ID_PREFIX / isTempId              — optimistic rows
// -----------------------------------------------------------







// -----------------------------------------------------------
// ChatMessageKind
// -----------------------------------------------------------
//
// text | image | video | file | system. Absent on the wire
// means "text, or image when imageUrl is set". 'custom'
// carries a host-defined payload (`custom`) that the UI
// renders through its own slot; any other kind a newer backend
// invents reaches the UI unchanged and renders as unsupported.
//
// Used by:
//   - ChatMessage / ChatReplyRef (below) — the `kind` field
//   - adapters/knf/wire.ts — ApiMessageKind mirrors it
// -----------------------------------------------------------

export type ChatMessageKind = 'text' | 'image' | 'video' | 'file' | 'audio' | 'system' | 'custom';







// -----------------------------------------------------------
// ChatMessageStatus
// -----------------------------------------------------------
//
// One own message's delivery ladder, as the bubble shows it.
//
// Used by:
//   - ChatMessage (below) — the `status` field
//   - index.ts — on the package surface for hosts typing UI
// -----------------------------------------------------------

export type ChatMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';







// -----------------------------------------------------------
// ChatFile
// -----------------------------------------------------------
//
// A document attachment (kind 'file').
//
// Used by:
//   - ChatMessage (below) — the `file` field
//   - index.ts — on the package surface for hosts typing UI
// -----------------------------------------------------------

export interface ChatFile {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
}







// -----------------------------------------------------------
// ChatVideo
// -----------------------------------------------------------
//
// A video attachment (kind 'video'): the stored clip, its
// poster (an uploaded frame), the local poster while an own
// send is still uploading, and the duration in seconds.
//
// Used by:
//   - ChatMessage (below) — the `video` field
//   - index.ts — on the package surface for hosts typing UI
// -----------------------------------------------------------

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
// ChatAudio
// -----------------------------------------------------------
//
// A voice note (kind 'audio'): the stored clip and its length.
// The uri is local on an optimistic row still uploading.
//
// Used by:
//   - ChatMessage (below) — the `audio` field; unlike its
//     siblings it is not re-exported by index.ts at the moment
// -----------------------------------------------------------

export interface ChatAudio {
  uri: string;
  duration?: number;
  size?: number;
  mimeType?: string;
  name?: string;
  // Amplitude bars (0..1, at most 64) the player draws
  waveform?: number[] | null;
}







// -----------------------------------------------------------
// ChatLinkPreview
// -----------------------------------------------------------
//
// The card of the first URL in a message's text, unfurled by
// the backend after the send (never by the client — a link
// must not beacon every reader to a stranger's host). imageUrl
// is a stored reference like any photo.
//
// Used by:
//   - ChatMessage (below) — the `linkPreview` field
//   - index.ts — on the package surface for hosts typing UI
// -----------------------------------------------------------

export interface ChatLinkPreview {
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageUrl?: string | null;
  imagePreview?: string | null;
}







// -----------------------------------------------------------
// ChatSystemEvent
// -----------------------------------------------------------
//
// What a 'system' row narrates, as a code plus parameters, so
// the UI words it in the READER's language with the row's
// sender as the actor. The KNF backend sends 'group_created'
// {title}, 'left', 'ttl_on' {seconds} and 'ttl_off'; any code a
// UI does not know — and every row written before events
// existed (no `system` at all) — falls back to the row's
// `text`, the backend's own prose.
//
// Used by:
//   - ChatMessage (below) — the `system` field
//   - adapters/knf/wire.ts — ApiMessage carries it as is
// -----------------------------------------------------------

export interface ChatSystemEvent {
  event: string;
  // 'group_created': the group's name as created
  title?: string;
  // 'ttl_on': the disappearing window, in seconds
  seconds?: number;
}







// -----------------------------------------------------------
// ChatReaction
// -----------------------------------------------------------
//
// One emoji group on a row, viewer-relative.
//
// Used by:
//   - ChatMessage (below) — the `reactions` list
//   - core/reducers.ts — recomputes bySelf on every ingest
// -----------------------------------------------------------

export interface ChatReaction {
  emoji: string;
  count: number;
  // Whether the CURRENT user is in byUserIds — the engine
  // recomputes it on every ingest, adapters may leave it false
  bySelf: boolean;
  byUserIds: string[];
}







// -----------------------------------------------------------
// ChatReplyRef
// -----------------------------------------------------------
//
// The quoted message inside a reply — a snapshot the backend
// joins in, not a live reference. `deleted` is true when the
// quoted message was since unsent; text/image are blank then.
//
// Used by:
//   - ChatMessage (below) — the `replyTo` field
//   - core/reducers.ts / adapters/knf/wire.ts — mapping both
//     ways
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// ChatMessage
// -----------------------------------------------------------
//
// One row of a conversation — THE shape of the engine: every
// hook reads and writes it, every adapter produces it, and a
// structurally compatible UI renders it unchanged.
//
// Used by:
//   - core/reducers.ts / outbox.ts / transport.ts — everywhere
//   - every hook, both testing doubles, the knf adapter
// -----------------------------------------------------------

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
  // A 'system' row's event (see ChatSystemEvent) — absent on
  // every other row and on system rows older than events
  system?: ChatSystemEvent | null;
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







// -----------------------------------------------------------
// ChatGalleryItem
// -----------------------------------------------------------
//
// One photo of a multi-photo message.
//
// Used by:
//   - ChatMessage (above) — the `gallery` list
//   - core/transport.ts — OutgoingMessage's gallery
// -----------------------------------------------------------

export interface ChatGalleryItem {
  url: string;
  width?: number | null;
  height?: number | null;
  // The ~14px micro copy shown while the tile downloads
  preview?: string | null;
}







// -----------------------------------------------------------
// ChatUser
// -----------------------------------------------------------
//
// The signed-in user as the engine needs them: for optimistic
// rows, echo dedupe and bySelf flags.
//
// Used by:
//   - provider/index.tsx — the env's `user`
//   - core/outbox.ts — rehydrating temp rows' sender
// -----------------------------------------------------------

export interface ChatUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}







// -----------------------------------------------------------
// Participant
// -----------------------------------------------------------
//
// A conversation member as the history page lists them.
//
// Used by:
//   - core/transport.ts — MessagesPage's participants
//   - hooks/useConversation.ts / adapters/knf/wire.ts /
//     testing/fakeTransport.ts
// -----------------------------------------------------------

export interface Participant {
  id: string;
  displayName: string;
  avatarUrl?: string;
}







// -----------------------------------------------------------
// ConversationMeta
// -----------------------------------------------------------
//
// The conversation row — type/title for a room opened without
// its own metadata (a push notification).
//
// Used by:
//   - core/transport.ts — MessagesPage's conversation
//   - hooks/useConversation.ts / adapters/knf/wire.ts /
//     testing/fakeTransport.ts
// -----------------------------------------------------------

export interface ConversationMeta {
  id: string;
  type: 'direct' | 'group';
  title?: string | null;
  avatarEmoji?: string | null;
  // Disappearing messages: the room's window (null/absent = off)
  messageTtlSeconds?: number | null;
}







// -----------------------------------------------------------
// ReactionGroup
// -----------------------------------------------------------
//
// A reaction group as backends broadcast it (no viewer-relative
// bySelf — the engine derives that).
//
// Used by:
//   - core/transport.ts — the 'reaction' ChatEvent
//   - core/reducers.ts / hooks/useReactions.ts — derive bySelf
//   - adapters/knf/rest.ts / wire.ts / testing/fakeTransport.ts
// -----------------------------------------------------------

export interface ReactionGroup {
  emoji: string;
  count: number;
  byUserIds: string[];
}







// -----------------------------------------------------------
// TEMP_ID_PREFIX
// -----------------------------------------------------------
//
// Optimistic rows only exist client-side; their ids carry this
// prefix so the echo dedupe and the resync merge can tell them
// from server rows.
//
// Used by:
//   - hooks/useComposer.ts — mints temp ids for own sends
//   - the host's chat room and message hooks — hide row
//     actions on a message that has no server id yet
// -----------------------------------------------------------

export const TEMP_ID_PREFIX = 'temp-';







// -----------------------------------------------------------
// isTempId
// -----------------------------------------------------------
//
// The prefix as a predicate — the form every filter uses.
//
// Used by:
//   - core/reducers.ts, core/outbox.ts — merge / rehydrate
//   - hooks/useComposer.ts, hooks/useConversation.ts — swap
//     and prune temp rows
//   - the host's chat room (context-menu isTemp guard)
// -----------------------------------------------------------

export const isTempId = (id: string): boolean => id.startsWith(TEMP_ID_PREFIX);
