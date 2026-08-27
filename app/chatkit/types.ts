// -----------------------------------------------------------
//  [*] chatkit — types
//
//  The kit is presentational: it renders messages it is
//  handed and calls back on every intent (send, react, reply,
//  delete, open image…). The message shape is the app's own
//  ChatMessage — re-exported here so a future extraction of
//  the kit into a package only has to inline three
//  interfaces (ChatMessage, ChatReaction, ChatReplyRef).
//
//  Split into:
//
//    KitMessage / KitReaction / KitReply — the message shapes
//    GroupPosition                       — bubble's place in a run
//    TimelineItem                        — list rows
//    BubbleFrame / ContextTarget         — long-press geometry
// -----------------------------------------------------------

import type { ChatMessage, ChatReaction, ChatReplyRef } from '@/types';


export type KitMessage = ChatMessage;
export type KitReaction = ChatReaction;
export type KitReply = ChatReplyRef;

// Where a bubble sits in a run of consecutive messages from
// the same sender — drives corner rounding, sender name,
// avatar and the receipt line
export type GroupPosition = 'single' | 'first' | 'middle' | 'last';

export type TimelineItem =
  | { type: 'message'; key: string; message: KitMessage; position: GroupPosition }
  | { type: 'separator'; key: string; day: string; time: string };

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
}
