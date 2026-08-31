// -----------------------------------------------------------
//  [*] @knf/socialengine — public surface
//
//  Everything a host may import, in one place. The runtime
//  export list is pinned by src/__tests__/surface.test.ts —
//  adding here is deliberate; removing or renaming is a
//  breaking change for every host.
// -----------------------------------------------------------

// The engine's vocabulary
export type {
  SocialUser,
  PostMediaItem,
  PostLinkPreview,
  PollOption,
  Poll,
  SocialPost,
  SocialComment,
  RelationshipState,
  SocialProfile,
  NotificationKind,
  SocialNotification,
  NotificationGroup,
} from './core/types';

// The one backend interface + the engine's error judgements
export {
  isRetryableError,
  isAuthError,
  type SocialTransport,
  type LikeResult,
  type LikeTarget,
  type RelationshipAction,
  type NotificationsPage,
  type SocialNotice,
  type SocialNoticeCode,
} from './core/transport';

// Optimistic state over immutable rows
export {
  createShadowStore,
  mergePostShadow,
  mergeRelationship,
  type PostShadow,
  type UserShadow,
  type ShadowStore,
} from './core/shadow';

// Tap-spam coalescing
export { createToggleQueue, getToggleQueue, type ToggleQueue } from './core/toggleQueue';

// The offline task queue's persistence surface (AsyncStorage-shaped)
export { memorySocialStorage, type SocialStorage } from './core/storage';
export { createSocialTaskQueue, socialTaskKey, type PendingSocialTask, type SocialTaskQueue } from './core/tasks';

// Poll arithmetic and gating, pure
export { pollPercent, pollLeaders, isPollExpired, showPollResults } from './core/poll';

// The activity list's grouping rules, pure
export { groupNotifications, type GroupNotificationsOptions } from './core/notifications';

// The provider every hook reads
export { SocialEngineProvider, useSocialEngine, type SocialEngineEnv } from './provider';

// Interaction hooks
export { useLikeToggle, type UseLikeToggleResult } from './hooks/useLikeToggle';
export { usePoll, type UsePollResult } from './hooks/usePoll';
export { useRelationship, type UseRelationshipResult } from './hooks/useRelationship';
export { useNotifications, type UseNotificationsResult } from './hooks/useNotifications';
export { useUnreadBadge, type UseUnreadBadgeResult } from './hooks/useUnreadBadge';

// Test doubles + the conformance suite for adapter authors
export { fakeSocialTransport, type FakeSocialTransport } from './testing/fakeSocialTransport';
export { describeSocialContract, type SocialTransportHarness } from './testing/socialContract';

// The KNF backend adapter (see adapters/knf for what it smooths over)
export { createKnfSocialTransport, type KnfSocialOptions } from './adapters/knf';
export { toPoll as knfToPoll, toSocialNotification as knfToSocialNotification, type HttpClient, type HttpRequestOptions } from './adapters/knf/wire';
