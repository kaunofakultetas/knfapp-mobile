// -----------------------------------------------------------
//  [*] chatkit — RoomHeaderTitle
//
//  The conversation's identity in the stack header: portrait,
//  name and a status line (online / member count) on the
//  brand bar — what Messenger and WhatsApp put at the top of
//  a room. Rendered through the header's `headerTitle` slot.
//
//  Used by:
//    - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import KitAvatar from './KitAvatar';
import StackedAvatars, { type StackMember } from './StackedAvatars';


export default function RoomHeaderTitle({
  title,
  subtitle,
  avatarUrl,
  isGroup,
  members,
  online,
  onPress,
}: {
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  isGroup: boolean;
  // Group chats: the other members, drawn as a stacked pair
  members?: StackMember[];
  online: boolean;
  onPress?: () => void;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'header'}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
    >
      <View>
        {isGroup && members && members.length > 0 ? (
          <StackedAvatars members={members} size={36} onBrand />
        ) : (
          <KitAvatar uri={avatarUrl} name={title} size={36} group={isGroup} onBrand />
        )}
        {online ? (
          <View
            style={{
              position: 'absolute',
              right: -1,
              bottom: -1,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: colors.success,
              borderWidth: 2,
              borderColor: colors.brandHeader,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 17, lineHeight: 21, color: colors.onBrand }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 15, color: colors.onBrand, opacity: 0.8 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
