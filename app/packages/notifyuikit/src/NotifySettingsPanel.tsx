// -----------------------------------------------------------
//  [*] notifyuikit — NotifySettingsPanel
//
//  The notification settings surface: one master switch, one
//  row per feature channel, the chat-preview privacy flag.
//  All state reads through the engine's stores; every flip is
//  an engine call. The one piece of UI judgment lives here:
//  turning the master switch ON can FAIL (permission denied,
//  unsupported runtime) — those failures snap the switch back
//  OFF and hand the reason to the host's onBlocked callback
//  (which shows its own prompt); a mere network failure keeps
//  the switch ON — intent is recorded, the register retries
//  later. Channel rows disable while the master is off. Every
//  string arrives through labels.
//
//  Used by:
//    - hosts' settings screens
// -----------------------------------------------------------

import { Switch, Text, View } from 'react-native';

import { useStoreValue } from './hooks/useStoreValue';
import { defaultColors, type NotifyChannelKey, type NotifyColors, type NotifyEngineLike } from './core/types';


const CHANNEL_ORDER: readonly NotifyChannelKey[] = ['news', 'chat', 'schedule', 'admin'];

export interface NotifySettingsLabels {
  master: string;
  masterHint?: string;
  channels: Record<NotifyChannelKey, string>;
  chatPreview: string;
  chatPreviewHint?: string;
}


// One labeled switch row — the whole panel is these stacked
function Row({
  label,
  hint,
  value,
  disabled,
  onToggle,
  colors,
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
  colors: NotifyColors;
  testID: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 14, color: colors.ink }}>{label}</Text>
        {hint ? <Text style={{ fontSize: 12, lineHeight: 16, color: colors.inkSoft, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        disabled={disabled}
        onValueChange={onToggle}
        trackColor={{ true: colors.brand, false: colors.line }}
        accessibilityLabel={label}
      />
    </View>
  );
}


export default function NotifySettingsPanel({
  engine,
  labels,
  onBlocked,
  colors = defaultColors,
}: {
  engine: NotifyEngineLike;
  labels: NotifySettingsLabels;
  // Master-ON failed for a reason only the host can act on
  // (prompt for permission, explain the runtime)
  onBlocked?: (reason: 'permission' | 'unsupported') => void;
  colors?: NotifyColors;
}) {

  const prefs = useStoreValue(engine.prefs);

  const toggleMaster = async (on: boolean) => {
    // The engine's contract is typed results, not throws — but
    // a UI handler still never lets a rejection escape
    try {
      const result = await engine.setMasterEnabled(on);
      if (!on || !result || result.ok) return;
      if (result.reason === 'permission' || result.reason === 'unsupported') {
        // The switch must not lie: delivery is impossible, so
        // the recorded intent snaps back off
        await engine.setMasterEnabled(false);
        onBlocked?.(result.reason);
      }
      // network/superseded keep the switch ON — the intent is
      // stored and a later register re-asserts it
    } catch {
      // A rejecting engine leaves the last honest snapshot
    }
  };

  return (
    <View testID="notifyuikit-settings">

      <Row
        label={labels.master}
        hint={labels.masterHint}
        value={prefs.masterEnabled}
        onToggle={(on) => void toggleMaster(on)}
        colors={colors}
        testID="notifyuikit-master"
      />

      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />

      {CHANNEL_ORDER.map((key) => (
        <Row
          key={key}
          label={labels.channels[key]}
          value={prefs.channels[key]}
          disabled={!prefs.masterEnabled}
          onToggle={(on) => engine.setChannelEnabled(key, on)}
          colors={colors}
          testID={`notifyuikit-channel-${key}`}
        />
      ))}

      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />

      <Row
        label={labels.chatPreview}
        hint={labels.chatPreviewHint}
        value={prefs.chatPreview}
        disabled={!prefs.masterEnabled}
        onToggle={(on) => void engine.setChatPreview(on).catch(() => undefined)}
        colors={colors}
        testID="notifyuikit-chat-preview"
      />

    </View>
  );
}
