// -----------------------------------------------------------
//  [*] RefreshSpinner — the house pull-to-refresh control
//
//  ONE native RefreshControl for every screen, wearing the
//  BRAND BURGUNDY in every scheme — the spinner is a brand
//  mark, not a theme surface, so it never swaps to the dark
//  palette's lifted pink. Android draws a solid burgundy disc
//  with a white arc; iOS tints its spinner burgundy. Both are
//  the PLATFORM controls — a custom fading disc was built and
//  deliberately removed: the dev shell's iOS runtime ignores
//  every RefreshControl styling prop (tint, opacity, offset —
//  the saga and the native-source evidence live in the
//  project's memory), so the two indicators showed stacked,
//  and the native one cannot be hidden there. A real build is
//  expected to honor this tint; verify there before touching
//  this file again.
//
//  Every prop forwards AFTER the theming — callers can
//  override, and the internals ScrollView injects into its
//  refreshControl element (children and style on Android, the
//  progressViewOffset the news header adds) flow through.
//
//  Used by:
//    - every screen with pull-to-refresh — the tabs, the news
//      and profile stacks, friends, info, admin
// -----------------------------------------------------------

import { RefreshControl, type RefreshControlProps } from 'react-native';

import { palettes } from '@/constants/theme';


export default function RefreshSpinner(props: RefreshControlProps) {
  return (
    <RefreshControl
      tintColor={palettes.light.brand}
      colors={[palettes.light.onBrand]}
      progressBackgroundColor={palettes.light.brand}
      {...props}
    />
  );
}
