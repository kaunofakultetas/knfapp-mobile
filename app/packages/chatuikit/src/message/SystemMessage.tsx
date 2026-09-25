// -----------------------------------------------------------
//  [*] chatuikit — SystemMessage
//
//  A 'system' row: "Ona created the group", "Ona left the
//  conversation" — a centred caption on the feed ground with
//  no bubble, avatar, receipt or gesture. The timeline never
//  groups it into a run; MessageList renders it instead of a
//  bubble. Replaceable through the provider's
//  components.SystemMessage.
//
//  The caption is worded from the row's EVENT through the
//  host's labels.systemMessage, with the row's sender as the
//  actor, so every reader sees it in their own language; the
//  row's text — the backend's own prose — shows only for an
//  event the host does not know and for rows written before
//  events existed.
//
//  Used by:
//    - MessageList.tsx
// -----------------------------------------------------------

import { Text, View } from 'react-native';

import { LIST_INSET } from '../core/metrics';
import { useKitLabels, useKitTheme } from '../provider';
import type { KitMessage } from '../core/types';







// -----------------------------------------------------------
// SystemMessage (default export)
// -----------------------------------------------------------
//
// A centred caption and nothing else — no bubble, avatar or
// gesture; the text role keeps screen readers treating the
// row as one plain announcement. System rows are rare, so the
// labels are read here rather than threaded through every
// row of the list.
//
// Used by:
//   - list/MessageList.tsx — the default slot; hosts may
//     replace it through the provider's `components`
// -----------------------------------------------------------

export default function SystemMessage({ message }: { message: KitMessage }) {

  const { colors, text } = useKitTheme();
  const labels = useKitLabels();
  const caption = (message.system ? labels.systemMessage(message.system, message.senderName) : null) ?? message.text;


  return (
    <View
      style={{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: LIST_INSET + 12 }}
      accessibilityRole="text"
    >
      <Text style={[text.caption, { color: colors.inkSoft, textAlign: 'center' }]}>{caption}</Text>
    </View>
  );
}
