// -----------------------------------------------------------
//  [*] WayfindHost — the app's WayfindProvider + WayfindUiKitProvider
//
//  Feeds the standalone wayfinding packages what they may not
//  reach for themselves: the building graph (seed → cache →
//  server, through useBuildingGraph), the app palette and
//  Raleway families as the kit theme, the active locale (the
//  kit's own LT/EN catalog does the rest) and getUploadUrl as
//  the image resolver for server-hosted panoramas. Mounted by
//  the map tab around its own screen — the packages are only
//  ever rendered there.
//
//  Used by:
//    - app/(main)/tabs/map.tsx
// -----------------------------------------------------------

import { useMemo, type ReactNode } from 'react';

import { fonts } from '@/constants/theme';
import { useBuildingGraph } from '@/hooks/useBuildingGraph';
import { useTheme } from '@/hooks/useTheme';
import { getUploadUrl } from '@/services/api';
import { activeLocale } from '@/services/format';
import { WayfindProvider } from '@knf/wayfindengine';
import { WayfindUiKitProvider, defaultTheme, type KitTheme } from '@knf/wayfinduikit';


export default function WayfindHost({ children }: { children: ReactNode }) {

  const { colors, scheme } = useTheme();
  const { graph } = useBuildingGraph();


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
    <WayfindProvider graph={graph}>
      <WayfindUiKitProvider theme={theme} scheme={scheme === 'dark' ? 'dark' : 'light'} locale={activeLocale() === 'en' ? 'en' : 'lt'} env={env}>
        {children}
      </WayfindUiKitProvider>
    </WayfindProvider>
  );
}
