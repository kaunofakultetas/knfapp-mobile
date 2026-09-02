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
//  arrives through labels — the kit owns no language.
//
//  Used by:
//    - hosts wrapping notification-dependent UI
// -----------------------------------------------------------

import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useStoreValue } from './hooks/useStoreValue';
import { defaultColors, type NotifyColors, type NotifyEngineLike } from './core/types';


export interface PermissionGateLabels {
  promptTitle: string;
  promptBody: string;
  promptButton: string;
  blockedTitle: string;
  blockedBody: string;
  blockedButton: string;
  unsupportedBody: string;
}

export default function PermissionGate({
  engine,
  labels,
  onOpenSettings,
  colors = defaultColors,
  children,
}: {
  engine: NotifyEngineLike;
  labels: PermissionGateLabels;
  // The host deep-links to OS settings; the kit only asks
  onOpenSettings: () => void;
  colors?: NotifyColors;
  children: ReactNode;
}) {

  const permission = useStoreValue(engine.permission);

  if (permission.canDeliver) return <>{children}</>;
  if (permission.status === 'unknown') return null;

  if (permission.status === 'unsupported') {
    return (
      <View testID="notifyuikit-unsupported" style={{ padding: 16 }}>
        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.inkSoft }}>{labels.unsupportedBody}</Text>
      </View>
    );
  }

  const blocked = permission.status === 'denied' && !permission.canAskAgain;

  return (
    <View
      testID={blocked ? 'notifyuikit-blocked' : 'notifyuikit-prompt'}
      style={{ padding: 16, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}
    >
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 4 }}>
        {blocked ? labels.blockedTitle : labels.promptTitle}
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.inkSoft, marginBottom: 12 }}>
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
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: colors.brand,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.surface }}>
          {blocked ? labels.blockedButton : labels.promptButton}
        </Text>
      </Pressable>
    </View>
  );
}
