// -----------------------------------------------------------
//  [*] wayfinduikit — theme
//
//  Every colour, font family and corner radius the kit draws
//  with, as one object. defaultTheme carries the faculty
//  burgundy on a light neutral ground so the kit renders
//  sensibly with no provider at all (tests, quick demos);
//  darkTheme is the same tokens for a dark canvas and the
//  reference for which of them change between schemes. A host
//  with its own palette hands WayfindUiKitProvider a deep
//  partial — resolveTheme fills the gaps from the scheme's
//  base, so overriding one colour never costs the other
//  nineteen.
//
//  Three token groups are this kit's own, beyond the usual
//  chrome. The route line and its glow are drawn OVER the
//  plan, so they must hold against the plan ground of both
//  schemes; the route defaults to the brand, so a host that
//  recolours the brand recolours the route with it. The plan
//  sheet and its ink are the drawing's paper — white inside
//  the light card, a shade above the dark card — so walls
//  read on both. The panorama stage is near-black in BOTH
//  schemes: a photo sphere sits on black whatever the app
//  around it does, and the stage ink is the hint text and
//  marker chrome laid on top of it.
//
//  Used by:
//    - provider/index.tsx — resolves the host's override and
//      serves the result through useKitTheme
//    - every component in the package, via useKitTheme
// -----------------------------------------------------------



export interface KitColors {
  bg: string;          // the screen canvas behind cards and sheets
  surface: string;     // cards, the route sheet, the search field
  ink: string;         // primary text
  inkSoft: string;     // secondary text (room hints, step details)
  inkFaint: string;    // tertiary text, distances in the margin
  line: string;        // hairlines between rows, chip borders
  brand: string;       // primary actions, the active floor chip
  onBrand: string;     // text and icons on brand fills
  brandSoft: string;   // brand-tinted washes (pressed chips, the current step)
  success: string;     // arrival, an aligned marker
  danger: string;      // off-route, a failed load
  route: string;       // the route polyline on the plan
  routeGlow: string;   // the wide translucent halo under the polyline
  plan: string;        // the floor plan's paper
  planInk: string;     // walls and room labels on the plan
  stageBg: string;     // the panorama stage ground (dark in both schemes)
  stageInk: string;    // hint text and marker chrome on the stage
  overlay: string;     // scrims over the plan and the stage
  overlayInk: string;  // text and glyphs ON overlay fills
  shadow: string;      // shadowColor for floating chrome
}

export interface KitFonts {
  regular: string;
  medium: string;
  bold: string;
}

export interface KitRadii {
  card: number;   // sheets, preview cards, the plan frame
  chip: number;   // floor chips, mode toggles
  pill: number;   // buttons, the you-are-here bar (effectively a capsule)
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
// host maps its loaded families onto the three slots. The
// route is the brand burgundy spelled out (not a reference),
// so the two stay equal by convention, not by binding — a host
// may still colour the route on its own.
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
    success: '#16A34A',
    danger: '#DC2626',
    route: '#7B003F',
    routeGlow: 'rgba(123, 0, 63, 0.22)',
    plan: '#FFFFFF',
    planInk: '#6B7280',
    stageBg: '#0B0F14',
    stageInk: '#FFFFFF',
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


// The burgundy is lightened so it holds its contrast on the
// dark ground, and the route follows it; washes flip from
// tint-of-white to tint-of-black. The plan paper stays a step
// ABOVE the card so the drawing still reads as a sheet
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
    success: '#4ADE80',
    danger: '#F87171',
    route: '#C9558A',
    routeGlow: 'rgba(201, 85, 138, 0.28)',
    plan: '#161E2E',
    planInk: '#9CA3AF',
    stageBg: '#000000',
    stageInk: '#FFFFFF',
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
// spread per branch is a genuine deep merge. Entries carrying
// an explicit undefined are dropped before each spread — a
// spread copies them as-is, so a host building its palette
// from optional config (`brand: config.brand` with the option
// unset) would otherwise erase the base token instead of
// falling through to it; the same guard the provider gives
// labels and env. Without an override the base is returned
// as-is, so a host that themes nothing pays nothing.
//
// Used by:
//   - provider/index.tsx — once per (scheme, override) pair
// -----------------------------------------------------------

const defined = <T extends object>(branch?: Partial<T>): Partial<T> =>
  Object.fromEntries(Object.entries(branch ?? {}).filter(([, value]) => value !== undefined)) as Partial<T>;

export function resolveTheme(base: KitTheme, override?: KitThemeOverride): KitTheme {
  if (!override) return base;

  return {
    scheme: override.scheme ?? base.scheme,
    colors: { ...base.colors, ...defined(override.colors) },
    fonts: { ...base.fonts, ...defined(override.fonts) },
    radii: { ...base.radii, ...defined(override.radii) },
  };
}
