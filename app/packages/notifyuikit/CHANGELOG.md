# Changelog

## 1.1.1 — 2026-09-05

The engine's host gate reaches the mirror:

- `RegisterResultLike.reason` gains `'unauthenticated'` — the
  engine's answer when its host gate turns a guest away. The
  panel treats it exactly like a network failure: the switch
  stays ON, `onBlocked` stays silent, and the intent waits for
  a login to claim it. The settings-panel suite pins the case
  — one `setMasterEnabled(true)`, no retraction.
- The README's `engine` row states the whole `NotifyEngineLike`
  shape: the panel reads `prefs` and calls the three setters,
  while `permission` + `requestPermission()` on the same type
  serve `PermissionGate` — an object built to the row's
  description now type-checks against the prop.
- NotifySettingsPanel's helpers carry their own section
  banners and the file header its split table — comments only,
  the rendered tree is untouched.

## 1.1.0 — 2026-09-05

The settings panel learns the host's side of the truth — four optional
props, and the default rendering is the 1.0 tree to the pixel:

- `showChannels={false}` drops the channel rows, both hairlines and
  the chat-preview row from the tree and keeps the master switch.
  Those rows are SERVER state; a host with no account to read them
  from has nothing honest to show, while the master is a device-local
  intent that stands on its own.
- `channelsLocked` dims + disables the channel and chat-preview rows
  even with the master ON — the window before the host's first
  successful server read, when a flip would overwrite an unread
  snapshot. The master never locks, and a prefs emission does not
  lift the lock: it is the host's to release.
- `channelHints` — a hint line under a channel label, in the same
  typography as the master and chat-preview hints.
- `icons` — a leading glyph per row (`master`, `chatPreview`, the four
  channel keys) in a fixed 24-wide box. Any glyph reserves the box on
  EVERY row so the label column stays aligned; no glyph at all renders
  no box. Glyphs are hidden from screen readers — the switch's label
  already speaks the row.
- New type exports: `NotifySettingsIcons`, `NotifyChannelHints`; the
  surface test pins them at the type level.

## 1.0.1 — 2026-09-02

The review round's kit share:

- The settings panel never lets an engine rejection escape a
  toggle handler — a rejecting promise leaves the last honest
  snapshot instead of an unhandled rejection.
- `useStoreValue` re-reads the store after subscribing, so a
  structurally valid store that only fires on change still
  starts (and swaps) current; the mirror documents the
  immediate-fire contract.

## 1.0.0 — 2026-09-02

Presentational companions to a notification engine — the engine
arrives as a prop, every label as a string.

- **PermissionGate** — renders children when deliverable, a
  prompt card when asking is possible, a settings hand-off card
  when the OS will no longer ask, and an honest note on
  runtimes without remote push.
- **NotifySettingsPanel** — master switch, one row per feature
  channel, the chat-preview privacy flag; a master-ON that the
  engine reports impossible (permission, unsupported) snaps
  back OFF and hands the reason to the host, while a mere
  network failure keeps the recorded intent.
- **useStoreValue** — one engine store into one React state,
  resubscribing when the host swaps stores.
- Structural mirrors of the engine's shapes — typed against,
  never imported.
