// -----------------------------------------------------------
//  [*] UI — Header
//
//  The burgundy top bar of tab screens. It owns the notch
//  inset itself (SafeAreaView edges ['top']) so the screen
//  below keeps edges []; the bg-brand-header token stays
//  burgundy in light mode and dims in dark mode instead of
//  flipping to a surface color.
//
//  The hamburger opens the app Sidebar, which the header
//  mounts itself so every tab screen gets the menu for free.
//  showMenu={false} drops both the hamburger and the Sidebar
//  mount — for pushed screens that bring their own back
//  affordance.
//
//  Split into (root component last):
//
//    MenuButton — the 44pt haptic hamburger
//    Header     — the bar itself (default export)
// -----------------------------------------------------------

// The menu this header owns
import Sidebar from '@/components/Sidebar';

// JS-side icon color
import { useTheme } from '@/hooks/useTheme';

// Bar chrome
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


interface HeaderProps {
  title: string;
  right?: ReactNode;
  showMenu?: boolean;
}







// -----------------------------------------------------------
// MenuButton
// -----------------------------------------------------------
//
// 44pt Pressable with a generous hitSlop; medium impact haptic
// on iOS only — Android's system feedback already covers taps.
//
// Used by:
//   - Header (below)
// -----------------------------------------------------------

function MenuButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (process.env.EXPO_OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('header.openMenu')}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name="menu" size={24} color={colors.onBrand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// Header (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/* — every tab screen
//   - pushed screens that pass showMenu={false}
// -----------------------------------------------------------

export default function Header({ title, right, showMenu }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);


  // Pushed screens opt out of the menu AND the Sidebar mount
  const hasMenu = showMenu !== false;


  return (
    <SafeAreaView edges={['top']} className="bg-brand-header">
      <View
        className="flex-row items-center px-lg"
        style={{ paddingVertical: 14 }}
      >
        {hasMenu ? <MenuButton onPress={() => setMenuOpen(true)} /> : null}
        <Text className="flex-1 font-raleway-bold text-xl text-on-brand">
          {title}
        </Text>
        {right ? <View>{right}</View> : null}
      </View>

      {hasMenu ? (
        <Sidebar visible={menuOpen} onClose={() => setMenuOpen(false)} />
      ) : null}
    </SafeAreaView>
  );
}
