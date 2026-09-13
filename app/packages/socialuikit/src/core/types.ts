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







// -----------------------------------------------------------
// KitUser
// -----------------------------------------------------------
//
// The person on a byline, a comment or a portrait stack — the
// smallest identity the kit draws.
//
// Used by:
//   - KitPost, KitComment, KitProfile, KitNotification (below)
//   - provider/index.tsx — the Avatar slot's prop
//   - post/PostCard.tsx, comments/CommentRow.tsx,
//     social/ProfileHeader.tsx — avatars and author taps
// -----------------------------------------------------------

export interface KitUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  handle?: string | null;
}







// -----------------------------------------------------------
// KitMediaItem
// -----------------------------------------------------------
//
// One gallery tile. width/height drive the frame's aspect,
// duration (in SECONDS) the video chip, alt the ALT badge.
//
// Used by:
//   - KitPost.media (below)
//   - media/MediaGallery.tsx — tiles, spans and chips
// -----------------------------------------------------------

export interface KitMediaItem {
  url: string;
  kind: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
}







// -----------------------------------------------------------
// KitLinkPreview
// -----------------------------------------------------------
//
// The unfurled link a post shares — what LinkCard draws.
//
// Used by:
//   - KitPost.link (below)
//   - media/LinkCard.tsx
// -----------------------------------------------------------

export interface KitLinkPreview {
  url: string;
  title: string;
  description?: string | null;
  siteName?: string | null;
  imageUrl?: string | null;
}







// -----------------------------------------------------------
// KitPollOption
// -----------------------------------------------------------
//
// One answer row with its display-truth tally.
//
// Used by:
//   - KitPoll.options (below)
//   - poll/PollBlock.tsx — bars, percentages, the leading set
// -----------------------------------------------------------

export interface KitPollOption {
  id: string;
  text: string;
  voteCount: number;
  votedByMe: boolean;
}







// -----------------------------------------------------------
// KitPoll
// -----------------------------------------------------------
//
// A whole poll as display truth — the tallies, closed and
// votedByMe all arrive decided by the host; the kit only
// renders them and reports taps back.
//
// Used by:
//   - poll/PollBlock.tsx — the whole block
//   - example/ExampleFeedScreen.tsx — the seeded demo poll
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// KitPost
// -----------------------------------------------------------
//
// One feed row. In PostCard media beats link (at most one
// attachment block); `source` draws the chip on the author
// row; `custom` is the host-typed side channel the poll
// payload rides in.
//
// Used by:
//   - post/PostCard.tsx — the card's whole surface
//   - provider/index.tsx — the PostPoll slot's prop
//   - example/ExampleFeedScreen.tsx — the seeded feed rows
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// KitComment
// -----------------------------------------------------------
//
// One comment row; likeCount/likedByMe are optional — a host
// running comments without likes just omits them.
//
// Used by:
//   - comments/CommentRow.tsx
//   - app/(main)/news-comments/index.tsx and
//     app/(main)/news-post/index.tsx — hosts mapping wire rows
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// KitRelationship
// -----------------------------------------------------------
//
// Mirrors the engine's RelationshipState; the ConnectButton
// renders one face per value ('blockedBy' renders NOTHING).
//
// Used by:
//   - KitProfile.relationship (below)
//   - social/ConnectButton.tsx — the state switch
// -----------------------------------------------------------

export type KitRelationship =
  | 'self'
  | 'none'
  | 'outgoing'
  | 'incoming'
  | 'connected'
  | 'blocking'
  | 'blockedBy';







// -----------------------------------------------------------
// KitProfile
// -----------------------------------------------------------
//
// A profile header's data: the person, the bio, the VIEWER'S
// relationship to them, and the optional counters.
//
// Used by:
//   - social/ProfileHeader.tsx
// -----------------------------------------------------------

export interface KitProfile {
  user: KitUser;
  bio?: string | null;
  relationship: KitRelationship;
  counts?: {
    posts?: number;
    connections?: number;
  };
}







// -----------------------------------------------------------
// KitNotification
// -----------------------------------------------------------
//
// One (possibly grouped) activity row: "Ona and 3 others liked
// your post". The kit shows up to maxStackedAvatars portraits;
// `kind` is an open string union on purpose, so an unknown
// kind still renders through the generic line.
//
// Used by:
//   - notifications/NotificationRow.tsx
//   - example/ExampleFeedScreen.tsx — the seeded row
// -----------------------------------------------------------

export interface KitNotification {
  key: string;
  kind: 'like' | 'comment' | 'reply' | 'mention' | 'connect_request' | 'connect_accept' | 'system' | (string & {});
  actors: KitUser[];
  newestAt: string;
  read: boolean;
  subjectPreview?: string | null;
}
