// -----------------------------------------------------------
//  [*] Tests — theme contrast
//
//  Every text token must clear WCAG AA (4.5:1) on every
//  surface it can land on, in both schemes — so a future
//  palette tweak cannot quietly regress readability the way
//  the original light inkFaint did.
// -----------------------------------------------------------

import { palettes, type Palette } from '@/constants/theme';


// WCAG 2.x relative luminance + contrast ratio for sRGB hex
const channel = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
};


const TEXT_TOKENS = ['ink', 'inkSoft', 'inkFaint'] as const satisfies readonly (keyof Palette)[];
const SURFACE_TOKENS = ['canvas', 'surface', 'surfaceSoft'] as const satisfies readonly (keyof Palette)[];


describe.each(['light', 'dark'] as const)('%s palette', (scheme) => {
  it.each(
    TEXT_TOKENS.flatMap((text) => SURFACE_TOKENS.map((surface) => [text, surface] as const)),
  )('%s clears WCAG AA on %s', (text, surface) => {
    const palette = palettes[scheme];
    expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
  });
});
