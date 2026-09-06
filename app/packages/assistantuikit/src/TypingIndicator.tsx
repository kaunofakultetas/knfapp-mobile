// -----------------------------------------------------------
//  [*] assistantuikit — TypingIndicator
//
//  Three dots breathing in sequence while the assistant has
//  started answering but no text has arrived yet. Driven by
//  the core Animated module (the kit carries no animation
//  library); a reader who asked the OS for less motion gets
//  the dots placed at half strength and still, never looping.
//  The query is async and best-effort: until it answers, the
//  animation default stands.
//
//  Split into (root component last):
//
//    useReduceMotion — the OS motion preference, best-effort
//    TypingIndicator — the dots (default export)
//
//  Used by:
//    - AssistantMessage.tsx — the assistant bubble's empty part
//    - hosts showing a wait outside a bubble
// -----------------------------------------------------------

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, View } from 'react-native';

import { defaultColors, type AssistantColors } from './core/types';


const DOT_COUNT = 3;
const DOT_STAGGER_MS = 150;
const DOT_RISE_MS = 300;







// -----------------------------------------------------------
// useReduceMotion
// -----------------------------------------------------------
//
// A reader who asked the OS for less motion — false until the
// async query answers, and false when it cannot answer at all.
//
// Used by:
//   - TypingIndicator (below)
// -----------------------------------------------------------

function useReduceMotion(): boolean {

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


  return reduceMotion;
}







// -----------------------------------------------------------
// TypingIndicator (default export)
// -----------------------------------------------------------
//
// Used by:
//   - AssistantMessage.tsx — through the Empty part slot
// -----------------------------------------------------------

export default function TypingIndicator({
  colors = defaultColors,
  testID = 'assistantuikit-typing',
}: {
  colors?: AssistantColors;
  testID?: string;
}) {

  // One phase value per dot: 0 = resting, 1 = risen and bright.
  // Created once in a lazy initializer so the loop below keeps
  // driving the same values across renders
  const [phases] = useState(() => Array.from({ length: DOT_COUNT }, () => new Animated.Value(0)));
  const reduceMotion = useReduceMotion();


  useEffect(() => {
    if (reduceMotion) {
      // Still, and clearly a wait: half strength, no rise
      phases.forEach((phase) => phase.setValue(0.5));
      return;
    }
    // The web target has no native animated module — asking for
    // it there logs a warning and falls back anyway, so ask only
    // where it exists
    const useNativeDriver = Platform.OS !== 'web';
    const rise = (phase: Animated.Value) =>
      Animated.sequence([
        Animated.timing(phase, { toValue: 1, duration: DOT_RISE_MS, useNativeDriver }),
        Animated.timing(phase, { toValue: 0, duration: DOT_RISE_MS, useNativeDriver }),
      ]);
    const loop = Animated.loop(Animated.stagger(DOT_STAGGER_MS, phases.map(rise)));
    loop.start();
    return () => loop.stop();
  }, [phases, reduceMotion]);


  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
      {phases.map((phase, index) => (
        <Animated.View
          key={index}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            marginHorizontal: 2.5,
            backgroundColor: colors.inkSoft,
            opacity: phase.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: phase.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
          }}
        />
      ))}
    </View>
  );
}
