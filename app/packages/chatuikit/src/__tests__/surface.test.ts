// -----------------------------------------------------------
//  [*] Tests — @knf/chatuikit public surface
//
//  The runtime exports, pinned. Adding is deliberate; removing
//  or renaming is a breaking change for every host.
// -----------------------------------------------------------

import * as kit from '..';

describe('@knf/chatuikit surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(kit).sort()).toEqual(
      [
        'AudioAttachment', 'ChatUiKitProvider', 'Composer', 'ConnectionBanner', 'ConversationIntro', 'DEFAULT_ASPECT', 'DEFAULT_AVATAR_COLORS', 'DEFAULT_MAX_LENGTH', 'EXTREME_MAX_ASPECT', 'EXTREME_MIN_ASPECT',
        'FileCard', 'FloatingDay', 'GROUP_GAP_MS', 'GalleryAttachment', 'ImageAttachment', 'KNOWN_KINDS', 'KitAvatar', 'KitKeyboardAvoidingView', 'LinkPreviewCard', 'MAX_ASPECT', 'MIN_ASPECT',
        'MemePicker', 'MessageBubble', 'BubbleBody', 'MessageContextMenu', 'MessageList', 'MessageText', 'PinnedBanner', 'ReactionPills', 'ReplyQuote', 'RoomHeaderTitle', 'SEPARATOR_GAP_MS',
        'ScrollToLatestButton', 'StackedAvatars', 'SystemMessage', 'TimeSeparator', 'TypingBubble', 'UnreadPill', 'UnreadSeparator', 'VideoAttachment', 'VideoPlayerModal',
        'avatarColorFor', 'buildMenuRows', 'buildTimeline', 'composeAccessibilityLabel', 'darkTheme', 'dayKey', 'dayLabel', 'defaultLabels', 'defaultTheme',
        'fileGlyph', 'fitMedia', 'floatingDayFor', 'formatBytes', 'formatDuration', 'hashKey', 'isExtremeAspect', 'linkify', 'mediaBoxFor', 'messageKind',
        'normalizeHref', 'openHref', 'parseStamp', 'replySnippet', 'resolveTheme', 'useKitComponents', 'useKitEnv', 'useKitLabels', 'useKitTheme',
        'useMediaFit', 'useReducedMotionSafe', 'useScreenReaderEnabled', 'useScreenReaderEnabledRef',
      ].sort(),
    );
  });

  it('every label key has both a Lithuanian and an English string', () => {
    const en = kit.defaultLabels.en as unknown as Record<string, unknown>;
    const lt = kit.defaultLabels.lt as unknown as Record<string, unknown>;
    expect(Object.keys(lt).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(typeof en[key]).toBe(typeof lt[key]);
      if (typeof en[key] === 'string') expect((en[key] as string).length).toBeGreaterThan(0);
    }
  });
});
