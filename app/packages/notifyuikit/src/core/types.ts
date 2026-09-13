// -----------------------------------------------------------
//  [*] notifyuikit — structural mirrors
//
//  The engine's shapes, MIRRORED rather than imported — the
//  same seam discipline as the other kit/engine pairs, so
//  either package upgrades alone. Anything satisfying these
//  shapes drives the components; the real engine does, and so
//  does a ten-line stub in a test.
//
//  Used by:
//    - PermissionGate.tsx / NotifySettingsPanel.tsx
//    - hosts typing their props
// -----------------------------------------------------------







// -----------------------------------------------------------
// NotifyChannelKey
// -----------------------------------------------------------
//
// The four notification channels, mirroring the engine's
// ChannelKey.
//
// Used by:
//   - PrefsLike / NotifyEngineLike (below)
//   - NotifySettingsPanel.tsx — row order, labels, hints, icons
// -----------------------------------------------------------

export type NotifyChannelKey = 'news' | 'chat' | 'schedule' | 'admin';







// -----------------------------------------------------------
// StoreLike
// -----------------------------------------------------------
//
// The read-and-subscribe surface of one engine store.
//
// Used by:
//   - NotifyEngineLike (below) — permission and prefs stores
//   - hooks/useStoreValue.ts — subscribes one as React state
// -----------------------------------------------------------

export interface StoreLike<T> {
  get(): T;
  // Engine stores invoke the listener immediately with the
  // current value; useStoreValue also re-reads get() after
  // subscribing, so a change-only store still starts current
  subscribe(listener: (value: T) => void): () => void;
}







// -----------------------------------------------------------
// PermissionLike
// -----------------------------------------------------------
//
// The OS permission snapshot the components read.
//
// Used by:
//   - NotifyEngineLike (below) — the permission store's value
//   - PermissionGate.tsx — via engine.permission
// -----------------------------------------------------------

export interface PermissionLike {
  status: 'unknown' | 'undetermined' | 'granted' | 'provisional' | 'denied' | 'unsupported';
  canAskAgain: boolean;
  canDeliver: boolean;
}







// -----------------------------------------------------------
// PrefsLike
// -----------------------------------------------------------
//
// The preference snapshot the settings panel renders.
//
// Used by:
//   - NotifyEngineLike (below) — the prefs store's value
//   - NotifySettingsPanel.tsx — via engine.prefs
// -----------------------------------------------------------

export interface PrefsLike {
  masterEnabled: boolean;
  channels: Record<NotifyChannelKey, boolean>;
  chatPreview: boolean;
  syncState: 'fresh' | 'stale' | 'flushing' | 'error';
}







// -----------------------------------------------------------
// RegisterResultLike
// -----------------------------------------------------------
//
// What setMasterEnabled resolves to when it reports back.
//
// Used by:
//   - NotifyEngineLike (below) — setMasterEnabled's result
//   - NotifySettingsPanel.tsx — snaps the switch back and
//     calls onBlocked on 'permission' / 'unsupported'
// -----------------------------------------------------------

export interface RegisterResultLike {
  ok: boolean;
  // 'unauthenticated' — the host's gate turned a guest away;
  // the intent is recorded and a later login claims it, so
  // the panel reads it like 'network': the switch stays ON
  reason?: 'unsupported' | 'permission' | 'network' | 'disabled' | 'superseded' | 'unauthenticated';
}







// -----------------------------------------------------------
// NotifyEngineLike
// -----------------------------------------------------------
//
// The slice of the engine the components actually touch.
//
// Used by:
//   - PermissionGate.tsx / NotifySettingsPanel.tsx — the
//     `engine` prop
//   - hosts stubbing an engine in tests
// -----------------------------------------------------------

export interface NotifyEngineLike {
  permission: StoreLike<PermissionLike>;
  prefs: StoreLike<PrefsLike>;
  requestPermission(): Promise<PermissionLike>;
  setMasterEnabled(on: boolean): Promise<RegisterResultLike | void>;
  setChannelEnabled(key: NotifyChannelKey, on: boolean): void;
  setChatPreview(on: boolean): Promise<void>;
}







// -----------------------------------------------------------
// NotifyColors
// -----------------------------------------------------------
//
// The color tokens both components paint with — neutral by
// default; a host maps its own tokens on.
//
// Used by:
//   - defaultColors (below) — the fallback palette
//   - PermissionGate.tsx / NotifySettingsPanel.tsx — the
//     `colors` prop
// -----------------------------------------------------------

export interface NotifyColors {
  ink: string;
  inkSoft: string;
  line: string;
  brand: string;
  surface: string;
}







// -----------------------------------------------------------
// defaultColors
// -----------------------------------------------------------
//
// The neutral palette both components fall back on when the
// host passes no `colors`.
//
// Used by:
//   - PermissionGate.tsx / NotifySettingsPanel.tsx — the
//     default prop value
// -----------------------------------------------------------

export const defaultColors: NotifyColors = {
  ink: '#111827',
  inkSoft: '#4B5563',
  line: '#E5E7EB',
  brand: '#2F6FED',
  surface: '#FFFFFF',
};
