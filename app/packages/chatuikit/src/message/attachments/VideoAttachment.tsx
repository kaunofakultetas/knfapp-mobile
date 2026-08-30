// -----------------------------------------------------------
//  [*] chatuikit — VideoAttachment
//
//  A video inside a bubble, the way Messenger and WhatsApp
//  show one: the poster frame at its natural proportions, a
//  play disc in the middle and the duration in the corner.
//  Nothing decodes in the list — a VideoView per row would
//  hold a decoder each — so a tap hands the message to the
//  host's onPressVideo, which opens VideoPlayerModal (or its
//  own player). An own send still uploading shows the local
//  poster with a spinner in place of the disc; a message with
//  no poster at all gets a dark stage with a camera glyph.
//
//  Used by:
//    - message/MessageBubble.tsx (BubbleBody)
// -----------------------------------------------------------

// Theme + labels + URL resolution
import { useKitEnv, useKitTheme } from '../../provider';
import type { KitLabels } from '../../provider/labels';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';

import { formatDuration } from '../../core/media';
import type { KitMediaSize, KitVideo } from '../../core/types';
import ImageAttachment, { useMediaFit } from './ImageAttachment';


// The chrome over a poster is always white on a dark wash —
// posters are photos, not theme surfaces
const WASH = 'rgba(0, 0, 0, 0.45)';
const CHROME = '#FFFFFF';







// -----------------------------------------------------------
// PlayOverlay
// -----------------------------------------------------------
//
// Used by:
//   - VideoAttachment (below)
// -----------------------------------------------------------

function PlayOverlay({ duration, busy }: { duration?: number; busy: boolean }) {

  const { fonts } = useKitTheme();
  const badge = formatDuration(duration);


  return (
    <>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: WASH, alignItems: 'center', justifyContent: 'center' }}>
          {busy ? (
            <ActivityIndicator size="small" color={CHROME} />
          ) : (
            <Ionicons name="play" size={24} color={CHROME} style={{ marginLeft: 3 }} />
          )}
        </View>
      </View>
      {badge ? (
        <View style={{ position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: WASH }}>
          <Ionicons name="videocam" size={11} color={CHROME} style={{ marginRight: 4 }} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, color: CHROME }}>{badge}</Text>
        </View>
      ) : null}
    </>
  );
}







// -----------------------------------------------------------
// VideoAttachment (default export)
// -----------------------------------------------------------

export default function VideoAttachment({
  video,
  mediaSize,
  initialRatio,
  onRatio,
  labels,
  busy,
}: {
  video: KitVideo;
  mediaSize?: KitMediaSize;
  initialRatio?: number;
  onRatio?: (ratio: number) => void;
  labels: KitLabels;
  // Still uploading — the disc becomes a spinner
  busy: boolean;
}) {

  const { colors } = useKitTheme();
  const { resolveImageUrl } = useKitEnv();
  const poster = video.localThumbnailUri ?? (video.thumbnailUri ? resolveImageUrl(video.thumbnailUri) ?? undefined : undefined);
  const { fit } = useMediaFit(mediaSize, initialRatio);


  if (!poster) {
    // No poster: a dark stage (a 16:9 frame when the size is
    // unknown) with the glyph, so the row still reads as a video
    return (
      <View
        style={{ width: fit.width, height: fit.height, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
        accessible
        accessibilityLabel={labels.video}
      >
        <Ionicons name="videocam-outline" size={30} color={colors.surface} style={{ position: 'absolute', top: 10, right: 10, opacity: 0.6 }} />
        <PlayOverlay duration={video.duration} busy={busy} />
      </View>
    );
  }


  return (
    <ImageAttachment
      uri={poster}
      mediaSize={mediaSize}
      initialRatio={initialRatio}
      onRatio={onRatio}
      labels={labels}
      unavailableLabel={labels.videoUnavailable}
      overlay={<PlayOverlay duration={video.duration} busy={busy} />}
    />
  );
}
