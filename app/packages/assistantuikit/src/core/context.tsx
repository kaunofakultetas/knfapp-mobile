// -----------------------------------------------------------
//  [*] assistantuikit — the kit context
//
//  The message list renders its rows through PROPLESS
//  component types (the upstream list mounts them by index),
//  and the part renderers inside a bubble — text, thinking,
//  tool card, typing dots — are component types too. Labels,
//  colours, the tool registry and the two host callbacks
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

import { defaultColors, type AssistantColors, type AssistantLabels, type ToolCardRenderer } from './types';


export interface AssistantKitValue {
  labels: AssistantLabels;
  colors: AssistantColors;
  tools: Record<string, ToolCardRenderer>;
  copyToClipboard?: (text: string) => Promise<void> | void;
  onPressLink?: (url: string) => void;
}

const AssistantKitContext = createContext<AssistantKitValue | null>(null);

// Frozen so a registry-less host shares one identity across
// renders — the parts memoize on the value they read
const NO_TOOLS: Record<string, ToolCardRenderer> = Object.freeze({});







// -----------------------------------------------------------
// AssistantKitProvider
// -----------------------------------------------------------
//
// The value is memoized on its five inputs, so a host that
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
  tools = NO_TOOLS,
  copyToClipboard,
  onPressLink,
  children,
}: {
  labels: AssistantLabels;
  colors?: AssistantColors;
  tools?: Record<string, ToolCardRenderer>;
  copyToClipboard?: (text: string) => Promise<void> | void;
  onPressLink?: (url: string) => void;
  children: ReactNode;
}) {
  const value = useMemo<AssistantKitValue>(
    () => ({ labels, colors, tools, copyToClipboard, onPressLink }),
    [labels, colors, tools, copyToClipboard, onPressLink],
  );
  return <AssistantKitContext.Provider value={value}>{children}</AssistantKitContext.Provider>;
}







// -----------------------------------------------------------
// useAssistantKit
// -----------------------------------------------------------
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
