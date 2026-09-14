// -----------------------------------------------------------
//  [*] chatuikit — UnreadSeparator
//
//  The "new messages" line the timeline places above the first
//  unread row (buildTimeline's unreadFromId): a brand rule on
//  both sides of the count. A screen reader lands on it as a
//  header, so the boundary is navigable by ear too. Replaceable
//  through the provider's components.UnreadSeparator.
//
//  Used by:
//    - MessageList.tsx
// -----------------------------------------------------------

import { StyleSheet, Text, View } from 'react-native';

import { LIST_INSET } from '../core/metrics';
import { useKitLabels, useKitTheme } from '../provider';







// -----------------------------------------------------------
// UnreadSeparator (default export)
// -----------------------------------------------------------
//
// Picks its label from the count — "N new" when known, the
// plain unread wording at zero — and hands the whole line
// to the reader as one header element.
//
// Used by:
//   - list/MessageList.tsx — the default slot; hosts may
//     replace it through the provider's `components`
//   - list/UnreadPill.tsx — shares its wording
// -----------------------------------------------------------

export default function UnreadSeparator({ count }: { count: number }) {

  const { colors, text } = useKitTheme();
  const labels = useKitLabels();
  const label = count > 0 ? labels.newMessages(count) : labels.unreadMessages;


  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: LIST_INSET }}
      accessibilityRole="header"
      accessibilityLabel={label}
    >
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.brand }} />
      <Text style={[text.caption, { color: colors.brandText, marginHorizontal: 10 }]}>{label}</Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.brand }} />
    </View>
  );
}
