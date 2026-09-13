// -----------------------------------------------------------
//  [*] timetableuikit — ConflictBanner
//
//  The danger strip summarizing how many lessons overlap,
//  worded by the catalog's pluralizing conflictsOverlap. An
//  accessible polite live region — role='alert' alone is a
//  no-op announcement-wise on RN. The leading mark defaults
//  to a dependency-free "!" disc; a host with an icon set
//  passes its own.
//
//  Used by:
//    - hosts, above their lesson list while conflicts exist
// -----------------------------------------------------------

import { Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { useTimetableLabels, useTimetableTheme } from '../provider';


export default function ConflictBanner({ count, icon }: { count: number; icon?: ReactNode }) {

  const { colors, fonts } = useTimetableTheme();
  const labels = useTimetableLabels();


  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: colors.dangerSoft,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      {icon ?? (
        <View
          style={{
            height: 16,
            width: 16,
            borderRadius: 8,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.onBrand, fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 }}>!</Text>
        </View>
      )}
      <Text style={{ marginLeft: 8, flex: 1, fontFamily: fonts.bold, fontSize: 12, color: colors.danger }}>
        {labels.conflictsOverlap(count)}
      </Text>
    </View>
  );
}
