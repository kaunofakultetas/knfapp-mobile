// -----------------------------------------------------------
//  [*] chatkit — ReplyQuote
//
//  The quoted message inside a reply bubble: accent bar, the
//  quoted sender, one line of their text — or "Photo", "Video",
//  the file's name, the deleted placeholder. A tap jumps to the
//  original.
//
//  Used by:
//    - message/MessageBubble.tsx (BubbleBody)
// -----------------------------------------------------------

// Theme + labels
import { useKitTheme } from '../provider';
import type { KitLabels } from '../provider/labels';

// Rendering
import { Pressable, Text, View } from 'react-native';

import type { KitReply } from '../core/types';







// -----------------------------------------------------------
// replySnippet
// -----------------------------------------------------------
//
// The one line a quote (and the composer's reply strip) shows
// for a message: text first, then what the kind implies.
//
// Used by:
//   - ReplyQuote (below), composer/Composer.tsx (ReplyStrip)
// -----------------------------------------------------------

export function replySnippet(reply: KitReply, labels: KitLabels): string {
  if (reply.deleted) return labels.deleted;
  if (reply.text) return reply.text;
  if (reply.kind === 'video') return labels.video;
  if (reply.kind === 'file') return reply.fileName || labels.file;
  if (reply.imageUrl || reply.kind === 'image') return labels.photo;
  return '';
}







// -----------------------------------------------------------
// ReplyQuote (default export)
// -----------------------------------------------------------

export default function ReplyQuote({
  reply,
  own,
  labels,
  onPress,
  onLongPress,
}: {
  reply: KitReply;
  own: boolean;
  // Resolved once per row and threaded down — a hook call in
  // every leaf would subscribe each one to i18next
  labels: KitLabels;
  onPress?: () => void;
  onLongPress?: () => void;
}) {

  const { colors, fonts } = useKitTheme();


  const snippet = replySnippet(reply, labels);
  const nameColor = own ? colors.onBrand : colors.brand;
  const textColor = own ? colors.onBrand : colors.ink;


  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      disabled={!onPress && !onLongPress}
      // No button role: the bubble around it is the button, and
      // nested buttons are invalid on web
      accessible={!!onPress}
      accessibilityLabel={`${reply.senderName}: ${snippet}`}
      accessibilityHint={onPress ? labels.jumpToQuoted : undefined}
      style={{
        flexDirection: 'row',
        overflow: 'hidden',
        borderRadius: 10,
        marginBottom: 6,
        minWidth: 150,
        backgroundColor: own ? colors.onBrandWash : colors.quoteWash,
      }}
    >
      <View style={{ width: 3, backgroundColor: own ? colors.onBrand : colors.brand }} />
      <View style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 5 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 12, lineHeight: 15, color: nameColor }} numberOfLines={1}>
          {reply.senderName}
        </Text>
        <Text
          // Full-strength white: at 0.9 the snippet dropped under
          // AA contrast on the dark own-bubble wash
          style={{
            fontFamily: fonts.regular,
            fontSize: 13,
            lineHeight: 17,
            color: textColor,
            fontStyle: reply.deleted ? 'italic' : 'normal',
          }}
          numberOfLines={1}
        >
          {snippet}
        </Text>
      </View>
    </Pressable>
  );
}
