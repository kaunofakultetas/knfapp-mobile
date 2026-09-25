// -----------------------------------------------------------
//  [*] chatuikit — MediaUnavailable
//
//  The labelled stand-in for a picture that will not load — a
//  purged upload, an expired disappearing message's file, no
//  connection. The kit's rule for media is that a failure is
//  never a blank hole in the run: the soft surface keeps the
//  slot's exact size, an image glyph says what was there, and
//  the caption (or, on a tile too small for words, the
//  accessibility label alone) says it could not be shown.
//
//  Used by:
//    - message/attachments/ImageAttachment.tsx — a lone photo
//    - message/attachments/GalleryAttachment.tsx — a tile
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Text, View, type DimensionValue } from 'react-native';

import { useKitTheme } from '../../provider';







// -----------------------------------------------------------
// MediaUnavailable (default export)
// -----------------------------------------------------------
//
// Fills the given box; `compact` drops the caption (a gallery
// tile) and keeps the glyph plus the spoken label.
//
// Used by:
//   - ImageAttachment, GalleryAttachment (see the header)
// -----------------------------------------------------------

export default function MediaUnavailable({
  width,
  height,
  label,
  compact = false,
}: {
  width: DimensionValue;
  height: DimensionValue;
  label: string;
  compact?: boolean;
}) {

  const { colors, fonts } = useKitTheme();


  return (
    <View
      style={{ width, height, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft }}
      accessible
      accessibilityLabel={label}
      testID="chatuikit-media-unavailable"
    >
      <Ionicons name="image-outline" size={compact ? 22 : 28} color={colors.inkSoft} />
      {compact ? null : (
        <Text style={{ marginTop: 4, fontFamily: fonts.regular, fontSize: 12, lineHeight: 15, color: colors.inkSoft, textAlign: 'center', paddingHorizontal: 8 }}>
          {label}
        </Text>
      )}
    </View>
  );
}
