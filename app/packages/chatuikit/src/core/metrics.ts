// -----------------------------------------------------------
//  [*] chatuikit — metrics
//
//  The geometry every component agrees on, in one place.
//  Every value is density-independent pixels, except
//  BUBBLE_MAX_WIDTH — a percent string the native layout
//  takes.
//
//  Used by:
//    - chatuikit/message/MessageBubble.tsx, TypingBubble.tsx,
//      TimeSeparator.tsx, MessageList.tsx
// -----------------------------------------------------------







// -----------------------------------------------------------
// BUBBLE_RADIUS
// -----------------------------------------------------------
//
// The open bubble corner — every corner not facing a
// neighbour in a run.
//
// Used by:
//   - message/MessageBubble.tsx — corners by group position
// -----------------------------------------------------------

export const BUBBLE_RADIUS = 18;







// -----------------------------------------------------------
// BUBBLE_TIGHT_RADIUS
// -----------------------------------------------------------
//
// The flattened corner facing a neighbour in a run — what
// visually chains consecutive bubbles of one sender.
//
// Used by:
//   - message/MessageBubble.tsx — corners by group position
// -----------------------------------------------------------

export const BUBBLE_TIGHT_RADIUS = 5;







// -----------------------------------------------------------
// BUBBLE_PADDING_H
// -----------------------------------------------------------
//
// Inner horizontal padding around text.
//
// Used by:
//   - message/MessageBubble.tsx
//   - message/attachments/FileCard.tsx, LinkPreviewCard.tsx —
//     so cards align with the text above them
// -----------------------------------------------------------

export const BUBBLE_PADDING_H = 12;







// -----------------------------------------------------------
// BUBBLE_PADDING_V
// -----------------------------------------------------------
//
// Inner vertical padding around text.
//
// Used by:
//   - message/MessageBubble.tsx
//   - message/attachments/FileCard.tsx
// -----------------------------------------------------------

export const BUBBLE_PADDING_V = 8;







// -----------------------------------------------------------
// MEDIA_MAX_WIDTH_SHARE
// -----------------------------------------------------------
//
// Photos and video posters: the share of the viewport a media
// bubble may fill — a fixed 240 px photo on a tablet looked
// like a stamp. See core/media.ts fitMedia() for the fitting
// rule.
//
// Used by:
//   - core/media.ts — mediaBoxFor
// -----------------------------------------------------------

export const MEDIA_MAX_WIDTH_SHARE = 0.68;







// -----------------------------------------------------------
// MEDIA_MAX_WIDTH_CAP
// -----------------------------------------------------------
//
// The absolute cap on the viewport share above, so a wide
// tablet does not blow a photo up to poster size.
//
// Used by:
//   - core/media.ts — mediaBoxFor
// -----------------------------------------------------------

export const MEDIA_MAX_WIDTH_CAP = 320;







// -----------------------------------------------------------
// MEDIA_MAX_HEIGHT
// -----------------------------------------------------------
//
// The height cap — keeps a tall portrait from eating the
// screen.
//
// Used by:
//   - core/media.ts — mediaBoxFor
// -----------------------------------------------------------

export const MEDIA_MAX_HEIGHT = 320;







// -----------------------------------------------------------
// MEDIA_MIN_WIDTH
// -----------------------------------------------------------
//
// The width floor — keeps a sliver of a photo from collapsing
// into a line.
//
// Used by:
//   - core/media.ts — mediaBoxFor
// -----------------------------------------------------------

export const MEDIA_MIN_WIDTH = 120;







// -----------------------------------------------------------
// MEDIA_MIN_HEIGHT
// -----------------------------------------------------------
//
// The height floor — keeps a panorama from collapsing into a
// line.
//
// Used by:
//   - core/media.ts — mediaBoxFor
// -----------------------------------------------------------

export const MEDIA_MIN_HEIGHT = 96;







// -----------------------------------------------------------
// IMAGE_MAX_WIDTH
// -----------------------------------------------------------
//
// Kept for hosts that imported the old constant — the fitting
// rule no longer reads it.
//
// Used by:
//   - nobody in-tree today; removing it would break old host
//     imports
// -----------------------------------------------------------

export const IMAGE_MAX_WIDTH = 240;







// -----------------------------------------------------------
// IMAGE_MAX_HEIGHT
// -----------------------------------------------------------
//
// Kept for hosts that imported the old constant — the fitting
// rule no longer reads it.
//
// Used by:
//   - nobody in-tree today; removing it would break old host
//     imports
// -----------------------------------------------------------

export const IMAGE_MAX_HEIGHT = 300;







// -----------------------------------------------------------
// AVATAR_SIZE
// -----------------------------------------------------------
//
// The group-chat avatar disc shown beside a run's last bubble.
//
// Used by:
//   - message/MessageBubble.tsx, list/TypingBubble.tsx
// -----------------------------------------------------------

export const AVATAR_SIZE = 28;







// -----------------------------------------------------------
// AVATAR_COLUMN
// -----------------------------------------------------------
//
// The column the avatar reserves (disc + gutter) — bubbles
// keep this indent even when no disc renders, so a run stays
// left-aligned.
//
// Used by:
//   - message/MessageBubble.tsx, list/TypingBubble.tsx
// -----------------------------------------------------------

export const AVATAR_COLUMN = AVATAR_SIZE + 8;







// -----------------------------------------------------------
// LIST_INSET
// -----------------------------------------------------------
//
// Horizontal inset of the whole feed.
//
// Used by:
//   - list/MessageList.tsx, UnreadSeparator.tsx
//   - message/SystemMessage.tsx
// -----------------------------------------------------------

export const LIST_INSET = 12;







// -----------------------------------------------------------
// RUN_GAP
// -----------------------------------------------------------
//
// Vertical rhythm inside a run — the hairline between
// consecutive bubbles of one sender.
//
// Used by:
//   - message/MessageBubble.tsx
// -----------------------------------------------------------

export const RUN_GAP = 2;







// -----------------------------------------------------------
// BLOCK_GAP
// -----------------------------------------------------------
//
// Vertical rhythm between runs — the breath separating one
// sender's block from the next.
//
// Used by:
//   - message/MessageBubble.tsx, list/TimeSeparator.tsx
// -----------------------------------------------------------

export const BLOCK_GAP = 10;







// -----------------------------------------------------------
// BUBBLE_MAX_WIDTH
// -----------------------------------------------------------
//
// Widest a bubble may grow, as a share of the list.
//
// Used by:
//   - message/MessageBubble.tsx
// -----------------------------------------------------------

export const BUBBLE_MAX_WIDTH = '78%';
