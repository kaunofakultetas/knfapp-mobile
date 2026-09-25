// -----------------------------------------------------------
//  [*] assistantuikit — the kit context
//
//  The message list renders its rows through PROPLESS
//  component types (the upstream list mounts them by index),
//  and the part renderers inside a bubble — text, thinking,
//  tool card, typing dots — are component types too. Labels,
//  colours, fonts, the tool registry and the host callbacks
//  therefore travel by context: AssistantThread provides it
//  once, and every row and part reads it. Hosts composing the
//  bubbles into a list of their own wrap them in
//  AssistantKitProvider instead. A bubble rendered with no
//  provider above it throws a named error at render time
//  rather than painting an empty button.
//
//  Used by:
//    - AssistantThread.tsx — provides, and its own pieces read
//    - AssistantMessage.tsx / ToolCardShell.tsx — read
// -----------------------------------------------------------

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  defaultColors,
  defaultFonts,
  type AssistantColors,
  type AssistantFonts,
  type AssistantLabels,
  type ToolCardRenderer,
} from './types';







// -----------------------------------------------------------
// AssistantKitValue
// -----------------------------------------------------------
//
// What travels by context: the labels, the colours, the
// host's font families, the tool registry and the host
// callbacks.
//
// Used by:
//   - AssistantKitProvider / useAssistantKit (below)
//   - not on the root barrel — hosts hand the pieces to the
//     provider and read them back with the hook
// -----------------------------------------------------------

export interface AssistantKitValue {
  labels: AssistantLabels;
  colors: AssistantColors;
  fonts: AssistantFonts;
  tools: Record<string, ToolCardRenderer>;
  copyToClipboard?: (text: string) => Promise<void> | void;
  onPressLink?: (url: string) => void;
  // The host records a thumbs verdict on one assistant
  // message (1 up, -1 down, 0 clears); absent = no buttons
  onFeedback?: (messageId: string, rating: 1 | -1 | 0) => Promise<void> | void;
  // Fired the moment the send button is pressed with content
  // to send — the host's haptic tick; absent = silence
  onComposerSend?: () => void;
  // Fired once when the LAST assistant message settles from
  // running — the host's answer-complete haptic
  onAnswerSettled?: () => void;
}

// null marks "no provider above" — the hook turns it into a
// loud error naming the two valid roots
const AssistantKitContext = createContext<AssistantKitValue | null>(null);

// Frozen so a registry-less host shares one identity across
// renders — the parts memoize on the value they read
const NO_TOOLS: Record<string, ToolCardRenderer> = Object.freeze({});







// -----------------------------------------------------------
// AssistantKitProvider
// -----------------------------------------------------------
//
// The value is memoized on its inputs, so a host that
// re-renders with the same objects does not re-render every
// bubble; one that builds a fresh labels object each render
// re-renders them in place — never remounts, the component
// types are module constants.
//
// Used by:
//   - AssistantThread (its root)
//   - hosts composing AssistantMessage into their own list
// -----------------------------------------------------------

export function AssistantKitProvider({
  labels,
  colors = defaultColors,
  fonts = defaultFonts,
  tools = NO_TOOLS,
  copyToClipboard,
  onPressLink,
  onFeedback,
  onComposerSend,
  onAnswerSettled,
  children,
}: {
  labels: AssistantLabels;
  colors?: AssistantColors;
  fonts?: AssistantFonts;
  tools?: Record<string, ToolCardRenderer>;
  copyToClipboard?: (text: string) => Promise<void> | void;
  onPressLink?: (url: string) => void;
  onFeedback?: (messageId: string, rating: 1 | -1 | 0) => Promise<void> | void;
  onComposerSend?: () => void;
  onAnswerSettled?: () => void;
  children: ReactNode;
}) {
  const value = useMemo<AssistantKitValue>(
    () => ({ labels, colors, fonts, tools, copyToClipboard, onPressLink, onFeedback, onComposerSend, onAnswerSettled }),
    [labels, colors, fonts, tools, copyToClipboard, onPressLink, onFeedback, onComposerSend, onAnswerSettled],
  );
  return <AssistantKitContext.Provider value={value}>{children}</AssistantKitContext.Provider>;
}







// -----------------------------------------------------------
// useAssistantKit
// -----------------------------------------------------------
//
// Resolves the nearest provider's value — labels, colours,
// fonts, tool registry and the host callbacks. No provider-less
// fallback: outside AssistantThread or AssistantKitProvider
// it throws a named error instead of painting defaults.
//
// Used by:
//   - AssistantThread.tsx — the chips, empty state, latest button
//     and error scope
//   - AssistantMessage.tsx — the bubbles and their parts
//   - ToolCardShell.tsx — the registry lookup
// -----------------------------------------------------------

export function useAssistantKit(): AssistantKitValue {
  const value = useContext(AssistantKitContext);
  if (!value) throw new Error('assistantuikit: render inside AssistantThread or AssistantKitProvider');
  return value;
}
