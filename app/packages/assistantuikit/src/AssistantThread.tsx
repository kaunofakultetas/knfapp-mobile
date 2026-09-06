// -----------------------------------------------------------
//  [*] assistantuikit — AssistantThread
//
//  The whole chat surface under a runtime provider: the
//  message list, the empty state with its suggestion chips,
//  the error strip and the composer, in one keyboard-safe
//  column. Meant to be the screen body — the keyboard math
//  reads the column's own frame against the window, so put it
//  at the screen root or under a header the window already
//  accounts for: iOS pads through the platform's avoiding
//  view, and on Android the column pads ITSELF by the
//  keyboard's height whenever the edge-to-edge window keeps
//  its height under it (where the window still resizes, the
//  pad stays out of the way). The list keeps its visible
//  content in place while a reply streams in and follows the
//  tail through the upstream auto-scroll; a reader who
//  scrolled up gets a "latest" button and is never yanked.
//  Rows are AssistantMessage, read from the kit context this
//  component provides; the empty state is the host's title and
//  body plus one chip per suggestion, each sending its prompt
//  on a tap. The error strip sits under the LAST message's
//  scope, where the upstream error primitives read from, and
//  its retry reloads that message.
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

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import {
  defaultColors,
  type AssistantColors,
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

// The list memoizes its rows on this function's identity, so
// it is one module constant — never a closure over props
const renderMessage = () => <AssistantMessage />;







// -----------------------------------------------------------
// SuggestionChip
// -----------------------------------------------------------
//
// One tappable chip: the title, an optional description line,
// and the prompt behind it sent as a user message the moment
// it is pressed (the upstream primitive appends and runs).
//
// Used by:
//   - EmptyState (below)
// -----------------------------------------------------------

function SuggestionChip({ suggestion, index }: { suggestion: AssistantSuggestion; index: number }) {
  const { colors } = useAssistantKit();
  return (
    <ThreadPrimitive.Suggestion
      testID={`assistantuikit-suggestion-${index}`}
      prompt={suggestion.prompt}
      send
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>{suggestion.title}</Text>
      {suggestion.description ? (
        <Text style={{ fontSize: 12, lineHeight: 16, color: colors.inkSoft, marginTop: 2 }}>{suggestion.description}</Text>
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

  const { labels, colors } = useAssistantKit();
  const isEmpty = useAuiState((s) => s.thread.isEmpty);


  if (!isEmpty) return null;


  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 6 }}>{labels.emptyTitle}</Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>{labels.emptyBody}</Text>
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
// reader announces, since the glyph alone says nothing.
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
// the reader sees still while the tail grows; the upstream
// auto-scroll follows the tail only while pinned to it, so the
// away state below is purely the button's — it never scrolls
// on its own. Taps inside the list keep the keyboard (a send
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
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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

  const { labels, colors } = useAssistantKit();
  const lastIndex = useAuiState((s) => s.thread.messages.length - 1);


  if (lastIndex < 0) return null;


  return (
    <MessageByIndexProvider index={lastIndex}>
      <RetryBanner labels={labels} colors={colors} />
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

function RetryBanner({ labels, colors }: { labels: AssistantLabels; colors: AssistantColors }) {
  const aui = useAui();
  return <AssistantErrorBanner labels={labels} colors={colors} onRetry={() => aui.message.reload()} />;
}







// -----------------------------------------------------------
// KeyboardSafeColumn
// -----------------------------------------------------------
//
// The keyboard pad, per platform. iOS is the platform's
// avoiding view with 'padding' — it measures the column's own
// frame against the keyboard and pads the overlap. Android
// under edge-to-edge (the platform default on its current
// versions) keeps the window at full height while the keyboard
// covers it, so the platform's view is inert there: this column
// listens to the keyboard itself, and when a keyboard appears
// while the window KEPT its height, pads the bottom by the
// keyboard's height — where the window did resize (the
// platform lifting on its own), it pads nothing, so the two
// never stack. Detected per event: a device that resizes and
// one that does not both work.
//
// Used by:
//   - AssistantThread (below)
// -----------------------------------------------------------

function KeyboardSafeColumn({ children }: { children: ReactNode }) {

  const [androidPad, setAndroidPad] = useState(0);


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
      setAndroidPad(resized ? 0 : keyboard);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setAndroidPad(0));
    return () => {
      dims.remove();
      show.remove();
      hide.remove();
    };
  }, []);


  if (Platform.OS === 'android') {
    return (
      <View testID="assistantuikit-keyboard-column" style={{ flex: 1, paddingBottom: androidPad }}>
        {children}
      </View>
    );
  }


  return (
    <KeyboardAvoidingView
      testID="assistantuikit-keyboard-column"
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
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
  tools,
  suggestions,
  copyToClipboard,
  onPressLink,
  contentPaddingBottom = 0,
}: {
  labels: AssistantLabels;
  colors?: AssistantColors;
  // Tool-card renderers keyed by tool name; a name with no
  // entry falls to the generic card
  tools?: Record<string, ToolCardRenderer>;
  suggestions?: AssistantSuggestion[];
  // Without it the copy action is not rendered at all
  copyToClipboard?: (text: string) => Promise<void> | void;
  onPressLink?: (url: string) => void;
  // Room under the composer — a floating tab bar, a home
  // indicator the host does not pad for
  contentPaddingBottom?: number;
}) {
  return (
    <AssistantKitProvider labels={labels} colors={colors} tools={tools} copyToClipboard={copyToClipboard} onPressLink={onPressLink}>
      <KeyboardSafeColumn>
        <ThreadPrimitive.Root
          testID="assistantuikit-thread"
          style={{ flex: 1, backgroundColor: colors.surfaceSoft, paddingBottom: contentPaddingBottom }}
        >
          <MessageList suggestions={suggestions} />
          <LastMessageError />
          <AssistantComposer labels={labels} colors={colors} />
        </ThreadPrimitive.Root>
      </KeyboardSafeColumn>
    </AssistantKitProvider>
  );
}
