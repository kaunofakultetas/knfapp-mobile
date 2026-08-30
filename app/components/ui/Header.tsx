// -----------------------------------------------------------
//  [*] UI — Header
//
//  The burgundy top bar of tab screens. By default it owns
//  the notch inset itself (SafeAreaView edges ['top']) so the
//  screen below keeps edges []; inset={false} renders just the
//  bar, for screens that draw the status-bar band themselves
//  because the bar is animated (the collapsing news header).
//  The bg-brand-header token stays burgundy in light mode and
//  dims in dark mode instead of flipping to a surface color.
//
//  The hamburger opens the app drawer through DrawerContext —
//  the drawer itself is mounted once by app/(main)/_layout.tsx,
//  not per header. showMenu={false} drops the hamburger for
//  screens that bring their own back affordance.
//
//  Split into (root component last):
//
//    MenuButton — the 44pt haptic hamburger
//    Header     — the bar itself (default export)
// -----------------------------------------------------------

// The drawer switch and JS-side icon color
import { useDrawer } from '@/context/DrawerContext';
import { useTheme } from '@/hooks/useTheme';

// Bar chrome
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


interface HeaderProps {
  title: string;
  right?: ReactNode;
  showMenu?: boolean;
  inset?: boolean;
}







// -----------------------------------------------------------
// MenuButton
// -----------------------------------------------------------
//
// 44pt Pressable with a generous hitSlop; light impact haptic
// on iOS only — Android's system feedback already covers taps.
//
// Used by:
//   - Header (below)
// -----------------------------------------------------------

function MenuButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { open } = useDrawer();


  return (
    <Pressable
      onPress={open}
      onPressIn={() => {
        if (process.env.EXPO_OS === 'ios') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('header.openMenu')}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
          marginLeft: -8,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name="menu" size={26} color={colors.onBrand} />
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

export default function Header({ title, right, showMenu, inset }: HeaderProps) {

  const bar = (
    <View className="flex-row items-center px-lg" style={{ height: 56 }}>
      {showMenu !== false ? <MenuButton /> : null}
      <Text
        accessibilityRole="header"
        className="flex-1 font-raleway-bold text-xl text-on-brand"
        numberOfLines={1}
        // The bar is fixed at 56px chrome — cap the title's
        // accessibility scaling so it cannot outgrow the bar
        maxFontSizeMultiplier={1.6}
      >
        {title}
      </Text>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );


  if (inset === false) {
    return <View className="bg-brand-header">{bar}</View>;
  }


  return (
    <SafeAreaView edges={['top']} className="bg-brand-header">
      {bar}
    </SafeAreaView>
  );
}
