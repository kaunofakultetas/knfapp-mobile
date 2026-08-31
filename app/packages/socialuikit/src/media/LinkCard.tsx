// -----------------------------------------------------------
//  [*] socialuikit — LinkCard
//
//  A shared link's preview, sized by how much the unfurler
//  found: an image → the large card (picture on top at 1.91:1,
//  site line, title, description); text only → the compact row
//  (a square glyph tile left, text right); a bare url+title →
//  one minimal line. The site line prefers siteName and falls
//  back to the url's hostname stripped of 'www.'.
//
//  Tapping hands the url to the host's onPress when given,
//  else to env.openHref — the kit itself never opens anything.
//  The whole card is ONE accessibility element ('site — title')
//  so a screen reader hears the destination before the pitch.
//
//  Split into (root component last):
//
//    hostOf   — url → bare hostname, no URL global needed
//    Shell    — the bordered pressable frame all variants share
//    LinkCard — picks the variant (default export)
// -----------------------------------------------------------

// Theme, host env
import { useKitEnv, useKitTheme } from '../provider';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { KitLinkPreview } from '../core/types';







// -----------------------------------------------------------
// hostOf
// -----------------------------------------------------------
//
// Regex, not the URL global — the JS engine on device does not
// guarantee one. Credentials and ports are shaved along with
// the leading 'www.'; a scheme-less string is read up to its
// first path delimiter, so junk still answers something short.
//
// Used by:
//   - LinkCard (below) — the site line when siteName is absent
// -----------------------------------------------------------

// Only web schemes may leave the card: a hostile preview URL
// ('javascript:', 'data:text/html', 'file:') must never reach
// env.openHref as a live tap. Scheme-less values pass — hosts
// store bare or protocol-relative URLs for their own domains
const SAFE_SCHEME = /^(?:https?:|\/\/|(?![a-z][a-z0-9+.-]*:))/i;

export function isSafeHref(url: string): boolean {
  return SAFE_SCHEME.test(url.trim());
}


function hostOf(url: string): string {

  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  const authority = match ? match[1] : url.replace(/^\/\//, '').split(/[/?#]/, 1)[0];


  return authority
    .replace(/^[^@]*@/, '')
    .replace(/:\d+$/, '')
    .toLowerCase()
    .replace(/^www\./, '');
}







// -----------------------------------------------------------
// Shell
// -----------------------------------------------------------
//
// The hairline-bordered pressable frame every variant sits in;
// overflow hidden so the large image's corners follow the card
// radius. `row` lays the compact and minimal variants out
// horizontally; `padded` is for the minimal line, whose content
// has no bleed-to-edge piece of its own.
//
// Used by:
//   - LinkCard (below) — all three variants
// -----------------------------------------------------------

function Shell({
  label,
  onPress,
  row,
  padded,
  children,
}: {
  label: string;
  onPress: () => void;
  row?: boolean;
  padded?: boolean;
  children: ReactNode;
}) {

  const { colors, radii } = useKitTheme();


  return (
    <Pressable
      testID="socialuikit-link-card"
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={{
        flexDirection: row ? 'row' : 'column',
        alignItems: row ? 'center' : 'stretch',
        padding: padded ? 10 : 0,
        borderRadius: radii.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.line,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {children}
    </Pressable>
  );
}







// -----------------------------------------------------------
// LinkCard (default export)
// -----------------------------------------------------------
//
// Used by:
//   - post/PostCard.tsx — a post carrying link and no media
//   - the host's post detail screen
// -----------------------------------------------------------

export default function LinkCard({ link, onPress }: { link: KitLinkPreview; onPress?: () => void }) {

  const { colors, fonts } = useKitTheme();
  const env = useKitEnv();


  const site = link.siteName || hostOf(link.url);
  const label = `${site} — ${link.title}`;
  // stopPropagation: a link tap must never ALSO open the card
  // wrapped around it (touches bubble on web)
  const press = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    // An unsafe scheme renders an inert card — the tap is
    // swallowed on BOTH paths, so a host's onPress cannot be
    // tricked into opening it either
    if (!isSafeHref(link.url)) return;
    if (onPress) onPress();
    else env.openHref(link.url);
  };


  // Large: the unfurler found a picture
  if (link.imageUrl) {
    return (
      <Shell label={label} onPress={press}>
        <ExpoImage
          testID="socialuikit-link-image"
          source={{ uri: env.resolveImageUrl(link.imageUrl) }}
          style={{ width: '100%', aspectRatio: 1.91, backgroundColor: colors.line }}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          recyclingKey={link.imageUrl}
        />
        <View style={{ padding: 10 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.inkFaint }}>{site}</Text>
          <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.ink }}>{link.title}</Text>
          {link.description ? (
            <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.inkSoft }}>{link.description}</Text>
          ) : null}
        </View>
      </Shell>
    );
  }


  // Compact: text only — a glyph tile stands in for the picture
  if (link.description) {
    return (
      <Shell label={label} onPress={press} row>
        <View testID="socialuikit-link-thumb" style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.chip }}>
          <Ionicons name="link-outline" size={22} color={colors.inkFaint} />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.inkFaint }}>{site}</Text>
          <Text numberOfLines={2} style={{ marginTop: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.ink }}>{link.title}</Text>
          <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.inkSoft }}>{link.description}</Text>
        </View>
      </Shell>
    );
  }


  // Minimal: nothing to preview — one line, destination last
  return (
    <Shell label={label} onPress={press} row padded>
      <View testID="socialuikit-link-minimal" style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.chip }}>
        <Ionicons name="link-outline" size={16} color={colors.inkFaint} />
      </View>
      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.ink }}>{link.title}</Text>
      <Text numberOfLines={1} style={{ marginLeft: 8, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.inkFaint }}>{site}</Text>
    </Shell>
  );
}
