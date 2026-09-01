// -----------------------------------------------------------
//  [*] SocialUiKitHost — the app's SocialUiKitProvider
//
//  Feeds the standalone socialuikit what it may not reach for
//  itself: the app palette and Raleway families as the kit
//  theme, the active locale (the kit's own LT/EN catalog does
//  the rest), getUploadUrl as the image resolver and the
//  platform link opener. Mounted once in the (main) layout,
//  above every screen that renders kit pieces (the news tab,
//  the post, the comments, the profile).
//
//  The theme object is memoised on the palette so the kit's
//  memoised cards only re-render on a real scheme change.
//
//  Used by:
//    - app/(main)/_layout.tsx
// -----------------------------------------------------------

import { useMemo, type ReactNode } from 'react';

import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { getUploadUrl } from '@/services/api';
import { activeLocale } from '@/services/format';

import { openHref } from '@knf/chatuikit';
import { SocialUiKitProvider, type KitTheme } from '@knf/socialuikit';


export default function SocialUiKitHost({ children }: { children: ReactNode }) {

  const { colors, scheme } = useTheme();


  // App palette → kit tokens. The like heart takes the accent
  // (the post screen's heart already did), chips sit on the soft
  // surface, overlays on the scrim
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
        like: colors.accent,
        danger: colors.danger,
        success: colors.success,
        chip: colors.surfaceSoft,
        chipInk: colors.inkSoft,
        unreadTint: colors.brandSoft,
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
  const env = useMemo(() => ({ resolveImageUrl: (url: string) => getUploadUrl(url) ?? url, openHref }), []);


  return (
    <SocialUiKitProvider theme={theme} scheme={scheme === 'dark' ? 'dark' : 'light'} locale={activeLocale() === 'en' ? 'en' : 'lt'} env={env}>
      {children}
    </SocialUiKitProvider>
  );
}
