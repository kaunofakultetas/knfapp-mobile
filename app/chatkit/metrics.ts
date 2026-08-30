// -----------------------------------------------------------
//  [*] chatkit — metrics
//
//  The geometry every component agrees on, in one place.
//
//  Used by:
//    - chatkit/MessageBubble.tsx, TypingBubble.tsx,
//      TimeSeparator.tsx, MessageList.tsx
// -----------------------------------------------------------


// Bubble corners: the open radius and the flattened corner
// facing a neighbour in a run
export const BUBBLE_RADIUS = 18;
export const BUBBLE_TIGHT_RADIUS = 5;

// Inner padding around text
export const BUBBLE_PADDING_H = 12;
export const BUBBLE_PADDING_V = 8;

// Photos
export const IMAGE_MAX_WIDTH = 240;
export const IMAGE_MAX_HEIGHT = 300;

// Group-chat avatar beside a run, and the column it reserves
export const AVATAR_SIZE = 28;
export const AVATAR_COLUMN = AVATAR_SIZE + 8;

// Horizontal inset of the whole feed
export const LIST_INSET = 12;

// Vertical rhythm: inside a run vs between runs
export const RUN_GAP = 2;
export const BLOCK_GAP = 10;

// Widest a bubble may grow, as a share of the list
export const BUBBLE_MAX_WIDTH = '78%';
