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
callback gets the reason; a mere network failure keeps the switch ON
because the intent is recorded and re-asserted later.

`npm test` inside the package (or the host's root jest run) pins the
gate's five states, the panel's wiring and the snap-back contract,
and the export surface.
