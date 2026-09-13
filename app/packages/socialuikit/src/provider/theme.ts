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







// -----------------------------------------------------------
// KitColors
// -----------------------------------------------------------
//
// The whole colour vocabulary — kit components draw from these
// tokens and nothing else, so a host override reaches every
// surface at once. Per-token roles are inline.
//
// Used by:
//   - KitTheme (below) — the `colors` branch
//   - every component, via useKitTheme().colors
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
  overlayInk: string;  // text and glyphs ON overlay fills
  shadow: string;      // shadowColor for floating chrome
}







// -----------------------------------------------------------
// KitFonts
// -----------------------------------------------------------
//
// The three family slots a host maps its loaded fonts onto;
// the defaults stay 'System' because the kit ships no font
// files of its own.
//
// Used by:
//   - KitTheme (below) — the `fonts` branch
//   - every text-drawing component, via useKitTheme().fonts
// -----------------------------------------------------------

export interface KitFonts {
  regular: string;
  medium: string;
  bold: string;
}







// -----------------------------------------------------------
// KitRadii
// -----------------------------------------------------------
//
// The corner-rounding vocabulary; per-token roles are inline.
//
// Used by:
//   - KitTheme (below) — the `radii` branch
//   - cards, chips and buttons, via useKitTheme().radii
// -----------------------------------------------------------

export interface KitRadii {
  card: number;   // post cards, link cards, media frames
  chip: number;   // source chips, poll bars
  pill: number;   // buttons, the new-posts pill (effectively a capsule)
}







// -----------------------------------------------------------
// KitTheme
// -----------------------------------------------------------
//
// The complete bundle one provider serves: the scheme word
// plus the three token branches.
//
// Used by:
//   - provider/index.tsx — resolved once per (scheme, override)
//     pair and served through useKitTheme
//   - components/social/SocialUiKitHost.tsx — the host app
//     builds its themed bundle in this shape
//   - defaultTheme, darkTheme, resolveTheme (below)
// -----------------------------------------------------------

export interface KitTheme {
  scheme: 'light' | 'dark';
  colors: KitColors;
  fonts: KitFonts;
  radii: KitRadii;
}







// -----------------------------------------------------------
// KitThemeOverride
// -----------------------------------------------------------
//
// What a host hands the provider: any subset, any depth — the
// gaps are filled from the scheme's base by resolveTheme.
//
// Used by:
//   - provider/index.tsx — SocialUiKitProvider's `theme` prop
//   - resolveTheme (below) — the override side of the merge
// -----------------------------------------------------------

export interface KitThemeOverride {
  scheme?: 'light' | 'dark';
  colors?: Partial<KitColors>;
  fonts?: Partial<KitFonts>;
  radii?: Partial<KitRadii>;
}







// -----------------------------------------------------------
// defaultTheme
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
    overlayInk: '#FFFFFF',
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







// -----------------------------------------------------------
// darkTheme
// -----------------------------------------------------------
//
// The burgundy and the heart are lightened so they hold their
// contrast on the dark ground; washes flip from tint-of-white
// to tint-of-black.
//
// Used by:
//   - provider/index.tsx — the base when scheme is 'dark'
// -----------------------------------------------------------

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
    overlayInk: '#FFFFFF',
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
