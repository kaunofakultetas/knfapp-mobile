// -----------------------------------------------------------
//  [*] chatkit — FloatingDay
//
//  The Telegram-style date pill: while the reader scrolls, the
//  day of the topmost visible row floats at the top of the list
//  and fades away once the scroll settles. MessageList owns the
//  opacity (a shared value it drives from its scroll events) and
//  the label; this is the glass. Replaceable through the
//  provider's components.FloatingDay.
//
//  Used by:
//    - MessageList.tsx
// -----------------------------------------------------------

import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useKitTheme } from '../provider';


export default function FloatingDay({ label, opacity }: { label: string; opacity: SharedValue<number> }) {

  const { colors, text } = useKitTheme();
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));


  return (
    <Animated.View
      style={[{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderRadius: 14,
          backgroundColor: colors.menuSurface,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <Text style={[text.caption, { color: colors.inkSoft }]}>{label}</Text>
      </View>
    </Animated.View>
  );
}
