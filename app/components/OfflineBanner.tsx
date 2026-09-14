// -----------------------------------------------------------
//  [*] OfflineBanner — the persistent "no internet" strip
//
//  What replaced the offline/online toast pair: a slim strip
//  pinned over the very bottom edge while the device is
//  offline, gone the moment the connection returns — its
//  disappearance IS the "back online" signal, so nothing ever
//  pops. It overlays the home-indicator padding zone (the tab
//  bar's own bottom inset), the way the big social apps park
//  theirs, so no navigation control is ever covered; taps
//  pass through regardless. Mounted ONCE in ThemedShell —
//  every screen, signed in or not, shows the same truth.
//
//  A screen reader hears the transition through the polite
//  live region; sighted feedback needs no animation — the
//  strip appearing/vanishing is the event.
// -----------------------------------------------------------

// The one connectivity truth this strip renders
import { useNetwork } from '@/context/NetworkContext';

// Bottom inset — the strip pads itself past the home indicator
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

// JS-side color for the icon tint
import { useTheme } from '@/hooks/useTheme';







// -----------------------------------------------------------
// OfflineBanner (default export)
// -----------------------------------------------------------
//
// Returns null while connected — mounting and vanishing IS
// the whole behavior. The strip is pointer-transparent, one
// polite alert element, and pads itself past the home
// indicator off the live bottom inset.
//
// Used by:
//   - app/_layout.tsx — ThemedShell, beside the Toast host
// -----------------------------------------------------------

export default function OfflineBanner() {

  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();


  if (isConnected) return null;

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="absolute bottom-0 left-0 right-0 flex-row items-center justify-center gap-1.5 bg-danger pt-1"
      style={{ paddingBottom: Math.max(insets.bottom - 8, 4) }}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={12}
        color={colors.onBrand}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text className="font-raleway-medium text-xs text-on-brand">
        {t('network.offline')}
      </Text>
    </View>
  );
}
