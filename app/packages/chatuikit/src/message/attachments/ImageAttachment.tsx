// -----------------------------------------------------------
//  [*] chatuikit — ImageAttachment
//
//  A photo inside a bubble, at its natural proportions. The
//  size comes from fitMedia(): a host that knows the pixel size
//  (`mediaSize`) gets the final box on the first frame; without
//  it the bubble opens at 4:3 and settles once the bytes report
//  their size (the settled ratio is reported up so the context
//  menu's floating copy starts from it). Loading shows the
//  soft surface behind the fade-in; a photo that cannot load
//  renders a labelled placeholder in its place — never a blank
//  hole in the run.
//
//  Used by:
//    - message/MessageBubble.tsx (BubbleBody)
//    - message/attachments/VideoAttachment.tsx — the poster
// -----------------------------------------------------------

// Theme + labels
import { useKitTheme } from '../../provider';
import type { KitLabels } from '../../provider/labels';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { fitMedia, isExtremeAspect, mediaBoxFor } from '../../core/media';
import type { KitMediaSize } from '../../core/types';







// -----------------------------------------------------------
// useMediaFit
// -----------------------------------------------------------
//
// The bubble box for a photo / poster: fixed when the natural
// size is known, otherwise the 4:3 guess (or the ratio a
// previous mount measured) until onLoad reports the real one.
//
// Used by:
//   - ImageAttachment (below), VideoAttachment
// -----------------------------------------------------------

export function useMediaFit(mediaSize: KitMediaSize | undefined, initialRatio: number | undefined) {
  const { width: viewportWidth } = useWindowDimensions();
  const [measuredRatio, setMeasuredRatio] = useState<number | undefined>(initialRatio);
  const box = mediaBoxFor(viewportWidth);
  const fit = fitMedia(mediaSize ?? measuredRatio, box);
  // A strip (a long screenshot, a panorama) is shown as a compact
  // row instead of a crop — see core/media.ts isExtremeAspect
  const extreme = isExtremeAspect(mediaSize ?? measuredRatio);
  return { fit, setMeasuredRatio, known: !!mediaSize, extreme };
}







// -----------------------------------------------------------
// ImageAttachment (default export)
// -----------------------------------------------------------

export default function ImageAttachment({
  uri,
  mediaSize,
  preview,
  initialRatio,
  onRatio,
  labels,
  unavailableLabel,
  overlay,
}: {
  // Already loadable: a resolved upload URL or a picker uri
  uri: string | undefined;
  mediaSize?: KitMediaSize;
  // The ~14px micro copy (a data URI) drawn blurry-by-upscale
  // while the real bytes download
  preview?: string | null;
  // The ratio a previous mount measured (the context menu's copy)
  initialRatio?: number;
  // Reports the settled ratio up
  onRatio?: (ratio: number) => void;
  labels: KitLabels;
  // The placeholder's text when the bytes never come
  unavailableLabel?: string;
  // Drawn over the image (a video's play disc and duration)
  overlay?: ReactNode;
}) {

  const { colors, fonts } = useKitTheme();
  const { fit, setMeasuredRatio, known, extreme } = useMediaFit(mediaSize, initialRatio);


  // A changed uri (local preview → uploaded path) gets a fresh try
  const [failed, setFailed] = useState(false);
  const [triedUri, setTriedUri] = useState(uri);
  if (triedUri !== uri) {
    setTriedUri(uri);
    setFailed(false);
  }


  if (failed || !uri) {
    return (
      <View
        style={{ width: fit.width, height: fit.height, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft }}
        accessible
        accessibilityLabel={unavailableLabel ?? labels.imageUnavailable}
      >
        <Ionicons name="image-outline" size={28} color={colors.inkSoft} />
        <Text style={{ marginTop: 4, fontFamily: fonts.regular, fontSize: 12, lineHeight: 15, color: colors.inkSoft }}>
          {unavailableLabel ?? labels.imageUnavailable}
        </Text>
      </View>
    );
  }


  if (extreme) {
    // The strip's own proportions are unreadable at bubble size:
    // a 64 px thumbnail, the word "photo" and its pixel size; the
    // tap still opens the viewer at full size
    const dims = mediaSize ? `${mediaSize.width} × ${mediaSize.height}` : '';
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, minWidth: 180 }} testID="chatuikit-image-strip">
        <ExpoImage testID="chatuikit-image-source" source={{ uri }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surfaceSoft }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} onError={() => setFailed(true)} />
        <View style={{ marginLeft: 10, flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 18, color: colors.ink }}>{labels.photo}</Text>
          {dims ? <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 15, color: colors.inkSoft }}>{dims}</Text> : null}
        </View>
        {overlay ? <View style={{ position: 'absolute', top: 8, left: 8, width: 64, height: 64, pointerEvents: 'none' }}>{overlay}</View> : null}
      </View>
    );
  }

  return (
    <View style={{ width: fit.width, height: fit.height, backgroundColor: colors.surfaceSoft }} testID="chatuikit-image">
      <ExpoImage
        testID="chatuikit-image-source"
        source={{ uri }}
        placeholder={preview ? { uri: preview } : undefined}
        placeholderContentFit="cover"
        style={{ width: fit.width, height: fit.height }}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width > 0 && height > 0) {
            const ratio = width / height;
            // A known size never re-lays out on load; the measured
            // ratio still reaches the menu so its copy matches
            if (!known) setMeasuredRatio(ratio);
            onRatio?.(ratio);
          }
        }}
        onError={() => setFailed(true)}
      />
      {overlay ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' }}>
          {overlay}
        </View>
      ) : null}
    </View>
  );
}
