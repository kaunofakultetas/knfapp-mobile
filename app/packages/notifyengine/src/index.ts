// -----------------------------------------------------------
//  [*] @knf/notifyengine — public surface
//
//  Headless push-notification logic: a permission machine, a
//  token-to-backend lifecycle, a declarative channel registry,
//  tap-to-route intents, per-feature preferences and a data-
//  driven foreground policy — composed by createNotifyEngine
//  over three injectable seams. The device and backend
//  adapters live behind the same door; the testing doubles
//  ship from '@knf/notifyengine/testing'.
//
//  Used by:
//    - the mobile app's notification wiring
//    - @knf/notifyuikit hosts (structurally, never imported)
// -----------------------------------------------------------

export { createNotifyEngine } from './core/engine';
export type { NotifyEngine, NotifyEngineConfig } from './core/engine';

export { createStore } from './core/store';
export type { MutableStore } from './core/store';
export { validateChannelSpecs } from './core/channels';
export { normalizeData } from './core/routing';
export { createForegroundHandler } from './core/presentation';
export { CHANNEL_KEYS } from './core/prefs';

export { createExpoDevice } from './adapters/expo';
export { createKnfNotifyTransport } from './adapters/knf';
export type { NotifyHttpClient } from './adapters/knf';

export { ChannelImportance, TransportFailure } from './core/types';
export type {
  ChannelKey,
  ChannelSpec,
  DeviceAdapter,
  DeviceChannel,
  DeviceNotificationResponse,
  DevicePermission,
  KeyValueStorage,
  Language,
  NotifyTransport,
  PermissionSnapshot,
  PrefsSnapshot,
  PresentationPolicy,
  PresentationRule,
  RegisterFailure,
  RegisterReason,
  RegisterResult,
  RegistrationSnapshot,
  RouteIntent,
  RouteResolver,
  StateStore,
  TransportErrorCode,
  Unsubscribe,
} from './core/types';
