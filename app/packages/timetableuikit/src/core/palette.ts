// -----------------------------------------------------------
//  [*] timetableuikit — subject palette
//
//  Every subject gets a stable pastel: the TITLE hashes to one
//  of the accent hues, and the pastel ground is that accent
//  alpha-composited over the theme's surface NUMERICALLY — so
//  it stays a solid, overdraw-free color that is correct on
//  any surface a theme brings, light or dark. Same title, same
//  color, every week, every screen.
//
//  Used by:
//    - grid/LessonCell.tsx — cell ground and accent bar
// -----------------------------------------------------------

// Mid-tone hues, distinct from each other at cell size and
// safe under dark ink
export const DEFAULT_SUBJECT_COLORS = ['#3A7BD5', '#1F9E8F', '#3E9B4F', '#B8960B', '#E07B39', '#D9534F', '#C64F93', '#7B5CD6'];


// Deterministic across sessions — never a runtime hash
const hashTitle = (title: string): number => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return hash;
};

// "#rrggbb" or "#rgb" → RGB channels; anything else (named
// colors, rgb()/hsl() strings) → null, and blend falls back
// instead of silently emitting a garbled hue
const parseHex = (color: string): [number, number, number] | null => {
  const raw = color.trim();
  const long = /^#([0-9a-f]{6})$/i.exec(raw);
  if (long) {
    const hex = long[1];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const short = /^#([0-9a-f]{3})$/i.exec(raw);
  if (short) {
    const hex = short[1];
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  return null;
};

// fg over bg at alpha, numerically — a SOLID resulting color.
// Either side unparseable → the bg unchanged: a wrong-but-safe
// plain surface beats a confidently wrong hue
const blend = (fg: string, bg: string, alpha: number): string => {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return bg;
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  const mix = (i: number) => to2(Math.round(f[i] * alpha + b[i] * (1 - alpha)));
  return `#${mix(0)}${mix(1)}${mix(2)}`;
};


export interface SubjectTint {
  // The pastel cell ground
  bg: string;
  // The full-strength hue — the cell's accent bar
  accent: string;
}

export function subjectTint(title: string, surface: string, palette: readonly string[] = DEFAULT_SUBJECT_COLORS): SubjectTint {
  const accent = palette.length > 0 ? palette[hashTitle(title) % palette.length] : '#3A7BD5';
  return { accent, bg: blend(accent, surface, 0.16) };
}
