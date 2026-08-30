// -----------------------------------------------------------
//  [*] socialuikit — view types
//
//  The kit's own vocabulary. Deliberately structural twins of
//  @knf/socialengine's domain types, so a host running both
//  maps with the identity function — but the packages stay
//  independent (they meet only in the host), so any data
//  layer can feed these shapes.
//
//  Everything is display truth: the kit never fetches, never
//  derives counts, never decides isOwn. Hosts hand rows in,
//  taps come back out through callbacks.
//
//  Used by:
//    - every component in the package
// -----------------------------------------------------------

export interface KitUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  handle?: string | null;
}

export interface KitMediaItem {
  url: string;
  kind: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
}

export interface KitLinkPreview {
  url: string;
  title: string;
  description?: string | null;
  siteName?: string | null;
  imageUrl?: string | null;
}

export interface KitPollOption {
  id: string;
  text: string;
  voteCount: number;
  votedByMe: boolean;
}

export interface KitPoll {
  id: string;
  question?: string | null;
  options: KitPollOption[];
  answerType: 'single' | 'multiple';
  totalVotes: number;
  voterCount?: number | null;
  expiresAt?: string | null;
  closed: boolean;
  votedByMe: boolean;
}

export interface KitPost {
  id: string;
  author: KitUser;
  text: string;
  createdAt: string;
  editedAt?: string | null;
  media?: KitMediaItem[];
  link?: KitLinkPreview | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isOwn: boolean;
  deleted?: boolean;
  source?: { id: string; label: string } | null;
  custom?: unknown;
}

export interface KitComment {
  id: string;
  author: KitUser;
  text: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
  isOwn: boolean;
  deleted?: boolean;
}

// Mirrors the engine's RelationshipState; the ConnectButton
// renders one face per value ('blockedBy' renders NOTHING)
export type KitRelationship =
  | 'self'
  | 'none'
  | 'outgoing'
  | 'incoming'
  | 'connected'
  | 'blocking'
  | 'blockedBy';

export interface KitProfile {
  user: KitUser;
  bio?: string | null;
  relationship: KitRelationship;
  counts?: {
    posts?: number;
    connections?: number;
  };
}

// One (possibly grouped) activity row: "Ona and 3 others liked
// your post". The kit shows up to maxStackedAvatars portraits
export interface KitNotification {
  key: string;
  kind: 'like' | 'comment' | 'reply' | 'mention' | 'connect_request' | 'connect_accept' | 'system' | (string & {});
  actors: KitUser[];
  newestAt: string;
  read: boolean;
  subjectPreview?: string | null;
}
