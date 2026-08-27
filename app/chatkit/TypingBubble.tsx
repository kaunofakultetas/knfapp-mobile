// -----------------------------------------------------------
//  [*] chatkit — TypingBubble
//
//  The "…" bubble at the bottom of the list while somebody is
//  typing: an incoming-style bubble with three dots breathing
//  in sequence on the UI thread. Group chats put the typist's
//  avatar beside it like any other incoming run.
//
//  Used by:
//    - chatkit/MessageList.tsx
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
import { useTheme } from '@/hooks/useTheme';
import KitAvatar from './KitAvatar';
import { AVATAR_COLUMN, AVATAR_SIZE } from './metrics';


// One dot: rises and brightens, then settles, offset per index
function Dot({ index }: { index: number }) {

  const { colors } = useTheme();
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

  const { colors } = useTheme();


  // iOS never reads a live region that mounts with its text;
  // announce it explicitly once
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(label);
  }, [label]);


  return (
    <Animated.View
      // The inverted native cell mirrors Y — 'Down' rises there
      entering={Platform.OS === 'web' ? FadeInUp.duration(180) : FadeInDown.duration(180)}
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
