// -----------------------------------------------------------
//  [*] chatkit — ReactionPills
//
//  The emoji tallies under a bubble, overlapping its bottom
//  edge on the inner corner — towards the screen centre, where
//  iMessage and Messenger hang theirs. The reader's own
//  reaction is washed in the brand colour. A tap opens the
//  reactor list.
//
//  Used by:
//    - chatkit/MessageBubble.tsx
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import type { KitReaction } from './types';


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

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      // The pills row is 22pt tall — the slop leans downward, away
      // from the bubble the row overlaps
      hitSlop={{ top: 6, bottom: 11, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${reactions.map((r) => `${r.emoji} ${r.count}`).join(', ')}`}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: -11,
        marginLeft: own ? 8 : 0,
        marginRight: own ? 0 : 8,
        zIndex: 1,
      }}
    >
      {reactions.map((reaction) => (
        <View
          key={reaction.emoji}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 22,
            paddingHorizontal: 6,
            marginRight: 3,
            borderRadius: 11,
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
            <Text className="ml-1 font-raleway-semibold text-ink-soft" style={{ fontSize: 11, lineHeight: 14 }}>
              {reaction.count}
            </Text>
          ) : null}
        </View>
      ))}
    </Pressable>
  );
}
