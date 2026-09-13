// -----------------------------------------------------------
//  [*] chatuikit — SystemMessage
//
//  A 'system' row: "Ona joined", "Group renamed to…" — a centred
//  caption on the feed ground with no bubble, avatar, receipt or
//  gesture. The timeline never groups it into a run; MessageList
//  renders it instead of a bubble. Replaceable through the
//  provider's components.SystemMessage.
//
//  Used by:
//    - MessageList.tsx
// -----------------------------------------------------------

import { Text, View } from 'react-native';

import { LIST_INSET } from '../core/metrics';
import { useKitTheme } from '../provider';
import type { KitMessage } from '../core/types';







// -----------------------------------------------------------
// SystemMessage (default export)
// -----------------------------------------------------------
//
// Used by:
//   - list/MessageList.tsx — the default slot; hosts may
//     replace it through the provider's `components`
// -----------------------------------------------------------

export default function SystemMessage({ message }: { message: KitMessage }) {

  const { colors, text } = useKitTheme();


  return (
    <View
      style={{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: LIST_INSET + 12 }}
      accessibilityRole="text"
    >
      <Text style={[text.caption, { color: colors.inkSoft, textAlign: 'center' }]}>{message.text}</Text>
    </View>
  );
}
