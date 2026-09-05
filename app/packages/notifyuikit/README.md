# notifyuikit

Thin presentational companions to a notification engine: a
permission gate and a settings panel. The engine is handed in as a
prop (typed structurally — nothing here imports the engine package),
every label is handed in as a string, and the kit owns no i18n, no
navigation and no native modules.

```tsx
import { NotifySettingsPanel, PermissionGate } from '@knf/notifyuikit';

<PermissionGate
  engine={engine}
  labels={gateLabels}                 // your i18n, your words
  onOpenSettings={() => Linking.openSettings()}
>
  <NotifySettingsPanel
    engine={engine}
    labels={panelLabels}
    onBlocked={(reason) => showPermissionSheet(reason)}
    colors={myTokens}                 // optional; neutral defaults
    showChannels={signedIn}           // optional; server-truth rows only with an account
    channelsLocked={!serverRead}      // optional; dim + disable until the first server read
    channelHints={{ news: t('…') }}   // optional; a line under a channel label
    icons={{ master: <Bell /> }}      // optional; a glyph per row, 24-wide gutter
  />
</PermissionGate>
```

**PermissionGate** renders by permission state: deliverable shows the
children; askable shows a prompt card whose button calls the
engine's `requestPermission()`; denied-for-good shows a card that
hands off to YOUR open-settings callback; an unsupported runtime
gets a plain honest note; the brief `unknown` moment renders nothing.

**NotifySettingsPanel** is the settings surface: master switch,
one row per feature channel (disabled while the master is off), the
chat-preview privacy flag. Its one piece of judgment: when turning
the master ON comes back impossible — permission denied or an
unsupported runtime — the switch snaps back OFF and your `onBlocked`
callback gets the reason; a mere network failure — or an engine that
answers `unauthenticated` because its host gate turned a guest away —
keeps the switch ON because the intent is recorded and a later
register claims it.

## NotifySettingsPanel props

| Prop | Default | What it does |
| --- | --- | --- |
| `engine` | — | `NotifyEngineLike` — the panel reads `prefs` and calls `setMasterEnabled` / `setChannelEnabled` / `setChatPreview`; the type also carries `permission` + `requestPermission()`, shared with `PermissionGate`, so one engine object serves both components |
| `labels` | — | `NotifySettingsLabels` — master, its hint, the four channel labels, chat preview and its hint |
| `onBlocked` | — | Called with `'permission'` or `'unsupported'` after a master-ON snapped back; the host prompts |
| `colors` | `defaultColors` | `NotifyColors` — ink, inkSoft, line, brand, surface |
| `showChannels` | `true` | `false` drops the channel rows, both hairlines and the chat-preview row from the tree; the master row stays. Those rows are server state — a host with no account to read them from hides them |
| `channelsLocked` | `false` | `true` dims + disables the channel and chat-preview rows even with the master ON — until the host's first successful server read. The master never locks, and only the host lifts the lock |
| `channelHints` | — | `NotifyChannelHints`: a hint line under a channel label, keyed by channel |
| `icons` | — | `NotifySettingsIcons`: a leading glyph per row, keyed `master`, `chatPreview` or a channel key. Any glyph reserves a 24-wide gutter on every row so labels stay in one column; no glyph renders no gutter. Glyphs are hidden from screen readers — the switch's label speaks the row |

Row testIDs are stable across all of it: `notifyuikit-settings`,
`notifyuikit-master`, `notifyuikit-channel-<key>`,
`notifyuikit-chat-preview`.

`npm test` inside the package (or the host's root jest run) pins the
gate's five states, the panel's wiring and the snap-back contract,
the four host props against the rendered tree, and the export
surface.
