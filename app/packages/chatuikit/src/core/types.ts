// -----------------------------------------------------------
//  [*] chatuikit — types
//
//  The kit is presentational: it renders messages it is
//  handed and calls back on every intent (send, react, reply,
//  delete, open image…). The message shapes below are the
//  kit's own contract — a host's message type only has to be
//  structurally compatible (extra fields are fine).
//
//  Split into:
//
//    KitMessage / KitReaction / KitReply — the message shapes
//    KitMessageKind / KitFile / KitVideo / KitMediaSize /
//    messageKind                         — what a bubble carries
//    KitMessageAction                    — host-supplied menu rows
//    GroupPosition                       — bubble's place in a run
//    TimelineItem                        — list rows
//    BubbleFrame / ContextTarget         — long-press geometry
// -----------------------------------------------------------

import type { Ionicons } from '@expo/vector-icons';







// -----------------------------------------------------------
// KitIconName
// -----------------------------------------------------------
//
// An Ionicons glyph name — the icon vocabulary the kit draws
// with.
//
// Used by:
//   - KitMessageAction (below) — a host row's icon
//   - menu/MessageContextMenu.tsx (MenuRowSpec),
//     message/attachments/FileCard.tsx
// -----------------------------------------------------------

export type KitIconName = keyof typeof Ionicons.glyphMap;







// -----------------------------------------------------------
// KitMessageKind
// -----------------------------------------------------------
//
// What a bubble carries. `kind` is optional on the wire: absent
// means "text, or a photo when imageUrl/localImageUri is set,
// a video when `video` is set, a document when `file` is" —
// messageKind() resolves it, so hosts that only ever send text
// and photos never set it. 'system' rows (joins, renames…) are
// centred captions: no bubble, no avatar, no receipts, never
// grouped into a run, never actionable.
// 'custom' is the extension point: the host renders it through
// the provider's components.MessageBody; any kind this build does
// not know renders the unsupported placeholder instead of a blank
// bubble (forward compatibility with a newer backend).
//
// Used by:
//   - KitMessage / KitReply / messageKind (below)
// -----------------------------------------------------------

export type KitMessageKind = 'text' | 'image' | 'video' | 'file' | 'audio' | 'system' | 'custom';







// -----------------------------------------------------------
// KNOWN_KINDS
// -----------------------------------------------------------
//
// The kind strings this build can render — KitMessageKind as a
// runtime list, since the wire value may come from a NEWER
// backend than this build knows.
//
// Used by:
//   - message/MessageBubble.tsx — anything not in here renders
//     the unsupported placeholder instead of a blank bubble
// -----------------------------------------------------------

export const KNOWN_KINDS: readonly string[] = ['text', 'image', 'video', 'file', 'audio', 'system', 'custom'];







// -----------------------------------------------------------
// KitFile
// -----------------------------------------------------------
//
// A document attachment: the card shows the name and the size,
// a tap hands `uri` to the host's link handler.
//
// Used by:
//   - KitMessage (below) — the `file` field
//   - message/attachments/FileCard.tsx
// -----------------------------------------------------------

export interface KitFile {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
}







// -----------------------------------------------------------
// KitVideo
// -----------------------------------------------------------
//
// A video attachment. The bubble shows the poster (thumbnailUri,
// resolved like any image; localThumbnailUri while an own send
// is still uploading) with a play disc and the duration; a tap
// hands the message to onPressVideo — the host decides how it
// plays (the kit ships VideoPlayerModal for the common case).
//
// Used by:
//   - KitMessage (below) — the `video` field
//   - message/attachments/VideoAttachment.tsx
// -----------------------------------------------------------

export interface KitVideo {
  uri: string;
  thumbnailUri?: string;
  localThumbnailUri?: string;
  // Seconds
  duration?: number;
  size?: number;
  mimeType?: string;
  name?: string;
}







// -----------------------------------------------------------
// KitMediaSize
// -----------------------------------------------------------
//
// The natural pixel size of a photo or a video frame. Handed
// in by hosts that know it (an upload response, the picker),
// so the bubble is laid out at its final size on the first
// frame — no 4:3 guess, no jump when the bytes arrive.
//
// Used by:
//   - KitMessage (below) — the `mediaSize` field
//   - message/attachments/ImageAttachment.tsx /
//     VideoAttachment.tsx
// -----------------------------------------------------------

export interface KitMediaSize {
  width: number;
  height: number;
}







// -----------------------------------------------------------
// KitLinkPreview
// -----------------------------------------------------------
//
// The card of a text message's first link, unfurled by the
// host's backend (never by the kit); imageUrl resolves like
// any stored image.
//
// Used by:
//   - KitMessage (below) — the `linkPreview` field
//   - message/attachments/LinkPreviewCard.tsx
// -----------------------------------------------------------

export interface KitLinkPreview {
  url: string;
  title: string;
  description: string;
  siteName: string;
  imageUrl?: string | null;
  imagePreview?: string | null;
}







// -----------------------------------------------------------
// KitReaction
// -----------------------------------------------------------
//
// One emoji's aggregate on a message — the pill under the
// bubble.
//
// Used by:
//   - KitMessage (below) — the `reactions` field
//   - message/ReactionPills.tsx
// -----------------------------------------------------------

export interface KitReaction {
  emoji: string;
  count: number;
  bySelf: boolean;
  byUserIds: string[];
}







// -----------------------------------------------------------
// KitReply
// -----------------------------------------------------------
//
// The quoted message a reply carries — enough for the one-line
// snippet, never the whole original.
//
// Used by:
//   - KitMessage (below) — the `replyTo` field
//   - message/ReplyQuote.tsx, composer/Composer.tsx — the
//     replying-to strip
// -----------------------------------------------------------

export interface KitReply {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
  deleted: boolean;
  // What the quoted message carried, so the one-line snippet can
  // say "Video" / the file's name instead of falling silent
  kind?: KitMessageKind;
  fileName?: string;
}







// -----------------------------------------------------------
// KitMessageStatus
// -----------------------------------------------------------
//
// An own message's delivery state — drives the receipt line
// under the run's last bubble and the failed-send affordance.
//
// Used by:
//   - KitMessage (below) — the `status` field
// -----------------------------------------------------------

export type KitMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';







// -----------------------------------------------------------
// KitMessage
// -----------------------------------------------------------
//
// The kit's message contract — a host's message type only has
// to be structurally compatible (extra fields are fine). The
// field comments below carry each field's story.
//
// Used by:
//   - every kit component and hook — the row's payload
//   - the host's chat screens — what they map their wire
//     messages into
// -----------------------------------------------------------

export interface KitMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
  imageUrl?: string;
  // ISO timestamp
  createdAt: string;
  isOwn: boolean;
  status: KitMessageStatus;
  // Ids of members who have read an OWN message (the sender's
  // own id included) — group bubbles claim 'read' only once
  // every other member is in here
  readBy?: string[];
  reactions: KitReaction[];
  replyTo?: KitReply;
  // Unsent by its sender — text/image are blank, a placeholder renders
  deleted?: boolean;
  // The optimistic temp id an own message was born with — kept
  // after the server swap so the list row keeps its key
  clientId?: string;
  // The picked asset's local uri, shown until the uploaded
  // image is cached (own photo sends only)
  localImageUri?: string;
  // See KitMessageKind — optional, resolved by messageKind()
  kind?: KitMessageKind;
  // The attachment of a 'file' message
  file?: KitFile;
  // The attachment of a 'video' message
  video?: KitVideo;
  // A 'custom' message's payload, for the host's MessageBody slot
  custom?: unknown;
  // The unfurled card of the first link (null until it lands)
  linkPreview?: KitLinkPreview | null;
  // Several photos in one message (2+): stored paths once sent,
  // the picked assets' local uris while still uploading
  gallery?: KitGalleryItem[] | null;
  audio?: KitAudio;
  // The photo's / poster's ~14px micro copy (a data URI) — the
  // blur drawn while the real bytes download
  mediaPreview?: string | null;
  // Re-sent from another room — the small marker row
  forwarded?: boolean;
  // Disappearing messages: the row's hard-delete deadline (the
  // tiny timer glyph beside the time)
  expiresAt?: string | null;
  // Pinned by a member (the banner + the host's menu action)
  pinnedAt?: string | null;
  pinnedBy?: string | null;
  // Own optimistic rows: the running upload's fraction (0..1)
  uploadProgress?: number;
  // Natural size of the photo / video frame (see KitMediaSize)
  mediaSize?: KitMediaSize;
  // ISO timestamp of the sender's last edit — the bubble adds
  // an "edited" mark to its time line
  editedAt?: string | null;
}







// -----------------------------------------------------------
// KitGalleryItem
// -----------------------------------------------------------
//
// One photo of a multi-photo message.
//
// Used by:
//   - KitMessage (above) — the `gallery` field
//   - message/attachments/GalleryAttachment.tsx
// -----------------------------------------------------------

export interface KitGalleryItem {
  url: string;
  width?: number | null;
  height?: number | null;
  // The tile's micro copy (a data URI)
  preview?: string | null;
}







// -----------------------------------------------------------
// KitMemeItem
// -----------------------------------------------------------
//
// One shared-library meme the picker's grid offers.
//
// Used by:
//   - composer/MemePicker.tsx — the grid's tiles
// -----------------------------------------------------------

export interface KitMemeItem {
  id: string;
  url: string;
  title: string;
  width?: number | null;
  height?: number | null;
  // The ~14px micro copy blurring the tile
  preview?: string | null;
}







// -----------------------------------------------------------
// KitMentionCandidate
// -----------------------------------------------------------
//
// A member the composer's mention strip can offer.
//
// Used by:
//   - composer/Composer.tsx — the `mentionCandidates` prop and
//     the strip's rows
// -----------------------------------------------------------

export interface KitMentionCandidate {
  id: string;
  name: string;
  avatarUrl?: string | null;
}







// -----------------------------------------------------------
// KitAudio
// -----------------------------------------------------------
//
// A voice note (kind 'audio'): the clip and its length — a
// local uri while an own send still uploads.
//
// Used by:
//   - KitMessage (above) — the `audio` field
//   - message/attachments/AudioAttachment.tsx
// -----------------------------------------------------------

export interface KitAudio {
  uri: string;
  duration?: number;
  size?: number;
  mimeType?: string;
  name?: string;
  // Amplitude bars (0..1) — drawn instead of the plain track
  waveform?: number[] | null;
}







// -----------------------------------------------------------
// messageKind
// -----------------------------------------------------------
//
// Resolves the optional wire `kind` from what the message
// actually carries — an explicit kind wins, then video, audio,
// photo (imageUrl / local uri / gallery), file, and text last —
// so hosts that only ever send text and photos never set it.
//
// Used by:
//   - message/MessageBubble.tsx, list/MessageList.tsx,
//     list/PinnedBanner.tsx, core/timeline.ts
// -----------------------------------------------------------

export function messageKind(message: KitMessage): KitMessageKind {
  if (message.kind) return message.kind;
  if (message.video) return 'video';
  if (message.audio) return 'audio';
  if (message.imageUrl || message.localImageUri || message.gallery?.length) return 'image';
  if (message.file) return 'file';
  return 'text';
}







// -----------------------------------------------------------
// KitMessageAction
// -----------------------------------------------------------
//
// A host-supplied row of the long-press menu (Report, Pin,
// Forward…), appended between the kit's own rows. `visible`
// decides per message; absent means always.
//
// Used by:
//   - menu/MessageContextMenu.tsx — buildMenuRows' `actions`
//   - app/(main)/chat-room/index.tsx — the host's rows
// -----------------------------------------------------------

export interface KitMessageAction {
  id: string;
  label: string;
  icon: KitIconName;
  destructive?: boolean;
  visible?: (message: KitMessage) => boolean;
  onPress: (message: KitMessage) => void;
}







// -----------------------------------------------------------
// GroupPosition
// -----------------------------------------------------------
//
// Where a bubble sits in a run of consecutive messages from
// the same sender — drives corner rounding, sender name,
// avatar and the receipt line.
//
// Used by:
//   - TimelineItem / ContextTarget (below)
//   - core/timeline.ts — buildTimeline assigns it
//   - message/MessageBubble.tsx — draws by it
// -----------------------------------------------------------

export type GroupPosition = 'single' | 'first' | 'middle' | 'last';







// -----------------------------------------------------------
// TimelineItem
// -----------------------------------------------------------
//
// One row of the rendered list: a message with its place in a
// run, a time separator, or the "new messages" line above the
// first unread row.
//
// Used by:
//   - core/timeline.ts — buildTimeline's return
//   - list/MessageList.tsx — the `items` prop
// -----------------------------------------------------------

export type TimelineItem =
  | { type: 'message'; key: string; message: KitMessage; position: GroupPosition }
  | { type: 'separator'; key: string; day: string; time: string }
  // The "new messages" line above the first unread row
  | { type: 'unread'; key: string; count: number };







// -----------------------------------------------------------
// BubbleFrame
// -----------------------------------------------------------
//
// Window-space rectangle of a bubble, measured on long-press so
// the context menu can float a copy of it in place.
//
// Used by:
//   - ContextTarget (below) — the `frame` it carries
// -----------------------------------------------------------

export interface BubbleFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}







// -----------------------------------------------------------
// ContextTarget
// -----------------------------------------------------------
//
// Everything the long-press hands the context menu: the
// message, its place in the run and the measured frame the
// floating copy mounts over.
//
// Used by:
//   - message/MessageBubble.tsx — built in onLongPress
//   - menu/MessageContextMenu.tsx / hooks/useContextMenu.ts /
//     list/MessageList.tsx
// -----------------------------------------------------------

export interface ContextTarget {
  message: KitMessage;
  position: GroupPosition;
  frame: BubbleFrame;
  // The photo / poster ratio the bubble already measured, so the
  // menu's floating copy mounts at the real size instead of the
  // 4:3 guess
  imageRatio?: number;
}
