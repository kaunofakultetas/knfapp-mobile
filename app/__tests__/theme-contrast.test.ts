// -----------------------------------------------------------
//  [*] Tests — theme contrast
//
//  Every text token must clear WCAG AA (4.5:1) on every
//  surface it can land on, in both schemes — so a future
//  palette tweak cannot quietly regress readability the way
//  the original light inkFaint did.
//
//  The matrix is the pairs the app actually PAINTS, not just
//  the three neutral inks on the three neutral grounds: the
//  first version checked only that nine-pair product and
//  passed while twelve painted pairs failed (KNF-131) — the
//  brand pink as text on every dark surface, white labels on
//  the danger red, the status inks on their own washes, the
//  faint ink on the raised surfaces.
// -----------------------------------------------------------

import { palettes, type Palette } from '@/constants/theme';


// Every token painted AS TEXT on a neutral or raised ground —
// brandText is what `text-brand` resolves to (tailwind.config.js)
const TEXT_TOKENS = [
  'ink',
  'inkSoft',
  'inkFaint',
  'brandText',
  'danger',
  'success',
  'warning',
  'info',
] as const satisfies readonly (keyof Palette)[];

// Every ground those inks land on: the screen, cards, soft
// fills, the chat feed and its received bubbles, floating
// chrome, and the brand-soft chips and selected rows
const SURFACE_TOKENS = [
  'canvas',
  'surface',
  'surfaceSoft',
  'chatCanvas',
  'bubbleIn',
  'menuSurface',
  'brandSoft',
] as const satisfies readonly (keyof Palette)[];

// Status inks on their own washes — the banners and badges
const WASH_PAIRS = [
  ['success', 'successSoft'],
  ['warning', 'warningSoft'],
  ['danger', 'dangerSoft'],
  ['brandText', 'brandSoft'],
] as const satisfies readonly (readonly [keyof Palette, keyof Palette])[];

// The ONLY fills an onBrand label may sit on. success, warning,
// info and accent are text colors (1.7–3.5:1 under white in
// dark mode) — a red fill under a white label is dangerFill
const ON_BRAND_FILLS = [
  'brand',
  'brandStrong',
  'brandHeader',
  'bubbleOut',
  'dangerFill',
] as const satisfies readonly (keyof Palette)[];







// -----------------------------------------------------------
// channel
// -----------------------------------------------------------
//
// sRGB channel → linear light (WCAG 2.x)
//
// Used by:
//   - luminance (below)
// -----------------------------------------------------------

const channel = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));







// -----------------------------------------------------------
// luminance
// -----------------------------------------------------------
//
// WCAG 2.x relative luminance of a #rrggbb hex
//
// Used by:
//   - contrast (below)
// -----------------------------------------------------------

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};







// -----------------------------------------------------------
// contrast
// -----------------------------------------------------------
//
// WCAG 2.x contrast ratio of two hex colors
//
// Used by:
//   - every test below
// -----------------------------------------------------------

const contrast = (a: string, b: string) => {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
};


describe.each(['light', 'dark'] as const)('%s palette', (scheme) => {
  const palette = palettes[scheme];


  it.each(
    TEXT_TOKENS.flatMap((text) => SURFACE_TOKENS.map((surface) => [text, surface] as const)),
  )('%s clears WCAG AA on %s', (text, surface) => {
    expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
  });


  it.each(WASH_PAIRS)('%s clears WCAG AA on its %s wash', (text, wash) => {
    expect(contrast(palette[text], palette[wash])).toBeGreaterThanOrEqual(4.5);
  });


  it.each(ON_BRAND_FILLS)('an onBrand label clears WCAG AA on %s', (fill) => {
    expect(contrast(palette.onBrand, palette[fill])).toBeGreaterThanOrEqual(4.5);
  });


  // text-brand-fill: the fill hue as a label on a white
  // bg-on-brand pill (the news filter chip, the sidebar login)
  it('the brand fill as text clears WCAG AA on an onBrand pill', () => {
    expect(contrast(palette.brand, palette.onBrand)).toBeGreaterThanOrEqual(4.5);
  });


  // Fill boundaries are non-text UI (WCAG 1.4.11, 3:1): a danger
  // button must still read as a button on the screen behind it
  it('the danger fill stands off the canvas and the cards at 3:1', () => {
    expect(contrast(palette.dangerFill, palette.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(palette.dangerFill, palette.surface)).toBeGreaterThanOrEqual(3);
  });
});
