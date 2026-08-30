// -----------------------------------------------------------
//  [*] chatkit — UnreadPill
//
//  "N new messages ↑" floating at the top of the list while
//  the unread line (UnreadSeparator) is off screen: tap to
//  jump to it, ✕ to dismiss. MessageList shows it only while
//  the line has never been in view, so a reader who has
//  already scrolled past their unread stretch is not nagged.
//  Replaceable through the provider's components.UnreadPill.
//
//  Used by:
//    - MessageList.tsx
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useReducedMotionSafe } from '../hooks/a11y';
import { useKitLabels, useKitTheme } from '../provider';


export default function UnreadPill({
  label,
  onPress,
  onDismiss,
}: {
  label: string;
  onPress: () => void;
  onDismiss: () => void;
}) {

  const { colors, text } = useKitTheme();
  const labels = useKitLabels();
  const reduceMotion = useReducedMotionSafe();


  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(160)}
      exiting={reduceMotion ? undefined : FadeOut.duration(120)}
      style={{ position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' }}
      pointerEvents="box-none"
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 18,
          backgroundColor: colors.brand,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.18,
          shadowRadius: 6,
          elevation: 5,
        }}
      >
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, height: 36 }}
        >
          <Ionicons name="chevron-up" size={16} color={colors.onBrand} />
          <Text style={[text.time, { color: colors.onBrand, marginLeft: 6, fontSize: 13, lineHeight: 16 }]}>{label}</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={labels.close}
          style={{ height: 36, width: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={16} color={colors.onBrand} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
