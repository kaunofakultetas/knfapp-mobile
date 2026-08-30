// -----------------------------------------------------------
//  [*] chatuikit — TimeSeparator
//
//  The centered "Šiandien 15:30" stamp between stretches of
//  conversation — quiet text, no pill, the way iMessage marks
//  its pauses.
//
//  Used by:
//    - chatuikit/list/MessageList.tsx
// -----------------------------------------------------------

import { Text, View } from 'react-native';

import { BLOCK_GAP } from '../core/metrics';
import { useKitTheme } from '../provider';


// The bubble below adds BLOCK_GAP above itself; the stamp gives
// that back so it sits centred in the pause
const PAD = 14;


export default function TimeSeparator({ day, time }: { day: string; time: string }) {

  const { colors, fonts, text } = useKitTheme();


  return (
    <View
      style={{ alignItems: 'center', paddingTop: PAD + BLOCK_GAP / 2, paddingBottom: PAD - BLOCK_GAP / 2 }}
      accessibilityRole="header"
    >
      <Text style={[text.caption, { color: colors.inkSoft }]}>
        {day ? <Text style={{ fontFamily: fonts.semiBold }}>{day} </Text> : null}
        {time}
      </Text>
    </View>
  );
}
