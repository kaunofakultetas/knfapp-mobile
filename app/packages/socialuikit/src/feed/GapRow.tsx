// -----------------------------------------------------------
//  [*] socialuikit — GapRow
//
//  The visible hole: after a long absence a feed's fresh
//  window can share nothing with the rows already held, and
//  stitching them silently would fake continuity over an
//  unknown number of missed posts. This row sits exactly where
//  the hole is — a tap asks the host to fill it (the data
//  layer pages the fresh window forward until it reaches the
//  old rows), a spinner holds the seat while it does.
//
//  Used by:
//    - feed/FeedList.tsx — rendered after the row named by
//      gapAfterKey
// -----------------------------------------------------------

import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useKitLabels, useKitTheme } from '../provider';


export default function GapRow({ filling, onPress }: { filling?: boolean; onPress?: () => void }) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  if (filling) {
    return (
      <View testID="socialuikit-gap-row" style={{ alignItems: 'center', paddingVertical: 10 }}>
        <ActivityIndicator size="small" color={colors.brand} />
      </View>
    );
  }


  return (
    <Pressable
      testID="socialuikit-gap-row"
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={labels.gapRow}
      style={{
        alignSelf: 'center',
        marginVertical: 6,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: radii.pill,
        backgroundColor: colors.chip,
      }}
    >
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.chipInk }}>{labels.gapRow}</Text>
    </Pressable>
  );
}
