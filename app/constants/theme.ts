// -----------------------------------------------------------
//  [*] Theme — the single source of color truth
//
//  Both color schemes of the app live here and nowhere else.
//  Every color reaches the UI through one of two doors:
//    - className tokens (bg-surface, text-ink, border-line…) —
//      tailwind.config.js maps them to CSS variables, and
//      themeVars below supplies the variable values for the
//      active scheme via a nativewind vars() style on the
//      root View (see app/_layout.tsx);
//    - useTheme().colors — the same palette as a JS object,
//      for props that cannot take a className (icon colors,
//      ActivityIndicator, navigation themes, StatusBar).
//
//  Raw hex values anywhere outside this file are a defect.
//
//  The burgundy #7B003F is the VU KnF brand color. In dark
//  mode `brand` is lifted for contrast on dark surfaces while
//  `brandHeader` (the top bar) dims instead, so dark mode
//  actually reads as dark.
//
//  Split into:
//
//    Palette          — the token shape both schemes share
//    palettes         — light + dark values
//    themeVars        — nativewind vars() per scheme
//    fonts            — Raleway family + mono names
//    navigationThemes — @react-navigation themes per scheme
// -----------------------------------------------------------

// Navigation base themes to derive ours from
import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

// Feeds the CSS variables behind every className token
import { vars } from 'nativewind';







// -----------------------------------------------------------
// Palette
// -----------------------------------------------------------
//
// The token shape shared by both schemes. Semantic, not
// literal: `ink` is "primary text", whatever color that is in
// the active scheme.
//
// Used by:
//   - palettes, themeVars, navigationThemes (below)
//   - hooks/useTheme.ts — the JS-side accessor
// -----------------------------------------------------------

export interface Palette {
  canvas: string;        // screen background
  surface: string;       // cards, sheets, bars
  surfaceSoft: string;   // inputs, chips, pressed rows
  ink: string;           // primary text
  inkSoft: string;       // secondary text
  inkFaint: string;      // disabled text, placeholders
  onBrand: string;       // text and icons on brand backgrounds
  line: string;          // hairline borders, separators
  lineStrong: string;    // input borders, emphasized dividers
  brand: string;         // primary actions, active states
  brandStrong: string;   // pressed primary
  brandSoft: string;     // selected-chip and badge wash
  brandHeader: string;   // the burgundy top bar
  accent: string;        // likes, highlights
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  scrim: string;         // modal overlays
}







// -----------------------------------------------------------
// palettes
// -----------------------------------------------------------
//
// The light neutrals carry a faint warm cast so surfaces sit
// naturally next to the burgundy; the dark scheme mirrors it.
//
// Used by:
//   - themeVars, navigationThemes (below)
//   - hooks/useTheme.ts
//   - components/ui/Toast.tsx — themed toast config
// -----------------------------------------------------------

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    canvas: '#F5F2F3',
    surface: '#FFFFFF',
    surfaceSoft: '#EFEAEC',
    ink: '#221E20',
    inkSoft: '#6E6468',
    inkFaint: '#A79DA1',
    onBrand: '#FFFFFF',
    line: '#E6E0E2',
    lineStrong: '#C9C0C4',
    brand: '#7B003F',
    brandStrong: '#5A002E',
    brandSoft: '#F5E4EC',
    brandHeader: '#7B003F',
    accent: '#E64164',
    success: '#2E7D32',
    successSoft: '#E5F2E6',
    warning: '#B26A00',
    warningSoft: '#F7EEDF',
    danger: '#C62828',
    dangerSoft: '#F9E5E5',
    info: '#1565C0',
    scrim: 'rgba(0, 0, 0, 0.45)',
  },
  dark: {
    canvas: '#151215',
    surface: '#201B1E',
    surfaceSoft: '#2A2428',
    ink: '#F3EEF0',
    inkSoft: '#A99FA4',
    inkFaint: '#6E6468',
    onBrand: '#FFFFFF',
    line: '#352E32',
    lineStrong: '#4A4247',
    brand: '#C2447C',
    brandStrong: '#A63363',
    brandSoft: '#3A2130',
    brandHeader: '#2E0F1E',
    accent: '#F0648A',
    success: '#66BB6A',
    successSoft: '#1E2F20',
    warning: '#FFB74D',
    warningSoft: '#332A1A',
    danger: '#EF5350',
    dangerSoft: '#351B1B',
    info: '#64B5F6',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
};







// -----------------------------------------------------------
// themeVars
// -----------------------------------------------------------
//
// nativewind vars() styles supplying the CSS variables that
// tailwind.config.js token colors resolve to. The root layout
// puts the active scheme's entry on a plain wrapper View, so
// switching theme restyles every className in the tree.
//
// Used by:
//   - app/_layout.tsx — style on the root wrapper View
// -----------------------------------------------------------

// Palette keys are camelCase; CSS variables are kebab-case
const toCssVars = (p: Palette) =>
  vars(
    Object.fromEntries(
      Object.entries(p).map(([key, value]) => [
        `--${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`,
        value,
      ]),
    ),
  );

export const themeVars = {
  light: toCssVars(palettes.light),
  dark: toCssVars(palettes.dark),
};







// -----------------------------------------------------------
// fonts
// -----------------------------------------------------------
//
// Names must match the keys given to useFonts() in
// app/_layout.tsx and the fontFamily table in
// tailwind.config.js. Raleway is the brand face; SpaceMono is
// for invitation codes and other fixed-width strings.
//
// Used by:
//   - app/_layout.tsx — useFonts loading
//   - components/ui — the rare style={} fontFamily cases
// -----------------------------------------------------------

export const fonts = {
  regular: 'Raleway-Regular',
  medium: 'Raleway-Medium',
  semiBold: 'Raleway-SemiBold',
  bold: 'Raleway-Bold',
  mono: 'SpaceMono',
} as const;







// -----------------------------------------------------------
// navigationThemes
// -----------------------------------------------------------
//
// @react-navigation themes derived from the palettes, so the
// native stack headers, back buttons and screen backgrounds
// follow the app scheme instead of the system one.
//
// Used by:
//   - app/_layout.tsx — ThemeProvider value
// -----------------------------------------------------------

const toNavigationTheme = (base: Theme, p: Palette): Theme => ({
  ...base,
  colors: {
    ...base.colors,
    primary: p.brand,
    background: p.canvas,
    card: p.surface,
    text: p.ink,
    border: p.line,
    notification: p.accent,
  },
});

export const navigationThemes: Record<'light' | 'dark', Theme> = {
  light: toNavigationTheme(DefaultTheme, palettes.light),
  dark: toNavigationTheme(DarkTheme, palettes.dark),
};
