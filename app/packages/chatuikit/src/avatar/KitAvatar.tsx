// -----------------------------------------------------------
//  [*] chatuikit — KitAvatar
//
//  The kit's own portrait: the photo when there is one (and it
//  loads — a dead URL falls back too), else the initial on a
//  disc whose colour is hashed from the sender (stable across
//  rooms), a people glyph for groups,
//  a translucent white on the brand header. Optionally tappable
//  (open a profile). Kept inside the kit so bubbles, the typing
//  bubble, the intro card and the room header share one look
//  without reaching into the app's UI kit.
//
//  Used by:
//    - chatuikit/message/MessageBubble.tsx, TypingBubble.tsx,
//      ConversationIntro.tsx, RoomHeaderTitle.tsx
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { avatarColorFor } from '../core/avatarColor';
import { useKitTheme } from '../provider';


export default function KitAvatar({
  uri,
  name,
  size,
  group = false,
  onBrand = false,
  colorKey,
  onPress,
  accessibilityLabel,
}: {
  uri?: string | null;
  name: string;
  size: number;
  // Group conversations get a people glyph instead of an initial
  group?: boolean;
  // On the burgundy header the disc is a translucent white
  onBrand?: boolean;
  // What the disc colour is hashed from — the sender id keeps a
  // person's colour stable across rooms; default: the name
  colorKey?: string;
  // A tappable portrait (open a profile); the label for the reader
  onPress?: () => void;
  accessibilityLabel?: string;
}) {

  const { colors, fonts, avatarColors } = useKitTheme();


  const [failed, setFailed] = useState(false);
  const [triedUri, setTriedUri] = useState(uri);
  if (triedUri !== uri) {
    setTriedUri(uri);
    setFailed(false);
  }


  // A press wraps whichever face renders below
  const wrap = (node: ReactNode) =>
    onPress ? (
      <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? name}>
        {node}
      </Pressable>
    ) : (
      node
    );


  if (uri && !failed) {
    return wrap(
      <ExpoImage
        testID="chatuikit-avatar-image"
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={100}
        accessibilityIgnoresInvertColors
        onError={() => setFailed(true)}
      />,
    );
  }


  // Spread iterates code points, not UTF-16 units — an emoji- or
  // non-BMP-leading name keeps its whole first glyph
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';

  // A person's disc takes their hashed colour with white on it; a
  // group keeps the brand wash; on the brand header everything is
  // the translucent white
  const personal = !group && !onBrand;
  const disc = onBrand ? colors.onBrandWash : personal ? avatarColorFor(colorKey ?? name, avatarColors) : colors.brandSoft;
  const ink = onBrand ? colors.onBrand : personal ? '#FFFFFF' : colors.brand;


  return wrap(
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: disc,
      }}
    >
      {group ? (
        <Ionicons name="people" size={size * 0.5} color={ink} />
      ) : (
        <Text
          style={{
            fontFamily: fonts.bold,
            fontSize: size * 0.42,
            color: ink,
          }}
        >
          {initial}
        </Text>
      )}
    </View>,
  );
}
