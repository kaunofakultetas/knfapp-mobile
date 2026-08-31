// -----------------------------------------------------------
//  [*] socialuikit — MediaGallery
//
//  A post's photo/video album as one fixed frame. The frame is
//  3:2 whatever the count, so a feed of cards scrolls at a
//  steady rhythm — EXCEPT a lone image, which keeps its own
//  proportions (width/height clamped to [0.5, 2.2] so neither
//  a tower nor a panorama hijacks the card; unknown size falls
//  back to 3:2). At most four tiles render; a longer album
//  washes the last tile with '+N'. gallerySpans is the layout
//  table itself, exported pure so hosts and tests can read the
//  arrangement without rendering.
//
//  Tiles sit on the theme's line colour until their bytes
//  arrive, videos carry a centred play glyph and a duration
//  chip, described media gets the ALT chip bottom-left.
//
//  Split into (root component last):
//
//    gallerySpans   — the pure 1–4 layout table (named export)
//    formatDuration — seconds → 'm:ss' / 'h:mm:ss'
//    GalleryTile    — one pressable tile with its overlays
//    MediaGallery   — the frame and its rows (default export)
// -----------------------------------------------------------

// Theme, labels, host env
import { useKitEnv, useKitLabels, useKitTheme } from '../provider';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import type { KitMediaItem } from '../core/types';


// The hairline between tiles, in dp — thin enough to read as
// one album, thick enough to separate similar photos
const GAP = 2;

// Everything past the fourth tile hides behind the '+N' wash
const MAX_TILES = 4;

// A lone image may bend the frame only this far either way
const MIN_LONE_ASPECT = 0.5;
const MAX_LONE_ASPECT = 2.2;









// -----------------------------------------------------------
// gallerySpans
// -----------------------------------------------------------
//
// The arrangement per count, index-aligned with the rendered
// tiles: `tall` spans the frame's full height, `wide` its full
// width. 1 → the whole frame; 2 → two full-height columns;
// 3 → a full-height left tile and two stacked right; 4 → 2×2.
// Counts past four answer the four-tile table (the extras never
// render); zero and junk answer an empty table.
//
// MediaGallery's JSX realises the same arrangements as literal
// rows/columns rather than deriving them from this table (flex
// wants structure, not spans) — the structural test in
// __tests__ pins the two against each other, so they cannot
// drift apart silently.
//
// Used by:
//   - hosts and tests reading the layout without a render
//   - __tests__/MediaGallery.test.tsx — the drift pin
// -----------------------------------------------------------

export function gallerySpans(count: number): { tall: boolean; wide: boolean }[] {

  const n = Math.min(MAX_TILES, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);


  if (n === 0) return [];
  if (n === 1) return [{ tall: true, wide: true }];
  if (n === 2) return [{ tall: true, wide: false }, { tall: true, wide: false }];
  if (n === 3) {
    return [
      { tall: true, wide: false },
      { tall: false, wide: false },
      { tall: false, wide: false },
    ];
  }


  return [
    { tall: false, wide: false },
    { tall: false, wide: false },
    { tall: false, wide: false },
    { tall: false, wide: false },
  ];
}







// -----------------------------------------------------------
// formatDuration
// -----------------------------------------------------------
//
// KitMediaItem.duration arrives in SECONDS; the chip shows
// 'm:ss' and grows an hour figure only past 59:59. Junk input
// (negative, NaN) renders as 0:00 — never NaN in the UI.
//
// Used by:
//   - GalleryTile (below) — the video duration chip
// -----------------------------------------------------------

function formatDuration(seconds: number): string {

  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');


  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}







// -----------------------------------------------------------
// GalleryTile
// -----------------------------------------------------------
//
// One flex:1 cell of the frame: the image (a video's thumbnail
// when it has one), the loading ground, and every overlay. The
// line-coloured ground doubles as the loading placeholder;
// onLoad flips it to transparent so a see-through PNG never
// sits on grey. Overlay text is fixed white — the scrim behind
// it is black-tinted in both schemes, so it always holds.
//
// Used by:
//   - MediaGallery (below) — one per visible item
// -----------------------------------------------------------

function GalleryTile({
  item,
  index,
  hiddenCount,
  onPress,
}: {
  item: KitMediaItem;
  index: number;
  // How many items hide behind this tile (>0 only on the last
  // tile of an over-long album — draws the '+N' wash)
  hiddenCount: number;
  onPress?: (event: GestureResponderEvent) => void;
}) {

  const { colors, fonts } = useKitTheme();
  const labels = useKitLabels();
  const env = useKitEnv();


  const [loaded, setLoaded] = useState(false);


  const uri = env.resolveImageUrl(item.thumbnailUrl ?? item.url);


  return (
    <Pressable
      testID={`socialuikit-gallery-item-${index}`}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'imagebutton' : 'image'}
      accessibilityLabel={item.alt ?? (item.kind === 'video' ? labels.mediaVideoA11y : labels.mediaPhotoA11y)}
      style={{ flex: 1, overflow: 'hidden', backgroundColor: loaded ? 'transparent' : colors.line }}
    >
      <ExpoImage
        testID={`socialuikit-gallery-img-${index}`}
        source={{ uri }}
        style={{ flex: 1 }}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
        recyclingKey={uri}
        onLoad={() => setLoaded(true)}
      />

      {item.kind === 'video' ? (
        <View
          testID={`socialuikit-gallery-play-${index}`}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={22} color={colors.overlayInk} />
          </View>
        </View>
      ) : null}

      {item.kind === 'video' && item.duration != null ? (
        <View style={{ position: 'absolute', right: 6, bottom: 6, borderRadius: 4, backgroundColor: colors.overlay, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, color: colors.overlayInk }}>{formatDuration(item.duration)}</Text>
        </View>
      ) : null}

      {item.alt ? (
        <View style={{ position: 'absolute', left: 6, bottom: 6, borderRadius: 4, backgroundColor: colors.overlay, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 10, lineHeight: 13, color: colors.overlayInk }}>{labels.altBadge}</Text>
        </View>
      ) : null}

      {hiddenCount > 0 ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay, pointerEvents: 'none' }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.overlayInk }}>{`+${hiddenCount}`}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}







// -----------------------------------------------------------
// MediaGallery (default export)
// -----------------------------------------------------------
//
// The frame realising gallerySpans with flex rows and columns.
// `maxHeight` caps a tall lone image on small screens — the
// cap wins over the aspect, so a capped frame letterboxes by
// cropping (contentFit cover), never by overflowing the card.
//
// Used by:
//   - post/PostCard.tsx — the media block under the body
//   - the host's post detail screen
// -----------------------------------------------------------

export default function MediaGallery({
  items,
  onPressItem,
  maxHeight,
}: {
  items: KitMediaItem[];
  onPressItem?: (index: number) => void;
  maxHeight?: number;
}) {

  const { radii } = useKitTheme();


  if (items.length === 0) return null;


  const visible = items.slice(0, MAX_TILES);
  const hidden = items.length - visible.length;
  const lone = items.length === 1 ? items[0] : null;


  // The lone image's own shape, clamped; every album is 3:2
  const aspect =
    lone && lone.width && lone.height && lone.width > 0 && lone.height > 0
      ? Math.min(MAX_LONE_ASPECT, Math.max(MIN_LONE_ASPECT, lone.width / lone.height))
      : 3 / 2;


  const tile = (index: number) => (
    <GalleryTile
      item={visible[index]}
      index={index}
      hiddenCount={index === visible.length - 1 ? hidden : 0}
      onPress={
        onPressItem
          ? (event) => {
              // A handled tile tap must never ALSO open the card
              // wrapped around the gallery (touches bubble on web)
              event.stopPropagation();
              onPressItem(index);
            }
          : undefined
      }
    />
  );


  return (
    <View testID="socialuikit-gallery" style={{ aspectRatio: aspect, maxHeight, borderRadius: radii.card, overflow: 'hidden' }}>

      {visible.length === 1 ? tile(0) : null}

      {visible.length === 2 ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: GAP }}>
          {tile(0)}
          {tile(1)}
        </View>
      ) : null}

      {visible.length === 3 ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: GAP }}>
          {tile(0)}
          <View style={{ flex: 1, gap: GAP }}>
            {tile(1)}
            {tile(2)}
          </View>
        </View>
      ) : null}

      {visible.length === 4 ? (
        <View style={{ flex: 1, gap: GAP }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: GAP }}>
            {tile(0)}
            {tile(1)}
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: GAP }}>
            {tile(2)}
            {tile(3)}
          </View>
        </View>
      ) : null}

    </View>
  );
}
