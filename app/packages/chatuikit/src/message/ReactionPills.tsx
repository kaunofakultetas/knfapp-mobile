// -----------------------------------------------------------
//  [*] chatuikit — ReactionPills
//
//  The emoji tallies under a bubble, overlapping its bottom
//  edge on the inner corner — towards the screen centre, where
//  iMessage and Messenger hang theirs. The reader's own
//  reaction is washed in the brand colour. A tap opens the
//  reactor list.
//
//  Used by:
//    - chatuikit/message/MessageBubble.tsx
// -----------------------------------------------------------

import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { useKitTheme } from '../provider';
import type { KitReaction } from '../core/types';


// The pill at the default text size — larger system text
// grows it
const BASE_PILL_HEIGHT = 22;
// The growth clamp, so a 200 % setting does not double the
// tail row
const MAX_PILL_SCALE = 1.6;







// -----------------------------------------------------------
// ReactionPills (default export)
// -----------------------------------------------------------
//
// One Pressable wraps the whole row — the tallies open the
// reactor list together, not as per-emoji targets; a negative
// top margin of half the pill is the overlap onto the bubble's
// bottom edge. The pill height follows the LIVE font scale
// (useWindowDimensions) — read once at module load it ignored
// a text-size change made while the app ran.
//
// Used by:
//   - message/MessageBubble.tsx — under the bubble
// -----------------------------------------------------------

export default function ReactionPills({
  reactions,
  own,
  label,
  onPress,
}: {
  reactions: KitReaction[];
  own: boolean;
  label: string;
  onPress: () => void;
}) {

  const { colors, fonts } = useKitTheme();
  const { fontScale } = useWindowDimensions();
  const pillHeight = Math.round(BASE_PILL_HEIGHT * Math.min(MAX_PILL_SCALE, Math.max(1, fontScale)));


  return (
    <Pressable
      onPress={onPress}
      // The pills row is ~22pt tall — the slop leans downward, away
      // from the bubble the row overlaps, to a 44pt target
      hitSlop={{ top: 6, bottom: Math.max(11, 44 - pillHeight - 6), left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${reactions.map((r) => `${r.emoji} ${r.count}`).join(', ')}`}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: -Math.round(pillHeight / 2),
        marginLeft: own ? 8 : 0,
        marginRight: own ? 0 : 8,
        zIndex: 1,
      }}
    >
      {reactions.map((reaction) => (
        <View
          key={reaction.emoji}
          testID={`chatuikit-reaction-${reaction.emoji}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: pillHeight,
            paddingHorizontal: 6,
            marginRight: 3,
            borderRadius: pillHeight / 2,
            backgroundColor: reaction.bySelf ? colors.brandSoft : colors.menuSurface,
            borderWidth: 1,
            borderColor: reaction.bySelf ? colors.brand : colors.line,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.08,
            shadowRadius: 2,
            elevation: 1,
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 16 }}>{reaction.emoji}</Text>
          {reaction.count > 1 ? (
            <Text style={{ marginLeft: 4, fontFamily: fonts.semiBold, color: colors.inkSoft, fontSize: 11, lineHeight: 14 }}>
              {reaction.count}
            </Text>
          ) : null}
        </View>
      ))}
    </Pressable>
  );
}
