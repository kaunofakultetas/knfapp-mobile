// -----------------------------------------------------------
//  [*] notifyengine — the engine
//
//  Composition root: the four machines wired to the three
//  seams, plus the two lifecycle guarantees everything else
//  leans on. init() is IDEMPOTENT — called twice it installs
//  ONE foreground handler and ONE set of listeners (the
//  fast-refresh double-mount is a named production hazard),
//  and it reconciles rather than trusts: seed the master
//  switch from storage, re-poll permission, re-register when
//  the stored tuple's TTL lapsed (the channel registry is
//  re-applied by the host, whose i18n owns the names).
//  dispose() removes every listener the engine installed;
//  events after dispose are dropped, never thrown into dead
//  handlers. The host's optional canRegister gate rides into
//  the token machine: a guest's register() is a pure typed
//  'unauthenticated', nothing stored, nothing on the wire.
//
//  Used by:
//    - hosts: createNotifyEngine(config) once, near the root
// -----------------------------------------------------------

import { createChannelApplier, validateChannelSpecs, type ChannelApplier } from './channels';
import { createForegroundHandler } from './presentation';
import { createPermissionMachine, type PermissionMachine } from './permission';
import { createPrefsMachine, type PrefsMachine } from './prefs';
import { createRegistrationMachine, type RegistrationMachine } from './registration';
import { createRoutingHub, type RoutingHub } from './routing';
import type {
  ChannelKey,
  ChannelSpec,
  DeviceAdapter,
  KeyValueStorage,
  Language,
  NotifyTransport,
  PermissionSnapshot,
  PrefsSnapshot,
  PresentationPolicy,
  RegisterReason,
  RegisterResult,
  RegistrationSnapshot,
  RouteIntent,
  RouteResolver,
  StateStore,
  Unsubscribe,
} from './types';


const TUPLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TUPLE_KEY = 'notify.lastRegistration';


export interface NotifyEngineConfig {
  transport: NotifyTransport;
  device: DeviceAdapter;
  storage: KeyValueStorage;
  channels: ChannelSpec[];
  presentation: PresentationPolicy;
  language: () => Language;
  // Consulted by every register() right after runtime support
  // and BEFORE the master switch: false → {ok:false,
  // reason:'unauthenticated'} with zero store writes. Absent
  // means always allowed
  canRegister?: () => boolean | Promise<boolean>;
  now?: () => number;
  onError?: (scope: string, error: unknown) => void;
}

export interface NotifyEngine {
  init(): Promise<void>;
  dispose(): void;

  readonly permission: StateStore<PermissionSnapshot>;
  requestPermission(): Promise<PermissionSnapshot>;

  readonly registration: StateStore<RegistrationSnapshot>;
  register(reason: RegisterReason): Promise<RegisterResult>;
  detach(opts?: { authToken?: string }): Promise<void>;

  readonly prefs: StateStore<PrefsSnapshot>;
  setMasterEnabled(on: boolean): Promise<RegisterResult | void>;
  setChannelEnabled(key: ChannelKey, on: boolean): void;
  // true when the wire agreed with the request, false when the
  // flag snapped back
  setChatPreview(on: boolean): Promise<boolean>;
  refreshPrefs(): Promise<void>;

  applyChannels(names: Record<string, string>): Promise<void>;

  routing: {
    setResolver(resolver: RouteResolver): void;
    consumeInitial(): Promise<RouteIntent | null>;
    onIntent(listener: (intent: RouteIntent) => void): Unsubscribe;
  };
}


export function createNotifyEngine(config: NotifyEngineConfig): NotifyEngine {
  validateChannelSpecs(config.channels);

  const now = config.now ?? (() => Date.now());
  const report = (scope: string, error: unknown) => {
    try {
      config.onError?.(scope, error);
    } catch {
      // Telemetry must never become the crash it reports
    }
  };

  const permission: PermissionMachine = createPermissionMachine(config.device);
  const prefs: PrefsMachine = createPrefsMachine({ transport: config.transport, storage: config.storage });
  const registration: RegistrationMachine = createRegistrationMachine({
    device: config.device,
    transport: config.transport,
    storage: config.storage,
    language: config.language,
    canDeliver: () => permission.store.get().canDeliver,
    canRegister: config.canRegister ?? (() => true),
    isMasterEnabled: prefs.isMasterEnabled,
    now,
  });
  const channelApplier: ChannelApplier = createChannelApplier({
    device: config.device,
    storage: config.storage,
    specs: config.channels,
  });
  const routing: RoutingHub = createRoutingHub({
    storage: config.storage,
    readLastResponse: () => config.device.getLastResponse(),
    clearLastResponse: () => config.device.clearLastResponse(),
  });

  let initPromise: Promise<void> | null = null;
  let disposed = false;
  const subscriptions: Unsubscribe[] = [];

  const initBody = async (): Promise<void> => {
    disposed = false;

    // One handler, one listener set — however often the host
    // remounts around us
    config.device.setForegroundHandler(createForegroundHandler(config.presentation));

    subscriptions.push(
      config.device.onResponse((response) => {
        if (disposed) return;
        void routing.ingest(response, false).catch((error) => report('routing', error));
      }),
    );
    subscriptions.push(
      config.device.onPushToken((token) => {
        if (disposed) return;
        // The DELIVERED value rides into register() — never a
        // re-acquire, which on real devices re-emits this very
        // event and loops forever. An echo of the token we
        // already hold is dropped outright.
        if (token === registration.store.get().token) return;
        void registration.register('rotation', token).catch((error) => report('rotation', error));
      }),
    );
    subscriptions.push(
      config.device.onAppActive(() => {
        if (disposed) return;
        void permission.poll().catch((error) => report('permission', error));
      }),
    );
    subscriptions.push(config.device.onHandleError((error) => report('foreground', error)));

    // Reconcile, never trust: the master switch seeded from
    // storage (a persisted OFF must be visible without a wire
    // round-trip), current permission, registry re-applied by
    // the host's applyChannels call (names live there), and a
    // TTL re-register when the tuple went stale. Every await
    // re-checks disposed — a teardown racing this tail must
    // not trigger a post-mortem POST
    await prefs.hydrate();
    if (disposed) return;
    await permission.poll();
    if (disposed) return;
    try {
      const raw = await config.storage.get(TUPLE_KEY);
      if (disposed) return;
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const registeredAt = (parsed as { registeredAt?: unknown })?.registeredAt;
        if (typeof registeredAt === 'number' && now() - registeredAt >= TUPLE_TTL_MS) {
          void registration.register('ttl').catch((error) => report('ttl', error));
        }
      }
    } catch (error) {
      report('reconcile', error);
    }
  };

  // Shared, not flag-gated: a second concurrent init() awaits
  // the SAME work instead of resolving before the first's
  // reconcile has run
  const init = (): Promise<void> => {
    if (!initPromise) initPromise = initBody();
    return initPromise;
  };

  const dispose = (): void => {
    disposed = true;
    initPromise = null;
    for (const unsubscribe of subscriptions.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // A broken unsubscribe must not stop the teardown
      }
    }
    prefs.dispose();
  };

  return {
    init,
    dispose,

    permission: permission.store,
    requestPermission: () => permission.request(),

    registration: registration.store,
    register: (reason) => registration.register(reason),
    detach: (opts) => registration.detach(opts),

    prefs: prefs.store,
    setMasterEnabled: async (on: boolean) => {
      await prefs.setMasterEnabled(on);
      if (on) return registration.register('toggle');
      await registration.detach();
      return undefined;
    },
    setChannelEnabled: (key, on) => prefs.setChannelEnabled(key, on),
    setChatPreview: (on) => prefs.setChatPreview(on),
    refreshPrefs: () => prefs.refresh(),

    applyChannels: (names) => channelApplier.apply(names),

    routing: {
      setResolver: (resolver) => routing.setResolver(resolver),
      consumeInitial: () => routing.consumeInitial(),
      onIntent: (listener) => routing.onIntent(listener),
    },
  };
}
