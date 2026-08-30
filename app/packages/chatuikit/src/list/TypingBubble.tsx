// -----------------------------------------------------------
//  [*] chatuikit — TypingBubble
//
//  The "…" bubble at the bottom of the list while somebody is
//  typing: an incoming-style bubble with three dots breathing
//  in sequence on the UI thread. Group chats put the typist's
//  avatar beside it like any other incoming run.
//
//  Used by:
//    - chatuikit/list/MessageList.tsx
// -----------------------------------------------------------

// Motion
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// Colours and the avatar
import { useKitTheme } from '../provider';
import { useReducedMotionSafe } from '../hooks/a11y';
import KitAvatar from '../avatar/KitAvatar';
import { AVATAR_COLUMN, AVATAR_SIZE } from '../core/metrics';


// Typing announcement debounce, held at module level so the
// bubble's start/stop REMOUNT cycles cannot re-announce: one
// spoken update per burst, resetting only after the bubble has
// stayed gone for the same window
const TYPING_ANNOUNCE_GAP_MS = 4000;
let typingAnnouncedAt = 0;
let typingResetTimer: ReturnType<typeof setTimeout> | null = null;


// One dot: rises and brightens, then settles, offset per index
function Dot({ index }: { index: number }) {

  const { colors } = useKitTheme();
  const phase = useSharedValue(0);


  useEffect(() => {
    phase.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 300, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 300 }),
        ),
        -1,
      ),
    );
  }, [index, phase]);


  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + phase.value * 0.65,
    transform: [{ translateY: -phase.value * 3 }],
  }));


  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.inkSoft, marginHorizontal: 2.5 }, style]}
    />
  );
}







export default function TypingBubble({
  label,
  name,
  avatarUrl,
  withAvatar,
}: {
  label: string;
  name?: string;
  avatarUrl?: string;
  withAvatar: boolean;
}) {

  const { colors } = useKitTheme();
  const reduceMotion = useReducedMotionSafe();


  // iOS never reads a live region that mounts with its text, so
  // it gets one explicit announcement — iOS ONLY (the live region
  // below already covers Android, which would speak twice), only
  // while VoiceOver is on, and at most once per burst however the
  // typist set churns or the bubble remounts. VoiceOver is asked
  // directly here: a cached ref is still false this early in the
  // bubble's life, and the bubble mounts exactly when the typist
  // appears
  useEffect(() => {
    if (typingResetTimer) {
      clearTimeout(typingResetTimer);
      typingResetTimer = null;
    }
    if (Platform.OS !== 'ios') return;
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!alive || !enabled) return;
      const now = Date.now();
      if (now - typingAnnouncedAt < TYPING_ANNOUNCE_GAP_MS) return;
      typingAnnouncedAt = now;
      AccessibilityInfo.announceForAccessibility(label);
    });
    return () => {
      alive = false;
    };
  }, [label]);

  // The debounce only resets once the bubble has stayed unmounted
  // (nobody typing) for a while — a quick stop/start keeps quiet
  useEffect(() => () => {
    typingResetTimer = setTimeout(() => {
      typingAnnouncedAt = 0;
      typingResetTimer = null;
    }, TYPING_ANNOUNCE_GAP_MS);
  }, []);


  return (
    <Animated.View
      // The inverted native cell mirrors Y — 'Down' rises there
      entering={reduceMotion ? undefined : Platform.OS === 'web' ? FadeInUp.duration(180) : FadeInDown.duration(180)}
      exiting={FadeOut.duration(120)}
      style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, marginBottom: 2 }}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      {withAvatar ? (
        <View style={{ width: AVATAR_COLUMN }}>
          <KitAvatar uri={avatarUrl} name={name ?? '?'} size={AVATAR_SIZE} />
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bubbleIn,
          borderRadius: 18,
          paddingHorizontal: 14,
          height: 36,
        }}
      >
        <Dot index={0} />
        <Dot index={1} />
        <Dot index={2} />
      </View>
    </Animated.View>
  );
}
