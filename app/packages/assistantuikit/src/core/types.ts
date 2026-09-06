// -----------------------------------------------------------
//  [*] assistantuikit — types
//
//  What a host hands the surfaces: a colour palette, the
//  complete set of labels (the kit owns NO strings — every
//  word on screen arrives here, Lithuanian first in the host),
//  the tool-card renderer contract, and a suggestion chip.
//  The kit knows no tool by name: renderers are keyed by
//  whatever names the host's engine and container agree on,
//  and a name with no renderer falls to the generic card.
//
//  Used by:
//    - every component in the package
//    - hosts typing their labels, colours and tool registry
// -----------------------------------------------------------

import type { ReactNode } from 'react';


// Neutral by default; a host maps its own tokens on. onBrand
// is the ink that sits ON the brand colour (the user bubble),
// surfaceSoft the recessed fill behind code and tool details
export interface AssistantColors {
  ink: string;
  inkSoft: string;
  line: string;
  brand: string;
  onBrand: string;
  surface: string;
  surfaceSoft: string;
  danger: string;
}

export const defaultColors: AssistantColors = {
  ink: '#111827',
  inkSoft: '#4B5563',
  line: '#E5E7EB',
  brand: '#2F6FED',
  onBrand: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSoft: '#F3F4F6',
  danger: '#B91C1C',
};


// Every string the surfaces can show. All required: a missing
// label is a host bug the type checker catches, not a blank
// button a tester finds
export interface AssistantLabels {
  placeholder: string;
  send: string;
  cancel: string;
  retry: string;
  copy: string;
  copied: string;
  regenerate: string;
  thinking: string;
  emptyTitle: string;
  emptyBody: string;
  errorTitle: string;
  errorBody: string;
  toolRunning: string;
  toolDone: string;
  toolFailed: string;
  showDetails: string;
  hideDetails: string;
  previousBranch: string;
  nextBranch: string;
  scrollToLatest: string;
}


// The tool-card contract. `input` is whatever the model sent
// (a partial parse while its arguments still stream), `output`
// the container's result once it landed; 'failed' carries the
// error text when the runtime had one
export type ToolCardStatus = 'running' | 'done' | 'failed';

export interface ToolCardPart {
  toolName: string;
  input: unknown;
  output?: unknown;
  status: ToolCardStatus;
  errorText?: string;
}

export type ToolCardRenderer = (part: ToolCardPart) => ReactNode;


// An empty-state chip: the title is what the chip shows, the
// prompt is what gets sent when it is tapped
export interface AssistantSuggestion {
  title: string;
  prompt: string;
  description?: string;
}
