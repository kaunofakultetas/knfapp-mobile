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







// -----------------------------------------------------------
// Language
// -----------------------------------------------------------
//
// The two languages the backend localizes pushes into.
//
// Used by:
//   - core/registration.ts / core/engine.ts — rides into
//     register()
//   - adapters/knf/index.ts — the register payload
//   - services/notifyEngine.ts — the host's current language
// -----------------------------------------------------------

export type Language = 'lt' | 'en';







// -----------------------------------------------------------
// ChannelKey
// -----------------------------------------------------------
//
// The closed set of per-feature channels the backend validates
// — mirrors the server's list; unknown keys are rejected at
// the API boundary before any write.
//
// Used by:
//   - core/prefs.ts / core/engine.ts — the channel toggles
//   - adapters/knf/index.ts — the channels endpoints
// -----------------------------------------------------------

export type ChannelKey = 'news' | 'chat' | 'schedule' | 'admin';







// -----------------------------------------------------------
// RegisterReason
// -----------------------------------------------------------
//
// Why a registration is happening — rides into telemetry and
// decides nothing by itself.
//
// Used by:
//   - core/registration.ts / core/engine.ts — register(reason)
// -----------------------------------------------------------

export type RegisterReason = 'login' | 'restore' | 'toggle' | 'language' | 'rotation' | 'ttl';







// -----------------------------------------------------------
// RegisterFailure
// -----------------------------------------------------------
//
// The typed no of a registration attempt.
//
// Used by:
//   - RegisterResult (below) — the failure arm
//   - core/registration.ts — lastError in the snapshot
// -----------------------------------------------------------

export type RegisterFailure = {
  ok: false;
  // 'unsupported'     — this runtime cannot do remote push at all
  // 'unauthenticated' — the host's canRegister gate said no: a
  //                     guest has nothing to claim the token
  //                     with, so the wire is never touched
  // 'superseded'      — a newer register() call took over
  reason: 'unsupported' | 'unauthenticated' | 'permission' | 'network' | 'disabled' | 'superseded';
};







// -----------------------------------------------------------
// RegisterResult
// -----------------------------------------------------------
//
// tokenId is the backend's identifier for the row — an opaque
// STRING (the server mints UUIDs); 'cached' marks a dedupe hit
// that never went to the wire.
//
// Used by:
//   - core/registration.ts / core/engine.ts — register()'s
//     resolution
//   - testing/index.ts — asserted in the contract tests
// -----------------------------------------------------------

export type RegisterResult = { ok: true; tokenId: string } | RegisterFailure;







// -----------------------------------------------------------
// PermissionSnapshot
// -----------------------------------------------------------
//
// One normalized cross-platform permission record — complete
// on every platform, so consumers never null-check per OS.
//
// Used by:
//   - core/permission.ts — the machine's store value
//   - core/engine.ts — engine.permission
//   - testing/index.ts — fixtures
// -----------------------------------------------------------

export interface PermissionSnapshot {
  status: 'unknown' | 'undetermined' | 'granted' | 'provisional' | 'denied' | 'unsupported';
  // false ⇒ the OS will not prompt again; UI must deep-link to
  // system settings instead of calling requestPermission()
  canAskAgain: boolean;
  // granted || provisional — the one flag delivery gates on
  canDeliver: boolean;
}







// -----------------------------------------------------------
// RegistrationSnapshot
// -----------------------------------------------------------
//
// Where the token lifecycle stands right now.
//
// Used by:
//   - core/registration.ts — the machine's store value
//   - core/engine.ts — engine.registration
// -----------------------------------------------------------

export interface RegistrationSnapshot {
  phase: 'idle' | 'acquiring' | 'syncing' | 'registered' | 'detached' | 'failed';
  token: string | null;
  lastError: RegisterFailure | null;
  registeredAt: number | null;
}







// -----------------------------------------------------------
// PrefsSnapshot
// -----------------------------------------------------------
//
// The preference state one read returns — the client master
// switch plus the server-truth toggles.
//
// Used by:
//   - core/prefs.ts — the machine's store value
//   - core/engine.ts — engine.prefs
// -----------------------------------------------------------

export interface PrefsSnapshot {
  // Client-only master switch — lives in storage, default ON
  masterEnabled: boolean;
  // Server truth, opt-out model: true = deliver
  channels: Record<ChannelKey, boolean>;
  chatPreview: boolean;
  syncState: 'fresh' | 'stale' | 'flushing' | 'error';
}







// -----------------------------------------------------------
// RouteIntent
// -----------------------------------------------------------
//
// A tapped notification, normalized: everything routes on
// `type`; `data` is a sanitized string→string map whatever the
// wire carried; the engine never navigates — a resolver does.
//
// Used by:
//   - core/routing.ts — built from device responses
//   - services/notifyRouting.ts / app/index.tsx — the host's
//     resolver navigates on it
// -----------------------------------------------------------

export interface RouteIntent {
  type: string;
  data: Record<string, string>;
  coldStart: boolean;
  // null = the default tap; anything else is a custom action
  // the resolver may treat differently
  actionId: string | null;
}







// -----------------------------------------------------------
// RouteResolver
// -----------------------------------------------------------
//
// The host's navigation hand — the only thing that ever acts
// on a RouteIntent.
//
// Used by:
//   - core/routing.ts — setResolver / the pending replay
//   - core/engine.ts — re-exposed as engine.setResolver
// -----------------------------------------------------------

export type RouteResolver = (intent: RouteIntent) => void;







// -----------------------------------------------------------
// Unsubscribe
// -----------------------------------------------------------
//
// Every subscription here returns its own undo.
//
// Used by:
//   - StateStore (below), core/routing.ts, core/engine.ts,
//     adapters/expo/index.ts — all listener registrations
// -----------------------------------------------------------

export type Unsubscribe = () => void;







// -----------------------------------------------------------
// StateStore
// -----------------------------------------------------------
//
// The one read/subscribe surface every machine exposes:
// subscribe fires immediately with the current value and is
// edge-deduped — equal snapshots never re-notify.
//
// Used by:
//   - core/store.ts — MutableStore implements it
//   - core/engine.ts — permission/registration/prefs surfaces
// -----------------------------------------------------------

export interface StateStore<T> {
  get(): T;
  subscribe(listener: (value: T) => void): Unsubscribe;
}







// -----------------------------------------------------------
// ChannelImportance
// -----------------------------------------------------------
//
// The native importance scale, mirrored so hosts never hunt
// for magic numbers (3 is MIN there — a silent channel).
//
// Used by:
//   - the host's channel specs (services/notifyEngine.ts)
// -----------------------------------------------------------

export const ChannelImportance = { MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 } as const;







// -----------------------------------------------------------
// ChannelSpec
// -----------------------------------------------------------
//
// One Android channel as the host declares it. Android
// freezes a channel's importance/sound/vibration at creation
// — changing settings means bumping the id version
// ('default.v1' → 'default.v2'), so ids are versioned and the
// charset stays URL/store-safe: [a-z0-9.] only.
//
// Used by:
//   - core/channels.ts — the applier diffs specs vs device
//   - adapters/expo/index.ts — setChannel's input
//   - services/notifyEngine.ts — the host's channel list
// -----------------------------------------------------------

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
// PresentationRule
// -----------------------------------------------------------
//
// How one foreground notification is allowed to show itself.
//
// Used by:
//   - PresentationPolicy (below) — the per-type rules
//   - core/presentation.ts — resolved per notification
//   - adapters/expo/index.ts — mapped onto the native handler
// -----------------------------------------------------------

export interface PresentationRule {
  banner: boolean;
  list: boolean;
  sound: boolean;
  badge: boolean;
}







// -----------------------------------------------------------
// PresentationPolicy
// -----------------------------------------------------------
//
// The host's whole foreground policy — per-type rules, the
// fallback, and the on-screen suppressor.
//
// Used by:
//   - core/presentation.ts — resolvePresentation walks it
//   - core/engine.ts — part of the engine config
//   - services/notifyEngine.ts — the host's policy
// -----------------------------------------------------------

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
// NotifyTransport
// -----------------------------------------------------------
//
// The backend contract — one adapter per backend, plus the
// in-memory fake. Errors surface as typed codes through
// TransportFailure, never raw exceptions.
//
// Used by:
//   - core/registration.ts / core/prefs.ts — the wire calls
//   - adapters/knf/index.ts — the real implementation
//   - testing/index.ts — FakeTransport
//   - services/notifyTransport.ts — the host's wiring
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// TransportErrorCode
// -----------------------------------------------------------
//
// The three ways a transport call fails — what machines triage
// on.
//
// Used by:
//   - TransportFailure (below) — its `code`
//   - index.ts — re-exported for hosts typing error handling
// -----------------------------------------------------------

export type TransportErrorCode = 'network' | 'auth' | 'server';







// -----------------------------------------------------------
// TransportFailure
// -----------------------------------------------------------
//
// The typed failure every transport rejects with — machines
// triage on `code` ('network' retries, 'auth' waits for a
// session, 'server' surfaces), never on message strings.
//
// Used by:
//   - adapters/knf/index.ts — maps HTTP failures into it
//   - testing/index.ts — the fake's scripted failures
// -----------------------------------------------------------

export class TransportFailure extends Error {
  code: TransportErrorCode;
  constructor(code: TransportErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'TransportFailure';
    this.code = code;
  }
}







// -----------------------------------------------------------
// DevicePermission
// -----------------------------------------------------------
//
// The raw permission pair the device below the engine reports
// — a flat injectable mirror of the native primitive, entirely
// fakeable.
//
// Used by:
//   - DeviceAdapter (below) — get/requestPermissions
//   - adapters/expo/index.ts — normalized from expo's record
//   - testing/index.ts — FakeDevice's scripted permissions
// -----------------------------------------------------------

export interface DevicePermission {
  status: 'undetermined' | 'granted' | 'provisional' | 'denied';
  canAskAgain: boolean;
}







// -----------------------------------------------------------
// DeviceChannel
// -----------------------------------------------------------
//
// One Android channel as the device reports it back.
//
// Used by:
//   - DeviceAdapter (below) — getChannels
//   - testing/index.ts — FakeDevice's channel table
// -----------------------------------------------------------

export interface DeviceChannel {
  id: string;
  name: string;
  importance: number;
}







// -----------------------------------------------------------
// DeviceNotificationResponse
// -----------------------------------------------------------
//
// A raw tap as the device delivers it, before routing
// normalizes it into a RouteIntent.
//
// Used by:
//   - DeviceAdapter (below) — onResponse / getLastResponse
//   - core/routing.ts — the intake side
//   - testing/index.ts — FakeDevice.tap()
// -----------------------------------------------------------

export interface DeviceNotificationResponse {
  identifier: string;
  actionIdentifier: string | null;
  data: unknown;
}







// -----------------------------------------------------------
// DeviceAdapter
// -----------------------------------------------------------
//
// What the device below the engine looks like — a flat
// injectable mirror of the native primitive, entirely
// fakeable.
//
// Used by:
//   - core/permission.ts / core/registration.ts /
//     core/channels.ts / core/engine.ts — everything native
//   - adapters/expo/index.ts — the real implementation
//   - testing/index.ts — FakeDevice
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// KeyValueStorage
// -----------------------------------------------------------
//
// The three-verb persistence seam the machines write through.
//
// Used by:
//   - core/registration.ts / core/prefs.ts / core/routing.ts /
//     core/channels.ts / core/engine.ts — persisted state
//   - testing/index.ts — FakeStorage
// -----------------------------------------------------------

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}
