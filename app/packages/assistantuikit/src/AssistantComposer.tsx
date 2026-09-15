// -----------------------------------------------------------
//  [*] assistantuikit — AssistantComposer
//
//  The input strip under the thread: a multiline field that
//  grows with its text up to six lines, and one button beside
//  it — Send while idle, Cancel while a run is in flight. The
//  upstream composer primitives own the text and the actions
//  (the field is bound to the runtime's composer, Send is
//  disabled on an empty field, the field clears when a send
//  lands); this file only lays them out and colours them.
//  Submit is the button alone: the keyboard's return key
//  inserts a newline, on the web too.
//
//  Split into (root component last):
//
//    ActionLabel       — the button text, brand-on-brand
//    AssistantComposer — the strip (default export)
//
//  Used by:
//    - AssistantThread.tsx — under the message list
//    - hosts composing their own thread
// -----------------------------------------------------------

import { Text } from 'react-native';
import { ComposerPrimitive, useAuiState } from '@assistant-ui/react-native';

import { defaultColors, type AssistantColors, type AssistantLabels } from './core/types';


// The input grows with its text between one line and
// INPUT_MAX_LINES, then scrolls — min/max height are derived
// from these, so the three must agree (all in dp)
const INPUT_LINE_HEIGHT = 20;
// Vertical padding inside the field, counted into both bounds
const INPUT_PADDING_V = 10;
// The tallest the field gets before it scrolls instead
const INPUT_MAX_LINES = 6;

// Static objects on purpose: a style FUNCTION on a Pressable is
// dropped under the host's JSX runtime, so the pressed look is
// left to the platform ripple/highlight
const BUTTON_STYLE = {
  marginLeft: 8,
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 20,
  justifyContent: 'center' as const,
};







// -----------------------------------------------------------
// ActionLabel
// -----------------------------------------------------------
//
// The one 14-point semibold text both buttons share; the
// caller picks the colour — onBrand on Send, ink on Cancel.
//
// Used by:
//   - AssistantComposer (below) — Send and Cancel
// -----------------------------------------------------------

function ActionLabel({ text, color }: { text: string; color: string }) {
  return <Text style={{ fontSize: 14, fontWeight: '600', color }}>{text}</Text>;
}







// -----------------------------------------------------------
// AssistantComposer (default export)
// -----------------------------------------------------------
//
// Lays the field and one button in a row; isRunning swaps
// Send for Cancel, canSend only DIMS Send — the primitive
// owns the real disable. Every string arrives in `labels`,
// `colors` falls back to the neutral palette.
//
// Used by:
//   - AssistantThread.tsx
//   - hosts, through the root export
// -----------------------------------------------------------

export default function AssistantComposer({
  labels,
  colors = defaultColors,
  onSend,
}: {
  labels: AssistantLabels;
  colors?: AssistantColors;
  // The host's haptic tick, fired as a sending press lands
  onSend?: () => void;
}) {

  const running = useAuiState((s) => s.thread.isRunning);
  // The primitive disables itself on an empty field; this only
  // dims the button to say so
  const canSend = useAuiState((s) => s.composer.canSend);


  return (
    <ComposerPrimitive.Root
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.surface,
      }}
    >

      <ComposerPrimitive.Input
        testID="assistantuikit-composer-input"
        multiline
        submitMode="none"
        placeholder={labels.placeholder}
        placeholderTextColor={colors.inkSoft}
        style={{
          flex: 1,
          minHeight: INPUT_LINE_HEIGHT + INPUT_PADDING_V * 2,
          maxHeight: INPUT_LINE_HEIGHT * INPUT_MAX_LINES + INPUT_PADDING_V * 2,
          paddingHorizontal: 14,
          paddingVertical: INPUT_PADDING_V,
          fontSize: 15,
          lineHeight: INPUT_LINE_HEIGHT,
          color: colors.ink,
          backgroundColor: colors.surfaceSoft,
          borderRadius: 20,
        }}
      />

      {/* One button: Cancel while a run is in flight, Send
          otherwise — the two never show together */}
      {running ? (
        <ComposerPrimitive.Cancel
          testID="assistantuikit-composer-cancel"
          style={{ ...BUTTON_STYLE, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line }}
        >
          <ActionLabel text={labels.cancel} color={colors.ink} />
        </ComposerPrimitive.Cancel>
      ) : (
        <ComposerPrimitive.Send
          testID="assistantuikit-composer-send"
          // The host's haptic tick — onPressIn so it lands with
          // the finger, only when the press will actually send
          onPressIn={canSend ? onSend : undefined}
          style={{ ...BUTTON_STYLE, backgroundColor: colors.brand, opacity: canSend ? 1 : 0.4 }}
        >
          <ActionLabel text={labels.send} color={colors.onBrand} />
        </ComposerPrimitive.Send>
      )}

    </ComposerPrimitive.Root>
  );
}
