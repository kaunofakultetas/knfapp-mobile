// -----------------------------------------------------------
//  [*] chatkit — theme contract
//
//  Every colour and font family the kit draws with, as one
//  object the host hands to ChatKitProvider. The names mirror
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
//    KitResolvedTheme / resolveTheme — what components read
//    defaultTheme                    — the provider-less fallback
// -----------------------------------------------------------

import type { TextStyle } from 'react-native';

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

export interface KitFonts {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
}

export interface KitTextStyles {
  body: TextStyle;      // message text
  name: TextStyle;      // the sender name above a run
  caption: TextStyle;   // separators, system rows, receipts
  time: TextStyle;      // the revealed time / status under a bubble
}

export interface KitTheme {
  colors: KitColors;
  fonts: KitFonts;
  // Optional overrides; resolveTheme derives the rest from fonts
  text?: Partial<KitTextStyles>;
}

// The theme components read: every text style present
export interface KitResolvedTheme {
  colors: KitColors;
  fonts: KitFonts;
  text: KitTextStyles;
}


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
  };
}


// System fonts and a neutral palette — what a host gets before
// it maps its own tokens
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
