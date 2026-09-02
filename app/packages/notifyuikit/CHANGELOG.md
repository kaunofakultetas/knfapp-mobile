# Changelog

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
