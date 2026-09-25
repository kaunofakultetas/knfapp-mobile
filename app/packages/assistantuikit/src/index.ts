// -----------------------------------------------------------
//  [*] @knf/assistantuikit — public surface
//
//  Chat surfaces over the upstream React Native primitives:
//  the thread (list, empty state, error strip, composer), the
//  two bubbles, the composer and error strip on their own, the
//  tool-card frame, the typing dots, the markdown renderer and
//  its parser, plus the provider that carries labels, colours,
//  fonts and the tool registry to bubbles a host lays out
//  itself.
//  Every label arrives from the host, the kit knows no tool by
//  name and never imports an engine — it is typed against the
//  upstream part shapes alone.
//
//  Used by:
//    - app/(main)/tabs/assistant.tsx — the thread and its types
//    - components/assistant/toolCards.tsx — the card contract
// -----------------------------------------------------------

export { default as AssistantThread } from './AssistantThread';
export { default as AssistantMessage } from './AssistantMessage';
export { default as AssistantComposer } from './AssistantComposer';
export { default as AssistantErrorBanner } from './AssistantErrorBanner';
export { default as ToolCardShell } from './ToolCardShell';
export { default as TypingIndicator } from './TypingIndicator';
export { default as MarkdownText } from './MarkdownText';
export { parseMarkdown } from './core/markdown';
export type { MarkdownBlock } from './core/markdown';
export { AssistantKitProvider } from './core/context';
export { defaultColors, defaultFonts } from './core/types';
export type {
  AssistantColors,
  AssistantFonts,
  AssistantLabels,
  AssistantSuggestion,
  ToolCardPart,
  ToolCardRenderer,
  ToolCardStatus,
} from './core/types';
