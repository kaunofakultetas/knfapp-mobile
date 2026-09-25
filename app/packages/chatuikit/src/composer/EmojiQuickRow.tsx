// -----------------------------------------------------------
//  [*] chatuikit — EmojiQuickRow
//
//  The strip the composer's emoji button toggles: a horizontal
//  row of tap-to-pick emoji. What a pick MEANS belongs to the
//  host — the reference host appends into its draft (which
//  also drives the typing emit); a host could as well send
//  the emoji outright. The set is overridable per host;
//  DEFAULT_QUICK_EMOJI is the stock dozen.
//
//  Used by:
//    - hosts, next to their Composer
// -----------------------------------------------------------

import { Pressable, ScrollView, Text, View } from 'react-native';

import { useKitTheme } from '../provider';







// -----------------------------------------------------------
// DEFAULT_QUICK_EMOJI
// -----------------------------------------------------------
//
// The stock dozen — reactions carry their own set elsewhere.
//
// Used by:
//   - EmojiQuickRow (below) — the default `emojis` prop;
//     exported through the kit's barrel, but no host overrides
//     the set at the moment
// -----------------------------------------------------------

export const DEFAULT_QUICK_EMOJI = ['😀', '😂', '😍', '😮', '😢', '😡', '👍', '🙏', '🎉', '🔥', '❤️', '👏'];







// -----------------------------------------------------------
// EmojiQuickRow (default export)
// -----------------------------------------------------------
//
// A horizontal row of 44pt round tap targets, one per emoji;
// taps land with the keyboard up (keyboardShouldPersistTaps)
// so a pick registers on the first touch.
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the reaction picker row
// -----------------------------------------------------------

export default function EmojiQuickRow({
  onPick,
  emojis = DEFAULT_QUICK_EMOJI,
}: {
  onPick: (emoji: string) => void;
  emojis?: readonly string[];
}) {

  const { colors } = useKitTheme();


  return (
    <ScrollView
      // flexGrow/flexShrink 0 are load-bearing: a ScrollView is
      // flex-elastic by default, and this strip usually sits in
      // a column next to a flex-1 message list — left elastic it
      // grows to split the height with it and opens a tall empty
      // box between the strip and the composer
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={{
        flexGrow: 0,
        flexShrink: 0,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.surface,
      }}
      contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 4 }}
    >
      {emojis.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => onPick(emoji)}
          accessibilityRole="button"
          accessibilityLabel={emoji}
          testID={`chatuikit-emoji-${emoji}`}
          // Static layout style on purpose — NativeWind's JSX runtime
          // drops a style FUNCTION on Pressable wholesale (the 44pt
          // box, centring and radius vanished on device while jest
          // rendered it fine); the pressed wash rides on the
          // children-as-function below instead
          style={{ height: 44, width: 44, borderRadius: 22 }}
        >
          {({ pressed }) => (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 22,
                backgroundColor: pressed ? colors.surfaceSoft : 'transparent',
              }}
            >
              <Text style={{ fontSize: 24 }}>{emoji}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}
