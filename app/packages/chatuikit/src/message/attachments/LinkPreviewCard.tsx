// -----------------------------------------------------------
//  [*] chatuikit — LinkPreviewCard
//
//  The card under a text message whose first link the backend
//  unfurled: a picture (when there is one, resolved like any
//  stored image), the site name, the title and a line of
//  description. Tapping opens the link through the same door
//  links use. Drawn on the bubble's ground, in the bubble's
//  ink, so it reads as part of the message.
//
//  Used by:
//    - message/MessageBubble.tsx (BubbleBody)
// -----------------------------------------------------------

// Theme + labels + URL resolution
import { useKitEnv, useKitTheme } from '../../provider';
import type { KitLabels } from '../../provider/labels';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { BUBBLE_PADDING_H } from '../../core/metrics';
import type { KitLinkPreview } from '../../core/types';


export default function LinkPreviewCard({
  preview,
  own,
  labels,
  onPress,
  onLongPress,
}: {
  preview: KitLinkPreview;
  own: boolean;
  labels: KitLabels;
  onPress?: (href: string) => void;
  onLongPress?: () => void;
}) {

  const { colors, fonts } = useKitTheme();
  const { resolveImageUrl } = useKitEnv();
  const image = preview.imageUrl ? resolveImageUrl(preview.imageUrl) : null;
  const ink = own ? colors.onBrand : colors.ink;
  const soft = own ? colors.onBrand : colors.inkSoft;


  return (
    <Pressable
      onPress={onPress ? () => onPress(preview.url) : undefined}
      onLongPress={onLongPress}
      delayLongPress={260}
      disabled={!onPress && !onLongPress}
      accessible={!!onPress}
      accessibilityLabel={`${labels.linkPreview}: ${preview.title || preview.url}`}
      accessibilityHint={onPress ? labels.openLink : undefined}
      testID="chatuikit-link-preview"
      style={{
        marginTop: 8,
        marginHorizontal: -BUBBLE_PADDING_H + 6,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: own ? colors.onBrandWash : colors.quoteWash,
      }}
    >
      {image ? (
        <ExpoImage source={{ uri: image }} placeholder={preview.imagePreview ? { uri: preview.imagePreview } : undefined} placeholderContentFit="cover" style={{ width: '100%', height: 120, backgroundColor: colors.surfaceSoft }} contentFit="cover" cachePolicy="memory-disk" recyclingKey={image} accessibilityIgnoresInvertColors />
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 }}>
        {!image ? <Ionicons name="link-outline" size={18} color={soft} style={{ marginRight: 8 }} /> : null}
        <View style={{ flexShrink: 1 }}>
          {preview.siteName ? (
            <Text style={{ fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, color: soft, opacity: own ? 0.85 : 1 }} numberOfLines={1}>
              {preview.siteName}
            </Text>
          ) : null}
          <Text style={{ fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 18, color: ink }} numberOfLines={2}>
            {preview.title || preview.url}
          </Text>
          {preview.description ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: soft, opacity: own ? 0.9 : 1 }} numberOfLines={2}>
              {preview.description}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
