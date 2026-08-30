// -----------------------------------------------------------
//  [*] chatuikit — FileCard
//
//  A 'file' message's body: a document glyph keyed to the
//  extension, the name and the size on the bubble ground.
//  Tapping hands the file's uri to the host's link handler (a
//  system opener or a download), the same door links use, so a
//  file needs no extra prop on the list.
//
//  Used by:
//    - message/MessageBubble.tsx (BubbleBody)
// -----------------------------------------------------------

// Theme + labels
import { useKitTheme } from '../../provider';
import type { KitLabels } from '../../provider/labels';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { formatBytes } from '../../core/media';
import { BUBBLE_PADDING_H, BUBBLE_PADDING_V } from '../../core/metrics';
import type { KitFile, KitIconName } from '../../core/types';







// -----------------------------------------------------------
// fileGlyph
// -----------------------------------------------------------
//
// The glyph for a name's extension — a reader tells a
// spreadsheet from a slide deck before reading the name.
//
// Used by:
//   - FileCard (below)
// -----------------------------------------------------------

export function fileGlyph(name: string, mimeType?: string): KitIconName {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'document-text-outline';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'grid-outline';
  if (ext === 'pptx' || ext === 'ppt') return 'easel-outline';
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return 'archive-outline';
  if (ext === 'txt' || ext === 'md') return 'reader-outline';
  if (mimeType?.startsWith('audio/')) return 'musical-notes-outline';
  return 'document-outline';
}







// -----------------------------------------------------------
// FileCard (default export)
// -----------------------------------------------------------

export default function FileCard({
  file,
  own,
  labels,
  onPress,
  onLongPress,
}: {
  file: KitFile;
  own: boolean;
  labels: KitLabels;
  onPress?: () => void;
  onLongPress?: () => void;
}) {

  const { colors, text } = useKitTheme();
  const ink = own ? colors.onBrand : colors.ink;
  const soft = own ? colors.onBrand : colors.inkSoft;
  const size = formatBytes(file.size);


  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      disabled={!onPress && !onLongPress}
      accessible={!!onPress}
      accessibilityLabel={`${labels.file}: ${file.name}${size ? `, ${size}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: BUBBLE_PADDING_H, paddingVertical: BUBBLE_PADDING_V, maxWidth: 280 }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: own ? colors.onBrandWash : colors.surfaceSoft,
          marginRight: 10,
        }}
      >
        <Ionicons name={fileGlyph(file.name, file.mimeType)} size={22} color={ink} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={[text.body, { color: ink }]} numberOfLines={2}>
          {file.name}
        </Text>
        {size ? <Text style={[text.caption, { color: soft, opacity: own ? 0.85 : 1 }]}>{size}</Text> : null}
      </View>
    </Pressable>
  );
}
