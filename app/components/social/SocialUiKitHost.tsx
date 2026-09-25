// -----------------------------------------------------------
//  [*] SocialUiKitHost — the app's SocialUiKitProvider
//
//  Feeds the standalone socialuikit what it may not reach for
//  itself: the app palette and Raleway families as the kit
//  theme, the active language, getUploadUrl as the image
//  resolver and the platform link opener. Mounted once in the
//  (main) layout, above every screen that renders kit pieces
//  (the news tab, the post, the comments, the profile, the
//  activity list).
//
//  The language follows i18next LIVE: the host subscribes
//  through useTranslation, so a switch in Settings re-renders
//  it at once, and the kit gets the bare 'lt' / 'en' it keys
//  its catalogs on. (It once compared activeLocale() — a
//  BCP-47 tag, 'en-GB' — against the bare 'en', which is never
//  equal: the kit was Lithuanian forever, KNF-130.)
//
//  The kit's own catalog speaks a generic "connect" vocabulary
//  (Užmegzti ryšį / Ryšiai); this app's social graph is
//  FRIENDS — the profile's stats, the friends screen, the
//  requests screen and the unfriend confirm all say so — so the
//  relationship faces, the activity lines about requests and
//  the connections counter are handed over from the app
//  catalog. Every other kit string stays the kit's.
//
//  The theme object is memoised on the palette so the kit's
//  memoised cards only re-render on a real scheme change.
//
//  Split into (root component last):
//
//    useKitLabelOverrides — the friends vocabulary for the kit
//    SocialUiKitHost      — the provider (default export)
// -----------------------------------------------------------

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { getUploadUrl } from '@/services/api';

import { openHref } from '@knf/chatuikit';
import { SocialUiKitProvider, type KitLabels, type KitTheme } from '@knf/socialuikit';







// -----------------------------------------------------------
// useKitLabelOverrides
// -----------------------------------------------------------
//
// The kit label keys this app words itself, rebuilt only when
// the language changes (t's identity moves with it), so the
// provider's merged catalog — and every memoised card under
// it — stays put between switches.
//
// Used by:
//   - SocialUiKitHost (below)
// -----------------------------------------------------------

function useKitLabelOverrides(): Partial<KitLabels> {

  const { t } = useTranslation();


  return useMemo<Partial<KitLabels>>(
    () => ({
      connect: t('social.addFriend'),
      requested: t('social.requestSent'),
      cancelRequest: t('social.cancelRequest'),
      accept: t('friendRequests.accept'),
      decline: t('friendRequests.reject'),
      connected: t('social.friendsFace'),
      profileConnections: t('profile.friends'),
      notifConnectRequest: (name: string) => t('social.notifFriendRequest', { name }),
      notifConnectAccept: (name: string) => t('social.notifFriendAccept', { name }),
    }),
    [t],
  );
}







// -----------------------------------------------------------
// SocialUiKitHost (default export)
// -----------------------------------------------------------
//
// Every provider input is memoized: the palette-to-kit-token
// map (like heart on accent, chips on the soft surface, brand
// TEXT on the AA-checked brandText token) rebuilt only on a
// palette change, the label overrides only on a language
// change, and a one-time env whose resolveImageUrl falls back
// to the raw value where getUploadUrl answers null — the kit
// insists on a string.
//
// Used by:
//   - app/(main)/_layout.tsx — above every kit-rendering screen
// -----------------------------------------------------------

export default function SocialUiKitHost({ children }: { children: ReactNode }) {

  const { colors, scheme } = useTheme();
  const { i18n } = useTranslation();
  const labels = useKitLabelOverrides();


  // App palette → kit tokens. The like heart takes the accent
  // (the post screen's heart already did), chips sit on the soft
  // surface, overlays on the scrim; brand-coloured TEXT takes
  // brandText (the fill burgundy reads under AA on dark cards)
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
        brandText: colors.brandText,
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
    <SocialUiKitProvider
      theme={theme}
      scheme={scheme === 'dark' ? 'dark' : 'light'}
      locale={i18n.language === 'lt' ? 'lt' : 'en'}
      labels={labels}
      env={env}
    >
      {children}
    </SocialUiKitProvider>
  );
}
