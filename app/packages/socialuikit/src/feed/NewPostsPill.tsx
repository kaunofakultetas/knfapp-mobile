// -----------------------------------------------------------
//  [*] socialuikit — NewPostsPill
//
//  "N new posts" floating near the top of the feed while newer
//  rows wait above the reader's position: tapping it is the
//  host's cue to merge them in (FeedList also scrolls back to
//  the top). Fades and slides in through the core Animated
//  module; renders nothing at zero, so callers leave it mounted
//  and let the count alone drive it. The wrapper spans the full
//  width to centre the pill but stays touch-transparent, so the
//  feed underneath keeps scrolling.
//
//  Used by:
//    - FeedList.tsx — overlaid on the feed while newCount > 0
//    - a host floating its own chrome over a custom list
// -----------------------------------------------------------

// Theme
import { useKitLabels, useKitTheme } from '../provider';

// Primitives
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text } from 'react-native';


export default function NewPostsPill({ count, onPress }: { count: number; onPress: () => void }) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();
  // 0 → hidden above the fold, 1 → settled in place
  const appear = useRef(new Animated.Value(0)).current;
  const visible = count > 0;


  // Returning null keeps the component MOUNTED, so the value
  // must be rewound by hand for the entrance to replay each
  // time the pill comes back after the count drops to zero
  // A reader who asked the OS for less motion gets the pill
  // placed, not animated (the query is async and best-effort —
  // until it answers, the animation default stands)
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setReduceMotion(enabled === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      appear.setValue(1);
      return;
    }
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [visible, appear, reduceMotion]);


  if (!visible) return null;


  const label = labels.newPosts(count);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 12,
        left: 0,
        right: 0,
        alignItems: 'center',
        pointerEvents: 'box-none',
        opacity: appear,
        transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
      }}
    >
      <Pressable
        testID="socialuikit-new-posts-pill"
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 36,
          paddingHorizontal: 16,
          borderRadius: radii.pill,
          backgroundColor: colors.brand,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.18,
          shadowRadius: 6,
          elevation: 5,
        }}
      >
        <Ionicons name="arrow-up" size={14} color={colors.onBrand} />
        <Text style={{ color: colors.onBrand, fontFamily: fonts.medium, fontSize: 13, marginLeft: 6 }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}
