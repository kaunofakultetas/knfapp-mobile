// -----------------------------------------------------------
//  [*] chatkit — types
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


// An Ionicons glyph name — the icon vocabulary the kit draws with
export type KitIconName = keyof typeof Ionicons.glyphMap;

// What a bubble carries. `kind` is optional on the wire: absent
// means "text, or a photo when imageUrl/localImageUri is set,
// a video when `video` is set, a document when `file` is" —
// messageKind() resolves it, so hosts that only ever send text
// and photos never set it. 'system' rows (joins, renames…) are
// centred captions: no bubble, no avatar, no receipts, never
// grouped into a run, never actionable.
export type KitMessageKind = 'text' | 'image' | 'video' | 'file' | 'system';

// A document attachment: the card shows the name and the size,
// a tap hands `uri` to the host's link handler
export interface KitFile {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
}

// A video attachment. The bubble shows the poster (thumbnailUri,
// resolved like any image; localThumbnailUri while an own send
// is still uploading) with a play disc and the duration; a tap
// hands the message to onPressVideo — the host decides how it
// plays (the kit ships VideoPlayerModal for the common case)
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

// The natural pixel size of a photo or a video frame. Handed
// in by hosts that know it (an upload response, the picker),
// so the bubble is laid out at its final size on the first
// frame — no 4:3 guess, no jump when the bytes arrive
export interface KitMediaSize {
  width: number;
  height: number;
}

export interface KitReaction {
  emoji: string;
  count: number;
  bySelf: boolean;
  byUserIds: string[];
}

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

export type KitMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

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
  // Natural size of the photo / video frame (see KitMediaSize)
  mediaSize?: KitMediaSize;
  // ISO timestamp of the sender's last edit — the bubble adds
  // an "edited" mark to its time line
  editedAt?: string | null;
}


export function messageKind(message: KitMessage): KitMessageKind {
  if (message.kind) return message.kind;
  if (message.video) return 'video';
  if (message.imageUrl || message.localImageUri) return 'image';
  if (message.file) return 'file';
  return 'text';
}


// A host-supplied row of the long-press menu (Report, Pin,
// Forward…), appended between the kit's own rows. `visible`
// decides per message; absent means always
export interface KitMessageAction {
  id: string;
  label: string;
  icon: KitIconName;
  destructive?: boolean;
  visible?: (message: KitMessage) => boolean;
  onPress: (message: KitMessage) => void;
}

// Where a bubble sits in a run of consecutive messages from
// the same sender — drives corner rounding, sender name,
// avatar and the receipt line
export type GroupPosition = 'single' | 'first' | 'middle' | 'last';

export type TimelineItem =
  | { type: 'message'; key: string; message: KitMessage; position: GroupPosition }
  | { type: 'separator'; key: string; day: string; time: string }
  // The "new messages" line above the first unread row
  | { type: 'unread'; key: string; count: number };

// Window-space rectangle of a bubble, measured on long-press so
// the context menu can float a copy of it in place
export interface BubbleFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContextTarget {
  message: KitMessage;
  position: GroupPosition;
  frame: BubbleFrame;
  // The photo / poster ratio the bubble already measured, so the
  // menu's floating copy mounts at the real size instead of the
  // 4:3 guess
  imageRatio?: number;
}
