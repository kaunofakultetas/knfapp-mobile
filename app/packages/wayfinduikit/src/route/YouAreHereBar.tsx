// -----------------------------------------------------------
//  [*] wayfinduikit — YouAreHereBar
//
//  The capsule over the plan that says where the walker is —
//  the place when the host knows it, the plain 'you are here'
//  when it only has a dot — and the two ways they can tell the
//  kit otherwise: scan a QR code, pick a spot by hand. Each
//  button exists only when the host wires it, so a screen with
//  no scanner shows no scanner. Off route is a second line in
//  the danger ink under the place, never instead of it: the
//  walker's position is still a fact, the route is what they
//  lost. The text column is one accessibility element (the
//  pinned youAreHereA11y sentence, plus the off-route notice
//  when it shows); the buttons stay their own elements so a
//  reader can reach them.
//
//  Split into (root component last):
//
//    BarButton     — one round icon button with a spoken name
//    YouAreHereBar — the capsule (default export)
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useKitLabels, useKitTheme } from '../provider';







// -----------------------------------------------------------
// BarButton
// -----------------------------------------------------------
//
// Icon-only to keep the capsule compact; the label is the
// accessibility name, so the glyph carries the eye and the
// catalog carries the reader.
//
// Used by:
//   - YouAreHereBar (below) — scan, pick
// -----------------------------------------------------------

function BarButton({
  glyph,
  label,
  onPress,
  testID,
}: {
  glyph: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  testID: string;
}) {

  const { colors } = useKitTheme();


  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{
        marginLeft: 6,
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
      }}
    >
      <Ionicons name={glyph} size={18} color={colors.brand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// YouAreHereBar (default export)
// -----------------------------------------------------------
//
//   <YouAreHereBar place={nav.state.currentPlace}
//                 offRoute={nav.offRoute}
//                 onScanQr={openScanner}
//                 onPickLocation={openPicker} />
//
// Used by:
//   - src/index.ts — the public surface; hosts float one over
//     the plan on the search and walking screens
// -----------------------------------------------------------

export default function YouAreHereBar({
  place,
  onScanQr,
  onPickLocation,
  offRoute = false,
}: {
  place?: string | null;
  onScanQr?: () => void;
  onPickLocation?: () => void;
  offRoute?: boolean;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  const placeLine = place ? labels.youAreIn(place) : labels.youAreHere;
  const spoken = offRoute ? `${labels.youAreHereA11y(place ?? null)}. ${labels.offRoute}` : labels.youAreHereA11y(place ?? null);


  return (
    <View
      testID="wayfinduikit-here"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 12,
        paddingRight: 6,
        paddingVertical: 6,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: offRoute ? colors.danger : colors.line,
        backgroundColor: colors.surface,
        shadowColor: colors.shadow,
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >

      <Ionicons
        testID="wayfinduikit-here-glyph"
        name={offRoute ? 'warning' : 'location'}
        size={18}
        color={offRoute ? colors.danger : colors.brand}
      />

      <View accessible accessibilityLabel={spoken} style={{ flex: 1, marginLeft: 8, marginRight: 4 }}>
        <Text testID="wayfinduikit-here-place" numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.medium, color: colors.ink }}>
          {placeLine}
        </Text>
        {offRoute ? (
          <Text testID="wayfinduikit-here-offroute" numberOfLines={1} style={{ marginTop: 1, fontSize: 12, fontFamily: fonts.medium, color: colors.danger }}>
            {labels.offRoute}
          </Text>
        ) : null}
      </View>

      {onScanQr ? <BarButton testID="wayfinduikit-here-scan" glyph="qr-code-outline" label={labels.scanQr} onPress={onScanQr} /> : null}
      {onPickLocation ? <BarButton testID="wayfinduikit-here-pick" glyph="map-outline" label={labels.pickLocation} onPress={onPickLocation} /> : null}

    </View>
  );
}
