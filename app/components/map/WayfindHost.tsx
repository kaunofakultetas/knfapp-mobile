// -----------------------------------------------------------
//  [*] WayfindHost — the app's WayfindProvider + WayfindUiKitProvider
//
//  Feeds the standalone wayfinding packages what they may not
//  reach for themselves: the building graph (seed → cache →
//  server, through useBuildingGraph), the app palette and
//  Raleway families as the kit theme, the app language as the
//  kit locale — read through useTranslation, so a language
//  switch re-renders the kit in the new language at once
//  (activeLocale()'s BCP 47 'en-GB' never equalled 'en', which
//  once pinned the kit to Lithuanian) — and getUploadUrl as
//  the image resolver for server-hosted panoramas.
//
//  WayfindKitHost is the kit half on its own, for the screens
//  that draw kit components without routing: the map editor,
//  the guided capture and the alignment screen mount it, so
//  their plan, HUD and stage speak the app's language and
//  scheme instead of the kit's Lithuanian light defaults
//  inside a dark English screen.
//
//  Split into (root component last):
//
//    WayfindKitHost — the kit provider, themed from the app
//    WayfindHost    — graph + kit, for the map tab (default)
//
//  Used by:
//    - app/(main)/tabs/map.tsx — WayfindHost
//    - app/(main)/map-editor/{index,capture,align}.tsx —
//      WayfindKitHost
// -----------------------------------------------------------

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { fonts } from '@/constants/theme';
import { useBuildingGraph } from '@/hooks/useBuildingGraph';
import { useTheme } from '@/hooks/useTheme';
import { getUploadUrl } from '@/services/api';
import { WayfindProvider } from '@knf/wayfindengine';
import { WayfindUiKitProvider, defaultTheme, type KitTheme } from '@knf/wayfinduikit';







// -----------------------------------------------------------
// WayfindKitHost
// -----------------------------------------------------------
//
// Two memos feed the kit provider: the palette-to-kit-token
// map (route on brand, brand-coloured text on the app's
// AA-checked brandText, plan on surface, the photo stage kept
// dark in both schemes) and an env whose resolveImageUrl falls
// back to the raw value where getUploadUrl answers null — the
// kit insists on a string. The locale follows i18n.language
// live; anything but Lithuanian reads English, the same rule
// the timetable host uses.
//
// Used by:
//   - WayfindHost (below)
//   - app/(main)/map-editor/index.tsx, capture.tsx, align.tsx
// -----------------------------------------------------------

export function WayfindKitHost({ children }: { children: ReactNode }) {

  const { colors, scheme } = useTheme();
  const { i18n } = useTranslation();


  // App palette → kit tokens. The route takes the brand, the
  // plan sits on the surface, the photo stage keeps its own dark
  const theme = useMemo<Partial<KitTheme>>(
    () => ({
      colors: {
        bg: colors.canvas,
        surface: colors.surface,
        ink: colors.ink,
        inkSoft: colors.inkSoft,
        inkFaint: colors.inkFaint,
        line: colors.line,
        brand: colors.brand,
        // Brand as TEXT is the AA-checked pink in dark mode
        brandText: colors.brandText,
        onBrand: colors.onBrand,
        brandSoft: colors.brandSoft,
        success: colors.success,
        danger: colors.danger,
        route: colors.brand,
        routeGlow: colors.brandSoft,
        plan: colors.surface,
        planInk: colors.inkSoft,
        // The photo stage keeps the kit's own dark look in both schemes
        stageBg: defaultTheme.colors.stageBg,
        stageInk: defaultTheme.colors.stageInk,
        overlay: colors.scrim,
        overlayInk: colors.onBrand,
        shadow: colors.shadow,
      },
      fonts: { regular: fonts.regular, medium: fonts.medium, bold: fonts.bold },
    }),
    [colors],
  );

  // getUploadUrl answers null for a value it cannot resolve — the
  // kit wants a string back, so the raw value stands in
  const env = useMemo(() => ({ resolveImageUrl: (url: string) => getUploadUrl(url) ?? url }), []);


  return (
    <WayfindUiKitProvider theme={theme} scheme={scheme === 'dark' ? 'dark' : 'light'} locale={i18n.language === 'lt' ? 'lt' : 'en'} env={env}>
      {children}
    </WayfindUiKitProvider>
  );
}







// -----------------------------------------------------------
// WayfindHost (default export)
// -----------------------------------------------------------
//
// The routing engine over the building graph, with the themed
// kit inside it — everything the map tab's hooks and kit
// components read.
//
// Used by:
//   - app/(main)/tabs/map.tsx — wraps the map screen
// -----------------------------------------------------------

export default function WayfindHost({ children }: { children: ReactNode }) {

  const { graph } = useBuildingGraph();


  return (
    <WayfindProvider graph={graph}>
      <WayfindKitHost>{children}</WayfindKitHost>
    </WayfindProvider>
  );
}
