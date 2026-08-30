// -----------------------------------------------------------
//  [*] chatkit — MessageList
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
//  WEB EXCEPTION: react-native-web renders an inverted list
//  rotated 180°, so on web the list is upright over the
//  REVERSED rows, pins itself to the bottom while the reader
//  is there, and pages older history through an explicit row
//  at the top. Every platform branch sits behind one `isWeb`
//  flag.
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
import MessageBubble from './MessageBubble';
import ScrollToLatestButton from './ScrollToLatestButton';
import TimeSeparator from './TimeSeparator';
import TypingBubble from './TypingBubble';
import { useScreenReaderEnabledRef } from './a11y';
import { useKitLabels, type KitLabels } from './labels';
import { LIST_INSET } from './metrics';
import { messageStamp } from './timeline';
import type { ContextTarget, KitMessage, TimelineItem } from './types';

// Theme
import { useTheme } from '@/hooks/useTheme';

// Primitives
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Platform, Pressable, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ViewStyle } from 'react-native';


// Distance from the latest message past which the reader counts
// as "away" and the scroll-to-latest button appears
const AWAY_OFFSET = 240;

// scrollToIndex attempts on rows the list has not measured yet
const MAX_INDEX_RETRIES = 6;

const isWeb = Platform.OS === 'web';

// Hoisted so the windowed cells never re-render over a fresh
// style object or key extractor identity
const CONTENT_STYLE_NATIVE: ViewStyle = { paddingHorizontal: LIST_INSET, paddingVertical: 8 };
// The upright web list bottom-aligns a short conversation the
// way the inverted native list does by itself
const CONTENT_STYLE_WEB: ViewStyle = { ...CONTENT_STYLE_NATIVE, flexGrow: 1, justifyContent: 'flex-end' };

// An own row keeps the key it was born with across the
// temp → server swap, so the bubble never remounts. Exported
// for __tests__/chatkitComponents.test.tsx.
export const keyExtractor = (row: TimelineItem) => (row.type === 'message' ? row.message.clientId ?? row.key : row.key);

// Row identity, not server id — same rule as keyExtractor
const rowId = (message: KitMessage) => message.clientId ?? message.id;


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

  const { colors } = useTheme();


  if (loading) {
    return (
      <View className="items-center py-sm">
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }


  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={labels.loadOlder} className="items-center py-sm">
      <Text className="font-raleway-medium text-sm text-brand">{labels.loadOlder}</Text>
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
    onPressReactions: (message: KitMessage) => void;
    onRetry: (message: KitMessage) => void;
    onPressLink: (href: string) => void;
    // Direct handlers for the bubbles' Copy / React accessibility
    // actions — optional, the bubble falls back to its menu
    onCopy?: (message: KitMessage) => void;
    onReact?: (message: KitMessage, emoji: string) => void;
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
    onPressReactions,
    onRetry,
    onPressLink,
    onCopy,
    onReact,
  },
  ref,
) {

  const labels = useKitLabels();
  const { colors } = useTheme();


  const listRef = useRef<FlatList<TimelineItem>>(null);
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
  const data = useMemo(() => (isWeb ? [...items].reverse() : items), [items]);


  const newest = useMemo(() => items.find((row) => row.type === 'message'), [items]);
  // Row identity, not server id: an own send keeps its key across
  // the temp → server swap and must not count as a new arrival
  const newestId = newest?.type === 'message' ? rowId(newest.message) : null;
  const newestOwn = newest?.type === 'message' ? newest.message.isOwn : false;

  // Rows that arrive after the first loaded page animate in; the
  // initial page and older pages appear in place. The baseline is
  // the first page's newest SERVER stamp — comparing server clock
  // to server clock, so device skew can never animate history
  // (lazily initialised on the first render that has a message)
  const baselineStampRef = useRef<number | null>(null);
  if (baselineStampRef.current === null && newest?.type === 'message') {
    baselineStampRef.current = messageStamp(newest.message);
  }

  // The last own message gets the receipt line
  const lastOwnId = useMemo(() => {
    const row = items.find((r) => r.type === 'message' && r.message.isOwn);
    return row?.type === 'message' ? row.message.id : null;
  }, [items]);


  const scrollToLatest = useCallback((animated: boolean) => {
    if (isWeb) {
      const offset = Math.max(0, contentHeightRef.current - viewportHeightRef.current);
      listRef.current?.scrollToOffset({ offset, animated });
    } else {
      listRef.current?.scrollToOffset({ offset: 0, animated });
    }
  }, []);


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


  const setAwayState = useCallback((next: boolean) => {
    awayRef.current = next;
    setAway((prev) => (prev === next ? prev : next));
    if (!next) setMissed(0);
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


  // scrollToIndex needs the row measured; when it is not, jump
  // near it by estimate and retry once
  useImperativeHandle(
    ref,
    () => ({
      scrollToMessage: (id) => {
        const index = data.findIndex((row) => row.type === 'message' && row.message.id === id);
        if (index < 0) return false;
        clearRetryTimer();
        atBottomRef.current = false;
        retriesRef.current = 0;
        listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
        return true;
      },
      scrollToLatest: () => scrollToLatest(true),
    }),
    [data, scrollToLatest, clearRetryTimer],
  );


  const renderItem = useCallback(
    ({ item }: { item: TimelineItem }) => {
      if (item.type === 'separator') return <TimeSeparator day={item.day} time={item.time} />;
      const { message, position } = item;
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
          onPressReactions={onPressReactions}
          onRetry={onRetry}
          onPressLink={onPressLink}
          onCopy={onCopy}
          onReact={onReact}
        />
      );
    },
    [isGroup, showAvatars, revealedId, lastOwnId, highlightedId, menuTargetId, canAct, canReply, labels, onPressMessage, onLongPressMessage, onSwipeReply, onPressQuote, onPressImage, onPressReactions, onRetry, onPressLink, onCopy, onReact],
  );


  // Stable FlatList handlers — a fresh identity per keystroke of
  // the composer would re-render the whole windowed cell set
  const onEndReached = useCallback(() => {
    if (!isWeb && hasMore && !loadingOlder) onLoadOlder();
  }, [hasMore, loadingOlder, onLoadOlder]);

  const onListLayout = useCallback((e: LayoutChangeEvent) => {
    // A shrinking viewport (composer grew, keyboard on web)
    // keeps the bottom in view when the reader was there
    const previous = viewportHeightRef.current;
    viewportHeightRef.current = e.nativeEvent.layout.height;
    if (isWeb && previous && previous !== viewportHeightRef.current && atBottomRef.current) scrollToLatest(false);
  }, [scrollToLatest]);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    if (!isWeb) return;
    contentHeightRef.current = h;
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
  }, [scrollToLatest]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    const distance = isWeb
      ? contentSize.height - layoutMeasurement.height - contentOffset.y
      : contentOffset.y;
    if (isWeb && pinnedOnceRef.current) atBottomRef.current = distance < 48;
    setAwayState(distance > AWAY_OFFSET);
  }, [setAwayState]);

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

  // Unmeasured rows: jump near the estimate and retry until the
  // target has a frame (bounded, one pending retry at a time)
  const onScrollToIndexFailed = useCallback(({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
    if (retriesRef.current >= MAX_INDEX_RETRIES) {
      // Out of retries: land on the estimate rather than nowhere,
      // and let the host explain — the highlight has long expired
      listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
      onJumpFailed?.();
      return;
    }
    retriesRef.current += 1;
    listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
    clearRetryTimer();
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    }, 120);
  }, [clearRetryTimer, onJumpFailed]);


  const typingRow = typing ? (
    <TypingBubble label={typing.label} name={typing.name} avatarUrl={typing.avatarUrl} withAvatar={showAvatars} />
  ) : null;

  // The visual top: the intro once history is exhausted, else the
  // paging affordance (explicit on web, a spinner natively)
  const topRow = !hasMore && intro ? (
    <ConversationIntro {...intro} />
  ) : isWeb && hasMore ? (
    <OlderMessagesRow loading={loadingOlder} labels={labels} onPress={onLoadOlderWeb} />
  ) : loadingOlder ? (
    <View className="items-center py-sm">
      <ActivityIndicator size="small" color={colors.brand} />
    </View>
  ) : null;


  return (
    <View style={{ flex: 1, backgroundColor: colors.chatCanvas }}>

      <FlatList
        ref={listRef}
        inverted={!isWeb}
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        className="flex-1"
        contentContainerStyle={isWeb ? CONTENT_STYLE_WEB : CONTENT_STYLE_NATIVE}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        // Inverted: header = bottom (typing), footer = top (intro / older)
        ListHeaderComponent={isWeb ? topRow : typingRow}
        ListFooterComponent={isWeb ? typingRow : topRow}
        onLayout={onListLayout}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        onScrollToIndexFailed={onScrollToIndexFailed}
        scrollEventThrottle={80}
        // Keeps the reader's place when messages arrive or older
        // pages land while scrolled up (native; the web branch
        // re-pins itself in onContentSizeChange instead)
        // The threshold keeps a reader near the newest end following
        // new rows (without it a prepended row lands below the fold)
        maintainVisibleContentPosition={isWeb ? undefined : { minIndexForVisible: 0, autoscrollToTopThreshold: AWAY_OFFSET }}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        initialNumToRender={20}
        maxToRenderPerBatch={12}
        windowSize={9}
      />

      {away ? (
        <ScrollToLatestButton
          label={missed > 0 ? labels.newMessages(missed) : labels.latestMessages}
          count={missed}
          onPress={() => {
            scrollToLatest(true);
            atBottomRef.current = true;
            setAwayState(false);
          }}
        />
      ) : null}

    </View>
  );
}));

export default MessageList;
