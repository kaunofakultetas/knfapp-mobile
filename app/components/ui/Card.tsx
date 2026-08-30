// -----------------------------------------------------------
//  [*] UI kit — Card
//
//  The surface block content panels and list rows sit on:
//  bg-surface, rounded-xl, a whisper of shadow. With
//  `onPress` it becomes a Pressable tinting surface-soft
//  while held; without it, a plain View.
//
//  The shadow's '#000' is the ONE sanctioned raw-hex
//  exception in the app — a palette token there would tint
//  the shadow itself in dark mode.
// -----------------------------------------------------------

// Static and pressable containers
import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

// Pressed tint for the active scheme
import { useTheme } from '@/hooks/useTheme';


type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  padding?: CardPadding;
  className?: string;
  // accessible={false} keeps the Pressable from folding its
  // children into one screen-reader element — composite cards
  // (NewsCard, profile rows) expose their own inner targets;
  // simple childless cards leave it unset and stay grouped
  accessible?: boolean;
}

const PADDINGS: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-sm',
  md: 'p-md',
  lg: 'p-lg',
};

// Subtle in both schemes: elevation 1 on Android, a soft 6%
// drop on iOS. '#000' is the sanctioned shadow exception.
const CARD_SHADOW: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 4,
  elevation: 1,
};







// -----------------------------------------------------------
// Card (default export)
// -----------------------------------------------------------
//
// Used by:
//   - components/news/NewsCard.tsx — every feed entry
//   - app/(main)/tabs/settings.tsx — the settings groups
//   - app/(main)/tabs/id.tsx — the student card
//   - app/(main)/info/ — contact and info panels
//   - app/(main)/admin/ — stat and invitation panels
// -----------------------------------------------------------

export default function Card({ children, onPress, padding = 'md', className, accessible }: CardProps) {

  const { colors } = useTheme();


  const classes = `rounded-xl bg-surface ${PADDINGS[padding]} ${className ?? ''}`;


  if (!onPress) {
    return (
      <View className={classes} style={CARD_SHADOW}>
        {children}
      </View>
    );
  }


  // Inline pressed backgroundColor outranks the className
  // fill only while held, then falls away again
  return (
    <Pressable
      className={classes}
      style={({ pressed }) =>
        pressed ? [CARD_SHADOW, { backgroundColor: colors.surfaceSoft }] : CARD_SHADOW
      }
      onPress={onPress}
      accessible={accessible}
      // No button role when the card is opted out of grouping —
      // the composite child provides its own labeled target
      accessibilityRole={accessible === false ? undefined : 'button'}
    >
      {children}
    </Pressable>
  );
}
