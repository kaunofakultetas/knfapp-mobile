// -----------------------------------------------------------
//  [*] UI — EmptyState
//
//  The friendly "nothing here" body a list screen shows
//  instead of a blank area: a soft icon circle, a title, an
//  optional hint and an optional action button. Texts arrive
//  already translated — the caller owns the copy, this file
//  owns only the layout.
// -----------------------------------------------------------

// JS-side icon color
import { useTheme } from '@/hooks/useTheme';

// Layout + the action button
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { Button } from './Button';


// Icon names typecheck against the real Ionicons glyph map
type IoniconName = keyof typeof Ionicons.glyphMap;

interface EmptyStateProps {
  icon: IoniconName;
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}







// -----------------------------------------------------------
// EmptyState (default export)
// -----------------------------------------------------------
//
// Used by:
//   - every list screen — news, messages, friends, admin… —
//     as FlatList ListEmptyComponent or standalone
// -----------------------------------------------------------

export default function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  const { colors } = useTheme();


  return (
    <View className="flex-1 items-center justify-center px-xl py-2xl">

      {/* Decorative icon — hidden from assistive tech */}
      <View
        className="mb-md items-center justify-center rounded-full bg-surface-soft"
        style={{ width: 72, height: 72 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={icon} size={32} color={colors.inkSoft} />
      </View>

      <Text className="text-center font-raleway-semibold text-lg text-ink">
        {title}
      </Text>
      {hint ? (
        <Text className="mt-sm text-center font-raleway text-sm text-ink-soft">
          {hint}
        </Text>
      ) : null}

      {action ? (
        <View className="mt-lg">
          <Button title={action.label} onPress={action.onPress} />
        </View>
      ) : null}

    </View>
  );
}
