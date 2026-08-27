// -----------------------------------------------------------
//  [*] chatkit — TimeSeparator
//
//  The centered "Šiandien 15:30" stamp between stretches of
//  conversation — quiet text, no pill, the way iMessage marks
//  its pauses.
//
//  Used by:
//    - chatkit/MessageList.tsx
// -----------------------------------------------------------

import { Text, View } from 'react-native';

import { BLOCK_GAP } from './metrics';


// The bubble below adds BLOCK_GAP above itself; the stamp gives
// that back so it sits centred in the pause
const PAD = 14;


export default function TimeSeparator({ day, time }: { day: string; time: string }) {

  return (
    <View
      className="items-center"
      style={{ paddingTop: PAD + BLOCK_GAP / 2, paddingBottom: PAD - BLOCK_GAP / 2 }}
      accessibilityRole="header"
    >
      <Text className="font-raleway text-xs text-ink-soft">
        {day ? <Text className="font-raleway-semibold">{day} </Text> : null}
        {time}
      </Text>
    </View>
  );
}
