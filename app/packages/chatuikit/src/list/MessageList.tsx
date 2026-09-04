// -----------------------------------------------------------
//  [*] chatuikit — MessageList
//
//  The conversation feed over the timeline rows (messages and
//  time separators). On native it is an INVERTED FlatList over
//  newest-first rows — stick-to-bottom, keyboard behaviour and
//  history paging all fall out of the platform; reaching the
//  visual top pages older history through onLoadOlder, and
//  once there is no older page the intro card closes the
//  history.
//
//  There is deliberately no pull-to-refresh: the socket keeps
//  the feed live, and a RefreshControl on an inverted list
//  renders upside-down at the bottom (iMessage has none).
//
//  UPRIGHT EXCEPTION: react-native-web renders an inverted
//  list rotated 180°, so on web the list is upright over the
//  REVERSED rows, pins itself to the bottom while the reader
//  is there, and pages older history through an explicit row
//  at the top. Native goes upright too while a screen reader
//  runs (the inverted transform breaks TalkBack/VoiceOver
//  swipe order) — same row order, same explicit paging rows,
//  but only the web keeps the bottom-pinning scroll math.
//  Orientation branches sit behind `upright`; the few web-only
//  mechanics stay behind `isWeb`.
//
//  While the reader is scrolled away, incoming messages from
//  others are counted on the scroll-to-latest button; an own
//  send always scrolls back down. Rows that arrive after mount
//  slide in; history pages do not. The list exposes
//  scrollToMessage(id) through its ref for jump-to-quoted.
//
//  Portraits (`showAvatars`) sit beside the last bubble of every
//  incoming run, in direct and group chats alike (Messenger);
//  sender names are a group-chat thing (`isGroup`).
//
//  Split into (root component last):
//
//    OlderMessagesRow — the web-only "load older" header
//    MessageList      — the feed (default export)
// -----------------------------------------------------------

// Rows
import ConversationIntro, { type IntroInfo } from './ConversationIntro';
import MessageBubble from '../message/MessageBubble';
import ScrollToLatestButton from './ScrollToLatestButton';
import TimeSeparator from './TimeSeparator';
import TypingBubble from './TypingBubble';
import SystemMessage from '../message/SystemMessage';
import UnreadSeparator from './UnreadSeparator';
import UnreadPill from './UnreadPill';
import FloatingDay from './FloatingDay';
import { useKitComponents } from '../provider';
import { useScreenReaderEnabled, useScreenReaderEnabledRef } from '../hooks/a11y';
import { type KitLabels } from '../provider/labels';
import { LIST_INSET } from '../core/metrics';
import { floatingDayFor, messageStamp } from '../core/timeline';
import { messageKind } from '../core/types';
import type { ContextTarget, KitMessage, TimelineItem } from '../core/types';

// Theme
import { useKitEnv, useKitLabels, useKitTheme } from '../provider';

// Primitives
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { AccessibilityInfo, ActivityIndicator, FlatList, Platform, Pressable, Text, View, type AccessibilityActionEvent, type FlatListProps, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle,
  type ViewToken,
} from 'react-native';


// Distance from the latest message past which the reader counts
// as "away" and the scroll-to-latest button appears
const AWAY_OFFSET = 240;

// scrollToIndex attempts on rows the list has not measured yet
// Deep targets climb the measured frontier a page at a time
const MAX_INDEX_RETRIES = 12;

const isWeb = Platform.OS === 'web';

// Hoisted so the windowed cells never re-render over a fresh
// style object or key extractor identity
const CONTENT_STYLE_NATIVE: ViewStyle = { paddingHorizontal: LIST_INSET, paddingVertical: 8 };
// The upright web list bottom-aligns a short conversation the
// way the inverted native list does by itself
const CONTENT_STYLE_WEB: ViewStyle = { ...CONTENT_STYLE_NATIVE, flexGrow: 1, justifyContent: 'flex-end' };

// An own row keeps the key it was born with across the
// temp → server swap, so the bubble never remounts. Exported
// for __tests__/chatuikitComponents.test.tsx.
export const keyExtractor = (row: TimelineItem) => (row.type === 'message' ? row.message.clientId ?? row.key : row.key);

// Row identity, not server id — same rule as keyExtractor
const rowId = (message: KitMessage) => message.clientId ?? message.id;

// The provider-less empty state: one centred caption on the canvas
function DefaultEmptyState({ label }: { label: string }) {
  const { colors, text } = useKitTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }} accessibilityRole="text" testID="chatuikit-empty">
      <Text style={[text.caption, { color: colors.inkSoft, textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}


export interface TypingInfo {
  label: string;
  name?: string;
  avatarUrl?: string;
}

export interface MessageListHandle {
  // Scrolls the row with this id into the middle; false when
  // the message is not in the loaded history
  scrollToMessage: (id: string) => boolean;
  scrollToLatest: () => void;
}







// -----------------------------------------------------------
// OlderMessagesRow
// -----------------------------------------------------------
//
// Web-only header: an explicit tap target for the next older
// page, or the spinner while it loads.
//
// Used by:
//   - MessageList (below)
// -----------------------------------------------------------

function OlderMessagesRow({ loading, labels, onPress }: { loading: boolean; labels: KitLabels; onPress: () => void }) {

  const { colors, fonts } = useKitTheme();


  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={labels.loadOlder}
      style={{ alignItems: 'center', paddingVertical: 8 }}
    >
      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.brand }}>{labels.loadOlder}</Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// NewerMessagesRow
// -----------------------------------------------------------
//
// The visual-bottom counterpart while the window is detached
// from the head (a jump deep into history): an explicit tap
// target for the next forward page, or the spinner while it
// loads. Every platform — the reader must SEE the list is not
// at the newest end.
//
// Used by:
//   - MessageList (below)
// -----------------------------------------------------------

function NewerMessagesRow({ loading, labels, onPress }: { loading: boolean; labels: KitLabels; onPress: () => void }) {

  const { colors, fonts } = useKitTheme();


  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={labels.loadNewer}
      testID="chatuikit-load-newer"
      style={{ alignItems: 'center', paddingVertical: 8 }}
    >
      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.brand }}>{labels.loadNewer}</Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// MessageList (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

const MessageList = memo(forwardRef<
  MessageListHandle,
  {
    items: TimelineItem[];
    typing: TypingInfo | null;
    isGroup: boolean;
    showAvatars: boolean;
    intro: IntroInfo | null;
    loadingOlder: boolean;
    hasMore: boolean;
    // Whether the room screen is the focused one — an unfocused
    // list never speaks to the screen reader (default true)
    isFocused?: boolean;
    onLoadOlder: () => void;
    // A detached window (a jump deep into history): newer rows
    // exist beyond the loaded end, so the list shows a forward
    // paging row at the visual bottom and forces the jump-back
    // button, whose press goes through onReturnToLatest
    hasNewer?: boolean;
    loadingNewer?: boolean;
    onLoadNewer?: () => void;
    onReturnToLatest?: () => void;
    // Arrivals the engine counted while detached — the badge on
    // the forced jump-back button
    missedCount?: number;
    // A jump-to-message that ran out of scrollToIndex retries —
    // the host explains instead of stranding the reader silently
    onJumpFailed?: () => void;
    revealedId: string | null;
    highlightedId: string | null;
    // The message whose copy floats in the context menu
    menuTargetId: string | null;
    // Whether a row may open the menu / be replied to (the host
    // excludes optimistic rows without a server id)
    canAct: (message: KitMessage) => boolean;
    canReply: (message: KitMessage) => boolean;
    onPressMessage: (message: KitMessage) => void;
    onLongPressMessage: (target: ContextTarget) => void;
    onSwipeReply: (message: KitMessage) => void;
    onPressQuote: (message: KitMessage) => void;
    onPressImage: (message: KitMessage) => void;
    // A gallery tile's tap — omitted, tiles open via onPressImage
    onPressGalleryImage?: (message: KitMessage, index: number) => void;
    // The room's member names for mention highlighting, and the
    // tap that opens the member
    mentionNames?: readonly string[];
    onPressMention?: (name: string, message: KitMessage) => void;
    // A video bubble's tap — hosts without video omit it
    onPressVideo?: (message: KitMessage) => void;
    // A portrait's tap (open a profile) — omitted, portraits are inert
    onPressAvatar?: (message: KitMessage) => void;
    // Fires when the reader reaches / leaves the newest end — the
    // engine gates read acknowledgements on it
    onAtLatestChange?: (atLatest: boolean) => void;
    // Escape hatch: extra FlatList props (contentInset, testID…);
    // the kit's own props win where they overlap
    flatListProps?: Partial<Omit<FlatListProps<TimelineItem>, 'data' | 'renderItem' | 'keyExtractor' | 'inverted'>>;
    onPressReactions: (message: KitMessage) => void;
    onRetry: (message: KitMessage) => void;
    onPressLink: (href: string) => void;
    // Direct handlers for the bubbles' Copy / React accessibility
    // actions — optional, the bubble falls back to its menu
    onCopy?: (message: KitMessage) => void;
    onReact?: (message: KitMessage, emoji: string) => void;
    // The unread stretch the host opened the room with: the
    // timeline draws the line above firstUnreadId (see
    // buildTimeline's options) and the list floats a "N new
    // messages ↑" pill until that line has been on screen
    unread?: { firstUnreadId: string; count: number } | null;
    // The Telegram-style day pill while scrolling (default on)
    floatingDay?: boolean;
  }
>(function MessageList(
  {
    items,
    typing,
    isGroup,
    showAvatars,
    intro,
    loadingOlder,
    hasMore,
    isFocused = true,
    onLoadOlder,
    hasNewer = false,
    loadingNewer = false,
    onLoadNewer,
    onReturnToLatest,
    missedCount = 0,
    onJumpFailed,
    revealedId,
    highlightedId,
    menuTargetId,
    canAct,
    canReply,
    onPressMessage,
    onLongPressMessage,
    onSwipeReply,
    onPressQuote,
    onPressImage,
    onPressGalleryImage,
    mentionNames,
    onPressMention,
    onPressVideo,
    onPressAvatar,
    onAtLatestChange,
    flatListProps,
    onPressReactions,
    onRetry,
    onPressLink,
    onCopy,
    onReact,
    unread = null,
    floatingDay = true,
  },
  ref,
) {

  const labels = useKitLabels();
  const { colors } = useKitTheme();


  const listRef = useRef<FlatList<TimelineItem>>(null);
  // Upright orientation: the web always (an inverted list cannot
  // hold the browser scrollbar), and native while a screen
  // reader runs — the inverted list's scaleY transform breaks
  // TalkBack/VoiceOver swipe order, so the reader gets the list
  // oldest-first, top to bottom, with explicit paging buttons
  const screenReaderUpright = useScreenReaderEnabled();
  const upright = isWeb || screenReaderUpright;
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  const [missed, setMissed] = useState(0);

  // Web only: whether the reader sits at the bottom (a tighter
  // test than `away`), so content growth re-pins the list. Scroll
  // events before the first pin are ignored — the initial paint
  // reports a large distance before the pin has run. The pin
  // scrolls to an explicit offset from the measured content and
  // viewport heights: FlatList's scrollToEnd trusts the last
  // cell's cached frame, which goes stale when an earlier cell
  // grows and pushes it down
  const atBottomRef = useRef(true);
  const pinnedOnceRef = useRef(false);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const retriesRef = useRef(0);
  // Web only: the current scroll offset and, while an older page
  // is being pulled in from the top row, the content height it
  // started from — prepended growth is compensated against these
  // so the reader keeps their place (native has
  // maintainVisibleContentPosition for this)
  const scrollOffsetRef = useRef(0);
  const pendingOlderRef = useRef<number | null>(null);


  // Newest-first everywhere except the upright web list
  const data = useMemo(() => (upright ? [...items].reverse() : items), [items, upright]);


  const newest = useMemo(() => items.find((row) => row.type === 'message'), [items]);
  // Row identity, not server id: an own send keeps its key across
  // the temp → server swap and must not count as a new arrival
  const newestId = newest?.type === 'message' ? rowId(newest.message) : null;
  const newestOwn = newest?.type === 'message' ? newest.message.isOwn : false;

  // Rows that arrive after the first loaded page animate in; the
  // initial page and older pages appear in place. The baseline is
  // the first page's newest SERVER stamp — comparing server clock
  // to server clock, so device skew can never animate history
  // (seeded by an effect on the first render that has one — the
  // null baseline reads as +Infinity below, so that first page
  // never animates either way)
  const baselineStampRef = useRef<number | null>(null);
  useEffect(() => {
    if (baselineStampRef.current === null && newest?.type === 'message') {
      baselineStampRef.current = messageStamp(newest.message);
    }
  });

  // The last own message gets the receipt line
  const lastOwnId = useMemo(() => {
    const row = items.find((r) => r.type === 'message' && r.message.isOwn);
    return row?.type === 'message' ? row.message.id : null;
  }, [items]);


  const scrollToLatest = useCallback((animated: boolean) => {
    if (upright) {
      const offset = Math.max(0, contentHeightRef.current - viewportHeightRef.current);
      listRef.current?.scrollToOffset({ offset, animated });
    } else {
      listRef.current?.scrollToOffset({ offset: 0, animated });
    }
  }, [upright]);


  // Own sends scroll back down; others' messages, while the
  // reader is away, bump the missed count by the number of
  // MESSAGES that actually arrived — one socket burst can land
  // several rows within a single render
  const screenReaderRef = useScreenReaderEnabledRef();
  const newestIdRef = useRef<string | null>(newestId);
  useEffect(() => {
    if (!newestId || newestId === newestIdRef.current) return;
    // The first page is history, not an arrival: seed and stay
    if (newestIdRef.current === null) {
      newestIdRef.current = newestId;
      return;
    }
    const previousId = newestIdRef.current;
    newestIdRef.current = newestId;
    if (newestOwn) {
      scrollToLatest(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- an arrival IS the event; the counter resets alongside the scroll it triggers
      setMissed(0);
      return;
    }
    if (awayRef.current) {
      // Count the message rows newer than the previous newest;
      // when it left the loaded window, fall back to +1
      let arrived = 0;
      let found = false;
      for (const row of items) {
        if (row.type !== 'message') continue;
        if (rowId(row.message) === previousId) {
          found = true;
          break;
        }
        arrived += 1;
      }
      setMissed((n) => n + (found ? arrived : 1));
    } else {
      // A reader at the bottom follows the new row (belt and braces
      // beside autoscrollToTopThreshold)
      scrollToLatest(true);
    }
    // Speak only to a listening reader on the focused room, and
    // only while scrolled away — at the bottom the reader reaches
    // the new row by its own navigation
    if (newest?.type === 'message' && isFocused && awayRef.current && screenReaderRef.current) {
      AccessibilityInfo.announceForAccessibility(`${newest.message.senderName}: ${newest.message.text || labels.photo}`);
    }
  }, [newestId, newestOwn, newest, items, isFocused, labels.photo, scrollToLatest, screenReaderRef]);


  const onAtLatestChangeRef = useRef(onAtLatestChange);
  useEffect(() => {
    onAtLatestChangeRef.current = onAtLatestChange;
  });
  const setAwayState = useCallback((next: boolean) => {
    const changed = awayRef.current !== next;
    awayRef.current = next;
    setAway((prev) => (prev === next ? prev : next));
    if (!next) setMissed(0);
    if (changed) onAtLatestChangeRef.current?.(!next);
  }, []);


  // The pending scrollToIndex retry — cleared before every new
  // jump so two jumps never race, and on unmount
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearRetryTimer, [clearRetryTimer]);


  // scrollToIndex on an index without a frame throws on some RN
  // versions instead of calling onScrollToIndexFailed — the guard
  // routes the throw to the same recovery
  const safeScrollToIndex = useCallback((params: { index: number; viewPosition?: number; animated?: boolean }) => {
    try {
      listRef.current?.scrollToIndex(params);
    } catch {
      onScrollToIndexFailedRef.current?.({ index: params.index, highestMeasuredFrameIndex: 0, averageItemLength: 80 });
    }
  }, []);

  // scrollToIndex needs the row measured; when it is not, jump
  // near it by estimate and retry
  useImperativeHandle(
    ref,
    () => ({
      scrollToMessage: (id) => {
        const index = data.findIndex((row) => row.type === 'message' && row.message.id === id);
        if (index < 0) return false;
        clearRetryTimer();
        atBottomRef.current = false;
        retriesRef.current = 0;
        safeScrollToIndex({ index, viewPosition: 0.5, animated: true });
        return true;
      },
      scrollToLatest: () => scrollToLatest(true),
    }),
    [data, scrollToLatest, clearRetryTimer, safeScrollToIndex],
  );


  // Host-swapped pieces, the kit's own where a slot is empty
  const slots = useKitComponents();
  const Separator = slots.TimeSeparator ?? TimeSeparator;
  const Unread = slots.UnreadSeparator ?? UnreadSeparator;
  const System = slots.SystemMessage ?? SystemMessage;
  const Typing = slots.TypingBubble ?? TypingBubble;
  const Intro = slots.ConversationIntro ?? ConversationIntro;
  const ToLatest = slots.ScrollToLatestButton ?? ScrollToLatestButton;
  const Pill = slots.UnreadPill ?? UnreadPill;
  const Floating = slots.FloatingDay ?? FloatingDay;


  // The unread pill lives until the unread line has been seen
  // (viewability below) or the reader dismisses it; a new unread
  // stretch (another room, a re-open) starts over
  const [unreadSeen, setUnreadSeen] = useState(false);
  const [unreadDismissed, setUnreadDismissed] = useState(false);
  const [unreadKey, setUnreadKey] = useState(unread?.firstUnreadId);
  if (unreadKey !== unread?.firstUnreadId) {
    setUnreadKey(unread?.firstUnreadId);
    setUnreadSeen(false);
    setUnreadDismissed(false);
  }


  // The floating day: label from the topmost visible row (the
  // viewability callback), opacity driven by scroll activity —
  // up on every scroll event, down 700 ms after the last one
  const { locale } = useKitEnv();
  const [floatingLabel, setFloatingLabel] = useState('');
  const dayOpacity = useSharedValue(0);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
  }, []);

  const dayLabels = useMemo(
    () => ({ today: labels.today, yesterday: labels.yesterday, locale }),
    [labels.today, labels.yesterday, locale],
  );
  const dayLabelsRef = useRef(dayLabels);
  useEffect(() => {
    dayLabelsRef.current = dayLabels;
  }, [dayLabels]);

  // FlatList wants a stable pair; the callback reads refs so the
  // pair never has to change
  // eslint-disable-next-line react-hooks/refs -- the closures only read refs when FlatList fires viewability events, never during render
  const viewabilityPairs = useRef([
    {
      viewabilityConfig: { itemVisiblePercentThreshold: 5, minimumViewTime: 0 },
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken<TimelineItem>[] }) => {
        if (viewableItems.length === 0) return;
        if (viewableItems.some((token) => token.item?.type === 'unread')) setUnreadSeen(true);
        // Inverted: the highest index is the topmost row on screen
        const top = viewableItems.reduce((best, token) =>
          (token.index ?? -1) > (best.index ?? -1) ? token : best,
        );
        if (top.item) {
          const label = floatingDayFor(top.item, dayLabelsRef.current);
          setFloatingLabel((current) => (current === label ? current : label));
        }
      },
    },
  ]).current;


  const renderItem = useCallback(
    ({ item }: { item: TimelineItem }) => {
      if (item.type === 'separator') return <Separator day={item.day} time={item.time} />;
      if (item.type === 'unread') return <Unread count={item.count} />;
      const { message, position } = item;
      if (messageKind(message) === 'system') return <System message={message} />;
      const runStart = position === 'single' || position === 'first';
      const runEnd = position === 'single' || position === 'last';
      const foreign = !message.isOwn;
      return (
        <MessageBubble
          message={message}
          position={position}
          showSender={isGroup && foreign && runStart}
          avatarSlot={showAvatars && foreign ? (runEnd ? 'show' : 'blank') : 'none'}
          timeRevealed={revealedId === message.id}
          showStatus={message.id === lastOwnId}
          highlighted={highlightedId === message.id}
          hidden={menuTargetId === message.id}
          canAct={canAct(message)}
          canReply={canReply(message)}
          labels={labels}
          // Server clock against server clock (cached parse): only
          // rows stamped after the first loaded page slide in
          animateIn={messageStamp(message) > (baselineStampRef.current ?? Number.POSITIVE_INFINITY)}
          onPress={onPressMessage}
          onLongPress={onLongPressMessage}
          onSwipeReply={onSwipeReply}
          onPressQuote={onPressQuote}
          onPressImage={onPressImage}
          onPressGalleryImage={onPressGalleryImage}
          mentionNames={mentionNames}
          onPressMention={onPressMention}
          onPressVideo={onPressVideo}
          onPressAvatar={onPressAvatar}
          onPressReactions={onPressReactions}
          onRetry={onRetry}
          onPressLink={onPressLink}
          onCopy={onCopy}
          onReact={onReact}
        />
      );
    },
    [Separator, Unread, System, isGroup, showAvatars, revealedId, lastOwnId, highlightedId, menuTargetId, canAct, canReply, labels, onPressMessage, onLongPressMessage, onSwipeReply, onPressQuote, onPressImage, onPressGalleryImage, mentionNames, onPressMention, onPressVideo, onPressAvatar, onPressReactions, onRetry, onPressLink, onCopy, onReact],
  );


  // Stable FlatList handlers — a fresh identity per keystroke of
  // the composer would re-render the whole windowed cell set.
  // onEndReached also fires with a non-positive distance on mount
  // and on content shrink — those are not the reader arriving
  const onEndReached = useCallback(({ distanceFromEnd }: { distanceFromEnd: number }) => {
    if (distanceFromEnd <= 0) return;
    if (!upright && hasMore && !loadingOlder) onLoadOlder();
  }, [upright, hasMore, loadingOlder, onLoadOlder]);

  // Native: the reader reaching the visual bottom of a detached
  // window pulls the next forward page without a tap (the row
  // stays as the visible affordance; web keeps only the row —
  // its upright list's start is the OLDER side)
  const onStartReached = useCallback(({ distanceFromStart }: { distanceFromStart: number }) => {
    if (upright || distanceFromStart <= 0) return;
    if (hasNewer && !loadingNewer) onLoadNewer?.();
  }, [upright, hasNewer, loadingNewer, onLoadNewer]);

  const onListLayout = useCallback((e: LayoutChangeEvent) => {
    // A shrinking viewport (composer grew, keyboard on web)
    // keeps the bottom in view when the reader was there
    const previous = viewportHeightRef.current;
    viewportHeightRef.current = e.nativeEvent.layout.height;
    if (isWeb && previous && previous !== viewportHeightRef.current && atBottomRef.current) scrollToLatest(false);
  }, [scrollToLatest]);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    if (!upright) return;
    contentHeightRef.current = h;
    if (!isWeb) return;
    if (atBottomRef.current) {
      scrollToLatest(false);
    } else if (pendingOlderRef.current !== null && h > pendingOlderRef.current) {
      // An older page grew the content ABOVE the viewport — shift
      // the offset by the growth so what the reader was looking at
      // stays put (incremental: the loading row swap also resizes)
      listRef.current?.scrollToOffset({ offset: scrollOffsetRef.current + (h - pendingOlderRef.current), animated: false });
      pendingOlderRef.current = h;
    }
    pinnedOnceRef.current = true;
  }, [upright, scrollToLatest]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    const distance = upright
      ? contentSize.height - layoutMeasurement.height - contentOffset.y
      : contentOffset.y;
    if (isWeb && pinnedOnceRef.current) atBottomRef.current = distance < 48;
    setAwayState(distance > AWAY_OFFSET);

    // Floating day: show on activity, fade once the scroll settles
    // eslint-disable-next-line react-hooks/immutability -- reanimated shared value: `.value` is the documented mutable box
    dayOpacity.value = withTiming(1, { duration: 120 });
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      dayOpacity.value = withTiming(0, { duration: 260 });
    }, 700);
  }, [upright, setAwayState, dayOpacity]);

  // The web top row pages history while the reader is scrolled UP,
  // outside the at-bottom re-pin — record the height the request
  // started from so the prepend can be compensated above
  const onLoadOlderWeb = useCallback(() => {
    pendingOlderRef.current = contentHeightRef.current;
    onLoadOlder();
  }, [onLoadOlder]);

  // The anchor closes a beat after the load settles, so the last
  // size change of the prepended page still lands inside it — and
  // later growth (new arrivals) is never compensated against
  useEffect(() => {
    if (loadingOlder || pendingOlderRef.current === null) return;
    const timer = setTimeout(() => {
      pendingOlderRef.current = null;
    }, 250);
    return () => clearTimeout(timer);
  }, [loadingOlder]);

  // Unmeasured rows: climb to the highest row that HAS a frame
  // (measuring the stretch in between), then retry the target on
  // the next frame — bounded, one pending retry at a time. The
  // retry is deferred because the list re-fires this handler
  // synchronously for a still-unmeasured index (a stack overflow
  // otherwise). Out of retries: land on the estimate rather than
  // nowhere, and let the host explain
  const onScrollToIndexFailed = useCallback(({ index, highestMeasuredFrameIndex, averageItemLength }: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    if (retriesRef.current >= MAX_INDEX_RETRIES) {
      listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
      onJumpFailed?.();
      return;
    }
    retriesRef.current += 1;
    const frontier = Math.max(0, Math.min(index, highestMeasuredFrameIndex));
    if (frontier > 0 && frontier < index) {
      try {
        listRef.current?.scrollToIndex({ index: frontier, animated: false });
      } catch {
        listRef.current?.scrollToOffset({ offset: averageItemLength * frontier, animated: false });
      }
    } else {
      listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
    }
    clearRetryTimer();
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      safeScrollToIndex({ index, viewPosition: 0.5, animated: true });
    }, 120);
  }, [clearRetryTimer, onJumpFailed, safeScrollToIndex]);
  const onScrollToIndexFailedRef = useRef(onScrollToIndexFailed);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- latest-ref update inside an effect; refs are mutable by contract
    onScrollToIndexFailedRef.current = onScrollToIndexFailed;
  });

  // The jump back to the newest end: detached, the host re-fetches
  // the head (returnToLatest); attached, a plain scroll suffices
  const onPressLatest = useCallback(() => {
    if (hasNewer) onReturnToLatest?.();
    scrollToLatest(true);
    atBottomRef.current = true;
    setAwayState(false);
  }, [hasNewer, onReturnToLatest, scrollToLatest, setAwayState]);

  // A reader scrolled away can jump to the newest end from the
  // rotor / accessibility actions without finding the button
  const listAccessibilityActions = useMemo(() => (away || hasNewer ? [{ name: 'scrollToLatest', label: labels.latestMessages }] : undefined), [away, hasNewer, labels.latestMessages]);
  const onListAccessibilityAction = useCallback((e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'scrollToLatest') onPressLatest();
  }, [onPressLatest]);


  // The list with nothing to show: the slot, else a centred label.
  // Not during the first page (the host shows its own loading
  // state) — only once history is known to be empty
  const Empty = slots.EmptyState ?? DefaultEmptyState;
  const emptyRow = !loadingOlder && items.length === 0 ? <Empty label={labels.emptyChat} /> : null;

  const typingRow = typing ? (
    <Typing label={typing.label} name={typing.name} avatarUrl={typing.avatarUrl} withAvatar={showAvatars} />
  ) : null;

  // The visual bottom while detached: typing stays nearest the
  // messages, the forward paging row sits nearest the composer
  const newerRow = hasNewer ? <NewerMessagesRow loading={loadingNewer} labels={labels} onPress={() => onLoadNewer?.()} /> : null;
  const bottomRow = typingRow || newerRow ? (
    <>
      {typingRow}
      {newerRow}
    </>
  ) : null;

  // The visual top: the intro once history is exhausted, else the
  // paging affordance (explicit on web, a spinner natively)
  const topRow = !hasMore && intro ? (
    <Intro {...intro} />
  ) : upright && hasMore ? (
    <OlderMessagesRow loading={loadingOlder} labels={labels} onPress={onLoadOlderWeb} />
  ) : loadingOlder ? (
    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
      <ActivityIndicator size="small" color={colors.brand} />
    </View>
  ) : null;


  return (
    <View style={{ flex: 1, backgroundColor: colors.chatCanvas }}>

      <FlatList
        {...flatListProps}
        testID={flatListProps?.testID ?? 'chatuikit-message-list'}
        ref={listRef}
        inverted={!upright}
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={emptyRow}
        accessibilityActions={listAccessibilityActions}
        onAccessibilityAction={onListAccessibilityAction}
        style={{ flex: 1 }}
        contentContainerStyle={upright ? CONTENT_STYLE_WEB : CONTENT_STYLE_NATIVE}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        // Inverted: header = bottom (typing / newer), footer = top
        // (intro / older)
        ListHeaderComponent={upright ? topRow : bottomRow}
        ListFooterComponent={upright ? bottomRow : topRow}
        onStartReached={onStartReached}
        onStartReachedThreshold={0.4}
        onLayout={onListLayout}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        onScrollToIndexFailed={onScrollToIndexFailed}
        viewabilityConfigCallbackPairs={viewabilityPairs}
        scrollEventThrottle={80}
        // Keeps the reader's place when messages arrive or older
        // pages land while scrolled up (native; the web branch
        // re-pins itself in onContentSizeChange instead)
        // The threshold keeps a reader near the newest end following
        // new rows (without it a prepended row lands below the fold)
        // While the context menu floats a copy over a hidden row, an
        // arrival must not shift that row under it — the threshold
        // is lifted until the menu closes
        maintainVisibleContentPosition={upright ? undefined : { minIndexForVisible: 0, autoscrollToTopThreshold: menuTargetId ? undefined : AWAY_OFFSET }}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        initialNumToRender={20}
        maxToRenderPerBatch={12}
        windowSize={9}
      />

      {floatingDay && floatingLabel ? <Floating label={floatingLabel} opacity={dayOpacity} /> : null}
      {unread && unread.count > 0 && !unreadSeen && !unreadDismissed ? (
        <Pill
          label={labels.newMessages(unread.count)}
          onPress={() => {
            const index = data.findIndex((item) => item.key === 'unread');
            if (index >= 0) safeScrollToIndex({ index, animated: true, viewPosition: 0.5 });
            else if (hasMore && !loadingOlder) onLoadOlder();
          }}
          onDismiss={() => setUnreadDismissed(true)}
        />
      ) : null}
      {away || hasNewer ? (
        <ToLatest
          label={(hasNewer ? missedCount : missed) > 0 ? labels.newMessages(hasNewer ? missedCount : missed) : labels.latestMessages}
          count={hasNewer ? missedCount : missed}
          onPress={onPressLatest}
        />
      ) : null}

    </View>
  );
}));

export default MessageList;
