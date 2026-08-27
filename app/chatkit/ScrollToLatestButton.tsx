// -----------------------------------------------------------
//  [*] chatkit — ScrollToLatestButton
//
//  The round button at the bottom-right that appears once the
//  reader has scrolled away from the newest messages; a brand
//  badge on it counts the messages that arrived meanwhile.
//
//  Used by:
//    - chatkit/MessageList.tsx
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';


export default function ScrollToLatestButton({
  label,
  count,
  onPress,
}: {
  label: string;
  count: number;
  onPress: () => void;
}) {

  const { colors } = useTheme();


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
        className="h-11 w-11 items-center justify-center rounded-full border border-line bg-menu-surface active:opacity-80"
        style={{
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.14,
          shadowRadius: 6,
          elevation: 5,
        }}
      >
        <Ionicons name="chevron-down" size={22} color={colors.inkSoft} />
        {count > 0 ? (
          <View
            className="absolute items-center justify-center rounded-full bg-brand px-1.5"
            style={{ top: -6, right: -4, minWidth: 20, height: 20 }}
          >
            <Text className="font-raleway-bold text-on-brand" style={{ fontSize: 11, lineHeight: 14 }}>
              {count > 99 ? '99+' : count}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
