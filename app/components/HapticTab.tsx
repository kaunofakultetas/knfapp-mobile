// -----------------------------------------------------------
//  [*] HapticTab — tab-bar button with iOS haptic feedback
//
//  The custom tabBarButton for the bottom tab bar: a medium
//  impact fires on press-in on iOS (Android's ripple is
//  feedback enough), and the children are re-centred in a
//  full-size View because PlatformPressable's default layout
//  lets the icon drift off-centre at our tab-bar height.
// -----------------------------------------------------------

// Haptics on iOS presses
import * as Haptics from 'expo-haptics';

// Tab-bar plumbing
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { View } from 'react-native';







// -----------------------------------------------------------
// HapticTab (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — tabBarButton for every tab
// -----------------------------------------------------------

export default function HapticTab(props: BottomTabBarButtonProps) {

  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        // Android's ripple is feedback enough — haptics stay iOS-only
        if (process.env.EXPO_OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        props.onPressIn?.(ev);
      }}
    >
      <View className="flex-1 w-full items-center justify-center">{props.children}</View>
    </PlatformPressable>
  );
}

// Named alias — the tab layout imports { HapticTab }
export { HapticTab };
