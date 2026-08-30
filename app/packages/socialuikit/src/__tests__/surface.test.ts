// -----------------------------------------------------------
//  [*] Tests — @knf/socialuikit public surface
//
//  The runtime exports, pinned. Adding is deliberate; removing
//  or renaming is a breaking change for every host. Type-only
//  exports (KitPost, KitTheme…) are erased at runtime and do
//  not appear here; the LT/EN label parity is pinned by the
//  provider's own tests.
// -----------------------------------------------------------

import * as kit from '..';

describe('@knf/socialuikit surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(kit).sort()).toEqual(
      [
        'ActionRow', 'CommentComposer', 'CommentRow', 'ConnectButton', 'FeedList', 'LinkCard', 'MediaGallery', 'NewPostsPill', 'NotificationRow',
        'PollBlock', 'PostCard', 'ProfileHeader', 'RelativeTime', 'RowErrorBoundary', 'SocialUiKitProvider',
        'clampSnippet', 'darkTheme', 'defaultLabels', 'defaultTheme', 'formatCount', 'gallerySpans', 'resolveTheme',
        'useKitComponents', 'useKitEnv', 'useKitLabels', 'useKitTheme',
      ].sort(),
    );
  });
});
