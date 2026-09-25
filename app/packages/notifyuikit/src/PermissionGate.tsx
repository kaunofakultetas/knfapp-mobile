// -----------------------------------------------------------
//  [*] notifyuikit — PermissionGate
//
//  Renders by permission state, with the engine as the only
//  brain: deliverable ⇒ the children; askable ⇒ a prompt card
//  whose button calls requestPermission(); denied-for-good ⇒
//  a card whose button hands off to the HOST's open-settings
//  callback (the kit never deep-links); unsupported ⇒ a plain
//  note (this runtime cannot push — a state, not an error);
//  unknown ⇒ nothing, the poll is a frame away. Every string
//  arrives through labels — the kit owns no language — and the
//  host's typography through `fonts`, so the cards set in the
//  same face as the screen around them.
//
//  Used by:
//    - hosts wrapping notification-dependent UI
// -----------------------------------------------------------

import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStoreValue } from './hooks/useStoreValue';
import { defaultColors, type NotifyColors, type NotifyEngineLike, type NotifyFonts } from './core/types';


// The gate's action is a real button — 44pt tall at least,
// however small its label sets
const MIN_TOUCH = 44;







// -----------------------------------------------------------
// PermissionGateLabels
// -----------------------------------------------------------
//
// Every string the gate's three cards can render — the host
// owns the language.
//
// Used by:
//   - PermissionGate (below) — the `labels` prop
// -----------------------------------------------------------

export interface PermissionGateLabels {
  promptTitle: string;
  promptBody: string;
  promptButton: string;
  blockedTitle: string;
  blockedBody: string;
  blockedButton: string;
  unsupportedBody: string;
}







// -----------------------------------------------------------
// PermissionGate (default export)
// -----------------------------------------------------------
//
// One card serves prompt and blocked alike: blocked (denied
// with canAskAgain false) swaps the strings and points the
// button at the host's onOpenSettings instead of the
// engine's permission request. The button label sets in
// `colors.onBrand` (white when absent) — the surface color
// it once borrowed misses AA on a dark scheme's brand fill.
//
// Used by:
//   - the host's settings screen (app/(main)/tabs/settings.tsx)
// -----------------------------------------------------------

export default function PermissionGate({
  engine,
  labels,
  onOpenSettings,
  colors = defaultColors,
  fonts,
  children,
}: {
  engine: NotifyEngineLike;
  labels: PermissionGateLabels;
  // The host deep-links to OS settings; the kit only asks
  onOpenSettings: () => void;
  colors?: NotifyColors;
  // Absent families keep the platform font (see NotifyFonts)
  fonts?: NotifyFonts;
  children: ReactNode;
}) {

  const permission = useStoreValue(engine.permission);


  // A given family carries its own weight; only the platform
  // font needs one spelled out
  const bold = fonts?.bold ? { fontFamily: fonts.bold } : { fontWeight: '600' as const };
  const regular = fonts?.regular ? { fontFamily: fonts.regular } : null;


  if (permission.canDeliver) return <>{children}</>;
  if (permission.status === 'unknown') return null;

  if (permission.status === 'unsupported') {
    return (
      <View testID="notifyuikit-unsupported" style={{ padding: 16 }}>
        <Text style={[{ fontSize: 13, lineHeight: 18, color: colors.inkSoft }, regular]}>{labels.unsupportedBody}</Text>
      </View>
    );
  }

  const blocked = permission.status === 'denied' && !permission.canAskAgain;

  return (
    <View
      testID={blocked ? 'notifyuikit-blocked' : 'notifyuikit-prompt'}
      style={{ padding: 16, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}
    >
      <Text style={[{ fontSize: 15, color: colors.ink, marginBottom: 4 }, bold]}>
        {blocked ? labels.blockedTitle : labels.promptTitle}
      </Text>
      <Text style={[{ fontSize: 13, lineHeight: 18, color: colors.inkSoft, marginBottom: 12 }, regular]}>
        {blocked ? labels.blockedBody : labels.promptBody}
      </Text>
      <Pressable
        testID="notifyuikit-gate-action"
        accessibilityRole="button"
        onPress={() => {
          if (blocked) onOpenSettings();
          else void engine.requestPermission();
        }}
        style={({ pressed }) => [
          {
            alignSelf: 'flex-start',
            minHeight: MIN_TOUCH,
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: colors.brand,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={[{ fontSize: 14, color: colors.onBrand ?? '#FFFFFF' }, bold]}>
          {blocked ? labels.blockedButton : labels.promptButton}
        </Text>
      </Pressable>
    </View>
  );
}
