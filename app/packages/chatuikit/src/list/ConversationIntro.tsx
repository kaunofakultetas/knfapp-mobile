// -----------------------------------------------------------
//  [*] chatuikit — ConversationIntro
//
//  The card at the very top of a conversation's history (the
//  inverted list's footer): the other party's portrait, the
//  title and a line such as "Start of the conversation" or the
//  member count — what Messenger shows when you scroll to the
//  beginning.
//
//  Used by:
//    - chatuikit/list/MessageList.tsx — when there is no older page
// -----------------------------------------------------------

import { Text, View } from 'react-native';

import KitAvatar from '../avatar/KitAvatar';
import { useKitTheme } from '../provider';
import StackedAvatars, { type StackMember } from '../avatar/StackedAvatars';







// -----------------------------------------------------------
// IntroInfo
// -----------------------------------------------------------
//
// What the card shows — the host builds it from its room data
// and hands it to MessageList's `intro` prop.
//
// Used by:
//   - ConversationIntro (below) — the props
//   - list/MessageList.tsx — the `intro` prop it threads down
// -----------------------------------------------------------

export interface IntroInfo {
  title: string;
  subtitle: string;
  avatarUrl?: string;
  isGroup: boolean;
  // Group chats: the other members, drawn as a stacked pair
  members?: StackMember[];
}







// -----------------------------------------------------------
// ConversationIntro (default export)
// -----------------------------------------------------------
//
// Takes IntroInfo straight as props: a stacked pair for a
// group with known members, the single portrait otherwise,
// then the title and subtitle centred beneath.
//
// Used by:
//   - list/MessageList.tsx — the default slot; hosts may
//     replace it through the provider's `components`
// -----------------------------------------------------------

export default function ConversationIntro({ title, subtitle, avatarUrl, isGroup, members }: IntroInfo) {

  const { colors, fonts } = useKitTheme();


  return (
    <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 12 }}>
      {isGroup && members && members.length > 0 ? (
        <StackedAvatars members={members} size={72} />
      ) : (
        <KitAvatar uri={avatarUrl} name={title} size={72} group={isGroup} />
      )}
      <Text style={{ marginTop: 12, fontFamily: fonts.bold, fontSize: 18, color: colors.ink }} numberOfLines={1}>
        {title}
      </Text>
      <Text style={{ marginTop: 4, fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft }} numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );
}
