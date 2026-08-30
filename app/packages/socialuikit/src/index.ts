// -----------------------------------------------------------
//  [*] @knf/socialuikit — public surface
//
//  Everything a host may import, in one place. The runtime
//  export list is pinned by src/__tests__/surface.test.ts —
//  adding here is deliberate; removing or renaming is a
//  breaking change for every host.
// -----------------------------------------------------------

// View types
export type {
  KitUser,
  KitMediaItem,
  KitLinkPreview,
  KitPollOption,
  KitPoll,
  KitPost,
  KitComment,
  KitRelationship,
  KitProfile,
  KitNotification,
} from './core/types';

// Provider — theme, labels, env, component swap-outs
export {
  SocialUiKitProvider,
  useKitTheme,
  useKitLabels,
  useKitComponents,
  useKitEnv,
} from './provider';
export { defaultTheme, darkTheme, resolveTheme, type KitTheme } from './provider/theme';
export { defaultLabels, type KitLabels } from './provider/labels';

// Formatting helpers, pure
export { formatCount, clampSnippet } from './core/format';

// Self-updating relative timestamps
export { default as RelativeTime } from './time/RelativeTime';

// The post card and its parts
export { default as PostCard } from './post/PostCard';
export { default as ActionRow } from './post/ActionRow';

// Media
export { default as MediaGallery, gallerySpans } from './media/MediaGallery';
export { default as LinkCard } from './media/LinkCard';

// Polls
export { default as PollBlock } from './poll/PollBlock';

// Comments
export { default as CommentRow } from './comments/CommentRow';
export { default as CommentComposer } from './comments/CommentComposer';

// People
export { default as ConnectButton } from './social/ConnectButton';
export { default as ProfileHeader } from './social/ProfileHeader';

// The activity list's row
export { default as NotificationRow } from './notifications/NotificationRow';

// Feed chrome
export { default as FeedList } from './feed/FeedList';
export { default as NewPostsPill } from './feed/NewPostsPill';
export { default as RowErrorBoundary } from './feed/RowErrorBoundary';
