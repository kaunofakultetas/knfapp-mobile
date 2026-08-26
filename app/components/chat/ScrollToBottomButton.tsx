// -----------------------------------------------------------
//  [*] Chat — ScrollToBottomButton
//
//  The floating brand disc shown while the chat-room list is
//  scrolled away from the newest messages; a tap jumps back
//  down. The caller positions it above the composer through
//  `bottomInset` (it knows the composer's height), and the
//  full-width wrapper is pointerEvents="box-none" so only the
//  44pt disc itself takes touches — the rest of the strip
//  stays tappable-through to the messages behind it.
//
//  `label` arrives already translated — this component renders
//  no strings of its own.
// -----------------------------------------------------------

// JS-side icon color
import { useTheme } from '@/hooks/useTheme';

// Disc primitives
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';


interface ScrollToBottomButtonProps {
  bottomInset: number;
  onPress: () => void;
  label: string;
}







// -----------------------------------------------------------
// ScrollToBottomButton (default export)
// -----------------------------------------------------------
//
// Used by:
//   - components/chat/MessageList.tsx — the chat-room's
//     inverted message list
// -----------------------------------------------------------

export default function ScrollToBottomButton({
  bottomInset,
  onPress,
  label,
}: ScrollToBottomButtonProps) {

  const { colors } = useTheme();


  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 items-center"
      style={{ bottom: bottomInset + 72 }}
    >
      <Pressable
        onPress={onPress}
        className="items-center justify-center rounded-full bg-brand"
        style={({ pressed }) => [
          {
            width: 44,
            height: 44,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          },
          pressed && { opacity: 0.8 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name="chevron-down" size={22} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}
