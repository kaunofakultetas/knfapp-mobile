// -----------------------------------------------------------
//  [*] assistantuikit — ToolCardShell and the tool card
//
//  A tool call inside an assistant bubble renders as a card.
//  The SHELL is the visual frame every card shares — a status
//  dot, the title, the status label, an optional body and an
//  optional details block behind a show/hide toggle. The CARD
//  is what the message's part renderer mounts for a tool-call
//  part: it reduces the upstream part to the kit's contract
//  (name, input, output, status, error text), looks the name
//  up in the host's renderer registry and hands the reduced
//  part over; a name with no renderer falls to the generic
//  card — the shell titled with the tool name, the raw input
//  and output behind the toggle. The kit knows no tool by
//  name; the registry is the host's.
//
//  Split into (root component last):
//
//    describeValue  — error/result → one readable string
//    toToolCardPart — upstream tool part → ToolCardPart
//    RawBlock       — input + output as monospace JSON
//    ToolCard       — registry lookup + generic fallback
//    ToolCardShell  — the frame (default export)
//
//  Used by:
//    - AssistantMessage.tsx — ToolCard as the tools fallback
//    - hosts' registry renderers — ToolCardShell as their frame
// -----------------------------------------------------------

import { useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { ToolCallMessagePartProps } from '@assistant-ui/react-native';

import { useAssistantKit } from './core/context';
import { defaultColors, type AssistantColors, type AssistantLabels, type ToolCardPart, type ToolCardStatus } from './core/types';


const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });







// -----------------------------------------------------------
// describeValue
// -----------------------------------------------------------
//
// One readable line out of whatever the runtime carried as an
// error or a failed result: a string as is, an Error-shaped
// object by its message, the runtime's failed-result envelope
// ({ error: string } or { error: { message } } — the shape a
// streamed tool error arrives in) by the text inside it,
// anything else as JSON — and the String() form when the value
// refuses to serialize.
//
// Used by:
//   - toToolCardPart (below) — the error text
// -----------------------------------------------------------

function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    if ('message' in value && typeof value.message === 'string') return value.message;
    if ('error' in value) {
      const inner = value.error;
      if (typeof inner === 'string') return inner;
      if (typeof inner === 'object' && inner !== null && 'message' in inner && typeof inner.message === 'string') {
        return inner.message;
      }
    }
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}







// -----------------------------------------------------------
// toToolCardPart
// -----------------------------------------------------------
//
// The upstream part status is the MESSAGE's while a result is
// still owed (running, requires-action, or the message's own
// failure) and 'complete' once one landed; isError marks a
// result that is itself the failure. Both failure roads end in
// 'failed' with whatever text the runtime had.
//
// Used by:
//   - ToolCard (below)
// -----------------------------------------------------------

export function toToolCardPart(part: ToolCallMessagePartProps): ToolCardPart {
  const { toolName, args, result, isError, status } = part;
  const base = { toolName, input: args, output: result };
  if (isError) return { ...base, status: 'failed', errorText: describeValue(result) };
  if (status.type === 'running' || status.type === 'requires-action') return { ...base, status: 'running' };
  if (status.type === 'incomplete') {
    return { ...base, status: 'failed', ...(status.error !== undefined ? { errorText: describeValue(status.error) } : {}) };
  }
  return { ...base, status: 'done' };
}







// -----------------------------------------------------------
// RawBlock
// -----------------------------------------------------------
//
// The generic card's details: the input the model sent and,
// once it landed, the container's output — pretty-printed
// JSON in monospace, output under a hairline. No headings:
// the kit owns no strings, and the shape reads on its own.
//
// Used by:
//   - ToolCard (below) — the fallback's details
// -----------------------------------------------------------

function RawBlock({ input, output, colors }: { input: unknown; output?: unknown; colors: AssistantColors }) {
  const pretty = (value: unknown) => {
    try {
      return JSON.stringify(value, null, 2) ?? String(value);
    } catch {
      return String(value);
    }
  };
  const mono = { fontFamily: MONO, fontSize: 12, lineHeight: 17, color: colors.ink };
  return (
    <View>
      <Text style={mono}>{pretty(input)}</Text>
      {output !== undefined ? (
        <>
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />
          <Text style={mono}>{pretty(output)}</Text>
        </>
      ) : null}
    </View>
  );
}







// -----------------------------------------------------------
// ToolCard
// -----------------------------------------------------------
//
// The tools fallback the assistant bubble hands the upstream
// part renderer. The registry lookup is an OWN-property read:
// a tool the model names 'constructor' must fall to the
// generic card, not to Object.prototype. The wrapper carries
// the stable testID whichever road renders the card.
//
// Used by:
//   - AssistantMessage.tsx — components.tools.Fallback
// -----------------------------------------------------------

export function ToolCard(props: ToolCallMessagePartProps) {

  const { labels, colors, tools } = useAssistantKit();
  const part = toToolCardPart(props);
  const renderer = Object.prototype.hasOwnProperty.call(tools, part.toolName) ? tools[part.toolName] : undefined;


  return (
    <View testID={`assistantuikit-tool-${part.toolName}`}>
      {renderer ? (
        renderer(part)
      ) : (
        <ToolCardShell
          title={part.toolName}
          status={part.status}
          labels={labels}
          colors={colors}
          details={<RawBlock input={part.input} output={part.output} colors={colors} />}
        >
          {part.errorText ? <Text style={{ fontSize: 13, lineHeight: 18, color: colors.danger }}>{part.errorText}</Text> : null}
        </ToolCardShell>
      )}
    </View>
  );
}







// -----------------------------------------------------------
// ToolCardShell (default export)
// -----------------------------------------------------------
//
// The frame: status dot (soft while running, brand when done,
// danger when failed), title, status label, an optional body,
// and an optional details block the reader opens with the
// show/hide toggle — closed by default, so a card stays one
// line tall until asked.
//
// Used by:
//   - ToolCard (above) — the generic fallback
//   - hosts' registry renderers, through the root export
// -----------------------------------------------------------

export default function ToolCardShell({
  title,
  status,
  labels,
  colors = defaultColors,
  children,
  details,
}: {
  title: string;
  status: ToolCardStatus;
  labels: AssistantLabels;
  colors?: AssistantColors;
  children?: ReactNode;
  details?: ReactNode;
}) {

  const [open, setOpen] = useState(false);
  const statusLabel = status === 'running' ? labels.toolRunning : status === 'done' ? labels.toolDone : labels.toolFailed;
  const dotColor = status === 'running' ? colors.inkSoft : status === 'done' ? colors.brand : colors.danger;


  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 12,
        backgroundColor: colors.surface,
        marginVertical: 4,
        overflow: 'hidden',
      }}
    >

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor, marginRight: 8 }} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: status === 'failed' ? colors.danger : colors.inkSoft, marginLeft: 8 }}>
          {statusLabel}
        </Text>
      </View>

      {children ? <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>{children}</View> : null}

      {/* Details — the toggle only exists when there is
          something to open */}
      {details ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((was) => !was)}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.brand }}>
              {open ? labels.hideDetails : labels.showDetails}
            </Text>
          </Pressable>
          {open ? <View style={{ backgroundColor: colors.surfaceSoft, padding: 12 }}>{details}</View> : null}
        </>
      ) : null}

    </View>
  );
}
