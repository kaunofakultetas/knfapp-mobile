// -----------------------------------------------------------
//  [*] chatkit — KitAvatar
//
//  The kit's own portrait: the photo when there is one (and it
//  loads — a dead URL falls back too), else the initial on a
//  brand-soft disc. Kept inside the kit so
//  bubbles, the typing bubble, the intro card and the room
//  header share one look without reaching into the app's UI
//  kit.
//
//  Used by:
//    - chatkit/message/MessageBubble.tsx, TypingBubble.tsx,
//      ConversationIntro.tsx, RoomHeaderTitle.tsx
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useKitTheme } from '../provider';


export default function KitAvatar({
  uri,
  name,
  size,
  group = false,
  onBrand = false,
}: {
  uri?: string | null;
  name: string;
  size: number;
  // Group conversations get a people glyph instead of an initial
  group?: boolean;
  // On the burgundy header the disc is a translucent white
  onBrand?: boolean;
}) {

  const { colors, fonts } = useKitTheme();


  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);


  if (uri && !failed) {
    return (
      <ExpoImage
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={100}
        accessibilityIgnoresInvertColors
        onError={() => setFailed(true)}
      />
    );
  }


  // Spread iterates code points, not UTF-16 units — an emoji- or
  // non-BMP-leading name keeps its whole first glyph
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';


  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: onBrand ? colors.onBrandWash : colors.brandSoft,
      }}
    >
      {group ? (
        <Ionicons name="people" size={size * 0.5} color={onBrand ? colors.onBrand : colors.brand} />
      ) : (
        <Text
          style={{
            fontFamily: fonts.bold,
            fontSize: size * 0.42,
            color: onBrand ? colors.onBrand : colors.brand,
          }}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}
