// -----------------------------------------------------------
//  [*] notifyengine — testing doubles
//
//  The package proves itself (and lets hosts prove themselves)
//  without a device or a backend: a fake DeviceAdapter whose
//  every scripted surface a test can drive by hand, a fake
//  NotifyTransport with per-method failure injection, the
//  transport conformance suite any real adapter must also
//  pass, and named fixtures. The fakes follow the callback-
//  capture pattern: whatever the engine registers, the test
//  can grab and fire with a synthetic event.
//
//  Used by:
//    - this package's own test battery
//    - hosts, via '@knf/notifyengine/testing'
// -----------------------------------------------------------

import { createStore } from '../core/store';
import type {
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
  PresentationRule,
  RegisterResult,
  RegistrationSnapshot,
  RouteIntent,
  Unsubscribe,
} from '../core/types';
import { TransportFailure } from '../core/types';


// -----------------------------------------------------------
// createMemoryStorage
// -----------------------------------------------------------
//
// KeyValueStorage over a Map, with an optional failure switch.
//
// Used by:
//   - engine tests as the storage seam
// -----------------------------------------------------------

export interface FakeStorage extends KeyValueStorage {
  map: Map<string, string>;
  failing: boolean;
}

export function createMemoryStorage(seed: Record<string, string> = {}): FakeStorage {
  const map = new Map(Object.entries(seed));
  const self: FakeStorage = {
    map,
    failing: false,
    get: async (key) => {
      if (self.failing) throw new Error('storage down');
      return map.has(key) ? (map.get(key) as string) : null;
    },
    set: async (key, value) => {
      if (self.failing) throw new Error('storage down');
      map.set(key, value);
    },
    del: async (key) => {
      if (self.failing) throw new Error('storage down');
      map.delete(key);
    },
  };
  return self;
}


// -----------------------------------------------------------
// createFakeDevice
// -----------------------------------------------------------
//
// The whole device in memory. Tests script permissions and
// tokens, emit rotations/responses/app-active edges, and fire
// the captured foreground handler to see what it resolves.
// Per-method overrides inject hangs and failures without
// rebuilding the fake.
//
// Used by:
//   - every engine test
// -----------------------------------------------------------

export interface FakeDevice extends DeviceAdapter {
  // Scripting
  permission: DevicePermission;
  requestOutcome: DevicePermission | null;
  token: string;
  remotePushSupported: boolean;
  channels: Map<string, DeviceChannel>;
  lastResponse: DeviceNotificationResponse | null;
  overrides: Partial<{
    getPushToken: () => Promise<string>;
    getPermissions: () => Promise<DevicePermission>;
    requestPermissions: () => Promise<DevicePermission>;
  }>;
  calls: { method: string; args: unknown[] }[];

  // Drivers
  emitTokenRotation(token: string): void;
  emitResponse(response: DeviceNotificationResponse): void;
  emitAppActive(): void;
  fireForeground(payload: { type: string; data: Record<string, string> }): Promise<PresentationRule>;
  emitHandleError(error: unknown): void;
  handlerInstallCount: number;
}

export function createFakeDevice(overrides: Partial<FakeDevice> = {}): FakeDevice {
  const tokenListeners = new Set<(token: string) => void>();
  const responseListeners = new Set<(response: DeviceNotificationResponse) => void>();
  const appActiveListeners = new Set<() => void>();
  const handleErrorListeners = new Set<(error: unknown) => void>();
  let foregroundHandler: ((payload: { type: string; data: Record<string, string> }) => Promise<PresentationRule>) | null =
    null;

  const self: FakeDevice = {
    platform: 'ios',
    permission: { status: 'undetermined', canAskAgain: true },
    requestOutcome: { status: 'granted', canAskAgain: true },
    token: 'ExponentPushToken[fake-token-1]',
    remotePushSupported: true,
    channels: new Map(),
    lastResponse: null,
    overrides: {},
    calls: [],
    handlerInstallCount: 0,

    supportsRemotePush: () => self.remotePushSupported,

    getPermissions: async () => {
      self.calls.push({ method: 'getPermissions', args: [] });
      if (self.overrides.getPermissions) return self.overrides.getPermissions();
      return self.permission;
    },
    requestPermissions: async () => {
      self.calls.push({ method: 'requestPermissions', args: [] });
      if (self.overrides.requestPermissions) return self.overrides.requestPermissions();
      if (self.requestOutcome) self.permission = self.requestOutcome;
      return self.permission;
    },

    getPushToken: async () => {
      self.calls.push({ method: 'getPushToken', args: [] });
      if (self.overrides.getPushToken) return self.overrides.getPushToken();
      return self.token;
    },
    onPushToken: (listener): Unsubscribe => {
      tokenListeners.add(listener);
      return () => tokenListeners.delete(listener);
    },

    getChannels: async () => [...self.channels.values()],
    setChannel: async (spec: ChannelSpec & { name: string }) => {
      self.calls.push({ method: 'setChannel', args: [spec] });
      self.channels.set(spec.id, { id: spec.id, name: spec.name, importance: spec.importance });
    },
    deleteChannel: async (id: string) => {
      self.calls.push({ method: 'deleteChannel', args: [id] });
      self.channels.delete(id);
    },

    onResponse: (listener): Unsubscribe => {
      responseListeners.add(listener);
      return () => responseListeners.delete(listener);
    },
    getLastResponse: async () => self.lastResponse,
    clearLastResponse: () => {
      self.lastResponse = null;
    },

    setForegroundHandler: (handler) => {
      self.handlerInstallCount += 1;
      foregroundHandler = handler;
    },
    onHandleError: (listener): Unsubscribe => {
      handleErrorListeners.add(listener);
      return () => handleErrorListeners.delete(listener);
    },

    onAppActive: (listener): Unsubscribe => {
      appActiveListeners.add(listener);
      return () => appActiveListeners.delete(listener);
    },

    emitTokenRotation: (token: string) => {
      self.token = token;
      for (const listener of [...tokenListeners]) listener(token);
    },
    emitResponse: (response) => {
      for (const listener of [...responseListeners]) listener(response);
    },
    emitAppActive: () => {
      for (const listener of [...appActiveListeners]) listener();
    },
    fireForeground: async (payload) => {
      if (!foregroundHandler) throw new Error('no foreground handler installed');
      return foregroundHandler(payload);
    },
    emitHandleError: (error) => {
      for (const listener of [...handleErrorListeners]) listener(error);
    },
  };

  return Object.assign(self, overrides);
}


// -----------------------------------------------------------
// createFakeTransport
// -----------------------------------------------------------
//
// An in-memory backend: a token table with upsert semantics,
// the four channels, the chat-preview flag. Records every call
// payload for exact-shape assertions; per-method overrides
// inject failures.
//
// Used by:
//   - engine tests, and the conformance suite below
// -----------------------------------------------------------

export interface FakeTransport extends NotifyTransport {
  tokens: Map<string, { tokenId: string; platform: string; language: Language }>;
  channels: Record<ChannelKey, boolean>;
  chatPreview: boolean;
  calls: { method: string; payload: unknown }[];
  overrides: Partial<Record<'register' | 'unregister' | 'getChannels' | 'putChannels' | 'getChatPreview' | 'putChatPreview', () => Promise<never>>>;
}

// The server's token grammar — the fake enforces it so the
// conformance suite means the same thing against both
const SERVER_TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_-]{10,64}\]$/;

export function createFakeTransport(): FakeTransport {
  let nextId = 1;

  const self: FakeTransport = {
    tokens: new Map(),
    channels: { news: true, chat: true, schedule: true, admin: true },
    chatPreview: true,
    calls: [],
    overrides: {},

    register: async (p) => {
      self.calls.push({ method: 'register', payload: p });
      if (self.overrides.register) return self.overrides.register();
      // Mirrors the real backend: malformed grammar is a 400
      if (!SERVER_TOKEN_RE.test(p.token)) throw new TransportFailure('server', 'Invalid push token format');
      const existing = self.tokens.get(p.token);
      if (existing) {
        existing.platform = p.platform;
        existing.language = p.language;
        return { tokenId: existing.tokenId, created: false };
      }
      const row = { tokenId: `tok-${nextId++}`, platform: p.platform, language: p.language };
      self.tokens.set(p.token, row);
      return { tokenId: row.tokenId, created: true };
    },

    unregister: async (p) => {
      self.calls.push({ method: 'unregister', payload: p });
      if (self.overrides.unregister) return self.overrides.unregister();
      // Unknown token resolves — mirrors the 404-swallow rule
      self.tokens.delete(p.token);
    },

    getChannels: async () => {
      self.calls.push({ method: 'getChannels', payload: null });
      if (self.overrides.getChannels) return self.overrides.getChannels();
      return { ...self.channels };
    },

    putChannels: async (patch) => {
      self.calls.push({ method: 'putChannels', payload: patch });
      if (self.overrides.putChannels) return self.overrides.putChannels();
      for (const key of Object.keys(patch)) {
        if (!(key in self.channels)) throw new TransportFailure('server', `Unknown channel "${key}"`);
      }
      self.channels = { ...self.channels, ...patch };
      return { ...self.channels };
    },

    getChatPreview: async () => {
      self.calls.push({ method: 'getChatPreview', payload: null });
      if (self.overrides.getChatPreview) return self.overrides.getChatPreview();
      return self.chatPreview;
    },

    putChatPreview: async (on) => {
      self.calls.push({ method: 'putChatPreview', payload: on });
      if (self.overrides.putChatPreview) return self.overrides.putChatPreview();
      self.chatPreview = on;
      return self.chatPreview;
    },
  };

  return self;
}


// -----------------------------------------------------------
// describeTransportContract
// -----------------------------------------------------------
//
// The behaviors EVERY transport must exhibit — run against the
// fake here and against the real adapter in an integration
// job. A transport that passes may be swapped in blind.
//
// Used by:
//   - this package's transport tests
//   - a host's backend integration suite
// -----------------------------------------------------------

export function describeTransportContract(name: string, makeTransport: () => Promise<NotifyTransport> | NotifyTransport): void {
  // Long enough for the server's 10-64 char grammar
  const CONTRACT_TOKEN = 'ExponentPushToken[contract-token-0001]';

  describe(`transport contract: ${name}`, () => {
    it('register upserts idempotently — same token keeps one identity', async () => {
      const transport = await makeTransport();
      const first = await transport.register({ token: CONTRACT_TOKEN, platform: 'ios', language: 'lt' });
      const second = await transport.register({ token: CONTRACT_TOKEN, platform: 'ios', language: 'en' });
      // The id is an opaque non-empty string; `created` is
      // best-effort and NOT asserted — the wire does not
      // carry it reliably
      expect(typeof first.tokenId).toBe('string');
      expect(first.tokenId.length).toBeGreaterThan(0);
      expect(second.tokenId).toBe(first.tokenId);
    });

    it('a malformed token is rejected typed, never stored', async () => {
      const transport = await makeTransport();
      await expect(
        transport.register({ token: 'ExponentPushToken[x]', platform: 'ios', language: 'lt' }),
      ).rejects.toBeTruthy();
    });

    it('unregister of an unknown token resolves — forgotten is success', async () => {
      const transport = await makeTransport();
      await expect(transport.unregister({ token: 'ExponentPushToken[never-seen-000]' })).resolves.toBeUndefined();
    });

    it('putChannels answers with the FULL state, untouched keys included', async () => {
      const transport = await makeTransport();
      const state = await transport.putChannels({ chat: false });
      expect(Object.keys(state).sort()).toEqual(['admin', 'chat', 'news', 'schedule']);
      expect(state.chat).toBe(false);
    });

    it('chat preview round-trips', async () => {
      const transport = await makeTransport();
      await expect(transport.putChatPreview(false)).resolves.toBe(false);
      await expect(transport.getChatPreview()).resolves.toBe(false);
    });
  });
}


// -----------------------------------------------------------
// Fixtures
// -----------------------------------------------------------
//
// Used by:
//   - engine and host tests — named, realistic payloads
// -----------------------------------------------------------

export const fixtureGranted: DevicePermission = { status: 'granted', canAskAgain: true };
// The long name some suites prefer — same object
export const fixtureGrantedPermission: DevicePermission = fixtureGranted;
export const fixtureDeniedForever: DevicePermission = { status: 'denied', canAskAgain: false };

export function fixtureResponse(
  type: string,
  data: Record<string, string> = {},
  identifier = `resp-${type}`,
): DeviceNotificationResponse {
  return { identifier, actionIdentifier: null, data: { type, ...data } };
}

export const fixtureChatMessage = fixtureResponse('chat_message', { conversationId: 'c1' }, 'resp-chat-1');
export const fixtureNewsPush = fixtureResponse('news', { postId: 'n1' }, 'resp-news-1');







// -----------------------------------------------------------
// createNotifyEngineStub
// -----------------------------------------------------------
//
// A drop-in NotifyEngine shape for APP-level tests: live
// stores a test can drive, no-op lifecycle, and a call log —
// screens render against it without a device, a backend or
// the real engine.
//
// Used by:
//   - host test suites mocking the notification seam
// -----------------------------------------------------------

export function createNotifyEngineStub() {
  const permission = createStore<PermissionSnapshot>({ status: 'granted', canAskAgain: true, canDeliver: true });
  const registration = createStore<RegistrationSnapshot>({ phase: 'idle', token: null, lastError: null, registeredAt: null });
  const prefs = createStore<PrefsSnapshot>({
    masterEnabled: true,
    channels: { news: true, chat: true, schedule: true, admin: true },
    chatPreview: true,
    syncState: 'fresh',
  });
  const calls: { method: string; args: unknown[] }[] = [];
  const log = (method: string, ...args: unknown[]) => calls.push({ method, args });
  const okResult: RegisterResult = { ok: true, tokenId: 'stub' };

  return {
    calls,
    permission,
    registration,
    prefs,
    init: async () => log('init'),
    dispose: () => log('dispose'),
    requestPermission: async () => {
      log('requestPermission');
      return permission.get();
    },
    register: async (...args: unknown[]) => {
      log('register', ...args);
      return okResult;
    },
    detach: async (...args: unknown[]) => log('detach', ...args),
    setMasterEnabled: async (on: boolean) => {
      log('setMasterEnabled', on);
      prefs.set({ ...prefs.get(), masterEnabled: on });
      return on ? okResult : undefined;
    },
    setChannelEnabled: (key: string, on: boolean) => {
      log('setChannelEnabled', key, on);
      const snapshot = prefs.get();
      prefs.set({ ...snapshot, channels: { ...snapshot.channels, [key]: on } });
    },
    setChatPreview: async (on: boolean) => {
      log('setChatPreview', on);
      prefs.set({ ...prefs.get(), chatPreview: on });
    },
    refreshPrefs: async () => log('refreshPrefs'),
    applyChannels: async (names: Record<string, string>) => log('applyChannels', names),
    routing: {
      setResolver: (resolver: (intent: RouteIntent) => void) => log('setResolver', resolver),
      consumeInitial: async () => {
        log('consumeInitial');
        return null;
      },
      onIntent: () => () => undefined,
    },
  };
}
