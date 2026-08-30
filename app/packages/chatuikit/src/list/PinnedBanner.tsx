// -----------------------------------------------------------
//  [*] chatuikit — PinnedBanner
//
//  The strip above the list naming the room's pinned message:
//  a pin glyph, the snippet, and — with several pins — a
//  "1/3" counter. A tap hands the SHOWN pin to the host (jump
//  to it) and advances the cycle, so repeated taps walk every
//  pin the way the big messengers do. No pins, no banner.
//  Unpinning is the menu's business, not the banner's.
//
//  Used by:
//    - the host's chat room, above MessageList
// -----------------------------------------------------------

// Theme + labels
import { useKitLabels, useKitTheme } from '../provider';
import type { KitLabels } from '../provider/labels';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { messageKind, type KitMessage } from '../core/types';


// What the one-line snippet says for a content kind without text
function pinSnippet(message: KitMessage, labels: KitLabels): string {
  if (message.text) return message.text;
  const kind = messageKind(message);
  if (kind === 'video') return labels.video;
  if (kind === 'audio') return labels.voiceNote;
  if (kind === 'file') return message.file?.name || labels.file;
  if (message.gallery && message.gallery.length >= 2) return labels.gallery(message.gallery.length);
  return labels.photo;
}


export default function PinnedBanner({ pins, onPress }: { pins: KitMessage[]; onPress: (message: KitMessage) => void }) {

  const labels = useKitLabels();
  const { colors, fonts } = useKitTheme();


  // The cycle restarts whenever the pin set changes shape
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    setCursor(0);
  }, [pins.length]);


  if (pins.length === 0) return null;
  const shown = pins[Math.min(cursor, pins.length - 1)];


  return (
    <Pressable
      onPress={() => {
        onPress(shown);
        setCursor((current) => (current + 1) % pins.length);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${labels.pinnedMessage}: ${pinSnippet(shown, labels)}`}
      testID="chatuikit-pinned-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <Ionicons name="pin" size={14} color={colors.brand} style={{ marginRight: 8, transform: [{ rotate: '45deg' }] }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 11, lineHeight: 13, color: colors.brandText }}>{labels.pinnedMessage}</Text>
        <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 17, color: colors.ink }} testID="chatuikit-pinned-snippet">
          {pinSnippet(shown, labels)}
        </Text>
      </View>
      {pins.length > 1 ? (
        <Text style={{ marginLeft: 8, fontFamily: fonts.medium, fontSize: 11, color: colors.inkSoft, fontVariant: ['tabular-nums'] }} testID="chatuikit-pinned-count">
          {`${Math.min(cursor, pins.length - 1) + 1}/${pins.length}`}
        </Text>
      ) : null}
    </Pressable>
  );
}
