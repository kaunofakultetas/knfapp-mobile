// -----------------------------------------------------------
//  [*] assistantuikit — AssistantThread
//
//  The whole chat surface under a runtime provider: the
//  message list, the empty state with its suggestion chips,
//  the error strip and the composer, in one keyboard-safe
//  column. The keyboard math measures the column's own frame
//  IN THE WINDOW, so it works wherever the host mounts it — at
//  the screen root or under a header of its own: iOS pads
//  through the platform's avoiding view, handed the column's
//  distance from the window top (without it, a column under a
//  header came up short by the header's height and the
//  composer sat behind the keys); on Android the column pads
//  ITSELF by exactly the part of it the keyboard covers
//  whenever the edge-to-edge window keeps its height under the
//  keyboard (where the window still resizes, the pad stays out
//  of the way). The list keeps its visible
//  content in place while a reply streams in and follows the
//  tail through the upstream auto-scroll; a reader who
//  scrolled up gets a "latest" button and is never yanked.
//  Rows are AssistantMessage, read from the kit context this
//  component provides; the empty state is the host's title and
//  body plus one chip per suggestion, each sending its prompt
//  on a tap. The error strip sits under the LAST message's
//  scope, where the upstream error primitives read from, and
//  its retry reloads that message. Every text is drawn in the
//  host's font families (`fonts`, system faces by default).
//
//  Split into (root component last):
//
//    renderMessage      — the list's row: one AssistantMessage
//    SuggestionChip     — one empty-state chip
//    EmptyState         — title, body, chips
//    ScrollToLatest     — the floating "↓" while scrolled away
//    MessageList        — the list + the away tracking
//    LastMessageError   — the last message's scope for the banner
//    RetryBanner        — the banner, retry wired to that message
//    KeyboardSafeColumn — the per-platform keyboard pad
//    AssistantThread    — the column (default export)
//
//  Used by:
//    - hosts' assistant screens
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  MessageByIndexProvider,
  ThreadPrimitive,
  useAui,
  useAuiState,
  type ThreadMessage,
} from '@assistant-ui/react-native';

import AssistantComposer from './AssistantComposer';
import AssistantErrorBanner from './AssistantErrorBanner';
import AssistantMessage from './AssistantMessage';
import { AssistantKitProvider, useAssistantKit } from './core/context';
import { typeface } from './core/typography';
import {
  defaultColors,
  defaultFonts,
  type AssistantColors,
  type AssistantFonts,
  type AssistantLabels,
  type AssistantSuggestion,
  type ToolCardRenderer,
} from './core/types';


// Past this many points above the tail the reader counts as
// scrolled away — a stream's own growth stays under it
const AWAY_THRESHOLD = 80;

// The upstream auto-scroll stops following the stream past this
// distance, so an UPWARD move beyond it must already offer the
// button — and only within it does the button leave again
// (hysteresis: no dead zone between losing the follow and
// getting the way back)
const NEAR_THRESHOLD = 4;







// -----------------------------------------------------------
// renderMessage
// -----------------------------------------------------------
//
// The list's row: one AssistantMessage, reading the scope the
// list mounts it in. The list memoizes its rows on this
// function's identity, so it is one module constant — never a
// closure over props.
//
// Used by:
//   - MessageList (below) — the FlatList's row renderer
// -----------------------------------------------------------

const renderMessage = () => <AssistantMessage />;







// -----------------------------------------------------------
// SuggestionChip
// -----------------------------------------------------------
//
// One tappable chip: the title, an optional description line,
// and the prompt behind it sent as a user message the moment
// it is pressed (the upstream primitive appends and runs). A
// one-line chip still stands at the 44pt touch floor.
//
// Used by:
//   - EmptyState (below)
// -----------------------------------------------------------

function SuggestionChip({ suggestion, index }: { suggestion: AssistantSuggestion; index: number }) {
  const { colors, fonts } = useAssistantKit();
  return (
    <ThreadPrimitive.Suggestion
      testID={`assistantuikit-suggestion-${index}`}
      prompt={suggestion.prompt}
      send
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        minHeight: 44,
        justifyContent: 'center',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 14, ...typeface(fonts, 'semibold'), color: colors.ink }}>{suggestion.title}</Text>
      {suggestion.description ? (
        <Text style={{ fontSize: 12, lineHeight: 16, ...typeface(fonts, 'regular'), color: colors.inkSoft, marginTop: 2 }}>
          {suggestion.description}
        </Text>
      ) : null}
    </ThreadPrimitive.Suggestion>
  );
}







// -----------------------------------------------------------
// EmptyState
// -----------------------------------------------------------
//
// The list's empty slot. It renders only while the thread is
// truly empty — no messages AND not loading history — so a
// thread still fetching its past shows a blank, not a welcome.
//
// Used by:
//   - MessageList (below) — ListEmptyComponent
// -----------------------------------------------------------

function EmptyState({ suggestions }: { suggestions?: AssistantSuggestion[] }) {

  const { labels, colors, fonts } = useAssistantKit();
  const isEmpty = useAuiState((s) => s.thread.isEmpty);


  if (!isEmpty) return null;


  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}>
      <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 26, ...typeface(fonts, 'bold'), color: colors.ink, marginBottom: 6 }}>
        {labels.emptyTitle}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 20, ...typeface(fonts, 'regular'), color: colors.inkSoft }}>{labels.emptyBody}</Text>
      {suggestions && suggestions.length > 0 ? (
        <View style={{ marginTop: 20 }}>
          {suggestions.map((suggestion, index) => (
            <SuggestionChip key={`${index}-${suggestion.prompt}`} suggestion={suggestion} index={index} />
          ))}
        </View>
      ) : null}
    </View>
  );
}







// -----------------------------------------------------------
// ScrollToLatest
// -----------------------------------------------------------
//
// The floating "↓" over the list's bottom-right corner while
// the reader is scrolled away from the tail. A glyph, not a
// word, on screen — the host's label under it is what a screen
// reader announces, since the glyph alone says nothing. The
// disc stays a small 36pt; its hitSlop takes the target to the
// 44pt floor.
//
// Used by:
//   - MessageList (below)
// -----------------------------------------------------------

function ScrollToLatest({ onPress }: { onPress: () => void }) {
  const { labels, colors } = useAssistantKit();
  return (
    <Pressable
      testID="assistantuikit-scroll-latest"
      accessibilityRole="button"
      accessibilityLabel={labels.scrollToLatest}
      onPress={onPress}
      hitSlop={4}
      style={{
        position: 'absolute',
        right: 16,
        bottom: 12,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Text style={{ fontSize: 18, lineHeight: 22, color: colors.ink }}>↓</Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// MessageList
// -----------------------------------------------------------
//
// The upstream FlatList with the kit's row, the empty slot and
// the away tracking. maintainVisibleContentPosition keeps what
// the reader sees still while the tail grows — but ANDROID
// ONLY: on iOS the prop corrupts a last row whose height grows
// mid-stream (the cell keeps its stale frame, so the answer's
// text paints past its bubble over the action bar — seen on
// device the first live day); the upstream auto-scroll follows
// the tail only while pinned to it, so the away state below is
// purely the button's — it never scrolls on its own. Taps inside the list keep the keyboard (a send
// press must not need two taps) and a drag dismisses it —
// interactively where the platform can, on the drag where it
// cannot.
//
// Used by:
//   - AssistantThread (below)
// -----------------------------------------------------------

function MessageList({ suggestions }: { suggestions?: AssistantSuggestion[] }) {

  const listRef = useRef<FlatList<ThreadMessage>>(null);
  const lastOffsetY = useRef(0);
  const [away, setAway] = useState(false);


  // Away arms the moment an UPWARD move leaves the follow line
  // (or the distance alone grows past the away threshold), and
  // disarms only back AT the tail — otherwise a reader who
  // nudged up a few points has lost the auto-follow and has no
  // button either. The functional update returning the previous
  // value bails out of the re-render when nothing changed —
  // scroll events fire every frame
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distance = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const movedUp = contentOffset.y < lastOffsetY.current;
    lastOffsetY.current = contentOffset.y;
    setAway((was) => {
      const next = was ? distance > NEAR_THRESHOLD : distance > AWAY_THRESHOLD || (movedUp && distance > NEAR_THRESHOLD);
      return was === next ? was : next;
    });
  };


  return (
    <View style={{ flex: 1 }}>

      <ThreadPrimitive.MessagesFlatList
        ref={listRef}
        contentContainerStyle={{ flexGrow: 1, paddingTop: 8, paddingBottom: 8 }}
        maintainVisibleContentPosition={Platform.OS === 'android' ? { minIndexForVisible: 0 } : undefined}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        ListEmptyComponent={<EmptyState suggestions={suggestions} />}
      >
        {renderMessage}
      </ThreadPrimitive.MessagesFlatList>

      {away ? <ScrollToLatest onPress={() => listRef.current?.scrollToEnd({ animated: true })} /> : null}

    </View>
  );
}







// -----------------------------------------------------------
// LastMessageError
// -----------------------------------------------------------
//
// The error strip lives under the LAST message's scope: the
// upstream error primitives read the message they are
// rendered in, and only the last message can be the one that
// just failed. Retry reloads that message — a new sibling run
// under the same parent.
//
// Used by:
//   - AssistantThread (below)
// -----------------------------------------------------------

function LastMessageError() {

  const { labels, colors, fonts } = useAssistantKit();
  const lastIndex = useAuiState((s) => s.thread.messages.length - 1);


  if (lastIndex < 0) return null;


  return (
    <MessageByIndexProvider index={lastIndex}>
      <RetryBanner labels={labels} colors={colors} fonts={fonts} />
    </MessageByIndexProvider>
  );
}







// -----------------------------------------------------------
// RetryBanner
// -----------------------------------------------------------
//
// Reads the client INSIDE the message scope LastMessageError
// opens — the reload has to address that message, and a hook
// called one level up would read the thread scope instead.
//
// Used by:
//   - LastMessageError (above)
// -----------------------------------------------------------

function RetryBanner({ labels, colors, fonts }: { labels: AssistantLabels; colors: AssistantColors; fonts: AssistantFonts }) {
  const aui = useAui();
  return <AssistantErrorBanner labels={labels} colors={colors} fonts={fonts} onRetry={() => aui.message.reload()} />;
}







// -----------------------------------------------------------
// KeyboardSafeColumn
// -----------------------------------------------------------
//
// The keyboard pad, per platform, both off the column's frame
// measured in the WINDOW (measureInWindow, redone on every
// layout). iOS is the platform's avoiding view with 'padding'
// — it reads its frame relative to its PARENT, so the
// column's distance from the window top rides in as
// keyboardVerticalOffset: a host header above the column is
// accounted for, not paid for with a hidden composer. Android
// under edge-to-edge (the platform default on its current
// versions) keeps the window at full height while the keyboard
// covers it, so the platform's view is inert there: this
// column listens to the keyboard itself, and when a keyboard
// appears while the window KEPT its height, pads the bottom by
// the part of the column the keyboard actually covers (column
// bottom minus the keyboard's top edge) — not the keyboard's
// full height, which overshot whenever the column ended above
// the window's bottom. Until a frame is measured it falls back
// to the keyboard height. Where the window did resize (the
// platform lifting on its own), it pads nothing, so the two
// never stack. Detected per event: a device that resizes and
// one that does not both work.
//
// Used by:
//   - AssistantThread (below)
// -----------------------------------------------------------

function KeyboardSafeColumn({ children }: { children: ReactNode }) {

  const columnRef = useRef<View>(null);
  // The column's window frame — its top for iOS, its bottom
  // for Android; null until the first measure answers
  const [frame, setFrame] = useState<{ y: number; height: number } | null>(null);
  // Android only: the keyboard over a window that kept its
  // height — its top edge and height; null while none is
  const [androidKeyboard, setAndroidKeyboard] = useState<{ top: number; height: number } | null>(null);


  const measure = useCallback(() => {
    columnRef.current?.measureInWindow((_x, y, _width, height) => {
      if (!(height > 0)) return;
      setFrame((was) => (was && was.y === y && was.height === height ? was : { y, height }));
    });
  }, []);


  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // The window height with no keyboard involved — the show
    // handler's baseline; a rotation updates it
    let bareHeight = Dimensions.get('window').height;
    const dims = Dimensions.addEventListener('change', ({ window }) => {
      bareHeight = window.height;
    });
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      const keyboard = event.endCoordinates?.height ?? 0;
      const resized = bareHeight - Dimensions.get('window').height > keyboard * 0.5;
      setAndroidKeyboard(resized ? null : { top: event.endCoordinates?.screenY ?? 0, height: keyboard });
      measure();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setAndroidKeyboard(null));
    return () => {
      dims.remove();
      show.remove();
      hide.remove();
    };
  }, [measure]);


  if (Platform.OS === 'android') {
    // The covered part of the column when both edges are known
    // (a screenY of 0 is no edge at all), else the old
    // full-height pad
    const covered = androidKeyboard && frame && androidKeyboard.top > 0
      ? Math.max(0, Math.round(frame.y + frame.height - androidKeyboard.top))
      : androidKeyboard?.height ?? 0;
    return (
      <View
        ref={columnRef}
        onLayout={measure}
        testID="assistantuikit-keyboard-column"
        style={{ flex: 1, paddingBottom: androidKeyboard ? covered : 0 }}
      >
        {children}
      </View>
    );
  }


  return (
    <View ref={columnRef} onLayout={measure} testID="assistantuikit-keyboard-frame" style={{ flex: 1 }}>
      <KeyboardAvoidingView
        testID="assistantuikit-keyboard-column"
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={frame?.y ?? 0}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}







// -----------------------------------------------------------
// AssistantThread (default export)
// -----------------------------------------------------------
//
// contentPaddingBottom sits on the COLUMN, under the composer —
// an overlay at the screen bottom (a floating tab bar, the home
// indicator) covers the composer, and padding inside the list
// would never move it.
//
// Used by:
//   - hosts' assistant screens, through the root export
// -----------------------------------------------------------

export default function AssistantThread({
  labels,
  colors = defaultColors,
  fonts = defaultFonts,
  tools,
  suggestions,
  copyToClipboard,
  onPressLink,
  onFeedback,
  onComposerSend,
  onAnswerSettled,
  contentPaddingBottom = 0,
}: {
  labels: AssistantLabels;
  colors?: AssistantColors;
  // The host's loaded font families per weight — unset slots
  // keep the system face
  fonts?: AssistantFonts;
  // Tool-card renderers keyed by tool name; a name with no
  // entry falls to the generic card
  tools?: Record<string, ToolCardRenderer>;
  suggestions?: AssistantSuggestion[];
  // Without it the copy action is not rendered at all
  copyToClipboard?: (text: string) => Promise<void> | void;
  onPressLink?: (url: string) => void;
  // Without it the thumbs actions are not rendered at all
  onFeedback?: (messageId: string, rating: 1 | -1 | 0) => Promise<void> | void;
  // The host's haptic seams — send press, answer settled
  onComposerSend?: () => void;
  onAnswerSettled?: () => void;
  // Room under the composer — a floating tab bar, a home
  // indicator the host does not pad for
  contentPaddingBottom?: number;
}) {
  return (
    <AssistantKitProvider
      labels={labels}
      colors={colors}
      fonts={fonts}
      tools={tools}
      copyToClipboard={copyToClipboard}
      onPressLink={onPressLink}
      onFeedback={onFeedback}
      onComposerSend={onComposerSend}
      onAnswerSettled={onAnswerSettled}
    >
      <KeyboardSafeColumn>
        <ThreadPrimitive.Root
          testID="assistantuikit-thread"
          style={{ flex: 1, backgroundColor: colors.surfaceSoft, paddingBottom: contentPaddingBottom }}
        >
          <MessageList suggestions={suggestions} />
          <LastMessageError />
          <AssistantComposer labels={labels} colors={colors} fonts={fonts} onSend={onComposerSend} />
        </ThreadPrimitive.Root>
      </KeyboardSafeColumn>
    </AssistantKitProvider>
  );
}
