// -----------------------------------------------------------
//  [*] chatuikit — theme contract
//
//  Every colour and font family the kit draws with, as one
//  object the host hands to ChatUiKitProvider. The names mirror
//  the KNF palette the kit grew up in, but nothing here knows
//  that palette: a host maps its own tokens onto these keys.
//  defaultTheme is a neutral light palette so the kit renders
//  sensibly with no provider at all (tests, quick demos).
//
//  Text is themed as whole TextStyle objects (body, sender name,
//  caption, time) — a host changes sizes and weights, not just
//  families; resolveTheme fills whatever the host leaves out
//  from its font families.
//
//  Split into:
//
//    KitColors / KitFonts / KitTextStyles / KitTheme — the contract
//    KitResolvedTheme                — what components read
//    defaultTheme / darkTheme        — the stock palettes
//    resolveTheme                    — fills what the host leaves out
// -----------------------------------------------------------

import type { TextStyle } from 'react-native';







// -----------------------------------------------------------
// KitColors
// -----------------------------------------------------------
//
// Every colour the kit draws with — the field comments name
// the surfaces each token paints.
//
// Used by:
//   - KitTheme / KitResolvedTheme (below)
//   - the host's theme mapping (app-side)
// -----------------------------------------------------------

export interface KitColors {
  brand: string;         // own bubbles, primary accents
  brandSoft: string;     // own-reaction pill ground
  brandText: string;     // brand-coloured text on surfaces
  brandHeader: string;   // the room header ground
  onBrand: string;       // text and icons on brand fills
  onBrandWash: string;   // translucent white on brand fills
  accent: string;        // reaction highlight ring
  ink: string;           // primary text
  inkSoft: string;       // secondary text
  inkFaint: string;      // tertiary text, counters
  surface: string;       // cards, the composer bar
  surfaceSoft: string;   // pressed rows, the field pill
  line: string;          // hairlines
  lineStrong: string;    // emphasised dividers, quote rails
  danger: string;        // failed sends, delete
  dangerSoft: string;    // failed-send bubble wash
  success: string;       // delivered/read accents
  scrim: string;         // modal overlays
  shadow: string;        // shadowColor
  chatCanvas: string;    // the conversation feed's ground
  bubbleIn: string;      // received bubbles
  bubbleOut: string;     // own bubbles (onBrand text)
  quoteWash: string;     // reply-quote block inside a received bubble
  menuSurface: string;   // floating chrome: context menu, pills, fabs
}







// -----------------------------------------------------------
// KitFonts
// -----------------------------------------------------------
//
// The four font families the kit's text styles derive from.
//
// Used by:
//   - KitTheme / KitResolvedTheme (below)
//   - resolveTheme (below) — derives the text styles
// -----------------------------------------------------------

export interface KitFonts {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
}







// -----------------------------------------------------------
// KitTextStyles
// -----------------------------------------------------------
//
// Whole TextStyle objects, not just families — a host changes
// sizes and weights too.
//
// Used by:
//   - KitTheme (below) — optional overrides
//   - KitResolvedTheme (below) — every style present
// -----------------------------------------------------------

export interface KitTextStyles {
  body: TextStyle;      // message text
  name: TextStyle;      // the sender name above a run
  caption: TextStyle;   // separators, system rows, receipts
  time: TextStyle;      // the revealed time / status under a bubble
}







// -----------------------------------------------------------
// KitTheme
// -----------------------------------------------------------
//
// What a host hands to ChatUiKitProvider: colours and fonts
// required, everything else optional — resolveTheme fills the
// rest.
//
// Used by:
//   - provider/index.tsx — the provider's `theme` prop
//   - resolveTheme / defaultTheme / darkTheme (below)
// -----------------------------------------------------------

export interface KitTheme {
  colors: KitColors;
  fonts: KitFonts;
  // Optional overrides; resolveTheme derives the rest from fonts
  text?: Partial<KitTextStyles>;
  // Drives the keyboard's appearance and dark-only details;
  // default 'light'
  scheme?: 'light' | 'dark';
  // The discs behind initials: one per sender, picked by a hash
  // of the sender id so a person keeps their colour across rooms
  // Default: DEFAULT_AVATAR_COLORS
  avatarColors?: string[];
}







// -----------------------------------------------------------
// KitResolvedTheme
// -----------------------------------------------------------
//
// The theme components read: every text style present.
//
// Used by:
//   - provider/index.tsx — what useKitTheme answers
//   - resolveTheme (below) — the return shape
// -----------------------------------------------------------

export interface KitResolvedTheme {
  colors: KitColors;
  fonts: KitFonts;
  text: KitTextStyles;
  scheme: 'light' | 'dark';
  avatarColors: string[];
}







// -----------------------------------------------------------
// DEFAULT_AVATAR_COLORS
// -----------------------------------------------------------
//
// The stock discs behind initials: mid-tone, white-text-safe,
// distinct from the brand blue and from each other at small
// sizes.
//
// Used by:
//   - resolveTheme (below) — the fallback when the host's
//     theme brings no avatarColors of its own
// -----------------------------------------------------------

export const DEFAULT_AVATAR_COLORS = ['#D9534F', '#E07B39', '#B8960B', '#3E9B4F', '#1F9E8F', '#3A7BD5', '#7B5CD6', '#C64F93'];







// -----------------------------------------------------------
// defaultTheme
// -----------------------------------------------------------
//
// System fonts and a neutral light palette — what a host gets
// before it maps its own tokens, and what tests and quick
// demos render with when no provider is mounted.
//
// Used by:
//   - provider/index.tsx — the provider-less default env
//   - darkTheme (below) — the base it re-tones
// -----------------------------------------------------------

export const defaultTheme: KitTheme = {
  colors: {
    brand: '#2F6FED',
    brandSoft: '#E4ECFF',
    brandText: '#2457C5',
    brandHeader: '#2F6FED',
    onBrand: '#FFFFFF',
    onBrandWash: 'rgba(255, 255, 255, 0.22)',
    accent: '#E11D48',
    ink: '#111827',
    inkSoft: '#4B5563',
    inkFaint: '#9CA3AF',
    surface: '#FFFFFF',
    surfaceSoft: '#F3F4F6',
    line: '#E5E7EB',
    lineStrong: '#9CA3AF',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    success: '#16A34A',
    scrim: 'rgba(0, 0, 0, 0.45)',
    shadow: '#000000',
    chatCanvas: '#F9FAFB',
    bubbleIn: '#EDEFF3',
    bubbleOut: '#2F6FED',
    quoteWash: 'rgba(0, 0, 0, 0.06)',
    menuSurface: '#FFFFFF',
  },
  fonts: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
  },
};







// -----------------------------------------------------------
// darkTheme
// -----------------------------------------------------------
//
// The same tokens for a dark canvas — a host with its own dark
// palette maps that instead; this is the provider-less default
// and the reference for which tokens change between schemes.
//
// Used by:
//   - exported through the kit's barrel for hosts; nothing
//     calls this at the moment (the KNF app maps its own
//     dark palette)
// -----------------------------------------------------------

export const darkTheme: KitTheme = {
  ...defaultTheme,
  scheme: 'dark',
  colors: {
    ...defaultTheme.colors,
    brand: '#5B8DF6',
    brandSoft: '#1E2A44',
    brandText: '#8FB3FF',
    brandHeader: '#111827',
    onBrand: '#FFFFFF',
    onBrandWash: 'rgba(255, 255, 255, 0.18)',
    accent: '#FB7185',
    ink: '#F3F4F6',
    inkSoft: '#B5BCC8',
    inkFaint: '#6B7280',
    surface: '#111827',
    surfaceSoft: '#1F2937',
    line: '#273244',
    lineStrong: '#4B5563',
    danger: '#F87171',
    dangerSoft: '#3F1D1D',
    success: '#4ADE80',
    scrim: 'rgba(0, 0, 0, 0.6)',
    shadow: '#000000',
    chatCanvas: '#0B1220',
    bubbleIn: '#1F2937',
    bubbleOut: '#2F6FED',
    quoteWash: 'rgba(255, 255, 255, 0.08)',
    menuSurface: '#1F2937',
  },
};







// -----------------------------------------------------------
// resolveTheme
// -----------------------------------------------------------
//
// KitTheme → KitResolvedTheme: derives the four text styles
// from the host's font families, then lets the host's partial
// overrides win field by field; the scheme defaults to light
// and the avatar palette to DEFAULT_AVATAR_COLORS.
//
// Used by:
//   - provider/index.tsx — on every theme prop change, and
//     for the provider-less default env
// -----------------------------------------------------------

export function resolveTheme(theme: KitTheme): KitResolvedTheme {
  const { fonts } = theme;
  const defaults: KitTextStyles = {
    body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 21 },
    name: { fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 15 },
    caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 15 },
    time: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
  };
  return {
    colors: theme.colors,
    fonts,
    text: {
      body: { ...defaults.body, ...theme.text?.body },
      name: { ...defaults.name, ...theme.text?.name },
      caption: { ...defaults.caption, ...theme.text?.caption },
      time: { ...defaults.time, ...theme.text?.time },
    },
    scheme: theme.scheme ?? 'light',
    avatarColors: theme.avatarColors && theme.avatarColors.length > 0 ? theme.avatarColors : DEFAULT_AVATAR_COLORS,
  };
}
