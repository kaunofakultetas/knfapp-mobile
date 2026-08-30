// -----------------------------------------------------------
//  [*] UI — Toast
//
//  Themed renderers for react-native-toast-message. The
//  library's stock BaseToast can't follow the app scheme, so
//  each type maps to a small component that reads useTheme() —
//  config values are render functions, and they mount inside
//  the themed tree, so the hook works.
//
//  Registered once in app/_layout.tsx via
//  <Toast config={toastConfig} />; screens then fire
//  Toast.show({ type: 'success' | 'error' | 'info', text1, text2 })
//  with already-translated texts.
//
//  Split into (exported config last):
//
//    ACCENTS     — per-type accent token + icon table
//    ToastCard   — the shared surface card
//    toastConfig — the config object (exported)
// -----------------------------------------------------------

// Palette type + JS-side colors
import { type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// Card chrome + the library's config typing
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { type ToastConfig } from 'react-native-toast-message';


type ToastKind = 'success' | 'error' | 'info';

// Success uses brand (not green) so toasts read as the app's
// own voice; error and info keep their semantic colors
const ACCENTS: Record<
  ToastKind,
  { icon: keyof typeof Ionicons.glyphMap; color: keyof Palette }
> = {
  success: { icon: 'checkmark-circle', color: 'brand' },
  error: { icon: 'alert-circle', color: 'danger' },
  info: { icon: 'information-circle', color: 'info' },
};







// -----------------------------------------------------------
// ToastCard
// -----------------------------------------------------------
//
// The one card all three types share: surface background,
// accent bar and icon from the ACCENTS table, text1 as the
// headline, text2 as the quieter second line. Width is fixed
// because the toast container centers an unconstrained child
// to its content size.
//
// Used by:
//   - toastConfig (below)
// -----------------------------------------------------------

function ToastCard({
  kind,
  text1,
  text2,
}: {
  kind: ToastKind;
  text1?: string;
  text2?: string;
}) {
  const { colors } = useTheme();
  const accent = ACCENTS[kind];


  // One accessible alert element per toast — errors interrupt
  // (assertive), the rest wait their turn; showToast in
  // NetworkContext also announces the text for iOS VoiceOver
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
      className="flex-row items-center overflow-hidden rounded-lg bg-surface"
      style={{
        width: '92%',
        maxWidth: 480,
        // '#000' is the sanctioned shadow-color exception
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      <View
        style={{
          width: 4,
          alignSelf: 'stretch',
          backgroundColor: colors[accent.color],
        }}
      />
      <Ionicons
        name={accent.icon}
        size={22}
        color={colors[accent.color]}
        style={{ marginLeft: 12 }}
      />
      <View className="flex-1 px-md py-sm">
        {text1 ? (
          <Text
            className="font-raleway-semibold text-sm text-ink"
            numberOfLines={2}
          >
            {text1}
          </Text>
        ) : null}
        {text2 ? (
          <Text
            className="mt-xs font-raleway text-xs text-ink-soft"
            numberOfLines={2}
          >
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// toastConfig
// -----------------------------------------------------------
//
// Used by:
//   - app/_layout.tsx — <Toast config={toastConfig} />
// -----------------------------------------------------------

export const toastConfig: ToastConfig = {
  success: ({ text1, text2 }) => (
    <ToastCard kind="success" text1={text1} text2={text2} />
  ),
  error: ({ text1, text2 }) => (
    <ToastCard kind="error" text1={text1} text2={text2} />
  ),
  info: ({ text1, text2 }) => (
    <ToastCard kind="info" text1={text1} text2={text2} />
  ),
};
