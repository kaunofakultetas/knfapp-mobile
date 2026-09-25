// -----------------------------------------------------------
//  [*] chatuikit — GalleryAttachment
//
//  Several photos in one bubble, tiled edge to edge: two make
//  a pair of squares, three a wide hero over a pair, four a
//  2×2 grid — and past four the last visible tile carries a
//  "+N" wash for the rest. Every tile is its own tap target
//  (the host opens its viewer at that photo); the count is
//  spoken, not the grid. Local uris (an optimistic send still
//  uploading) render as they are; stored paths go through the
//  host's resolver like any other image. A tile whose photo
//  will not load (a purged upload, an expired message, no
//  connection) shows the labelled placeholder — never a blank
//  square — and stops being a button: the viewer has nothing
//  to open there.
//
//  Split into (root component last):
//
//    GalleryTile       — one tile with its own failed state
//    GalleryAttachment — the grid (default export)
//
//  Used by:
//    - message/MessageBubble.tsx (BubbleBody)
// -----------------------------------------------------------

// Theme + URL resolution
import { useKitEnv, useKitTheme } from '../../provider';
import type { KitLabels } from '../../provider/labels';

// Rendering
import { Image as ExpoImage } from 'expo-image';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { useState } from 'react';

import { mediaBoxFor } from '../../core/media';
import type { KitGalleryItem } from '../../core/types';
import MediaUnavailable from './MediaUnavailable';


// Tiles shown before the "+N" wash takes over
const MAX_TILES = 4;
// Hairline between tiles — the grid reads as one photo block
const TILE_GAP = 2;







// -----------------------------------------------------------
// GalleryTile
// -----------------------------------------------------------
//
// One photo of the grid. A failed load swaps in the compact
// placeholder and drops the tile's button role (a changed uri
// — the local preview swapping to the uploaded path — gets a
// fresh try). The "+N" wash is a dimmed layer UNDER an opaque
// count, so the number keeps its full contrast.
//
// Used by:
//   - GalleryAttachment (below)
// -----------------------------------------------------------

function GalleryTile({
  item,
  index,
  total,
  size,
  hidden,
  labels,
  onPressItem,
  onLongPress,
  disabled,
}: {
  item: KitGalleryItem;
  index: number;
  total: number;
  size: { width: number; height: number };
  // The count behind the "+N" wash — 0 on every other tile
  hidden: number;
  labels: KitLabels;
  onPressItem?: (index: number) => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {

  const { colors, fonts } = useKitTheme();
  const { resolveImageUrl } = useKitEnv();
  const uri = item.url.startsWith('/') ? resolveImageUrl(item.url) ?? item.url : item.url;


  const [failed, setFailed] = useState(false);
  const [triedUri, setTriedUri] = useState(uri);
  if (triedUri !== uri) {
    setTriedUri(uri);
    setFailed(false);
  }


  return (
    <Pressable
      onPress={onPressItem && !failed ? () => onPressItem(index) : undefined}
      onLongPress={onLongPress}
      delayLongPress={260}
      disabled={disabled || !onPressItem || failed}
      accessibilityRole={failed ? 'image' : 'imagebutton'}
      accessibilityLabel={failed ? labels.imageUnavailable : `${labels.photo} ${index + 1} / ${total}`}
      style={size}
      testID={`chatuikit-gallery-tile-${index}`}
    >
      {failed ? (
        <MediaUnavailable width="100%" height="100%" label={labels.imageUnavailable} compact />
      ) : (
        <ExpoImage source={{ uri }} placeholder={item.preview ? { uri: item.preview } : undefined} placeholderContentFit="cover" style={{ width: '100%', height: '100%', backgroundColor: colors.surfaceSoft }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={uri} onError={() => setFailed(true)} testID={`chatuikit-gallery-image-${index}`} />
      )}
      {hidden > 0 ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.shadow, opacity: 0.55 }} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.onBrand }} testID="chatuikit-gallery-more">{`+${hidden}`}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}







// -----------------------------------------------------------
// GalleryAttachment (default export)
// -----------------------------------------------------------
//
// An odd count opens with one wide hero tile, then square
// pairs; tile indices stay in FULL-list terms so onPressItem
// opens the host's viewer at the right photo.
//
// Used by:
//   - message/MessageBubble.tsx — a message carrying two or
//     more photos
// -----------------------------------------------------------

export default function GalleryAttachment({
  items,
  labels,
  onPressItem,
  onLongPress,
  disabled,
}: {
  items: KitGalleryItem[];
  labels: KitLabels;
  // The tapped photo's index in the FULL list ("+N" taps hand
  // over the first hidden one)
  onPressItem?: (index: number) => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {

  const { width: viewportWidth } = useWindowDimensions();


  // The grid claims the same width class a lone photo would
  const width = mediaBoxFor(viewportWidth).maxWidth;
  const half = (width - TILE_GAP) / 2;
  const shown = items.slice(0, MAX_TILES);
  const hidden = items.length - shown.length;
  // Odd counts open with a wide hero; even counts are all pairs
  const hero = shown.length % 2 === 1;


  const tile = (item: KitGalleryItem, index: number, size: { width: number; height: number }) => (
    <GalleryTile
      key={`${index}-${item.url}`}
      item={item}
      index={index}
      total={items.length}
      size={size}
      hidden={index === shown.length - 1 ? hidden : 0}
      labels={labels}
      onPressItem={onPressItem}
      onLongPress={onLongPress}
      disabled={disabled}
    />
  );


  // [hero?] then pairs — square tiles keep every layout calm
  const rows: KitGalleryItem[][] = [];
  let cursor = 0;
  if (hero) {
    rows.push([shown[0]]);
    cursor = 1;
  }
  while (cursor < shown.length) {
    rows.push(shown.slice(cursor, cursor + 2));
    cursor += 2;
  }


  return (
    <View accessibilityLabel={labels.gallery(items.length)} style={{ width, gap: TILE_GAP }} testID="chatuikit-gallery">
      {rows.map((row, rowIndex) => {
        const start = rowIndex === 0 ? 0 : (hero ? 1 : 0) + (rowIndex - (hero ? 1 : 0)) * 2;
        return (
          <View key={rowIndex} style={{ flexDirection: 'row', gap: TILE_GAP }}>
            {row.length === 1 && hero && rowIndex === 0
              ? tile(row[0], 0, { width, height: Math.round(width * 0.56) })
              : row.map((item, i) => tile(item, start + i, { width: half, height: half }))}
          </View>
        );
      })}
    </View>
  );
}
