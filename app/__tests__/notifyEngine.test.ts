// -----------------------------------------------------------
//  [*] Tests — services/notifyEngine singleton wiring
//
//  The app-side composition, pinned: the channel registry's
//  frozen shape (pattern included), the nameKey → i18n mapping,
//  the language reduction, the legacy master-switch migration
//  (writes '0' ONLY for an absent engine key plus an explicit
//  legacy false, never throws), readyNotifyEngine's memo — one
//  promise for every caller, migration before init, and a
//  resolved engine even when init rejects — and the three
//  gates the composition adds around the REAL engine: the
//  stored session as canRegister, real hardware folded into
//  supportsRemotePush, and the legacy opt-out reaching
//  register() end to end through the AsyncStorage seam.
// -----------------------------------------------------------

import type AsyncStorageType from '@react-native-async-storage/async-storage';

import { palettes } from '@/constants/theme';

// Pure values off the (mocked, actual-spread) barrel — the
// factory below replaces only the two constructors
import { ChannelImportance, validateChannelSpecs, type DeviceAdapter } from '@knf/notifyengine';
import { fixtureGranted, type FakeDevice, type FakeTransport } from '@knf/notifyengine/testing';


jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Read lazily so the factory never touches the script object
// before this module's own statements have run
const mockI18n = { language: 'lt' };
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    get language() {
      return mockI18n.language;
    },
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-under-test' } } } },
}));

// Real hardware by default; a test flips it to play a simulator
const mockDevice = { isDevice: true };
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
}));

// The session gate: null = guest. Reads are counted so a test
// can prove the gate was consulted, not bypassed
const mockSession = { token: null as string | null, reads: 0 };
jest.mock('@/services/session', () => ({
  getStoredToken: async () => {
    mockSession.reads += 1;
    return mockSession.token;
  },
}));

// Only reached through the package's device adapter, which is
// swapped for the testing fake below — the primitive's import-
// time token auto-registration must not run here
jest.mock('expo-notifications', () => ({}));

const mockLogError = jest.fn();
jest.mock('@/services/log', () => ({ logError: (...args: unknown[]) => mockLogError(...args) }));

// Every register/detach would otherwise hit the app's HTTP client
jest.mock('@/services/notifyTransport', () => ({
  notifyTransport: jest.requireActual('@knf/notifyengine/testing').createFakeTransport(),
}));

// The real engine over the fake device; init() is scriptable so
// the readiness memo can be proven against a rejecting init.
// The fake the adapter factory hands out is kept so tests can
// script permissions and tokens underneath the hardware wrapper
const mockEngine = {
  initImpl: null as (() => Promise<void>) | null,
  initCalls: 0,
  deviceOptions: [] as unknown[],
  fakeDevices: [] as FakeDevice[],
  configs: [] as unknown[],
};
jest.mock('@knf/notifyengine', () => {
  const actual = jest.requireActual('@knf/notifyengine');
  const testing = jest.requireActual('@knf/notifyengine/testing');
  return {
    ...actual,
    createExpoDevice: (options: unknown) => {
      mockEngine.deviceOptions.push(options);
      const fake = testing.createFakeDevice();
      mockEngine.fakeDevices.push(fake);
      return fake;
    },
    createNotifyEngine: (config: Parameters<typeof actual.createNotifyEngine>[0]) => {
      mockEngine.configs.push(config);
      const engine = actual.createNotifyEngine(config);
      return {
        ...engine,
        init: () => {
          mockEngine.initCalls += 1;
          return mockEngine.initImpl ? mockEngine.initImpl() : engine.init();
        },
      };
    },
  };
});


// The module memoises the engine and the readiness promise at
// module level — every test gets a fresh instance through the
// reset registry. The storage mock and the fake transport must
// be fetched from that same registry after the reset, or the
// test would read a DIFFERENT store than the service writes.
type NotifyEngineModule = typeof import('@/services/notifyEngine');
type EngineBarrel = typeof import('@knf/notifyengine');
type EngineTesting = typeof import('@knf/notifyengine/testing');
let service: NotifyEngineModule;
let storage: typeof AsyncStorageType;
let transport: FakeTransport;

const MASTER_KEY = 'notify.masterEnabled';
const LEGACY_KEY = 'app_settings';
const TUPLE_KEY = 'notify.lastRegistration';
const LEGACY_TOKEN_KEY = 'push_last_token';

// The fake device the singleton was built over, and the config
// the singleton handed the engine
const fakeDevice = () => mockEngine.fakeDevices[0];
const engineConfig = () => mockEngine.configs[0] as Parameters<EngineBarrel['createNotifyEngine']>[0];
const wireMethods = () => transport.calls.map((call) => call.method);

beforeEach(async () => {
  jest.resetModules();
  // Module paths stay literal — the babel alias only rewrites
  // string literals, a const would bypass '@/'
  storage = jest.requireMock<typeof AsyncStorageType>('@react-native-async-storage/async-storage');
  await storage.clear();
  mockLogError.mockClear();
  mockI18n.language = 'lt';
  mockDevice.isDevice = true;
  mockSession.token = null;
  mockSession.reads = 0;
  mockEngine.initImpl = null;
  mockEngine.initCalls = 0;
  mockEngine.deviceOptions.length = 0;
  mockEngine.fakeDevices.length = 0;
  mockEngine.configs.length = 0;
  service = jest.requireActual<NotifyEngineModule>('@/services/notifyEngine');
  transport = jest.requireMock<{ notifyTransport: FakeTransport }>('@/services/notifyTransport').notifyTransport;
});


describe('NOTIFY_CHANNELS', () => {
  it('is exactly the frozen default channel: MAX importance, the shipped vibration pattern, brand light', () => {
    expect(service.NOTIFY_CHANNELS).toEqual([
      {
        id: 'default',
        nameKey: 'default',
        importance: ChannelImportance.MAX,
        vibration: true,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: palettes.light.brand,
      },
    ]);
    expect(palettes.light.brand).toBe('#7B003F');
  });

  it('passes the registry validation and is what the singleton was built with', () => {
    expect(() => validateChannelSpecs(service.NOTIFY_CHANNELS)).not.toThrow();
    expect(engineConfig().channels).toEqual(service.NOTIFY_CHANNELS);
    expect(engineConfig().presentation).toBe(service.NOTIFY_PRESENTATION);
  });

  it('is accepted by createNotifyEngine over the testing fakes', () => {
    const actual = jest.requireActual<EngineBarrel>('@knf/notifyengine');
    const testing = jest.requireActual<EngineTesting>('@knf/notifyengine/testing');
    expect(() =>
      actual.createNotifyEngine({
        transport: testing.createFakeTransport(),
        device: testing.createFakeDevice(),
        storage: testing.createMemoryStorage(),
        channels: [...service.NOTIFY_CHANNELS],
        presentation: service.NOTIFY_PRESENTATION,
        language: service.currentLanguage,
      }),
    ).not.toThrow();
  });
});


describe('NOTIFY_PRESENTATION', () => {
  it('shows every push in the foreground with no suppress predicate yet', () => {
    expect(service.NOTIFY_PRESENTATION).toEqual({
      rules: {},
      default: { banner: true, list: true, sound: true, badge: true },
    });
    expect(service.NOTIFY_PRESENTATION.suppress).toBeUndefined();
  });
});


describe('notifyChannelNames', () => {
  it("maps the default channel to t('settings.notifications')", () => {
    const t = jest.fn((key: string) => `T:${key}`);
    expect(service.notifyChannelNames(t)).toEqual({ default: 'T:settings.notifications' });
    expect(t).toHaveBeenCalledTimes(1);
  });
});


describe('currentLanguage', () => {
  it("is 'en' only for English and 'lt' for everything else", () => {
    mockI18n.language = 'en';
    expect(service.currentLanguage()).toBe('en');
    mockI18n.language = 'lt';
    expect(service.currentLanguage()).toBe('lt');
    mockI18n.language = 'en-US';
    expect(service.currentLanguage()).toBe('lt');
    mockI18n.language = '';
    expect(service.currentLanguage()).toBe('lt');
  });
});


describe('the singleton', () => {
  it('hands the EAS project id from app config to the device adapter', () => {
    expect(mockEngine.deviceOptions).toEqual([{ projectId: 'proj-under-test' }]);
  });

  it('routes engine errors into the app log under a notify: scope', () => {
    const err = new Error('boom');
    engineConfig().onError?.('rotation', err);
    expect(mockLogError).toHaveBeenCalledWith('notify:rotation', err);
  });

  it('reads the language live at register time', () => {
    mockI18n.language = 'en';
    expect(engineConfig().language()).toBe('en');
    mockI18n.language = 'lt';
    expect(engineConfig().language()).toBe('lt');
  });

  it('is built without calling init()', () => {
    expect(mockEngine.initCalls).toBe(0);
  });

  it('gates the register on the stored session — the config reads getStoredToken live', async () => {
    const canRegister = engineConfig().canRegister;
    expect(canRegister).toBeDefined();

    await expect(canRegister?.()).resolves.toBe(false);
    mockSession.token = 'jwt-under-test';
    await expect(canRegister?.()).resolves.toBe(true);
    expect(mockSession.reads).toBe(2);
  });
});


describe('the device seam', () => {
  it('wraps the Expo adapter: every surface passes through, supportsRemotePush also asks the hardware', () => {
    const device: DeviceAdapter = engineConfig().device;
    const fake = fakeDevice();

    expect(device).not.toBe(fake);
    expect(device.platform).toBe(fake.platform);
    expect(device.getPermissions).toBe(fake.getPermissions);
    expect(device.getPushToken).toBe(fake.getPushToken);
    expect(device.onResponse).toBe(fake.onResponse);

    // Real hardware and a supporting runtime → true
    expect(device.supportsRemotePush()).toBe(true);
    // A simulator → false, whatever the runtime says
    mockDevice.isDevice = false;
    expect(device.supportsRemotePush()).toBe(false);
    // Real hardware but an unsupporting runtime (web, the dev
    // shell) → the adapter's own answer still counts
    mockDevice.isDevice = true;
    fake.remotePushSupported = false;
    expect(device.supportsRemotePush()).toBe(false);
  });

  it("a simulator reads 'unsupported' after init and register() rejects 'unsupported' before the wire", async () => {
    mockDevice.isDevice = false;
    // The OS would even say granted — the hardware answer wins
    fakeDevice().permission = fixtureGranted;
    mockSession.token = 'jwt-under-test';

    await service.readyNotifyEngine();

    expect(service.notifyEngine.permission.get()).toEqual({
      status: 'unsupported',
      canAskAgain: false,
      canDeliver: false,
    });
    await expect(service.notifyEngine.register('restore')).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(wireMethods()).toEqual([]);
    expect(service.notifyEngine.registration.get().phase).toBe('idle');
  });

  it("real hardware with the same OS answer reads 'granted' and registers", async () => {
    fakeDevice().permission = fixtureGranted;
    mockSession.token = 'jwt-under-test';

    await service.readyNotifyEngine();

    expect(service.notifyEngine.permission.get().status).toBe('granted');
    await expect(service.notifyEngine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    expect(wireMethods()).toEqual(['register']);
  });
});


describe('canRegister — the session gate on the real engine', () => {
  beforeEach(() => {
    fakeDevice().permission = fixtureGranted;
  });

  it("a guest's register('toggle') resolves 'unauthenticated' with no wire call and no store write", async () => {
    await service.readyNotifyEngine();

    await expect(service.notifyEngine.register('toggle')).resolves.toEqual({ ok: false, reason: 'unauthenticated' });

    expect(mockSession.reads).toBeGreaterThan(0);
    expect(wireMethods()).toEqual([]);
    expect(service.notifyEngine.registration.get()).toEqual({
      phase: 'idle',
      token: null,
      lastError: null,
      registeredAt: null,
    });
    expect(await storage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
  });

  it("a guest's master-ON records the intent in storage without touching the wire", async () => {
    await service.readyNotifyEngine();

    await expect(service.notifyEngine.setMasterEnabled(true)).resolves.toEqual({
      ok: false,
      reason: 'unauthenticated',
    });

    expect(await storage.getItem(MASTER_KEY)).toBe('1');
    expect(service.notifyEngine.prefs.get().masterEnabled).toBe(true);
    expect(wireMethods()).toEqual([]);
  });

  it('a stored session lets the same engine through to the wire — the gate is read per call', async () => {
    await service.readyNotifyEngine();
    await expect(service.notifyEngine.register('toggle')).resolves.toEqual({ ok: false, reason: 'unauthenticated' });

    mockSession.token = 'jwt-under-test';

    await expect(service.notifyEngine.register('login')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    expect(transport.calls).toEqual([
      {
        method: 'register',
        payload: { token: 'ExponentPushToken[fake-token-1]', platform: 'ios', language: 'lt' },
      },
    ]);
    expect(service.notifyEngine.registration.get().phase).toBe('registered');
  });
});


describe('migrateLegacyMasterSwitch', () => {
  it("writes '0' when the engine key is absent and the legacy blob says false", async () => {
    await storage.setItem(LEGACY_KEY, JSON.stringify({ language: 'lt', notifications: false }));

    await service.migrateLegacyMasterSwitch();

    expect(await storage.getItem(MASTER_KEY)).toBe('0');
  });

  it('is idempotent — a second run changes nothing', async () => {
    await storage.setItem(LEGACY_KEY, JSON.stringify({ notifications: false }));
    await service.migrateLegacyMasterSwitch();
    await service.migrateLegacyMasterSwitch();

    expect(await storage.getItem(MASTER_KEY)).toBe('0');
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("never overrides an engine key that already exists — even '1' against a legacy false", async () => {
    await storage.setItem(MASTER_KEY, '1');
    await storage.setItem(LEGACY_KEY, JSON.stringify({ notifications: false }));

    await service.migrateLegacyMasterSwitch();

    expect(await storage.getItem(MASTER_KEY)).toBe('1');
  });

  it('is a no-op when the legacy blob says true', async () => {
    await storage.setItem(LEGACY_KEY, JSON.stringify({ notifications: true }));

    await service.migrateLegacyMasterSwitch();

    expect(await storage.getItem(MASTER_KEY)).toBeNull();
  });

  it('is a no-op when the legacy blob is absent or carries no switch', async () => {
    await service.migrateLegacyMasterSwitch();
    expect(await storage.getItem(MASTER_KEY)).toBeNull();

    await storage.setItem(LEGACY_KEY, JSON.stringify({ language: 'en' }));
    await service.migrateLegacyMasterSwitch();
    expect(await storage.getItem(MASTER_KEY)).toBeNull();
  });

  it('is a no-op on a corrupt blob and logs instead of throwing', async () => {
    await storage.setItem(LEGACY_KEY, '{not json');

    await expect(service.migrateLegacyMasterSwitch()).resolves.toBeUndefined();

    expect(await storage.getItem(MASTER_KEY)).toBeNull();
    expect(mockLogError).toHaveBeenCalledWith('notify:migrate', expect.any(SyntaxError));
  });

  it('treats a non-object blob (a bare false, a string) as no legacy opt-out', async () => {
    await storage.setItem(LEGACY_KEY, 'false');
    await service.migrateLegacyMasterSwitch();
    expect(await storage.getItem(MASTER_KEY)).toBeNull();

    await storage.setItem(LEGACY_KEY, '"off"');
    await service.migrateLegacyMasterSwitch();
    expect(await storage.getItem(MASTER_KEY)).toBeNull();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('never throws when storage itself throws', async () => {
    const getItem = jest.spyOn(storage, 'getItem').mockRejectedValue(new Error('storage down'));
    try {
      await expect(service.migrateLegacyMasterSwitch()).resolves.toBeUndefined();
      expect(mockLogError).toHaveBeenCalledWith('notify:migrate', expect.any(Error));
    } finally {
      getItem.mockRestore();
    }
  });
});


describe('readyNotifyEngine', () => {
  it('returns the SAME promise to every caller and runs init once', async () => {
    const first = service.readyNotifyEngine();
    const second = service.readyNotifyEngine();

    expect(second).toBe(first);
    await expect(first).resolves.toBe(service.notifyEngine);
    expect(service.readyNotifyEngine()).toBe(first);
    expect(mockEngine.initCalls).toBe(1);
  });

  it('lands the legacy opt-out BEFORE init runs', async () => {
    await storage.setItem(LEGACY_KEY, JSON.stringify({ notifications: false }));
    let masterAtInit: string | null = 'unread';
    mockEngine.initImpl = async () => {
      masterAtInit = await storage.getItem(MASTER_KEY);
    };

    await service.readyNotifyEngine();

    expect(masterAtInit).toBe('0');
    expect(mockEngine.initCalls).toBe(1);
  });

  it('still resolves the engine when init rejects, logging the failure', async () => {
    const failure = new Error('device exploded');
    mockEngine.initImpl = async () => {
      throw failure;
    };

    await expect(service.readyNotifyEngine()).resolves.toBe(service.notifyEngine);
    // The memo keeps the settled promise — no retry storm, no
    // second init on the next caller
    await expect(service.readyNotifyEngine()).resolves.toBe(service.notifyEngine);

    expect(mockLogError).toHaveBeenCalledWith('notify:init', failure);
    expect(mockEngine.initCalls).toBe(1);
  });

  it('a fresh module instance starts un-ready (the memo is module-scoped, not global)', async () => {
    await service.readyNotifyEngine();
    expect(mockEngine.initCalls).toBe(1);

    jest.resetModules();
    const fresh = jest.requireActual<NotifyEngineModule>('@/services/notifyEngine');
    await fresh.readyNotifyEngine();
    expect(mockEngine.initCalls).toBe(2);
  });
});


describe('the real engine over the AsyncStorage seam', () => {
  beforeEach(() => {
    // A signed-in user on real hardware with permission granted:
    // only the storage seam decides what happens next
    fakeDevice().permission = fixtureGranted;
    mockSession.token = 'jwt-under-test';
  });

  it("a legacy opt-out reaches register('restore') end to end: 'disabled', the wire never sees a POST", async () => {
    await storage.setItem(LEGACY_KEY, JSON.stringify({ notifications: false }));

    await service.readyNotifyEngine();

    // init seeds the snapshot from the migrated key — visible
    // without any server round-trip
    expect(service.notifyEngine.prefs.get().masterEnabled).toBe(false);
    await expect(service.notifyEngine.register('restore')).resolves.toEqual({ ok: false, reason: 'disabled' });
    expect(wireMethods()).toEqual([]);
    expect(service.notifyEngine.registration.get().phase).toBe('idle');
  });

  it('drives get/set/del through AsyncStorage: master key, token mirror and tuple, detach cleanup', async () => {
    await service.readyNotifyEngine();

    // OFF → '0' under the engine's own key; the detach it runs
    // has no stored token yet, so it asks the device and clears
    // that one server-side
    await expect(service.notifyEngine.setMasterEnabled(false)).resolves.toBeUndefined();
    expect(await storage.getItem(MASTER_KEY)).toBe('0');
    expect(service.notifyEngine.prefs.get().masterEnabled).toBe(false);
    expect(wireMethods()).toEqual(['unregister']);

    // ON → '1', a register('toggle') on the wire, and both the
    // dedupe tuple and the legacy token mirror written
    await expect(service.notifyEngine.setMasterEnabled(true)).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    expect(await storage.getItem(MASTER_KEY)).toBe('1');
    expect(await storage.getItem(LEGACY_TOKEN_KEY)).toBe('ExponentPushToken[fake-token-1]');
    expect(JSON.parse((await storage.getItem(TUPLE_KEY)) as string)).toMatchObject({
      token: 'ExponentPushToken[fake-token-1]',
      platform: 'ios',
      language: 'lt',
    });
    expect(wireMethods()).toEqual(['unregister', 'register']);

    // detach → a confirmed DELETE removes both keys
    await service.notifyEngine.detach();
    expect(await storage.getItem(LEGACY_TOKEN_KEY)).toBeNull();
    expect(await storage.getItem(TUPLE_KEY)).toBeNull();
    expect(wireMethods()).toEqual(['unregister', 'register', 'unregister']);
    expect(service.notifyEngine.registration.get().phase).toBe('detached');
  });
});
