// -----------------------------------------------------------
//  [*] chatuikit — MemePicker
//
//  The panel above the composer while the meme toggle is open:
//  a search field, a three-column grid of tiles — animated
//  GIFs play on their own (expo-image), static memes just
//  stand, the ~14px preview blurs each while its bytes come —
//  a "+" tile for pushing into the shared library, and
//  load-more at the bottom edge. Purely presentational — the
//  host owns the data, the search round trip and the pick
//  (usually the engine's sendStoredImage).
//
//  Used by:
//    - the host's chat room, above the Composer
// -----------------------------------------------------------

// Theme + labels + URL resolution
import { useKitEnv, useKitLabels, useKitTheme } from '../provider';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import type { KitMemeItem } from '../core/types';


const COLUMNS = 3;
const PANEL_HEIGHT = 264;
const TILE_GAP = 4;


export default function MemePicker({
  items,
  query,
  onQueryChange,
  onPick,
  onAdd,
  adding = false,
  loading = false,
  onEndReached,
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
}) {

  const labels = useKitLabels();
  const { colors, fonts } = useKitTheme();
  const { resolveImageUrl } = useKitEnv();


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
          loading ? null : (
            <Text style={{ padding: 24, textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft }}>
              {labels.emptyMemes}
            </Text>
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
            <Pressable
              onPress={() => onPick(item as KitMemeItem)}
              accessibilityRole="imagebutton"
              accessibilityLabel={(item as KitMemeItem).title}
              testID={`chatuikit-meme-${item.id}`}
              style={{ flex: 1 / COLUMNS, aspectRatio: 1, margin: TILE_GAP / 2, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceSoft }}
            >
              <ExpoImage
                source={{ uri: (item as KitMemeItem).url.startsWith('/') ? resolveImageUrl((item as KitMemeItem).url) ?? (item as KitMemeItem).url : (item as KitMemeItem).url }}
                placeholder={(item as KitMemeItem).preview ? { uri: (item as KitMemeItem).preview as string } : undefined}
                placeholderContentFit="cover"
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={(item as KitMemeItem).url}
              />
            </Pressable>
          )
        }
      />

    </View>
  );
}
