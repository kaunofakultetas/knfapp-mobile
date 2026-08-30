// -----------------------------------------------------------
//  [*] chatengine — transport
//
//  The seam between the engine and a backend. An adapter
//  implements ChatTransport in the engine's OWN domain types
//  (core/types.ts) — the engine never sees a wire shape — and
//  the realtime half hands events over as one discriminated
//  union. Everything the hooks do (paging, optimistic sends,
//  the outbox, receipts, typing) is expressed against this
//  interface, so swapping the backend is writing an adapter,
//  not touching a hook. testing/transportContract.ts is the
//  conformance suite an adapter runs to prove it fits.
//
//  Split into:
//
//    MessagesPage / OutgoingMessage / UploadAsset / UploadResult
//    ChatEvent            — the realtime union
//    RealtimeStatus       — connection state
//    ChatRealtime         — the realtime half
//    ChatTransport        — the whole contract
//    NoticeCode / EngineNotice — what the engine tells the host
// -----------------------------------------------------------

import type { ChatMessage, ConversationMeta, Participant, ReactionGroup } from './types';


// One history page, OLDEST message first (the engine flips it
// for its newest-first list)
export interface MessagesPage {
  messages: ChatMessage[];
  hasMore: boolean;
  participants: Participant[];
  conversation: ConversationMeta | null;
}

// The cursor for older pages: the oldest loaded row's stamp AND
// id, so an equal-stamp sibling is never skipped at a boundary
export interface PageCursor {
  createdAt: string;
  id: string;
}

// What a send carries. clientId is the optimistic temp's id —
// adapters pass it as the idempotency key so a retry of a
// timed-out-but-committed send resolves to the SAME row
export interface OutgoingMessage {
  text: string;
  imageUrl?: string;
  replyToId?: string;
  clientId: string;
  kind?: 'text' | 'image' | 'file' | 'video';
  attachment?: { url: string; name: string; size: number; mime: string };
  media?: { width?: number; height?: number; duration?: number; thumbnailUrl?: string };
}

export interface UploadAsset {
  uri: string;
  name?: string;
  mimeType?: string;
  size?: number;
  kind: 'image' | 'file' | 'video';
}

export interface UploadResult {
  // The reference the message stores (the engine never resolves
  // it — the UI's resolver does)
  url: string;
  name: string;
  size: number;
  mime: string;
  width?: number | null;
  height?: number | null;
}


export type ChatEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'reactions'; conversationId: string; messageId: string; reactions: ReactionGroup[] }
  | { type: 'deleted'; conversationId: string; messageId: string }
  | { type: 'edited'; conversationId: string; messageId: string; text: string; editedAt: string }
  | { type: 'read'; conversationId: string; readerId: string; messageIds: string[] }
  | { type: 'typing'; conversationId: string; userId: string; displayName: string; active: boolean };

export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'unauthorized';


export interface ChatRealtime {
  // Resolves true when a live connection exists (or is being
  // established for a signed-in user), false when there is none
  // to have (a guest). Safe to call repeatedly
  connect(): Promise<boolean>;
  status(): RealtimeStatus;
  onStatus(listener: (status: RealtimeStatus) => void): () => void;
  // Every event of every conversation; the engine filters by id.
  // Registration must work BEFORE connect() resolves
  subscribe(listener: (event: ChatEvent) => void): () => void;
  // Rooms created after connect are not auto-joined by every
  // backend — the engine calls this on every room mount
  join(conversationId: string): void;
  // Volatile signals — dropped while disconnected, never queued
  typing(conversationId: string, active: boolean): void;
  markRead(conversationId: string): void;
}


export interface ChatTransport {
  fetchMessages(conversationId: string, options?: { before?: PageCursor; limit?: number }): Promise<MessagesPage>;
  sendMessage(conversationId: string, message: OutgoingMessage): Promise<ChatMessage>;
  editMessage(conversationId: string, messageId: string, text: string): Promise<{ id: string; text: string; editedAt: string }>;
  deleteMessage(conversationId: string, messageId: string): Promise<void>;
  setReaction(conversationId: string, messageId: string, emoji: string): Promise<ReactionGroup[]>;
  removeReaction(conversationId: string, messageId: string): Promise<ReactionGroup[]>;
  // The durable read mark (the realtime markRead is the fast,
  // droppable twin)
  markRead(conversationId: string): Promise<void>;
  upload(asset: UploadAsset): Promise<UploadResult>;
  realtime: ChatRealtime;
}


// What the engine reports to the host instead of showing toasts
// itself — the host maps codes to its own strings and surface
export type NoticeCode =
  | 'send_failed'
  | 'send_too_long'
  | 'send_forbidden'
  | 'session_expired'
  | 'timeout'
  | 'upload_failed'
  | 'upload_too_large'
  | 'edit_failed'
  | 'delete_failed'
  | 'load_older_failed'
  | 'reaction_target_gone'
  | 'reaction_add_failed'
  | 'reaction_remove_failed';

export interface EngineNotice {
  level: 'error' | 'info';
  code: NoticeCode;
  // The asset kind for upload codes, so a host can say "video"
  detail?: string;
}
