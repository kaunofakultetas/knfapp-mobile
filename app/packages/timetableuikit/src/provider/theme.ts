// -----------------------------------------------------------
//  [*] timetableuikit — theme contract
//
//  Every color and font the kit draws with, as one object the
//  host hands to TimetableProvider. The names are semantic and
//  brand-neutral: a host maps its own tokens onto these keys,
//  and defaultTheme is a plain light palette so the kit renders
//  sensibly with no provider at all (tests, quick demos).
//
//  Split into:
//
//    TimetableColors / TimetableFonts / TimetableTextStyles /
//    TimetableTheme                  — the contract
//    TimetableResolvedTheme / resolveTheme — what components read
//    defaultTheme                    — the provider-less fallback
// -----------------------------------------------------------

import type { TextStyle } from 'react-native';

import { DEFAULT_SUBJECT_COLORS } from '../core/palette';

export interface TimetableColors {
  brand: string;        // today's day chip, selection accents
  onBrand: string;      // text on brand fills
  ink: string;          // titles
  inkSoft: string;      // times, rooms
  inkFaint: string;     // the hour axis, empty states
  surface: string;      // the grid's ground — subject pastels composite over THIS
  surfaceSoft: string;  // the header row, block wash base
  line: string;         // hour hairlines, column separators
  danger: string;       // conflict borders, the now line's urgency-free cousin is nowLine
  dangerSoft: string;   // conflict cell wash
  nowLine: string;      // the current-minute line and dot
  shadow: string;       // shadowColor
}

export interface TimetableFonts {
  regular: string;
  medium: string;
  semiBold: string;
  bold: string;
}

export interface TimetableTextStyles {
  title: TextStyle;   // the lesson title inside a cell
  meta: TextStyle;    // time range, rooms, groups
  axis: TextStyle;    // the hour labels
  day: TextStyle;     // the day names across the header
}

export interface TimetableTheme {
  colors: TimetableColors;
  fonts: TimetableFonts;
  // Optional overrides; resolveTheme derives the rest from fonts
  text?: Partial<TimetableTextStyles>;
  // The subject-pastel accent hues, hashed by title
  subjectColors?: string[];
}

// The theme components read: every text style present
export interface TimetableResolvedTheme {
  colors: TimetableColors;
  fonts: TimetableFonts;
  text: TimetableTextStyles;
  subjectColors: string[];
}


export function resolveTheme(theme: TimetableTheme): TimetableResolvedTheme {
  const { fonts } = theme;
  const defaults: TimetableTextStyles = {
    title: { fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 15 },
    meta: { fontFamily: fonts.regular, fontSize: 10, lineHeight: 13 },
    axis: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
    day: { fontFamily: fonts.semiBold, fontSize: 12, lineHeight: 15 },
  };
  return {
    colors: theme.colors,
    fonts,
    text: {
      title: { ...defaults.title, ...theme.text?.title },
      meta: { ...defaults.meta, ...theme.text?.meta },
      axis: { ...defaults.axis, ...theme.text?.axis },
      day: { ...defaults.day, ...theme.text?.day },
    },
    subjectColors: theme.subjectColors && theme.subjectColors.length > 0 ? theme.subjectColors : DEFAULT_SUBJECT_COLORS,
  };
}


// System fonts and a neutral light palette — what a host gets
// before it maps its own tokens
export const defaultTheme: TimetableTheme = {
  colors: {
    brand: '#2F6FED',
    onBrand: '#FFFFFF',
    ink: '#111827',
    inkSoft: '#4B5563',
    inkFaint: '#9CA3AF',
    surface: '#FFFFFF',
    surfaceSoft: '#F3F4F6',
    line: '#E5E7EB',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    nowLine: '#E11D48',
    shadow: '#000000',
  },
  fonts: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
  },
};
