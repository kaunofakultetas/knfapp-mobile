// -----------------------------------------------------------
//  [*] UI kit — Badge
//
//  The brand count pill for unread counters and pending
//  states. Renders nothing at zero or below — or for a count
//  that is not a finite number (an unread total computed off
//  a missing field reads NaN, and the pill used to print
//  "NaN"); counts past `max` (default 99) collapse to "99+" so
//  the pill never stretches across a tab icon.
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
// Stateless — hiding at zero and the "99+" collapse both
// derive straight from `count`, so callers render it
// unconditionally instead of guarding with `count > 0 &&`.
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — messages-tab unread count
//   - components/chat/ConversationRow.tsx — per-conversation
//     unread count
//   - app/(main)/friends/ — pending friend requests
//   - app/(main)/admin/ — invitation use counts
// -----------------------------------------------------------

export default function Badge({ count, max = 99 }: BadgeProps) {

  // Hidden entirely at zero — an empty pill is visual noise —
  // and for NaN/Infinity, which no counter should ever show
  if (!Number.isFinite(count) || count <= 0) return null;


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
