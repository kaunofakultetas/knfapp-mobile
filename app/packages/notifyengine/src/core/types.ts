// -----------------------------------------------------------
//  [*] notifyengine — types
//
//  The whole domain in one place: what a permission looks like
//  once normalized across platforms, what the token lifecycle
//  reports, what a tapped notification becomes, and the three
//  seams (transport, device, storage) everything is built
//  against. Every read surface is a snapshot or a store —
//  never a stale sync cache — and every result that can fail
//  fails as a TYPED value, not a thrown "wrong platform".
//
//  Used by:
//    - every core module, both adapters, the testing doubles
//    - hosts typing their config and subscriptions
// -----------------------------------------------------------

export type Language = 'lt' | 'en';

// The closed set of per-feature channels the backend validates
// — mirrors the server's list; unknown keys are rejected at
// the API boundary before any write
export type ChannelKey = 'news' | 'chat' | 'schedule' | 'admin';

// Why a registration is happening — rides into telemetry and
// decides nothing by itself
export type RegisterReason = 'login' | 'restore' | 'toggle' | 'language' | 'rotation' | 'ttl';

export type RegisterFailure = {
  ok: false;
  // 'unsupported'     — this runtime cannot do remote push at all
  // 'unauthenticated' — the host's canRegister gate said no: a
  //                     guest has nothing to claim the token
  //                     with, so the wire is never touched
  // 'superseded'      — a newer register() call took over
  reason: 'unsupported' | 'unauthenticated' | 'permission' | 'network' | 'disabled' | 'superseded';
};
// tokenId is the backend's identifier for the row — an opaque
// STRING (the server mints UUIDs); 'cached' marks a dedupe hit
// that never went to the wire
export type RegisterResult = { ok: true; tokenId: string } | RegisterFailure;


// One normalized cross-platform permission record — complete
// on every platform, so consumers never null-check per OS
export interface PermissionSnapshot {
  status: 'unknown' | 'undetermined' | 'granted' | 'provisional' | 'denied' | 'unsupported';
  // false ⇒ the OS will not prompt again; UI must deep-link to
  // system settings instead of calling requestPermission()
  canAskAgain: boolean;
  // granted || provisional — the one flag delivery gates on
  canDeliver: boolean;
}

export interface RegistrationSnapshot {
  phase: 'idle' | 'acquiring' | 'syncing' | 'registered' | 'detached' | 'failed';
  token: string | null;
  lastError: RegisterFailure | null;
  registeredAt: number | null;
}

export interface PrefsSnapshot {
  // Client-only master switch — lives in storage, default ON
  masterEnabled: boolean;
  // Server truth, opt-out model: true = deliver
  channels: Record<ChannelKey, boolean>;
  chatPreview: boolean;
  syncState: 'fresh' | 'stale' | 'flushing' | 'error';
}


// A tapped notification, normalized: everything routes on
// `type`; `data` is a sanitized string→string map whatever the
// wire carried; the engine never navigates — a resolver does
export interface RouteIntent {
  type: string;
  data: Record<string, string>;
  coldStart: boolean;
  // null = the default tap; anything else is a custom action
  // the resolver may treat differently
  actionId: string | null;
}
export type RouteResolver = (intent: RouteIntent) => void;


export type Unsubscribe = () => void;

// The one read/subscribe surface every machine exposes:
// subscribe fires immediately with the current value and is
// edge-deduped — equal snapshots never re-notify
export interface StateStore<T> {
  get(): T;
  subscribe(listener: (value: T) => void): Unsubscribe;
}


// -----------------------------------------------------------
// Channel registry
// -----------------------------------------------------------

// Android freezes a channel's importance/sound/vibration at
// creation — changing settings means bumping the id version
// ('default.v1' → 'default.v2'), so ids are versioned and the
// charset stays URL/store-safe: [a-z0-9.] only
// The native importance scale, mirrored so hosts never hunt
// for magic numbers (3 is MIN there — a silent channel)
export const ChannelImportance = { MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 } as const;

export interface ChannelSpec {
  id: string;
  // Which localized name the host supplies at apply time
  nameKey: ChannelKey | 'default';
  importance: number;
  vibration?: boolean;
  // Off/on millisecond pairs ([0, 250, 250, 250] — a double
  // buzz); frozen at creation like everything else here
  vibrationPattern?: number[];
  lightColor?: string;
  sound?: boolean;
}


// -----------------------------------------------------------
// Foreground presentation policy
// -----------------------------------------------------------

export interface PresentationRule {
  banner: boolean;
  list: boolean;
  sound: boolean;
  badge: boolean;
}

export interface PresentationPolicy {
  // Keyed by data.type; anything unknown falls to `default`
  rules: Record<string, PresentationRule>;
  default: PresentationRule;
  // e.g. "this chat room is on screen" — a THROWING predicate
  // falls back to the rule; it must never hide a notification
  // by crashing
  suppress?: (intentType: string, data: Record<string, string>) => boolean;
}


// -----------------------------------------------------------
// Seams
// -----------------------------------------------------------

// The backend contract — one adapter per backend, plus the
// in-memory fake. Errors surface as typed codes through
// TransportFailure, never raw exceptions.
export interface NotifyTransport {
  register(p: {
    token: string;
    platform: 'ios' | 'android' | 'web' | 'unknown';
    language: Language;
  }): Promise<{ tokenId: string; created: boolean }>;
  // 404 resolves — an already-forgotten token is success
  unregister(p: { token: string; authToken?: string }): Promise<void>;
  getChannels(): Promise<Record<ChannelKey, boolean>>;
  putChannels(patch: Partial<Record<ChannelKey, boolean>>): Promise<Record<ChannelKey, boolean>>;
  getChatPreview(): Promise<boolean>;
  putChatPreview(on: boolean): Promise<boolean>;
}

export type TransportErrorCode = 'network' | 'auth' | 'server';

export class TransportFailure extends Error {
  code: TransportErrorCode;
  constructor(code: TransportErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'TransportFailure';
    this.code = code;
  }
}


// What the device below the engine looks like — a flat
// injectable mirror of the native primitive, entirely fakeable
export interface DevicePermission {
  status: 'undetermined' | 'granted' | 'provisional' | 'denied';
  canAskAgain: boolean;
}

export interface DeviceChannel {
  id: string;
  name: string;
  importance: number;
}

export interface DeviceNotificationResponse {
  identifier: string;
  actionIdentifier: string | null;
  data: unknown;
}

export interface DeviceAdapter {
  // Environment
  platform: 'ios' | 'android' | 'web' | 'unknown';
  // false ⇒ this runtime cannot do remote push (the dev-shell
  // Android case, web without a service worker)
  supportsRemotePush(): boolean;

  // Permissions — getPermissions is side-effect free
  getPermissions(): Promise<DevicePermission>;
  requestPermissions(): Promise<DevicePermission>;

  // Token
  getPushToken(): Promise<string>;
  onPushToken(listener: (token: string) => void): Unsubscribe;

  // Channels (Android; others resolve empty / no-op)
  getChannels(): Promise<DeviceChannel[]>;
  setChannel(spec: ChannelSpec & { name: string }): Promise<void>;
  deleteChannel(id: string): Promise<void>;

  // Taps
  onResponse(listener: (response: DeviceNotificationResponse) => void): Unsubscribe;
  getLastResponse(): Promise<DeviceNotificationResponse | null>;
  clearLastResponse(): void;

  // Foreground handler — `data` extraction already normalized
  // by the adapter; the callback returns the rule to apply
  setForegroundHandler(
    handler: (payload: { type: string; data: Record<string, string> }) => Promise<PresentationRule>,
  ): void;
  onHandleError(listener: (error: unknown) => void): Unsubscribe;

  // AppState — 'active' re-polls permissions
  onAppActive(listener: () => void): Unsubscribe;
}


export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}
