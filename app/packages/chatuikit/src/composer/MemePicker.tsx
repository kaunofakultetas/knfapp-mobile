// -----------------------------------------------------------
//  [*] chatuikit — MemePicker
//
//  The panel above the composer while the meme toggle is open:
//  a search field, a three-column grid of tiles — animated
//  GIFs play on their own (expo-image), static memes just
//  stand, the ~14px preview blurs each while its bytes come —
//  a "+" tile for pushing into the shared library, and
//  load-more at the bottom edge. The grid never lies about
//  why it is empty: a failed load says so with a retry, a
//  search that matched nothing says THAT (not "no memes yet"),
//  and only a truly empty library invites the first push. A
//  meme the viewer pushed can be removed again (a long-press
//  or the tile's accessibility action — the host confirms).
//  Purely presentational — the host owns the data, the search
//  round trip, the pick (usually the engine's
//  sendStoredImage) and the removal.
//
//  Split into (root component last):
//
//    MemeTile   — one meme, with its removal door
//    GridNotice — the empty / no-match / failed line
//    MemePicker — the panel (default export)
//
//  Used by:
//    - the host's chat room, above the Composer
// -----------------------------------------------------------

// Theme + labels + URL resolution
import { useKitEnv, useKitLabels, useKitTheme } from '../provider';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View, type AccessibilityActionEvent } from 'react-native';

import type { KitLabels } from '../provider/labels';
import type { KitMemeItem } from '../core/types';


// The grid: three square tiles per row
const COLUMNS = 3;
// Fixed panel height — the composer above never jumps as the
// result set changes
const PANEL_HEIGHT = 264;
// Hairline between tiles
const TILE_GAP = 4;







// -----------------------------------------------------------
// MemeTile
// -----------------------------------------------------------
//
// One tile of the grid: a tap sends it; an OWN meme also
// answers a long-press and a named "remove" accessibility
// action with onRemove (the host asks before it deletes).
//
// Used by:
//   - MemePicker (below)
// -----------------------------------------------------------

function MemeTile({ item, labels, onPick, onRemove }: { item: KitMemeItem; labels: KitLabels; onPick: (item: KitMemeItem) => void; onRemove?: (item: KitMemeItem) => void }) {

  const { colors } = useKitTheme();
  const { resolveImageUrl } = useKitEnv();
  const removable = !!item.own && !!onRemove;
  const uri = item.url.startsWith('/') ? resolveImageUrl(item.url) ?? item.url : item.url;


  return (
    <Pressable
      onPress={() => onPick(item)}
      onLongPress={removable ? () => onRemove?.(item) : undefined}
      delayLongPress={400}
      accessibilityRole="imagebutton"
      accessibilityLabel={item.title}
      accessibilityActions={removable ? [{ name: 'remove', label: labels.removeMeme }] : undefined}
      onAccessibilityAction={removable ? (e: AccessibilityActionEvent) => { if (e.nativeEvent.actionName === 'remove') onRemove?.(item); } : undefined}
      testID={`chatuikit-meme-${item.id}`}
      style={{ flex: 1 / COLUMNS, aspectRatio: 1, margin: TILE_GAP / 2, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceSoft }}
    >
      <ExpoImage
        source={{ uri }}
        placeholder={item.preview ? { uri: item.preview } : undefined}
        placeholderContentFit="cover"
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={item.url}
      />
    </Pressable>
  );
}







// -----------------------------------------------------------
// GridNotice
// -----------------------------------------------------------
//
// The line an empty grid shows — and, for a failed load, a
// retry beside it.
//
// Used by:
//   - MemePicker (below)
// -----------------------------------------------------------

function GridNotice({ text, retryLabel, onRetry }: { text: string; retryLabel?: string; onRetry?: () => void }) {

  const { colors, fonts } = useKitTheme();


  return (
    <View style={{ padding: 24, alignItems: 'center' }} accessibilityLiveRegion="polite">
      <Text style={{ textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft }}>{text}</Text>
      {onRetry && retryLabel ? (
        <Pressable onPress={onRetry} hitSlop={10} accessibilityRole="button" accessibilityLabel={retryLabel} testID="chatuikit-meme-retry" style={{ marginTop: 8, minHeight: 32, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.brandText }}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}







// -----------------------------------------------------------
// MemePicker (default export)
// -----------------------------------------------------------
//
// A fixed-height panel (the composer never jumps): search
// field up top, the three-column FlatList under it. The "+"
// tile leads the grid when onAdd is given; relative URLs go
// through the provider's resolveImageUrl.
//
// Used by:
//   - composer/Composer.tsx — the meme panel under the field
//   - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

export default function MemePicker({
  items,
  query,
  onQueryChange,
  onPick,
  onAdd,
  adding = false,
  loading = false,
  onEndReached,
  error = false,
  onRetry,
  onRemove,
}: {
  items: KitMemeItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onPick: (item: KitMemeItem) => void;
  // The push door — omitted, the "+" tile is not drawn
  onAdd?: () => void;
  // The push in flight — the "+" tile shows a spinner
  adding?: boolean;
  loading?: boolean;
  onEndReached?: () => void;
  // The last load failed — the empty grid says so, with a retry
  error?: boolean;
  onRetry?: () => void;
  // An own meme's removal (items flagged `own`) — omitted, no
  // tile offers it
  onRemove?: (item: KitMemeItem) => void;
}) {

  const labels = useKitLabels();
  const { colors, fonts } = useKitTheme();


  // The "+" tile leads the grid so pushing is always one tap away
  const rows: (KitMemeItem | { id: '__add__' })[] = onAdd ? [{ id: '__add__' }, ...items] : items;


  return (
    <View style={{ height: PANEL_HEIGHT, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }} testID="chatuikit-meme-picker">

      <View style={{ flexDirection: 'row', alignItems: 'center', margin: 8, paddingHorizontal: 10, borderRadius: 16, backgroundColor: colors.surfaceSoft }}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder={labels.searchMemes}
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel={labels.searchMemes}
          testID="chatuikit-meme-search"
          style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 8, fontFamily: fonts.regular, fontSize: 14, color: colors.ink }}
        />
        {loading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
      </View>

      <FlatList
        data={rows}
        numColumns={COLUMNS}
        keyExtractor={(item) => item.id}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: TILE_GAP, paddingBottom: TILE_GAP }}
        ListEmptyComponent={
          loading ? null : error ? (
            <GridNotice text={labels.memesLoadError} retryLabel={labels.tryAgain} onRetry={onRetry} />
          ) : (
            <GridNotice text={query.trim() ? labels.noMemeResults : labels.emptyMemes} />
          )
        }
        renderItem={({ item }) =>
          item.id === '__add__' ? (
            <Pressable
              onPress={adding ? undefined : onAdd}
              accessibilityRole="button"
              accessibilityLabel={labels.addMeme}
              testID="chatuikit-meme-add"
              style={{ flex: 1 / COLUMNS, aspectRatio: 1, margin: TILE_GAP / 2, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}
            >
              {adding ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="add" size={26} color={colors.brand} />}
            </Pressable>
          ) : (
            <MemeTile item={item as KitMemeItem} labels={labels} onPick={onPick} onRemove={onRemove} />
          )
        }
      />

    </View>
  );
}
