// -----------------------------------------------------------
//  [*] Tests — engine lifecycle, pinned at the composition root
//
//  The two guarantees a remounting host leans on: init() twice
//  installs ONE foreground handler and ONE listener set;
//  dispose() turns every later device edge into a dropped
//  no-op, and a later init() re-arms the whole engine. Plus
//  the lanes only the root can prove wired: token rotation →
//  register POST, app-active → permission re-poll, stale
//  stored tuple → TTL POST with no explicit call, an invalid
//  channel spec dying at build time, the master switch's
//  register/detach round trip and its seeding from storage at
//  init, and the host's session gate turning a guest's
//  register into a pure typed 'unauthenticated'.
// -----------------------------------------------------------

import { createNotifyEngine } from '../engine';
import type { ChannelSpec, PresentationPolicy, RouteIntent } from '../types';
import {
  createFakeDevice,
  createFakeTransport,
  createMemoryStorage,
  fixtureGranted,
  fixtureResponse,
} from '../../testing';


const CHANNELS: ChannelSpec[] = [{ id: 'default.v1', nameKey: 'default', importance: 3 }];
const PRESENTATION: PresentationPolicy = {
  rules: {},
  default: { banner: true, list: true, sound: true, badge: true },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_756_800_000_000; // fixed clock for the TTL lane

// The engine's lanes are await chains, never pending timers —
// a microtask-turn loop settles every void-dispatched branch
const flush = async (turns = 25): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
};

const rig = (
  opts: { seed?: Record<string, string>; now?: () => number; canRegister?: () => boolean | Promise<boolean> } = {},
) => {
  const device = createFakeDevice();
  const transport = createFakeTransport();
  const storage = createMemoryStorage(opts.seed ?? {});
  const engine = createNotifyEngine({
    transport,
    device,
    storage,
    channels: CHANNELS,
    presentation: PRESENTATION,
    language: () => 'lt',
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.canRegister ? { canRegister: opts.canRegister } : {}),
  });
  return { device, transport, storage, engine };
};

const registerPosts = (transport: ReturnType<typeof createFakeTransport>) =>
  transport.calls.filter((call) => call.method === 'register');

const permissionReads = (device: ReturnType<typeof createFakeDevice>) =>
  device.calls.filter((call) => call.method === 'getPermissions').length;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});


describe('init() idempotence — scenario 53', () => {
  it('called twice installs ONE foreground handler, and one response delivers ONE intent', async () => {
    const { device, engine } = rig();

    await engine.init();
    await engine.init();

    // The fast-refresh double-mount hazard: still one handler
    expect(device.handlerInstallCount).toBe(1);

    const intents: RouteIntent[] = [];
    engine.routing.onIntent((intent) => intents.push(intent));

    device.emitResponse(fixtureResponse('chat_message', { conversationId: 'c1' }, 'resp-53'));
    await flush();

    expect(intents).toEqual([
      {
        type: 'chat_message',
        data: { type: 'chat_message', conversationId: 'c1' },
        coldStart: false,
        actionId: null,
      },
    ]);
  });
});


describe('dispose() and the remount cycle — scenario 54', () => {
  it('drops every later device edge — no intents, no register calls, no re-polls, nothing thrown', async () => {
    const { device, transport, engine } = rig();
    device.permission = fixtureGranted;
    await engine.init();

    const intents: RouteIntent[] = [];
    engine.routing.onIntent((intent) => intents.push(intent));
    const readsBefore = permissionReads(device);

    engine.dispose();

    expect(() => {
      device.emitResponse(fixtureResponse('news', { postId: 'n1' }, 'resp-dead'));
      device.emitTokenRotation('ExponentPushToken[rotated-54]');
      device.emitAppActive();
    }).not.toThrow();
    await flush();

    expect(intents).toEqual([]);
    expect(transport.calls).toEqual([]);
    expect(permissionReads(device)).toBe(readsBefore);
  });

  it('init() after dispose() re-arms — a full remount works', async () => {
    const { device, transport, engine } = rig();
    await engine.init();
    engine.dispose();

    await engine.init();

    // A fresh handler for the fresh mount…
    expect(device.handlerInstallCount).toBe(2);

    // …and live listeners behind it
    const intents: RouteIntent[] = [];
    engine.routing.onIntent((intent) => intents.push(intent));
    device.emitResponse(fixtureResponse('news', { postId: 'n2' }, 'resp-remount'));
    await flush();

    expect(intents).toEqual([
      { type: 'news', data: { type: 'news', postId: 'n2' }, coldStart: false, actionId: null },
    ]);
    expect(transport.calls).toEqual([]);
  });
});


describe('the wiring lanes', () => {
  it('a token rotation after init+register POSTs the NEW token (rotation lane)', async () => {
    const { device, transport, engine } = rig();
    device.permission = fixtureGranted;
    await engine.init();

    await expect(engine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });

    device.emitTokenRotation('ExponentPushToken[rotated-2]');
    await flush();

    expect(registerPosts(transport)).toEqual([
      {
        method: 'register',
        payload: { token: 'ExponentPushToken[fake-token-1]', platform: 'ios', language: 'lt' },
      },
      {
        method: 'register',
        payload: { token: 'ExponentPushToken[rotated-2]', platform: 'ios', language: 'lt' },
      },
    ]);
  });

  it('app-active re-polls the device permission into the store (re-poll lane)', async () => {
    const { device, engine } = rig();
    await engine.init();
    expect(engine.permission.get()).toEqual({
      status: 'undetermined',
      canAskAgain: true,
      canDeliver: false,
    });

    device.permission = fixtureGranted;
    device.emitAppActive();
    await flush();

    expect(engine.permission.get()).toEqual({
      status: 'granted',
      canAskAgain: true,
      canDeliver: true,
    });
    expect(permissionReads(device)).toBe(2); // init poll + app-active poll
  });

  it('a stored tuple 8 days old fires a TTL register at init — a POST with no explicit call', async () => {
    const staleTuple = {
      token: 'ExponentPushToken[fake-token-1]',
      platform: 'ios',
      language: 'lt',
      registeredAt: NOW - 8 * DAY_MS,
    };
    const { device, transport, engine } = rig({
      seed: { 'notify.lastRegistration': JSON.stringify(staleTuple) },
      now: () => NOW,
    });
    device.permission = fixtureGranted;

    await engine.init();
    await flush();

    expect(registerPosts(transport)).toEqual([
      {
        method: 'register',
        payload: { token: 'ExponentPushToken[fake-token-1]', platform: 'ios', language: 'lt' },
      },
    ]);
    expect(engine.registration.get()).toEqual({
      phase: 'registered',
      token: 'ExponentPushToken[fake-token-1]',
      lastError: null,
      registeredAt: NOW,
    });
  });

  it('setMasterEnabled(true) returns the register result; false detaches through the transport', async () => {
    const { device, transport, storage, engine } = rig();
    device.permission = fixtureGranted;
    await engine.init();

    await expect(engine.setMasterEnabled(true)).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    expect(engine.prefs.get().masterEnabled).toBe(true);

    await expect(engine.setMasterEnabled(false)).resolves.toBeUndefined();

    expect(transport.calls.filter((call) => call.method === 'unregister')).toEqual([
      {
        method: 'unregister',
        payload: { token: 'ExponentPushToken[fake-token-1]', authToken: undefined },
      },
    ]);
    expect(engine.prefs.get().masterEnabled).toBe(false);
    expect(engine.registration.get()).toEqual({
      phase: 'detached',
      token: null,
      lastError: null,
      registeredAt: null,
    });
    expect(storage.map.get('notify.masterEnabled')).toBe('0');
    // A CONFIRMED delete forgets the stored tuple + legacy copy
    expect(storage.map.has('notify.lastRegistration')).toBe(false);
    expect(storage.map.has('push_last_token')).toBe(false);
  });

  it('setChatPreview forwards the machine verdict — true confirmed, false reverted', async () => {
    const { transport, engine } = rig();
    await engine.init();

    await expect(engine.setChatPreview(false)).resolves.toBe(true);
    expect(engine.prefs.get().chatPreview).toBe(false);

    transport.overrides.putChatPreview = () => Promise.reject(new Error('backend down'));
    await expect(engine.setChatPreview(true)).resolves.toBe(false);
    expect(engine.prefs.get().chatPreview).toBe(false);
  });
});


describe('init() seeds the master switch from storage', () => {
  it('a stored "0" is visible as OFF the moment init() resolves — no refreshPrefs, no wire', async () => {
    const { transport, engine } = rig({ seed: { 'notify.masterEnabled': '0' } });
    expect(engine.prefs.get().masterEnabled).toBe(true);

    await engine.init();

    expect(engine.prefs.get().masterEnabled).toBe(false);
    expect(transport.calls).toEqual([]);
  });

  it('a stored "1" and an absent key both read ON', async () => {
    const stored = rig({ seed: { 'notify.masterEnabled': '1' } });
    await stored.engine.init();
    expect(stored.engine.prefs.get().masterEnabled).toBe(true);

    const fresh = rig();
    await fresh.engine.init();
    expect(fresh.engine.prefs.get().masterEnabled).toBe(true);
  });

  it('a seeded OFF gates the register lanes: a restore answers disabled without touching the wire', async () => {
    const { device, transport, engine } = rig({ seed: { 'notify.masterEnabled': '0' } });
    device.permission = fixtureGranted;
    await engine.init();

    await expect(engine.register('restore')).resolves.toEqual({ ok: false, reason: 'disabled' });
    expect(transport.calls).toEqual([]);
    expect(engine.registration.get().phase).toBe('idle');
  });
});


describe("the host's session gate", () => {
  it('without canRegister every register lane is allowed (the default gate)', async () => {
    const { device, engine } = rig();
    device.permission = fixtureGranted;
    await engine.init();

    await expect(engine.register('restore')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
  });

  it("a guest's register is a pure typed unauthenticated — no device acquire, no wire, store untouched", async () => {
    const { device, transport, engine } = rig({ canRegister: () => false });
    device.permission = fixtureGranted;
    await engine.init();
    const phases: string[] = [];
    engine.registration.subscribe((snapshot) => phases.push(snapshot.phase));

    await expect(engine.register('restore')).resolves.toEqual({ ok: false, reason: 'unauthenticated' });

    expect(device.calls.filter((call) => call.method === 'getPushToken')).toEqual([]);
    expect(transport.calls).toEqual([]);
    expect(phases).toEqual(['idle']);
  });

  it("a guest's master-ON records the intent and answers unauthenticated; login later claims the token", async () => {
    let signedIn = false;
    const { device, transport, storage, engine } = rig({ canRegister: async () => signedIn });
    device.permission = fixtureGranted;
    await engine.init();

    await expect(engine.setMasterEnabled(true)).resolves.toEqual({ ok: false, reason: 'unauthenticated' });
    expect(storage.map.get('notify.masterEnabled')).toBe('1');
    expect(engine.prefs.get().masterEnabled).toBe(true);
    expect(transport.calls).toEqual([]);

    signedIn = true;
    await expect(engine.register('login')).resolves.toEqual({ ok: true, tokenId: 'tok-1' });
    expect(registerPosts(transport)).toHaveLength(1);
  });

  it('a rotation delivered to a guest never POSTs', async () => {
    const { device, transport, engine } = rig({ canRegister: () => false });
    device.permission = fixtureGranted;
    await engine.init();

    device.emitTokenRotation('ExponentPushToken[rotated-guest]');
    await flush();

    expect(transport.calls).toEqual([]);
    expect(engine.registration.get().phase).toBe('idle');
  });
});


describe('createNotifyEngine validation', () => {
  it('an invalid channel spec dies at build time, offending config named', () => {
    const build = (channels: ChannelSpec[]) =>
      createNotifyEngine({
        transport: createFakeTransport(),
        device: createFakeDevice(),
        storage: createMemoryStorage(),
        channels,
        presentation: PRESENTATION,
        language: () => 'lt',
      });

    expect(() => build([{ id: 'Default:V1', nameKey: 'default', importance: 3 }])).toThrow(
      'Channel id "Default:V1" is invalid — allowed charset is [a-z0-9.]',
    );
    expect(() => build([{ id: 'news.v1', nameKey: 'news', importance: 3 }])).toThrow(
      'Channel registry needs the guaranteed default channel (nameKey "default")',
    );
  });
});

describe('the telemetry lane', () => {
  it("a device handler error surfaces through onError as scope 'foreground'", async () => {
    const device = createFakeDevice();
    const transport = createFakeTransport();
    const storage = createMemoryStorage();
    const reports: { scope: string; error: unknown }[] = [];
    const engine = createNotifyEngine({
      transport,
      device,
      storage,
      channels: CHANNELS,
      presentation: PRESENTATION,
      language: () => 'lt',
      onError: (scope, error) => reports.push({ scope, error }),
    });
    await engine.init();

    device.emitHandleError(new Error('handler blew up'));
    expect(reports).toHaveLength(1);
    expect(reports[0].scope).toBe('foreground');
    expect((reports[0].error as Error).message).toBe('handler blew up');
    engine.dispose();
  });
});
