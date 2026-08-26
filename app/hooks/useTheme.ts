// -----------------------------------------------------------
//  [*] useTheme — JS-side access to the active palette
//
//  Colors reach the UI through two doors (see constants/
//  theme.ts): className tokens for everything Tailwind can
//  style, and this hook for props that only take a color
//  string — icon tints, ActivityIndicator, StatusBar,
//  placeholderTextColor, navigation themes.
//
//  The scheme comes from AppContext, which already resolves
//  the three-way setting ('system' follows the OS), so both
//  doors always agree and flip together on a theme change.
// -----------------------------------------------------------

// Resolved scheme lives in the app settings context
import { useApp } from '@/context/AppContext';

// The palettes themselves — the single source of color truth
import { palettes, type Palette } from '@/constants/theme';







// -----------------------------------------------------------
// useTheme
// -----------------------------------------------------------
//
//   const { scheme, colors } = useTheme()
//     scheme — 'light' | 'dark', already resolved ('system'
//              never leaks out of AppContext)
//     colors — the full Palette for that scheme; use it for
//              any prop that cannot take a className
//
// Used by:
//   - components/ui — icon tints, spinners, placeholder colors
//   - app/_layout.tsx — StatusBar + navigation theming
//   - any screen needing a JS-side color
// -----------------------------------------------------------

export function useTheme(): { scheme: 'light' | 'dark'; colors: Palette } {
  const { scheme } = useApp();
  return { scheme, colors: palettes[scheme] };
}
