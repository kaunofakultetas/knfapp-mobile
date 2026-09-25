// -----------------------------------------------------------
//  [*] assistantuikit — AssistantMessage
//
//  One row of the thread, rendered by role from the message
//  scope the upstream list mounts it in: the user's words in a
//  brand bubble on the right, the assistant's answer in a
//  surface bubble on the left. The assistant bubble hands the
//  upstream part renderer one module-constant component table
//  — text as streaming markdown, reasoning as a collapsible
//  "thinking" row, tool calls as ToolCard, and the typing dots
//  in the Empty slot while an answer has started but nothing
//  has arrived — then an action bar under the bubble once the
//  message settled: copy (with the copied state the upstream
//  hook keeps, dimmed when there is no text to copy),
//  regenerate on the last assistant message only, and the
//  branch picker whenever the message has siblings, its arrows
//  dimmed at their edge. A message that settled with NOTHING
//  in it renders no bubble at all — the thread's error strip
//  owns that moment.
//  Labels, colours, fonts, the tool registry and the host
//  callbacks come from the kit context; the part components
//  are propless by upstream contract, which is why the table
//  can stay one constant and no part ever remounts on a
//  re-render. Both bubbles cap their width off the LIVE window
//  width, so a rotation or a split-screen resize re-flows
//  them.
//
//  Split into (root component last):
//
//    UserTextPart     — plain text on the brand colour
//    TextPart         — markdown, streaming-aware
//    ReasoningPart    — the collapsible thinking row
//    EmptyPart        — typing dots while running
//    BranchPicker     — ‹ n / count › when siblings exist
//    SourcesFooter    — searchHandbook citations under the bubble
//    FeedbackButtons  — the host-backed thumbs pair
//    ActionBar        — copy + regenerate + thumbs + branch picker
//    UserBubble       — the right-hand row
//    AssistantBubble  — the left-hand row
//    AssistantMessage — the role switch (default export)
//
//  Used by:
//    - AssistantThread.tsx — every row of the list
//    - hosts composing their own list under AssistantKitProvider
// -----------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  MessagePrimitive,
  useAuiState,
  type EmptyMessagePartProps,
  type ReasoningMessagePartProps,
  type TextMessagePartProps,
} from '@assistant-ui/react-native';

import { useAssistantKit } from './core/context';
import { typeface } from './core/typography';
import MarkdownText from './MarkdownText';
import { ToolCard } from './ToolCardShell';
import TypingIndicator from './TypingIndicator';


// Both bubble kinds cap at this share of the row, so a long
// answer never touches the opposite edge. Applied in POINTS
// off the live window width (useWindowDimensions, so rotation
// and split-screen re-flow), not a yoga percentage — percent
// maxWidth inside a virtualized list row is an iOS
// measurement trap
const BUBBLE_MAX_SHARE = 0.86;


// Static objects on purpose: a style FUNCTION on a Pressable is
// dropped under the host's JSX runtime. The 44pt minimums are
// the platform touch-target floor — the labels stay small, the
// PRESSABLE does not (a 24pt copy button misses half its taps)
const ACTION_STYLE = {
  paddingHorizontal: 8,
  paddingVertical: 4,
  marginRight: 4,
  minWidth: 44,
  minHeight: 44,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

// A disabled action is dimmed to this — the primitives disable
// the press themselves, the dim only makes it visible
const DISABLED_OPACITY = 0.4;

// The tables the upstream part renderer memoizes on — one
// identity for the life of the module, so rows never remount
// when the thread re-renders. The parts are hoisted function
// declarations (below), so the tables may sit above them
const USER_PARTS = { Text: UserTextPart };
// The assistant side of the same memoized table — tool parts
// fall back to the generic card
const ASSISTANT_PARTS = { Text: TextPart, Reasoning: ReasoningPart, Empty: EmptyPart, tools: { Fallback: ToolCard } };







// -----------------------------------------------------------
// UserTextPart
// -----------------------------------------------------------
//
// What the user typed, verbatim — never parsed as markdown, a
// literal asterisk stays an asterisk.
//
// Used by:
//   - UserBubble (below) — USER_PARTS.Text
// -----------------------------------------------------------

function UserTextPart({ text }: TextMessagePartProps) {
  const { colors, fonts } = useAssistantKit();
  return (
    <Text selectable style={{ fontSize: 15, lineHeight: 21, ...typeface(fonts, 'regular'), color: colors.onBrand }}>
      {text}
    </Text>
  );
}







// -----------------------------------------------------------
// TextPart
// -----------------------------------------------------------
//
// The assistant's text through the markdown renderer; the
// part status says whether it is still streaming, so an open
// marker renders as plain text until its close arrives.
//
// Used by:
//   - AssistantBubble (below) — ASSISTANT_PARTS.Text
// -----------------------------------------------------------

function TextPart({ text, status }: TextMessagePartProps) {
  const { colors, fonts, onPressLink } = useAssistantKit();
  return <MarkdownText text={text} colors={colors} fonts={fonts} onPressLink={onPressLink} isStreaming={status.type === 'running'} />;
}







// -----------------------------------------------------------
// ReasoningPart
// -----------------------------------------------------------
//
// The model's thinking behind a one-line header, closed by
// default: the header shows the host's "thinking" label and a
// caret; opening it reveals the text in the soft ink. An
// empty reasoning part renders nothing at all.
//
// Used by:
//   - AssistantBubble (below) — ASSISTANT_PARTS.Reasoning
// -----------------------------------------------------------

function ReasoningPart({ text }: ReasoningMessagePartProps) {

  const { labels, colors, fonts } = useAssistantKit();
  const [open, setOpen] = useState(false);


  if (!text) return null;


  return (
    <View style={{ marginBottom: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, minHeight: 32 }}
      >
        <Text style={{ fontSize: 12, color: colors.inkSoft, marginRight: 6 }}>{open ? '▾' : '▸'}</Text>
        <Text style={{ fontSize: 12, ...typeface(fonts, 'semibold'), color: colors.inkSoft }}>{labels.thinking}</Text>
      </Pressable>
      {open ? (
        <Text style={{ fontSize: 13, lineHeight: 18, ...typeface(fonts, 'regular'), color: colors.inkSoft, paddingLeft: 14, paddingBottom: 4 }}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}







// -----------------------------------------------------------
// EmptyPart
// -----------------------------------------------------------
//
// The upstream renderer mounts this when the message has no
// parts, and when its last part is not text (a tool call the
// container is still answering). Only a running message
// deserves the dots — a settled one with nothing to show
// shows nothing.
//
// Used by:
//   - AssistantBubble (below) — ASSISTANT_PARTS.Empty
// -----------------------------------------------------------

function EmptyPart({ status }: EmptyMessagePartProps) {
  const { colors } = useAssistantKit();
  if (status.type !== 'running') return null;
  return <TypingIndicator colors={colors} />;
}







// -----------------------------------------------------------
// BranchPicker
// -----------------------------------------------------------
//
// ‹ n / count › — rendered only when the message has siblings
// (a regenerate makes one). The arrows carry the host's labels
// for screen readers; the upstream primitives disable each
// end at its edge, and the selectors below mirror their exact
// disabled predicates so the arrow at an edge is also DIMMED —
// a dead control at full strength reads as broken, not as an
// edge.
//
// Used by:
//   - ActionBar (below) — assistant rows
//   - UserBubble (below) — a user row with edited siblings
// -----------------------------------------------------------

function BranchPicker() {

  const { labels, colors, fonts } = useAssistantKit();
  const branchCount = useAuiState((s) => s.message.branchCount);
  const previousDisabled = useAuiState(
    (s) => s.message.branchNumber <= 1 || (s.thread.isRunning && !s.thread.capabilities.switchBranchDuringRun),
  );
  const nextDisabled = useAuiState(
    (s) => s.message.branchNumber >= s.message.branchCount || (s.thread.isRunning && !s.thread.capabilities.switchBranchDuringRun),
  );


  if (branchCount <= 1) return null;


  const arrow = { fontSize: 16, lineHeight: 18, color: colors.inkSoft };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
      <BranchPickerPrimitive.Previous
        accessibilityLabel={labels.previousBranch}
        style={{ ...ACTION_STYLE, opacity: previousDisabled ? DISABLED_OPACITY : 1 }}
      >
        <Text style={arrow}>‹</Text>
      </BranchPickerPrimitive.Previous>
      <Text style={{ fontSize: 12, ...typeface(fonts, 'regular'), color: colors.inkSoft }}>
        <BranchPickerPrimitive.Number />
        {' / '}
        <BranchPickerPrimitive.Count />
      </Text>
      <BranchPickerPrimitive.Next
        accessibilityLabel={labels.nextBranch}
        style={{ ...ACTION_STYLE, opacity: nextDisabled ? DISABLED_OPACITY : 1 }}
      >
        <Text style={arrow}>›</Text>
      </BranchPickerPrimitive.Next>
    </View>
  );
}







// -----------------------------------------------------------
// SourcesFooter
// -----------------------------------------------------------
//
// The citation list under an answer that used searchHandbook:
// every entry the tool returned, numbered in tool order — the
// same numbering the system prompt tells the model to cite as
// [1], [2] inline. Each row is a button: a tap expands the
// entry's EXCERPT in place (accordion, one open at a time),
// so a citation is verifiable without leaving the thread.
// Rows are 44pt touch targets showing the entry's TITLE only
// (up to two lines): the wire's `section` is a retrieval
// label — "faq", "contacts", a source domain — never words
// for a reader, and printing it cited "Kontaktai — contacts"
// (KNF-150). Reads the message's tool parts straight from the
// upstream state, so it needs no new wire shape; hidden while
// the message still runs and when no entries exist.
//
// Used by:
//   - AssistantBubble (below) — inside the bubble, under parts
// -----------------------------------------------------------

function SourcesFooter() {

  const { labels, colors, fonts } = useAssistantKit();
  const running = useAuiState((s) => s.message.status?.type === 'running');
  // The selector must answer a STABLE snapshot — the parts
  // array reference is one; the derived list is memoized off it
  const parts = useAuiState((s) => s.message.parts);
  const entries = useMemo(
    () =>
      parts.flatMap((part) => {
        const candidate = part as { toolName?: unknown; result?: { entries?: unknown } };
        if (candidate.toolName !== 'searchHandbook') return [];
        const listed = candidate.result?.entries;
        return Array.isArray(listed)
          ? listed.filter(
              (entry): entry is { id: string; title: string; excerpt?: string; section?: string } =>
                !!entry && typeof (entry as { title?: unknown }).title === 'string',
            )
          : [];
      }),
    [parts],
  );
  const [openIndex, setOpenIndex] = useState<number | null>(null);


  if (running || entries.length === 0) return null;


  return (
    <View testID="assistantuikit-sources" style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 }}>
      <Text style={{ fontSize: 11, ...typeface(fonts, 'bold'), color: colors.inkSoft, marginBottom: 2 }}>
        {labels.sourcesTitle}
      </Text>
      {entries.map((entry, index) => (
        // Position first: two searchHandbook calls in one turn
        // can return the same chunk, and a bare id would repeat
        <View key={`${index}:${entry.id}`}>
          <Pressable
            testID={`assistantuikit-source-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`[${index + 1}] ${entry.title}`}
            accessibilityState={{ expanded: openIndex === index }}
            onPress={() => setOpenIndex((was) => (was === index ? null : index))}
            style={{ paddingVertical: 6, minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 12, ...typeface(fonts, 'regular'), color: colors.inkSoft, lineHeight: 17 }} numberOfLines={2}>
              {openIndex === index ? '▾' : '▸'} [{index + 1}] {entry.title}
            </Text>
          </Pressable>
          {openIndex === index && entry.excerpt ? (
            <Text
              testID={`assistantuikit-source-excerpt-${index}`}
              style={{ fontSize: 12, lineHeight: 17, ...typeface(fonts, 'regular'), color: colors.inkSoft, paddingLeft: 14, paddingBottom: 4 }}
            >
              {entry.excerpt}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// FeedbackButtons
// -----------------------------------------------------------
//
// The thumbs pair, rendered only when the host handed an
// onFeedback callback: a tap records the verdict, tapping
// the same thumb again clears it (rating 0). The chosen
// state lives here per message row — the store of record is
// the host's, and a failed send simply leaves the visual
// choice, retried on the next tap.
//
// Used by:
//   - ActionBar (below)
// -----------------------------------------------------------

function FeedbackButtons() {

  const { labels, colors, fonts, onFeedback } = useAssistantKit();
  const messageId = useAuiState((s) => s.message.id);
  const [chosen, setChosen] = useState<1 | -1 | 0>(0);


  if (!onFeedback) return null;


  const choose = (rating: 1 | -1) => {
    const next = chosen === rating ? 0 : rating;
    setChosen(next);
    void onFeedback(messageId, next);
  };

  const label = (selected: boolean) => ({
    fontSize: 12,
    ...typeface(fonts, 'semibold'),
    color: selected ? colors.brandText : colors.inkSoft,
  });
  return (
    <>
      <Pressable
        testID="assistantuikit-feedback-up"
        onPress={() => choose(1)}
        accessibilityRole="button"
        accessibilityLabel={labels.feedbackUp}
        accessibilityState={{ selected: chosen === 1 }}
        style={ACTION_STYLE}
      >
        <Text style={label(chosen === 1)}>👍</Text>
      </Pressable>
      <Pressable
        testID="assistantuikit-feedback-down"
        onPress={() => choose(-1)}
        accessibilityRole="button"
        accessibilityLabel={labels.feedbackDown}
        accessibilityState={{ selected: chosen === -1 }}
        style={ACTION_STYLE}
      >
        <Text style={label(chosen === -1)}>👎</Text>
      </Pressable>
    </>
  );
}







// -----------------------------------------------------------
// ActionBar
// -----------------------------------------------------------
//
// Under a settled assistant bubble: copy (only when the host
// wired a clipboard — the upstream hook disables itself
// without one, and a dead button is worse than none), then
// regenerate on the last assistant message, then the thumbs
// pair, then the branch picker. Hidden entirely while the
// message is still running. The copy selector mirrors the
// upstream primitive's exact disabled predicate — a message
// with no text to copy shows the action dimmed, so the
// disable the primitive applies is visible too.
//
// Used by:
//   - AssistantBubble (below)
// -----------------------------------------------------------

function ActionBar() {

  const { labels, colors, fonts, copyToClipboard } = useAssistantKit();
  const isLast = useAuiState((s) => s.message.isLast);
  const running = useAuiState((s) => s.message.status?.type === 'running');
  const copyDisabled = useAuiState(
    (s) =>
      !(
        (s.message.role !== 'assistant' || s.message.status?.type !== 'running') &&
        s.message.parts.some((part) => part.type === 'text' && part.text.length > 0)
      ),
  );


  if (running) return null;


  const label = { fontSize: 12, ...typeface(fonts, 'semibold'), color: colors.inkSoft };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 4 }}>
      {copyToClipboard ? (
        <ActionBarPrimitive.Copy
          testID="assistantuikit-copy"
          copyToClipboard={copyToClipboard}
          style={{ ...ACTION_STYLE, opacity: copyDisabled ? DISABLED_OPACITY : 1 }}
        >
          {({ isCopied }) => <Text style={label}>{isCopied ? labels.copied : labels.copy}</Text>}
        </ActionBarPrimitive.Copy>
      ) : null}
      {isLast ? (
        <ActionBarPrimitive.Reload testID="assistantuikit-regenerate" style={ACTION_STYLE}>
          <Text style={label}>{labels.regenerate}</Text>
        </ActionBarPrimitive.Reload>
      ) : null}
      <FeedbackButtons />
      <BranchPicker />
    </View>
  );
}







// -----------------------------------------------------------
// UserBubble
// -----------------------------------------------------------
//
// The right-hand row: the user's words verbatim in a brand
// pill whose tighter bottom-right corner marks the sender,
// the branch picker beneath once an edit made siblings.
//
// Used by:
//   - AssistantMessage (below) — role 'user'
// -----------------------------------------------------------

function UserBubble() {
  const { colors } = useAssistantKit();
  const { width } = useWindowDimensions();
  return (
    <MessagePrimitive.Root
      testID="assistantuikit-message-user"
      style={{ alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 4 }}
    >
      <View
        style={{
          maxWidth: Math.round(width * BUBBLE_MAX_SHARE),
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 18,
          borderBottomRightRadius: 6,
          backgroundColor: colors.brand,
        }}
      >
        <MessagePrimitive.Parts components={USER_PARTS} />
      </View>
      <BranchPicker />
    </MessagePrimitive.Root>
  );
}







// -----------------------------------------------------------
// AssistantBubble
// -----------------------------------------------------------
//
// A message that settled with nothing in it — the shape a
// transport failure leaves behind when the run died before any
// chunk arrived, or a cancel landed first — renders nothing:
// the error strip under the thread owns that moment (and the
// retry), and an empty bordered pill with its own Regenerate
// would sit beside it as a second, redundant story. A RUNNING
// message with no parts still renders — that is the typing
// dots' slot.
//
// Used by:
//   - AssistantMessage (below) — role 'assistant'
// -----------------------------------------------------------

function AssistantBubble() {

  const { colors, onAnswerSettled } = useAssistantKit();
  const { width } = useWindowDimensions();
  const settledEmpty = useAuiState(
    (s) => s.message.parts.length === 0 && s.message.status?.type !== 'running' && s.message.status?.type !== 'requires-action',
  );

  // The answer-complete haptic: fired once on the running →
  // settled transition of the LAST message — a replayed old
  // thread (never running) stays silent. DEBOUNCED: between a
  // tool round-trip's response and the automatic follow-up
  // send the upstream reads 'ready' for a frame, and firing
  // there buzzes "done" in the middle of nearly every answer;
  // the timer is cancelled the moment running resumes
  const running = useAuiState((s) => s.message.status?.type === 'running');
  const isLast = useAuiState((s) => s.message.isLast);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current || !isLast) return;
    const timer = setTimeout(() => {
      wasRunning.current = false;
      onAnswerSettled?.();
    }, 400);
    return () => clearTimeout(timer);
  }, [running, isLast, onAnswerSettled]);


  if (settledEmpty) return null;


  return (
    <MessagePrimitive.Root
      testID="assistantuikit-message-assistant"
      style={{ alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 4 }}
    >
      <View
        style={{
          maxWidth: Math.round(width * BUBBLE_MAX_SHARE),
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 18,
          borderBottomLeftRadius: 6,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <MessagePrimitive.Parts components={ASSISTANT_PARTS} />
        <SourcesFooter />
      </View>
      <ActionBar />
    </MessagePrimitive.Root>
  );
}







// -----------------------------------------------------------
// AssistantMessage (default export)
// -----------------------------------------------------------
//
// System messages are the host's instructions, not
// conversation — they render nothing.
//
// Used by:
//   - AssistantThread.tsx — the list's row renderer
//   - hosts, through the root export
// -----------------------------------------------------------

export default function AssistantMessage() {
  const role = useAuiState((s) => s.message.role);
  if (role === 'user') return <UserBubble />;
  if (role === 'assistant') return <AssistantBubble />;
  return null;
}
