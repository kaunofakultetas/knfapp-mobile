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
//  Labels, colours, the tool registry and the host callbacks
//  come from the kit context; the part components are
//  propless by upstream contract, which is why the table can
//  stay one constant and no part ever remounts on a re-render.
//
//  Split into (root component last):
//
//    UserTextPart     — plain text on the brand colour
//    TextPart         — markdown, streaming-aware
//    ReasoningPart    — the collapsible thinking row
//    EmptyPart        — typing dots while running
//    BranchPicker     — ‹ n / count › when siblings exist
//    ActionBar        — copy + regenerate + branch picker
//    UserBubble       — the right-hand row
//    AssistantBubble  — the left-hand row
//    AssistantMessage — the role switch (default export)
//
//  Used by:
//    - AssistantThread.tsx — every row of the list
//    - hosts composing their own list under AssistantKitProvider
// -----------------------------------------------------------

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import MarkdownText from './MarkdownText';
import { ToolCard } from './ToolCardShell';
import TypingIndicator from './TypingIndicator';


const BUBBLE_MAX_WIDTH = '86%';

// Static objects on purpose: a style FUNCTION on a Pressable is
// dropped under the host's JSX runtime
const ACTION_STYLE = { paddingHorizontal: 8, paddingVertical: 4, marginRight: 4 };

// A disabled action is dimmed to this — the primitives disable
// the press themselves, the dim only makes it visible
const DISABLED_OPACITY = 0.4;







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
  const { colors } = useAssistantKit();
  return (
    <Text selectable style={{ fontSize: 15, lineHeight: 21, color: colors.onBrand }}>
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
  const { colors, onPressLink } = useAssistantKit();
  return <MarkdownText text={text} colors={colors} onPressLink={onPressLink} isStreaming={status.type === 'running'} />;
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

  const { labels, colors } = useAssistantKit();
  const [open, setOpen] = useState(false);


  if (!text) return null;


  return (
    <View style={{ marginBottom: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}
      >
        <Text style={{ fontSize: 12, color: colors.inkSoft, marginRight: 6 }}>{open ? '▾' : '▸'}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.inkSoft }}>{labels.thinking}</Text>
      </Pressable>
      {open ? (
        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.inkSoft, paddingLeft: 14, paddingBottom: 4 }}>{text}</Text>
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


// The tables the upstream part renderer memoizes on — one
// identity for the life of the module, so rows never remount
// when the thread re-renders
const USER_PARTS = { Text: UserTextPart };
const ASSISTANT_PARTS = { Text: TextPart, Reasoning: ReasoningPart, Empty: EmptyPart, tools: { Fallback: ToolCard } };







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

  const { labels, colors } = useAssistantKit();
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
      <Text style={{ fontSize: 12, color: colors.inkSoft }}>
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
// ActionBar
// -----------------------------------------------------------
//
// Under a settled assistant bubble: copy (only when the host
// wired a clipboard — the upstream hook disables itself
// without one, and a dead button is worse than none), then
// regenerate on the last assistant message, then the branch
// picker. Hidden entirely while the message is still running.
// The copy selector mirrors the upstream primitive's exact
// disabled predicate — a message with no text to copy shows
// the action dimmed, so the disable the primitive applies is
// visible too.
//
// Used by:
//   - AssistantBubble (below)
// -----------------------------------------------------------

function ActionBar() {

  const { labels, colors, copyToClipboard } = useAssistantKit();
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


  const label = { fontSize: 12, fontWeight: '600' as const, color: colors.inkSoft };
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
      <BranchPicker />
    </View>
  );
}







// -----------------------------------------------------------
// UserBubble
// -----------------------------------------------------------
//
// Used by:
//   - AssistantMessage (below) — role 'user'
// -----------------------------------------------------------

function UserBubble() {
  const { colors } = useAssistantKit();
  return (
    <MessagePrimitive.Root
      testID="assistantuikit-message-user"
      style={{ alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 4 }}
    >
      <View
        style={{
          maxWidth: BUBBLE_MAX_WIDTH,
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

  const { colors } = useAssistantKit();
  const settledEmpty = useAuiState(
    (s) => s.message.parts.length === 0 && s.message.status?.type !== 'running' && s.message.status?.type !== 'requires-action',
  );


  if (settledEmpty) return null;


  return (
    <MessagePrimitive.Root
      testID="assistantuikit-message-assistant"
      style={{ alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 4 }}
    >
      <View
        style={{
          maxWidth: BUBBLE_MAX_WIDTH,
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
