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

export type NotifyChannelKey = 'news' | 'chat' | 'schedule' | 'admin';

export interface StoreLike<T> {
  get(): T;
  // Engine stores invoke the listener immediately with the
  // current value; useStoreValue also re-reads get() after
  // subscribing, so a change-only store still starts current
  subscribe(listener: (value: T) => void): () => void;
}

export interface PermissionLike {
  status: 'unknown' | 'undetermined' | 'granted' | 'provisional' | 'denied' | 'unsupported';
  canAskAgain: boolean;
  canDeliver: boolean;
}

export interface PrefsLike {
  masterEnabled: boolean;
  channels: Record<NotifyChannelKey, boolean>;
  chatPreview: boolean;
  syncState: 'fresh' | 'stale' | 'flushing' | 'error';
}

export interface RegisterResultLike {
  ok: boolean;
  reason?: 'unsupported' | 'permission' | 'network' | 'disabled' | 'superseded';
}

// The slice of the engine the components actually touch
export interface NotifyEngineLike {
  permission: StoreLike<PermissionLike>;
  prefs: StoreLike<PrefsLike>;
  requestPermission(): Promise<PermissionLike>;
  setMasterEnabled(on: boolean): Promise<RegisterResultLike | void>;
  setChannelEnabled(key: NotifyChannelKey, on: boolean): void;
  setChatPreview(on: boolean): Promise<void>;
}


// Neutral by default; a host maps its own tokens on
export interface NotifyColors {
  ink: string;
  inkSoft: string;
  line: string;
  brand: string;
  surface: string;
}

export const defaultColors: NotifyColors = {
  ink: '#111827',
  inkSoft: '#4B5563',
  line: '#E5E7EB',
  brand: '#2F6FED',
  surface: '#FFFFFF',
};
