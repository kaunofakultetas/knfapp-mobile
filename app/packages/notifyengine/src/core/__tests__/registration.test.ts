// -----------------------------------------------------------
//  [*] Tests — the registration machine
//
//  register()/detach() driven end to end over scripted seams:
//  the exact wire payload, the pre-flight gates (runtime, the
//  host's session gate, the master switch, permission) that
//  reject typed without a single store write, supersede generations
//  (a stale completion physically unable to overwrite), the
//  watchdog that settles a device that never answers, the
//  master switch re-read between token acquire and POST,
//  tuple dedupe with TTL + force reasons + fail-open storage,
//  rotation, and a detach that never throws, never prompts,
//  never hangs — and walks its whole token chain down to the
//  device. Every outcome is an exact shape.
// -----------------------------------------------------------

import { createRegistrationMachine, type RegistrationMachine } from '../registration';
import type { Language } from '../types';
import {
  createFakeDevice,
  createFakeTransport,
  createMemoryStorage,
  type FakeDevice,
  type FakeStorage,
  type FakeTransport,
} from '../../testing';

const TOKEN = 'ExponentPushToken[fake-token-1]';
const TUPLE_KEY = 'notify.lastRegistration';
const LEGACY_KEY = 'push_last_token';
const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = 1_750_000_000_000;

interface Rig {
  device: FakeDevice;
  transport: FakeTransport;
  storage: FakeStorage;
  machine: RegistrationMachine;
  setNow(ms: number): void;
  setLanguage(next: Language): void;
  setCanDeliver(next: boolean): void;
  setMasterEnabled(next: boolean): void;
  setAuthenticated(next: boolean): void;
}

// One machine over all three fakes, with every closure the
// machine reads (now / language / canDeliver / canRegister /
// isMasterEnabled) exposed as a settable knob
const buildRig = (seed: Record<string, string> = {}): Rig => {
  const device = createFakeDevice();
  const transport = createFakeTransport();
  const storage = createMemoryStorage(seed);
  let nowMs = T0;
  let lang: Language = 'lt';
  let deliverable = true;
  let masterEnabled = true;
  let authenticated = true;

  const machine = createRegistrationMachine({
    device,
    transport,
    storage,
    language: () => lang,
    canDeliver: () => deliverable,
    canRegister: () => authenticated,
    isMasterEnabled: async () => masterEnabled,
    now: () => nowMs,
  });

  return {
    device,
    transport,
    storage,
    machine,
    setNow: (ms) => {
      nowMs = ms;
    },
    setLanguage: (next) => {
      lang = next;
    },
    setCanDeliver: (next) => {
      deliverable = next;
    },
    setMasterEnabled: (next) => {
      masterEnabled = next;
    },
    setAuthenticated: (next) => {
      authenticated = next;
    },
  };
};

// Enough microtask turns for an attempt to cross its awaited
// gates and park inside whatever the script left hanging
const flushMicrotasks = async (rounds = 12): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};

afterEach(() => {
  jest.useRealTimers();
});


describe('register — the happy path', () => {
  it("register('login') POSTs the exact tuple and lands registered", async () => {
    const rig = buildRig();

    const result = await rig.machine.register('login');

    expect(result).toEqual({ ok: true, tokenId: 'tok-1' });
    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
    ]);
    expect(rig.machine.store.get()).toEqual({
      phase: 'registered',
      token: TOKEN,
      lastError: null,
      registeredAt: T0,
    });
    // Both persisted copies written: the diff tuple and the
    // legacy key the detach fallback chain reads
    expect(JSON.parse(rig.storage.map.get(TUPLE_KEY) as string)).toEqual({
      token: TOKEN,
      platform: 'ios',
      language: 'lt',
      registeredAt: T0,
    });
    expect(rig.storage.map.get(LEGACY_KEY)).toBe(TOKEN);
  });
});


describe('register — the pre-flight gates', () => {
  // A gate rejection is a pure typed answer: the attempt never
  // started, so the store must not even flicker — a subscriber
  // sees exactly the one snapshot it was handed on subscribe
  const phasesSeen = (rig: Rig): string[] => {
    const seen: string[] = [];
    rig.machine.store.subscribe((snapshot) => seen.push(snapshot.phase));
    return seen;
  };

  it('permission not deliverable rejects typed — no device call, no wire, no store phase change', async () => {
    const rig = buildRig();
    rig.setCanDeliver(false);
    const seen = phasesSeen(rig);

    await expect(rig.machine.register('login')).resolves.toEqual({ ok: false, reason: 'permission' });

    expect(rig.device.calls).toEqual([]);
    expect(rig.transport.calls).toEqual([]);
    expect(seen).toEqual(['idle']);
  });

  it('a runtime without remote push rejects unsupported — likewise untouched', async () => {
    const rig = buildRig();
    rig.device.remotePushSupported = false;
    const seen = phasesSeen(rig);

    await expect(rig.machine.register('login')).resolves.toEqual({ ok: false, reason: 'unsupported' });

    expect(rig.device.calls).toEqual([]);
    expect(rig.transport.calls).toEqual([]);
    expect(seen).toEqual(['idle']);
  });

  it("the host's session gate saying no rejects unauthenticated — no device call, no wire, no store emission", async () => {
    const rig = buildRig();
    rig.setAuthenticated(false);
    const seen = phasesSeen(rig);

    await expect(rig.machine.register('toggle')).resolves.toEqual({ ok: false, reason: 'unauthenticated' });

    expect(rig.device.calls).toEqual([]);
    expect(rig.transport.calls).toEqual([]);
    expect(seen).toEqual(['idle']);
  });

  it('the session gate is asked BEFORE the master switch — a guest with master off still reads unauthenticated', async () => {
    const rig = buildRig();
    rig.setAuthenticated(false);
    rig.setMasterEnabled(false);

    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: false, reason: 'unauthenticated' });
  });

  it('an async session gate is awaited; a throwing one fails CLOSED as unauthenticated', async () => {
    const asyncRig = createRegistrationMachine({
      device: createFakeDevice(),
      transport: createFakeTransport(),
      storage: createMemoryStorage(),
      language: () => 'lt',
      canDeliver: () => true,
      canRegister: async () => true,
      isMasterEnabled: async () => true,
      now: () => T0,
    });
    await expect(asyncRig.register('login')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });

    const throwingRig = createRegistrationMachine({
      device: createFakeDevice(),
      transport: createFakeTransport(),
      storage: createMemoryStorage(),
      language: () => 'lt',
      canDeliver: () => true,
      canRegister: () => {
        throw new Error('secure store unreadable');
      },
      isMasterEnabled: async () => true,
      now: () => T0,
    });
    await expect(throwingRig.register('login')).resolves.toEqual({ ok: false, reason: 'unauthenticated' });
    expect(throwingRig.store.get().phase).toBe('idle');
  });

  it('master off from the start rejects disabled as a pure typed answer — the store stays idle', async () => {
    const rig = buildRig();
    rig.setMasterEnabled(false);
    const seen = phasesSeen(rig);

    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: false, reason: 'disabled' });

    expect(rig.device.calls).toEqual([]);
    expect(rig.transport.calls).toEqual([]);
    expect(seen).toEqual(['idle']);
  });

  it("a master-off register after detach() leaves 'detached' standing — never stamped 'failed'", async () => {
    const rig = buildRig();
    await rig.machine.detach();
    expect(rig.machine.store.get().phase).toBe('detached');
    rig.setMasterEnabled(false);
    const seen = phasesSeen(rig);

    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: false, reason: 'disabled' });

    expect(rig.machine.store.get()).toEqual({
      phase: 'detached',
      token: null,
      lastError: null,
      registeredAt: null,
    });
    expect(seen).toEqual(['detached']);
  });
});


describe('register — supersede generations', () => {
  it('two concurrent calls coalesce: the first resolves superseded, ONE POST happens', async () => {
    const rig = buildRig();

    const first = rig.machine.register('login');
    const second = rig.machine.register('login');

    await expect(first).resolves.toEqual({ ok: false, reason: 'superseded' });
    await expect(second).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
    ]);
    expect(rig.machine.store.get()).toEqual({
      phase: 'registered',
      token: TOKEN,
      lastError: null,
      registeredAt: T0,
    });
  });

  it('a stale completion cannot overwrite the newest generation', async () => {
    const STALE = 'ExponentPushToken[stale-00000001]';
    const FRESH = 'ExponentPushToken[fresh-00000002]';
    const rig = buildRig();

    // The FIRST acquire parks until we release it; the second
    // answers immediately — so the old attempt finishes LAST
    let releaseStale!: (token: string) => void;
    let grabs = 0;
    rig.device.overrides.getPushToken = () => {
      grabs += 1;
      if (grabs === 1) {
        return new Promise<string>((resolve) => {
          releaseStale = resolve;
        });
      }
      return Promise.resolve(FRESH);
    };

    const first = rig.machine.register('login');
    await flushMicrotasks();
    // Proof the first attempt crossed its gates and is parked
    // inside the token acquire before the second call exists
    expect(rig.device.calls).toEqual([{ method: 'getPushToken', args: [] }]);

    const second = rig.machine.register('login');
    await expect(second).resolves.toEqual({ ok: true, tokenId: 'tok-1' });

    releaseStale(STALE);
    await expect(first).resolves.toEqual({ ok: false, reason: 'superseded' });

    // The late old token never reached state or the wire
    expect(rig.machine.store.get()).toEqual({
      phase: 'registered',
      token: FRESH,
      lastError: null,
      registeredAt: T0,
    });
    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: FRESH, platform: 'ios', language: 'lt' } },
    ]);
  });
});


describe('register — the watchdog', () => {
  it('a device that never answers settles as network after 10s', async () => {
    jest.useFakeTimers();
    const rig = buildRig();
    rig.device.overrides.getPushToken = () => new Promise<string>(() => undefined);

    const pending = rig.machine.register('login');
    await jest.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toEqual({ ok: false, reason: 'network' });
    expect(rig.machine.store.get()).toEqual({
      phase: 'failed',
      token: null,
      lastError: { ok: false, reason: 'network' },
      registeredAt: null,
    });
    // The attempt was parked in the acquire — nothing reached
    // the backend
    expect(rig.device.calls).toEqual([{ method: 'getPushToken', args: [] }]);
    expect(rig.transport.calls).toEqual([]);
  });
});


describe('register — the master switch re-read', () => {
  it('a toggle-off between token acquire and POST kills the attempt before the wire', async () => {
    const rig = buildRig();
    // The flip happens INSIDE the acquire — after the first
    // gate already read the switch as on
    rig.device.overrides.getPushToken = async () => {
      rig.setMasterEnabled(false);
      return TOKEN;
    };

    await expect(rig.machine.register('login')).resolves.toEqual({ ok: false, reason: 'disabled' });
    expect(rig.transport.calls).toEqual([]);
    expect(rig.machine.store.get()).toEqual({
      phase: 'failed',
      token: null,
      lastError: { ok: false, reason: 'disabled' },
      registeredAt: null,
    });
  });
});


describe('register — tuple dedupe', () => {
  it("a second 'restore' over the same fresh tuple answers ok(-1) without a POST", async () => {
    const rig = buildRig();

    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'cached' });

    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
    ]);
    expect(rig.machine.store.get()).toEqual({
      phase: 'registered',
      token: TOKEN,
      lastError: null,
      registeredAt: T0,
    });
  });

  it('a language change between restores re-POSTs with the new language', async () => {
    const rig = buildRig();

    await rig.machine.register('restore');
    rig.setLanguage('en');
    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });

    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'en' } },
    ]);
  });

  it('a corrupt persisted tuple fails OPEN — the restore POSTs', async () => {
    const rig = buildRig({ [TUPLE_KEY]: '{definitely not json' });

    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
    ]);
  });

  it("'login' and 'toggle' ALWAYS POST over a fresh identical tuple; 'restore' still dedupes", async () => {
    const rig = buildRig();

    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    await expect(rig.machine.register('login')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    await expect(rig.machine.register('toggle')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'cached' });

    expect(rig.transport.calls.map((c) => c.method)).toEqual(['register', 'register', 'register']);
  });

  it("an 8-day-old tuple is stale — a 'restore' re-POSTs and re-stamps the tuple", async () => {
    const rig = buildRig();

    await rig.machine.register('restore');
    rig.setNow(T0 + 8 * DAY_MS);
    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });

    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
    ]);
    expect(JSON.parse(rig.storage.map.get(TUPLE_KEY) as string)).toEqual({
      token: TOKEN,
      platform: 'ios',
      language: 'lt',
      registeredAt: T0 + 8 * DAY_MS,
    });
  });

  it("a rotation to the SAME token dedupes; a NEW token POSTs", async () => {
    const ROTATED = 'ExponentPushToken[rotated-000002]';
    const rig = buildRig();

    await expect(rig.machine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });

    // Same token re-announced by the platform — nothing to say
    rig.device.emitTokenRotation(TOKEN);
    await expect(rig.machine.register('rotation')).resolves.toEqual({ ok: true, tokenId: 'cached' });

    // A genuinely new token must reach the backend
    rig.device.emitTokenRotation(ROTATED);
    await expect(rig.machine.register('rotation')).resolves.toEqual({ ok: true, tokenId: 'tok-2' });

    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
      { method: 'register', payload: { token: ROTATED, platform: 'ios', language: 'lt' } },
    ]);
    expect(rig.machine.store.get()).toEqual({
      phase: 'registered',
      token: ROTATED,
      lastError: null,
      registeredAt: T0,
    });
  });
});


describe('detach — the token chain', () => {
  it('canDeliver false + empty memory and storage: the device is NEVER asked', async () => {
    const rig = buildRig();
    rig.setCanDeliver(false);

    await rig.machine.detach();

    expect(rig.device.calls).toEqual([]);
    expect(rig.transport.calls).toEqual([]);
    expect(rig.machine.store.get()).toEqual({
      phase: 'detached',
      token: null,
      lastError: null,
      registeredAt: null,
    });
  });

  it('a token in memory is used as-is — no second device acquire', async () => {
    const rig = buildRig();
    await rig.machine.register('login');
    // If the chain ever fell through to the device again this
    // would both reject and grow the calls array
    rig.device.overrides.getPushToken = () => Promise.reject(new Error('must not be asked'));

    await rig.machine.detach({ authToken: 'session-jwt' });

    expect(rig.device.calls).toEqual([{ method: 'getPushToken', args: [] }]);
    expect(rig.transport.calls[1]).toEqual({
      method: 'unregister',
      payload: { token: TOKEN, authToken: 'session-jwt' },
    });
    expect(rig.machine.store.get()).toEqual({
      phase: 'detached',
      token: null,
      lastError: null,
      registeredAt: null,
    });
  });

  it('memory empty but a stored copy exists: the stored token is DELETEd and the device is not probed', async () => {
    const STORED = 'ExponentPushToken[stored-00000001]';
    const rig = buildRig({ [LEGACY_KEY]: STORED });

    await rig.machine.detach();

    expect(rig.device.calls).toEqual([]);
    expect(rig.transport.calls).toEqual([
      { method: 'unregister', payload: { token: STORED, authToken: undefined } },
    ]);
    // Confirmed on the wire, so the stored copy is forgotten
    expect(rig.storage.map.has(LEGACY_KEY)).toBe(false);
  });

  it('nothing in memory or storage, permission granted: the device is probed ONCE and its token DELETEd', async () => {
    const rig = buildRig();

    await rig.machine.detach({ authToken: 'session-jwt' });

    expect(rig.device.calls).toEqual([{ method: 'getPushToken', args: [] }]);
    expect(rig.transport.calls).toEqual([
      { method: 'unregister', payload: { token: TOKEN, authToken: 'session-jwt' } },
    ]);
    expect(rig.machine.store.get()).toEqual({
      phase: 'detached',
      token: null,
      lastError: null,
      registeredAt: null,
    });
  });
});


describe('detach — outcomes', () => {
  it('a rejecting DELETE still resolves — and KEEPS the stored token for the next retry', async () => {
    const rig = buildRig();
    await rig.machine.register('login');
    rig.transport.overrides.unregister = () => Promise.reject(new Error('backend down'));

    await expect(rig.machine.detach()).resolves.toBeUndefined();

    expect(rig.storage.map.get(LEGACY_KEY)).toBe(TOKEN);
    expect(rig.storage.map.has(TUPLE_KEY)).toBe(true);
    expect(rig.machine.store.get()).toEqual({
      phase: 'detached',
      token: null,
      lastError: null,
      registeredAt: null,
    });
  });

  it('a confirmed DELETE clears both stored copies', async () => {
    const rig = buildRig();
    await rig.machine.register('login');

    await rig.machine.detach();

    expect(rig.storage.map.has(LEGACY_KEY)).toBe(false);
    expect(rig.storage.map.has(TUPLE_KEY)).toBe(false);
    expect(rig.transport.calls).toEqual([
      { method: 'register', payload: { token: TOKEN, platform: 'ios', language: 'lt' } },
      { method: 'unregister', payload: { token: TOKEN, authToken: undefined } },
    ]);
  });

  it('a hanging DELETE is time-boxed — detach settles within 5s', async () => {
    jest.useFakeTimers();
    const rig = buildRig();
    await rig.machine.register('login');
    rig.transport.overrides.unregister = () => new Promise<never>(() => undefined);

    let settled = false;
    const parked = rig.machine.detach();
    void parked.then(() => {
      settled = true;
    });

    await jest.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();

    expect(settled).toBe(true);
    await parked;
    // The DELETE never confirmed, so the stored copies survive
    // for the next retry
    expect(rig.storage.map.get(LEGACY_KEY)).toBe(TOKEN);
    expect(rig.storage.map.has(TUPLE_KEY)).toBe(true);
    expect(rig.transport.calls.map((c) => c.method)).toEqual(['register', 'unregister']);
  });
});


describe('register — failure keeps the last good token', () => {
  it('a failed re-register stamps failed + lastError but the previous token survives', async () => {
    const rig = buildRig();
    await expect(rig.machine.register('login')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    rig.transport.overrides.register = () => Promise.reject(new Error('backend down'));

    await expect(rig.machine.register('login')).resolves.toEqual({ ok: false, reason: 'network' });

    expect(rig.machine.store.get()).toEqual({
      phase: 'failed',
      token: TOKEN,
      lastError: { ok: false, reason: 'network' },
      registeredAt: T0,
    });
  });
});

describe('register — the token grammar gate', () => {
  it('a device answer outside the Expo grammar never reaches the wire — typed failure, zero POSTs', async () => {
    const rig = buildRig();
    rig.setCanDeliver(true);
    rig.device.token = 'not-a-push-token-at-all';
    await expect(rig.machine.register('login')).resolves.toEqual({ ok: false, reason: 'network' });
    expect(rig.transport.calls.filter((call) => call.method === 'register')).toHaveLength(0);
  });
});
