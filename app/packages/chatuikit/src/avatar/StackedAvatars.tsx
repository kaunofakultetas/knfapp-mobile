// -----------------------------------------------------------
//  [*] chatuikit — StackedAvatars
//
//  A group's identity as Messenger draws it: the first two
//  members' portraits overlapping inside the same circle a
//  single portrait would occupy — a photo where there is one,
//  the initial disc where there is none. Falls back to the
//  people glyph when no member is known yet.
//
//  Used by:
//    - chatuikit/avatar/RoomHeaderTitle.tsx, ConversationIntro.tsx
//    - components/chat/ConversationRow.tsx — group rows
// -----------------------------------------------------------

import { View } from 'react-native';

import { useKitTheme } from '../provider';
import KitAvatar from './KitAvatar';


export interface StackMember {
  name: string;
  uri?: string | null;
}


export default function StackedAvatars({
  members,
  size,
  onBrand = false,
}: {
  members: StackMember[];
  size: number;
  // On the burgundy header the ring between portraits is brand
  onBrand?: boolean;
}) {

  const { colors } = useKitTheme();


  const pair = members.slice(0, 2);
  if (pair.length < 2) {
    return <KitAvatar uri={pair[0]?.uri} name={pair[0]?.name ?? '?'} size={size} group={pair.length === 0} onBrand={onBrand} />;
  }


  // Each portrait is ~65% of the circle; the front one carries a
  // ring in the ground colour so the overlap reads as depth
  const small = Math.round(size * 0.66);
  const ring = Math.max(2, Math.round(size * 0.05));


  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', top: 0, right: 0 }}>
        <KitAvatar uri={pair[1].uri} name={pair[1].name} size={small} onBrand={onBrand} />
      </View>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: small + ring * 2,
          height: small + ring * 2,
          borderRadius: (small + ring * 2) / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: onBrand ? colors.brandHeader : colors.surface,
        }}
      >
        <KitAvatar uri={pair[0].uri} name={pair[0].name} size={small} onBrand={onBrand} />
      </View>
    </View>
  );
}
