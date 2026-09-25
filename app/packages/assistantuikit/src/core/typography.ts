// -----------------------------------------------------------
//  [*] assistantuikit — typography
//
//  The one place a text style learns its FACE. A weight the
//  host mapped (AssistantFonts) is drawn in that family with
//  no fontWeight beside it — a per-weight font file IS the
//  weight, and a fontWeight on top makes Android fake a
//  second bold or fall back to the system face; a weight the
//  host left unset keeps the system face at that weight, so
//  a host with no fonts of its own looks exactly as before.
//  Code always takes the monospace face: the host's when it
//  named one, else the platform's.
//
//  Split into:
//
//    MONO           — the platform's monospace family
//    FontWeightName — the four weights the kit draws
//    typeface       — weight → the style fragment for it
//    monoFamily     — the code face
//
//  Used by:
//    - AssistantThread / AssistantComposer / AssistantErrorBanner
//      / AssistantMessage / MarkdownText / ToolCardShell — every
//      Text the kit draws
// -----------------------------------------------------------

import { Platform, type TextStyle } from 'react-native';

import type { AssistantFonts } from './types';


// The system weight each name stands for when the host left
// that slot unset — the numeric scale both platforms honour
const SYSTEM_WEIGHT = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;







// -----------------------------------------------------------
// MONO
// -----------------------------------------------------------
//
// Neither platform knows the other's family: iOS has no
// generic 'monospace', Android no Menlo — and an unknown
// family falls back to the proportional system font without
// a word.
//
// Used by:
//   - monoFamily (below) — the default code face
// -----------------------------------------------------------

export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });







// -----------------------------------------------------------
// FontWeightName
// -----------------------------------------------------------
//
// The four weights the kit draws — the AssistantFonts slots
// that are weights (mono is a face, not a weight).
//
// Used by:
//   - typeface (below) — its weight argument
// -----------------------------------------------------------

export type FontWeightName = 'regular' | 'medium' | 'semibold' | 'bold';







// -----------------------------------------------------------
// typeface
// -----------------------------------------------------------
//
//   typeface({ bold: 'Raleway-Bold' }, 'bold') → { fontFamily: 'Raleway-Bold' }
//   typeface({}, 'bold')                       → { fontWeight: '700' }
//   typeface({}, 'regular')                    → {}
//
// The style fragment for one weight, spread into a Text's
// style. The unset regular answers nothing at all, so a
// regular span nested in a bold one keeps inheriting — the
// way a system-font host always rendered.
//
// Used by:
//   - every text-drawing surface in the package
// -----------------------------------------------------------

export function typeface(fonts: AssistantFonts, weight: FontWeightName): TextStyle {
  const family = fonts[weight];
  if (family) return { fontFamily: family };
  return weight === 'regular' ? {} : { fontWeight: SYSTEM_WEIGHT[weight] };
}







// -----------------------------------------------------------
// monoFamily
// -----------------------------------------------------------
//
// The code face — the host's monospace when it named one,
// the platform's otherwise.
//
// Used by:
//   - MarkdownText.tsx — inline code and fenced blocks
//   - ToolCardShell.tsx — the generic card's raw payload
// -----------------------------------------------------------

export function monoFamily(fonts: AssistantFonts): string {
  return fonts.mono || MONO;
}
