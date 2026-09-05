// -----------------------------------------------------------
//  [*] @knf/notifyuikit — public surface
//
//  Presentational companions to a notification engine: the
//  permission gate and the settings panel, plus the store
//  hook and the structural mirrors hosts type against. The
//  engine arrives as a prop and every label as a string —
//  no i18n, no navigation, no native modules in here.
//
//  Used by:
//    - the mobile app's settings and gating surfaces
// -----------------------------------------------------------

export { default as PermissionGate } from './PermissionGate';
export type { PermissionGateLabels } from './PermissionGate';
export { default as NotifySettingsPanel } from './NotifySettingsPanel';
export type { NotifyChannelHints, NotifySettingsIcons, NotifySettingsLabels } from './NotifySettingsPanel';
export { useStoreValue } from './hooks/useStoreValue';
export { defaultColors } from './core/types';
export type {
  NotifyChannelKey,
  NotifyColors,
  NotifyEngineLike,
  PermissionLike,
  PrefsLike,
  RegisterResultLike,
  StoreLike,
} from './core/types';
