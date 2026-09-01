// -----------------------------------------------------------
//  [*] wayfinduikit — DirectionMarker
//
//  The badge that says "the route goes THAT way" on a
//  panorama: a soft halo, a solid brand disc, and a chevron
//  that leans towards the target — by the signed offset
//  itself while it is small, pinned at ±60° once the target
//  is off to a side or behind, so the badge never draws a
//  chevron pointing at the floor. Inside the alignment
//  tolerance the disc turns success-green and the chevron
//  stands straight: the walker is facing the route.
//
//  The marker knows nothing about WHERE it sits — the stage
//  computes the anchor (through the projection math) and
//  wraps the marker in a positioned view. `clamped` is the
//  stage telling the marker it was pulled to an edge rather
//  than anchored on its target; the halo goes, so a pinned
//  badge reads as a pointer and an anchored one as a pin.
//
//  Accessibility reads the same truth as the colour: the
//  aligned string inside the tolerance, else the signed offset
//  rounded to whole degrees. Pointer events pass through so a
//  badge over a pannable stage never eats the pan.
//
//  Used by:
//    - pano/FlatPanorama.tsx — over the scrolling strip
//    - pano/PanoramaStage.tsx — over the sphere
//    - the host app, through the root export
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useKitLabels, useKitTheme } from '../provider';


// The halo's footprint — the stage anchors on half of this
export const MARKER_SIZE = 64;

// Within this many degrees of the target the marker turns green
export const ALIGNED_TOLERANCE_DEG = 12;

// The chevron leans no further than this, either way
const TILT_LIMIT_DEG = 60;

const DISC_SIZE = 44;


export default function DirectionMarker({
  deltaDeg,
  label,
  clamped = false,
}: {
  deltaDeg: number;
  label?: string | null;
  clamped?: boolean;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  // A non-finite offset (a stage before its first layout)
  // reads as aligned rather than rotating by NaN
  const delta = Number.isFinite(deltaDeg) ? deltaDeg : 0;
  const aligned = Math.abs(delta) < ALIGNED_TOLERANCE_DEG;
  const tilt = Math.max(-TILT_LIMIT_DEG, Math.min(TILT_LIMIT_DEG, delta));


  return (
    <View
      testID="wayfinduikit-marker"
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={aligned ? labels.markerAligned : labels.markerA11y(Math.round(delta))}
      style={{ width: MARKER_SIZE, alignItems: 'center' }}
    >

      <View
        style={{
          width: MARKER_SIZE,
          height: MARKER_SIZE,
          borderRadius: MARKER_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: clamped ? 'transparent' : 'rgba(255, 255, 255, 0.22)',
        }}
      >
        <View
          testID="wayfinduikit-marker-disc"
          style={{
            width: DISC_SIZE,
            height: DISC_SIZE,
            borderRadius: DISC_SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: colors.onBrand,
            backgroundColor: aligned ? colors.success : colors.brand,
            shadowColor: colors.shadow,
            shadowOpacity: 0.3,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <View testID="wayfinduikit-marker-chevron" style={{ transform: [{ rotate: `${tilt}deg` }] }}>
            <Ionicons name="chevron-up" size={26} color={colors.onBrand} />
          </View>
        </View>
      </View>

      {label ? (
        <View style={{ marginTop: 2, maxWidth: MARKER_SIZE * 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.overlay }}>
          <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: fonts.medium, color: colors.overlayInk }}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
