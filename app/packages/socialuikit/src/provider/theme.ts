// -----------------------------------------------------------
//  [*] socialuikit — theme
//
//  Every colour, font family and corner radius the kit draws
//  with, as one object. defaultTheme carries the faculty
//  burgundy on a light neutral ground so the kit renders
//  sensibly with no provider at all (tests, quick demos);
//  darkTheme is the same tokens for a dark canvas and the
//  reference for which of them change between schemes. A host
//  with its own palette hands SocialUiKitProvider a deep
//  partial — resolveTheme fills the gaps from the scheme's
//  base, so overriding one colour never costs the other
//  sixteen.
//
//  Used by:
//    - provider/index.tsx — resolves the host's override and
//      serves the result through useKitTheme
//    - every component in the package, via useKitTheme
// -----------------------------------------------------------



export interface KitColors {
  bg: string;          // the feed canvas behind cards
  surface: string;     // cards, sheets, the comment composer
  ink: string;         // primary text
  inkSoft: string;     // secondary text (handles, snippets)
  inkFaint: string;    // tertiary text, timestamps, counters
  line: string;        // hairlines between rows and cards
  brand: string;       // primary actions, active states
  onBrand: string;     // text and icons on brand fills
  brandSoft: string;   // brand-tinted washes (own poll bar, pressed chips)
  like: string;        // the filled heart and its count
  danger: string;      // destructive actions, failed rows
  success: string;     // confirmations, accepted states
  chip: string;        // source/topic chip ground
  chipInk: string;     // text on chips
  unreadTint: string;  // the wash behind an unread activity row
  overlay: string;     // modal and image-viewer scrims
  shadow: string;      // shadowColor for floating chrome
}

export interface KitFonts {
  regular: string;
  medium: string;
  bold: string;
}

export interface KitRadii {
  card: number;   // post cards, link cards, media frames
  chip: number;   // source chips, poll bars
  pill: number;   // buttons, the new-posts pill (effectively a capsule)
}

export interface KitTheme {
  scheme: 'light' | 'dark';
  colors: KitColors;
  fonts: KitFonts;
  radii: KitRadii;
}

// What a host hands the provider: any subset, any depth
export interface KitThemeOverride {
  scheme?: 'light' | 'dark';
  colors?: Partial<KitColors>;
  fonts?: Partial<KitFonts>;
  radii?: Partial<KitRadii>;
}







// -----------------------------------------------------------
// defaultTheme / darkTheme
// -----------------------------------------------------------
//
// System fonts everywhere: the kit never ships font files, a
// host maps its loaded families onto the three slots.
//
// Used by:
//   - provider/index.tsx — the scheme picks which one is the
//     base under the host's override
//   - resolveTheme callers in tests and demos
// -----------------------------------------------------------

export const defaultTheme: KitTheme = {
  scheme: 'light',
  colors: {
    bg: '#F5F6F8',
    surface: '#FFFFFF',
    ink: '#111827',
    inkSoft: '#4B5563',
    inkFaint: '#9CA3AF',
    line: '#E5E7EB',
    brand: '#7B003F',
    onBrand: '#FFFFFF',
    brandSoft: '#F6E3ED',
    like: '#E0245E',
    danger: '#DC2626',
    success: '#16A34A',
    chip: '#F3F4F6',
    chipInk: '#374151',
    unreadTint: '#FBF4F8',
    overlay: 'rgba(0, 0, 0, 0.45)',
    shadow: '#000000',
  },
  fonts: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  },
  radii: {
    card: 16,
    chip: 10,
    pill: 999,
  },
};


// The burgundy and the heart are lightened so they hold their
// contrast on the dark ground; washes flip from tint-of-white
// to tint-of-black
export const darkTheme: KitTheme = {
  ...defaultTheme,
  scheme: 'dark',
  colors: {
    ...defaultTheme.colors,
    bg: '#0B1220',
    surface: '#111827',
    ink: '#F3F4F6',
    inkSoft: '#B5BCC8',
    inkFaint: '#6B7280',
    line: '#273244',
    brand: '#C9558A',
    onBrand: '#FFFFFF',
    brandSoft: '#3B1229',
    like: '#F2688C',
    danger: '#F87171',
    success: '#4ADE80',
    chip: '#1F2937',
    chipInk: '#D1D5DB',
    unreadTint: '#241723',
    overlay: 'rgba(0, 0, 0, 0.6)',
    shadow: '#000000',
  },
};







// -----------------------------------------------------------
// resolveTheme
// -----------------------------------------------------------
//
// One level of merge per branch is the structure's full depth:
// colours, fonts and radii are flat maps of scalars, so a
// spread per branch is a genuine deep merge. Without an
// override the base is returned as-is, so a host that themes
// nothing pays nothing.
//
// Used by:
//   - provider/index.tsx — once per (scheme, override) pair
// -----------------------------------------------------------

export function resolveTheme(base: KitTheme, override?: KitThemeOverride): KitTheme {
  if (!override) return base;

  return {
    scheme: override.scheme ?? base.scheme,
    colors: { ...base.colors, ...override.colors },
    fonts: { ...base.fonts, ...override.fonts },
    radii: { ...base.radii, ...override.radii },
  };
}
