// -----------------------------------------------------------
//  [*] UI kit — Badge
//
//  The brand count pill for unread counters and pending
//  states. Renders nothing at zero or below; counts past
//  `max` (default 99) collapse to "99+" so the pill never
//  stretches across a tab icon.
// -----------------------------------------------------------

// Pill primitives
import { Text, View } from 'react-native';


interface BadgeProps {
  count: number;
  max?: number;
}







// -----------------------------------------------------------
// Badge (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — messages-tab unread count
//   - components/chat/ConversationRow.tsx — per-conversation
//     unread count
//   - app/(main)/friends/ — pending friend requests
//   - app/(main)/admin/ — invitation use counts
// -----------------------------------------------------------

export default function Badge({ count, max = 99 }: BadgeProps) {

  // Hidden entirely at zero — an empty pill is visual noise
  if (count <= 0) return null;


  const label = count > max ? `${max}+` : String(count);


  // The pill overlays icons and rows and genuinely cannot
  // grow — cap accessibility scaling instead of clipping
  return (
    <View className="h-[20px] min-w-[20px] items-center justify-center rounded-full bg-brand px-xs">
      <Text className="font-raleway-bold text-xs text-on-brand" maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </View>
  );
}
