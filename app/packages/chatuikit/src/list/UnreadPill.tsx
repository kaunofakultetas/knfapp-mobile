// -----------------------------------------------------------
//  [*] chatuikit — UnreadPill
//
//  "N new messages ↑" floating at the top of the list while
//  the unread line (UnreadSeparator) is off screen: tap to
//  jump to it, ✕ to dismiss. The chevron points at the line —
//  up while it waits above the viewport, down when the reader
//  has scrolled up past it. MessageList shows it only while
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







// -----------------------------------------------------------
// UnreadPill (default export)
// -----------------------------------------------------------
//
// Two targets in one pill: the labelled jump and a separate
// ✕ with its own hit slop, so a dismiss can never misfire a
// jump. The fades honour reduced motion.
//
// Used by:
//   - list/MessageList.tsx — the default slot; hosts may
//     replace it through the provider's `components`
// -----------------------------------------------------------

export default function UnreadPill({
  label,
  onPress,
  onDismiss,
  direction = 'up',
}: {
  label: string;
  onPress: () => void;
  onDismiss: () => void;
  // Where the unread line is: above the viewport (the usual case
  // on opening) or below it (a reader scrolled up into history)
  direction?: 'up' | 'down';
}) {

  const { colors, text } = useKitTheme();
  const labels = useKitLabels();
  const reduceMotion = useReducedMotionSafe();


  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(160)}
      exiting={reduceMotion ? undefined : FadeOut.duration(120)}
      style={{ position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' }}
    >
      <View
        style={{ pointerEvents: 'box-none',
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
          // The pill is 36pt tall — the slop takes it to 44
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, height: 36 }}
        >
          <Ionicons name={direction === 'down' ? 'chevron-down' : 'chevron-up'} size={16} color={colors.onBrand} testID={`chatuikit-unread-pill-${direction}`} />
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
