// -----------------------------------------------------------
//  [*] socialengine — domain types
//
//  The engine's own vocabulary — no wire formats, no vendor
//  types. An adapter maps its backend into these shapes once;
//  every hook and reducer speaks them from then on. Hosts
//  render whatever UI they like on top (@knf/socialuikit
//  mirrors these shapes structurally, so mapping is usually
//  the identity).
//
//  The relationship model is deliberately the superset of
//  "friends" (request → accept) and "follow" (connect is
//  instant): a follow-style backend simply never answers
//  'outgoing' or 'incoming'.
//
//  Used by:
//    - everything in the package
// -----------------------------------------------------------







// -----------------------------------------------------------
// SocialUser
// -----------------------------------------------------------
//
// The person shape every other shape embeds.
//
// Used by:
//   - SocialPost, SocialComment, SocialProfile,
//     SocialNotification, NotificationGroup (below)
//   - provider/index.tsx — the env's currentUser
//   - components/social/SocialEngineHost.tsx — maps the host's
//     account into it
// -----------------------------------------------------------

export interface SocialUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  // A secondary line where the host has one (@handle, a role)
  handle?: string | null;
}







// -----------------------------------------------------------
// PostMediaItem
// -----------------------------------------------------------
//
// One image or video on a post.
//
// Used by:
//   - SocialPost (below) — the `media` list
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface PostMediaItem {
  url: string;
  kind: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  // Screen-reader description, when the author supplied one
  alt?: string | null;
  thumbnailUrl?: string | null;
  // Seconds; video only
  duration?: number | null;
}







// -----------------------------------------------------------
// PostLinkPreview
// -----------------------------------------------------------
//
// The unfurled link card a post may carry.
//
// Used by:
//   - SocialPost (below) — the `link` field
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface PostLinkPreview {
  url: string;
  title: string;
  description?: string | null;
  siteName?: string | null;
  imageUrl?: string | null;
}







// -----------------------------------------------------------
// PollOption
// -----------------------------------------------------------
//
// One answer row of a poll.
//
// Used by:
//   - Poll (below)
//   - core/poll.ts — the percent math
// -----------------------------------------------------------

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
  votedByMe: boolean;
}







// -----------------------------------------------------------
// Poll
// -----------------------------------------------------------
//
// A poll's whole live state — fetched and voted through the
// transport by id, never embedded in a post.
//
// Used by:
//   - core/transport.ts — fetchPoll and vote
//   - core/poll.ts, hooks/usePoll.ts
//   - adapters/knf/wire.ts — toPoll's output
//   - testing/fakeSocialTransport.ts, testing/socialContract.ts
// -----------------------------------------------------------

export interface Poll {
  id: string;
  question?: string | null;
  options: PollOption[];
  // 'single' replaces the choice, 'multiple' toggles it
  answerType: 'single' | 'multiple';
  // Sum of option voteCounts as the server reports it
  totalVotes: number;
  // Distinct voters, when the backend counts them — the percent
  // denominator prefers this over totalVotes
  voterCount?: number | null;
  // ISO stamp, null/absent = never expires
  expiresAt?: string | null;
  // Server-side closed flag; expiry is ALSO checked client-side
  closed: boolean;
  votedByMe: boolean;
}







// -----------------------------------------------------------
// SocialPost
// -----------------------------------------------------------
//
// The feed row. The engine itself never consumes whole posts —
// hooks take narrower slices (useLikeToggle wants only id +
// likedByMe + likeCount) — so this shape exists for hosts and
// their mapping layers.
//
// Used by:
//   - src/index.ts — the public surface hosts import from
//   - example/ExampleSocialScreen.tsx — the demo feed rows
// -----------------------------------------------------------

export interface SocialPost {
  id: string;
  author: SocialUser;
  text: string;
  // ISO stamps from the server clock
  createdAt: string;
  editedAt?: string | null;
  media?: PostMediaItem[];
  link?: PostLinkPreview | null;
  // The poll travels by id — its live state is fetched and
  // voted through the transport (usePoll), never embedded
  pollId?: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  // Derived for the viewer by normalizeForViewer, never trusted
  // from the wire
  isOwn: boolean;
  deleted?: boolean;
  // Where a syndicated/scraped post came from — hosts map their
  // origins to a stable id + display label
  source?: { id: string; label: string } | null;
  // Escape hatch for host-specific payloads
  custom?: unknown;
}







// -----------------------------------------------------------
// SocialComment
// -----------------------------------------------------------
//
// A comment row; likeable through useLikeToggle's 'comment'
// target where the backend supports it.
//
// Used by:
//   - src/index.ts — the public surface; nothing else in-tree
//     consumes it yet (the comment UI is still to come)
// -----------------------------------------------------------

export interface SocialComment {
  id: string;
  postId: string;
  author: SocialUser;
  text: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
  replyToId?: string | null;
  isOwn: boolean;
  deleted?: boolean;
}







// -----------------------------------------------------------
// RelationshipState
// -----------------------------------------------------------
//
// One user's standing with the viewer. 'outgoing' = the viewer
// asked (friend request sent / follow pending approval);
// 'incoming' = the other side asked and the viewer may accept
// or decline; 'connected' = friends / following.
// 'blockedBy' intentionally exists: UIs render NOTHING for it.
//
// Used by:
//   - SocialProfile (below)
//   - core/transport.ts, core/shadow.ts,
//     hooks/useRelationship.ts, adapters/knf/index.ts,
//     testing/fakeSocialTransport.ts, testing/socialContract.ts
//   - app/(main)/profile/index.tsx — the host's profile header
// -----------------------------------------------------------

export type RelationshipState =
  | 'self'
  | 'none'
  | 'outgoing'
  | 'incoming'
  | 'connected'
  | 'blocking'
  | 'blockedBy';







// -----------------------------------------------------------
// SocialProfile
// -----------------------------------------------------------
//
// A profile page's data as an adapter maps it.
//
// Used by:
//   - src/index.ts — the public surface; nothing else in-tree
//     consumes it yet (the profile screen fetches its own
//     shape and uses useRelationship directly)
// -----------------------------------------------------------

export interface SocialProfile {
  user: SocialUser;
  bio?: string | null;
  relationship: RelationshipState;
  counts?: {
    posts?: number;
    connections?: number;
  };
  custom?: unknown;
}







// -----------------------------------------------------------
// NotificationKind
// -----------------------------------------------------------
//
// The activity row's kind. Open-ended (string) beyond the
// well-known values so backends can extend without a package
// release; unknown kinds still render (the UI shows a generic
// line).
//
// Used by:
//   - SocialNotification, NotificationGroup (below)
//   - core/notifications.ts — the groupable set
// -----------------------------------------------------------

export type NotificationKind =
  | 'like'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'connect_request'
  | 'connect_accept'
  | 'system'
  | (string & {});







// -----------------------------------------------------------
// SocialNotification
// -----------------------------------------------------------
//
// One row of the activity list, as the transport serves it.
//
// Used by:
//   - NotificationGroup (below)
//   - core/transport.ts — NotificationsPage's rows
//   - core/notifications.ts, hooks/useNotifications.ts
//   - adapters/knf/wire.ts, testing/fakeSocialTransport.ts,
//     testing/socialContract.ts
// -----------------------------------------------------------

export interface SocialNotification {
  id: string;
  kind: NotificationKind;
  actor: SocialUser;
  createdAt: string;
  read: boolean;
  // What the activity is about (a post id, a comment id)
  subjectId?: string | null;
  // A short excerpt of the subject for the row's second line
  subjectPreview?: string | null;
}







// -----------------------------------------------------------
// NotificationGroup
// -----------------------------------------------------------
//
// What grouping produces: one row for "Ona and 3 others liked
// your post". Originals ride along so expansion is free.
//
// Used by:
//   - core/notifications.ts — groupNotifications' output
//   - hooks/useNotifications.ts — the rows it serves
//   - app/(main)/activity/index.tsx — the host's activity list
// -----------------------------------------------------------

export interface NotificationGroup {
  // Stable list key (the newest member's id)
  key: string;
  kind: NotificationKind;
  actors: SocialUser[];
  notifications: SocialNotification[];
  newestAt: string;
  // Read only when EVERY member is read
  read: boolean;
  subjectId?: string | null;
  subjectPreview?: string | null;
}
