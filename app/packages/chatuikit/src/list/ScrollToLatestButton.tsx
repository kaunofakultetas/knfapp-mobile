// -----------------------------------------------------------
//  [*] chatuikit — ScrollToLatestButton
//
//  The round button at the bottom-right that appears once the
//  reader has scrolled away from the newest messages; a brand
//  badge on it counts the messages that arrived meanwhile.
//
//  Used by:
//    - chatuikit/list/MessageList.tsx
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useKitTheme } from '../provider';


export default function ScrollToLatestButton({
  label,
  count,
  onPress,
}: {
  label: string;
  count: number;
  onPress: () => void;
}) {

  const { colors, fonts } = useKitTheme();


  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      style={{ position: 'absolute', bottom: 12, right: 12 }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        // Static layout style on purpose — NativeWind's JSX runtime
        // drops a style FUNCTION on Pressable; the pressed dim rides
        // on the child-function below
        style={{
          height: 44,
          width: 44,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.menuSurface,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.14,
          shadowRadius: 6,
          elevation: 5,
        }}
      >
        {({ pressed }) => (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 }}>
        <Ionicons name="chevron-down" size={22} color={colors.inkSoft} />
        {count > 0 ? (
          <View
            style={{
              position: 'absolute',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              backgroundColor: colors.brand,
              paddingHorizontal: 6,
              top: -6,
              right: -4,
              minWidth: 20,
              height: 20,
            }}
          >
            <Text style={{ fontFamily: fonts.bold, color: colors.onBrand, fontSize: 11, lineHeight: 14 }}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        ) : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
