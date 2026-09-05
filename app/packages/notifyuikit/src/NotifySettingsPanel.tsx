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
//  (which shows its own prompt); a network failure, or a host
//  gate turning a guest away (unauthenticated), keeps the
//  switch ON — intent is recorded, a later register claims it.
//  Channel rows disable while the master is off.
//
//  Two truths only the host knows arrive as props. The channel
//  and chat-preview rows are SERVER state: showChannels=false
//  drops them for a host with no account to read them from
//  (the master stays — it is a device-local intent), and
//  channelsLocked dims + disables them until the host's first
//  successful server read, so a flip never overwrites an
//  unread snapshot. channelHints and icons are decoration.
//  Every string arrives through labels / channelHints.
//
//  Split into (root component last):
//
//    Row                 — one labeled switch row
//    Hairline            — the break between the row groups
//    NotifySettingsPanel — the panel (default export)
//
//  Used by:
//    - hosts' settings screens
// -----------------------------------------------------------

import { type ReactNode } from 'react';
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

// A hint line under a channel label — the master and chat-preview
// hints live in labels already
export type NotifyChannelHints = Partial<Record<NotifyChannelKey, string>>;

// One leading glyph per row, addressed by the row it decorates
export type NotifySettingsIcons = Partial<Record<'master' | 'chatPreview' | NotifyChannelKey, ReactNode>>;







// -----------------------------------------------------------
// Row
// -----------------------------------------------------------
//
// One labeled switch row — the whole panel is these stacked.
// The glyph sits in a FIXED 24-wide box so the label column
// lines up across rows whether or not this row has one; the
// panel reserves the box on every row or on none, so an
// icon-less host renders no gutter anywhere.
//
// Used by:
//   - NotifySettingsPanel (below) — master, channels, chat preview
// -----------------------------------------------------------

function Row({
  label,
  hint,
  icon,
  iconGutter,
  value,
  disabled,
  onToggle,
  colors,
  testID,
}: {
  label: string;
  hint?: string;
  icon?: ReactNode;
  iconGutter?: boolean;
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
      {iconGutter ? (
        // Decorative: the switch's accessibilityLabel already
        // speaks the row, so a screen reader skips the glyph
        <View
          style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {icon}
        </View>
      ) : null}
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







// -----------------------------------------------------------
// Hairline
// -----------------------------------------------------------
//
// The break between the master, the channels and the chat
// preview — 1px of the line colour, so the three groups read
// as groups without a heading.
//
// Used by:
//   - NotifySettingsPanel (below)
// -----------------------------------------------------------

function Hairline({ colors }: { colors: NotifyColors }) {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />;
}







// -----------------------------------------------------------
// NotifySettingsPanel (default export)
// -----------------------------------------------------------
//
// Used by:
//   - hosts' settings screens, through the root export
// -----------------------------------------------------------

export default function NotifySettingsPanel({
  engine,
  labels,
  onBlocked,
  colors = defaultColors,
  showChannels = true,
  channelsLocked = false,
  channelHints,
  icons,
}: {
  engine: NotifyEngineLike;
  labels: NotifySettingsLabels;
  // Master-ON failed for a reason only the host can act on
  // (prompt for permission, explain the runtime)
  onBlocked?: (reason: 'permission' | 'unsupported') => void;
  colors?: NotifyColors;
  // false drops the channel + chat-preview rows (server truth a
  // signed-out host cannot read); the master row stays
  showChannels?: boolean;
  // true dims + disables those rows even with the master ON —
  // the host has not read server truth yet
  channelsLocked?: boolean;
  channelHints?: NotifyChannelHints;
  icons?: NotifySettingsIcons;
}) {

  const prefs = useStoreValue(engine.prefs);

  // Any glyph reserves the gutter on EVERY row — a mixed panel
  // would otherwise stagger its labels
  const iconGutter = Object.values(icons ?? {}).some(Boolean);
  const serverRowsDisabled = !prefs.masterEnabled || channelsLocked;


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
      // network/superseded/unauthenticated keep the switch ON —
      // the intent is stored and a later register (a retry, a
      // login) claims it
    } catch {
      // A rejecting engine leaves the last honest snapshot
    }
  };


  return (
    <View testID="notifyuikit-settings">

      <Row
        label={labels.master}
        hint={labels.masterHint}
        icon={icons?.master}
        iconGutter={iconGutter}
        value={prefs.masterEnabled}
        onToggle={(on) => void toggleMaster(on)}
        colors={colors}
        testID="notifyuikit-master"
      />

      {/* Server-truth rows — gone entirely, hairlines included,
          when the host has no account to read them from */}
      {showChannels ? (
        <>
          <Hairline colors={colors} />

          {CHANNEL_ORDER.map((key) => (
            <Row
              key={key}
              label={labels.channels[key]}
              hint={channelHints?.[key]}
              icon={icons?.[key]}
              iconGutter={iconGutter}
              value={prefs.channels[key]}
              disabled={serverRowsDisabled}
              onToggle={(on) => engine.setChannelEnabled(key, on)}
              colors={colors}
              testID={`notifyuikit-channel-${key}`}
            />
          ))}

          <Hairline colors={colors} />

          <Row
            label={labels.chatPreview}
            hint={labels.chatPreviewHint}
            icon={icons?.chatPreview}
            iconGutter={iconGutter}
            value={prefs.chatPreview}
            disabled={serverRowsDisabled}
            onToggle={(on) => void engine.setChatPreview(on).catch(() => undefined)}
            colors={colors}
            testID="notifyuikit-chat-preview"
          />
        </>
      ) : null}

    </View>
  );
}
