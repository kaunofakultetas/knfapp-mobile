// -----------------------------------------------------------
//  [*] Tests — components/notify/NotifyEngineHost
//
//  The root host's duties, pinned against the engine stub:
//  readiness is kicked on mount whatever else is pending; the
//  resolver is installed only AFTER the launch gate resolves
//  (not before — a pending gate leaves the routing buffer to
//  the cold-start consume), regardless of readiness, again on
//  a router identity change, and routes through the app's one
//  map with the router; the engine is never disposed; the
//  channel names are applied in the active language after
//  readiness and again on a language switch; a SWITCH — never
//  the first run — re-registers only for a signed-in user with
//  the master switch on; a permission grant registers once,
//  after readiness, only for a signed-in, master-on, not-yet-
//  registered user, never after unmount — and the startup
//  poll's 'unknown' → anything transition is a READ, never a
//  grant.
// -----------------------------------------------------------

import { act, render, waitFor } from '@testing-library/react-native';

import type { NotifyEngine, RouteIntent } from '@knf/notifyengine';
import type { createNotifyEngineStub } from '@knf/notifyengine/testing';

import NotifyEngineHost from '@/components/notify/NotifyEngineHost';
import { notifyEngine, readyNotifyEngine } from '@/services/notifyEngine';
import type { NotifyRouter } from '@/services/notifyRouting';


// The real services/notifyEngine is loaded for its channel-name
// mapping — these keep its module-level singleton off the
// device, the wire and the app's storage
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} }, executionEnvironment: 'bare' },
}));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { language: 'lt' } }));
jest.mock('@/services/session', () => ({ getStoredToken: async () => null }));
jest.mock('@/services/notifyTransport', () => ({
  notifyTransport: jest.requireActual('@knf/notifyengine/testing').createFakeTransport(),
}));

const mockLogError = jest.fn();
jest.mock('@/services/log', () => ({ logError: (...args: unknown[]) => mockLogError(...args) }));

// The stub stands in for the singleton; readiness resolves to
// it by default and is re-scripted per test; the channel-name
// mapping is the REAL one, so a drift there fails here too
jest.mock('@/services/notifyEngine', () => {
  const stub = jest.requireActual('@knf/notifyengine/testing').createNotifyEngineStub();
  return {
    notifyEngine: stub,
    readyNotifyEngine: jest.fn(async () => stub),
    notifyChannelNames: jest.requireActual('@/services/notifyEngine').notifyChannelNames,
  };
});

// The launch gate is scripted per test: settled by default,
// held open by holdGate() to prove the resolver waits for it
const mockRoute = jest.fn<boolean, [RouteIntent, NotifyRouter]>(() => true);
const mockGate = { promise: Promise.resolve() };
const mockSettled = jest.fn(() => mockGate.promise);
jest.mock('@/services/notifyRouting', () => ({
  routeNotificationIntent: (...args: [RouteIntent, NotifyRouter]) => mockRoute(...args),
  launchRoutingSettled: () => mockSettled(),
}));

// useRouter hands back whichever router is active, so a test
// can swap the identity and rerender to drive the router dep
const mockRouter = { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() };
const mockActive = { router: mockRouter };
jest.mock('expo-router', () => ({ useRouter: () => mockActive.router }));

const mockAuth = { isAuthenticated: false };
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockAuth.isAuthenticated }),
}));

// `t` is one stable function on purpose — the real hook keeps
// its identity between renders and re-binds only on a language
// event, and the host's effect keys off exactly that
const mockI18n = { language: 'lt' };
const mockT = (key: string) => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: mockI18n }) }));


type Stub = ReturnType<typeof createNotifyEngineStub>;
const stub = notifyEngine as unknown as Stub;
const mockReady = readyNotifyEngine as jest.MockedFunction<typeof readyNotifyEngine>;
const asEngine = (value: Stub): NotifyEngine => value as unknown as NotifyEngine;

const CHANNEL_NAMES = { default: 'settings.notifications' };
const UNKNOWN = { status: 'unknown' as const, canAskAgain: false, canDeliver: false };
const DENIED = { status: 'denied' as const, canAskAgain: false, canDeliver: false };
const GRANTED = { status: 'granted' as const, canAskAgain: true, canDeliver: true };

const intent = (type: string, data: Record<string, string> = {}): RouteIntent => ({
  type,
  data,
  coldStart: false,
  actionId: null,
});

const callsOf = (method: string) => stub.calls.filter((call) => call.method === method);
const registersFor = (reason: string) => callsOf('register').filter((call) => call.args[0] === reason);
const resolverAt = (index: number) => callsOf('setResolver')[index]?.args[0] as ((next: RouteIntent) => void) | undefined;
const installedResolver = () => resolverAt(0);

// A macrotask boundary drains every microtask the async effect
// chains queue — the negative assertions below rely on it
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const grantPermission = () =>
  act(async () => {
    stub.permission.set(GRANTED);
  });

const denyPermission = () =>
  act(async () => {
    stub.permission.set(DENIED);
  });

// Replaces the settled default with a gate the test opens by
// hand; returns the opener
const holdGate = (): (() => void) => {
  let open: () => void = () => undefined;
  mockGate.promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return open;
};

const openGate = (open: () => void) =>
  act(async () => {
    open();
  });


beforeEach(() => {
  stub.calls.length = 0;
  stub.permission.set(GRANTED);
  stub.registration.set({ phase: 'idle', token: null, lastError: null, registeredAt: null });
  stub.prefs.set({
    masterEnabled: true,
    channels: { news: true, chat: true, schedule: true, admin: true },
    chatPreview: true,
    syncState: 'fresh',
  });
  mockReady.mockReset();
  mockReady.mockImplementation(async () => asEngine(stub));
  mockRoute.mockReset();
  mockRoute.mockImplementation(() => true);
  mockGate.promise = Promise.resolve();
  mockSettled.mockClear();
  mockLogError.mockClear();
  mockAuth.isAuthenticated = false;
  mockI18n.language = 'lt';
  mockActive.router = mockRouter;
  for (const fn of Object.values(mockRouter)) fn.mockClear();
});


describe('readiness', () => {
  it('is kicked on mount, even while the launch gate is still open', async () => {
    holdGate();

    await render(<NotifyEngineHost />);

    expect(mockReady).toHaveBeenCalled();
    expect(callsOf('setResolver')).toHaveLength(0);
  });
});


describe('the resolver', () => {
  it('is NOT installed while the launch gate is open, and goes in right after it settles', async () => {
    const open = holdGate();

    await render(<NotifyEngineHost />);
    await settle();
    expect(mockSettled).toHaveBeenCalledTimes(1);
    expect(callsOf('setResolver')).toHaveLength(0);

    await openGate(open);

    await waitFor(() => expect(callsOf('setResolver')).toHaveLength(1));
    expect(typeof installedResolver()).toBe('function');
  });

  it('does not wait for readiness — a settled gate is enough', async () => {
    mockReady.mockImplementation(() => new Promise<NotifyEngine>(() => {}));

    await render(<NotifyEngineHost />);

    await waitFor(() => expect(callsOf('setResolver')).toHaveLength(1));
    expect(mockReady).toHaveBeenCalled();
  });

  it('routes every intent through the app map with the router', async () => {
    await render(<NotifyEngineHost />);
    await waitFor(() => expect(callsOf('setResolver')).toHaveLength(1));
    const tap = intent('chat_message', { conversationId: 'c1' });

    installedResolver()?.(tap);

    expect(mockRoute).toHaveBeenCalledTimes(1);
    expect(mockRoute).toHaveBeenCalledWith(tap, mockRouter);
  });

  it('is re-installed with the new router when the router identity changes', async () => {
    const { rerender } = await render(<NotifyEngineHost />);
    await waitFor(() => expect(callsOf('setResolver')).toHaveLength(1));

    const nextRouter = { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() };
    mockActive.router = nextRouter;
    await rerender(<NotifyEngineHost />);

    await waitFor(() => expect(callsOf('setResolver')).toHaveLength(2));
    const tap = intent('news');
    resolverAt(1)?.(tap);
    expect(mockRoute).toHaveBeenCalledWith(tap, nextRouter);
  });

  it('waits for the gate again on a router change made while it is still open', async () => {
    const open = holdGate();
    const { rerender } = await render(<NotifyEngineHost />);
    await settle();

    const nextRouter = { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() };
    mockActive.router = nextRouter;
    await rerender(<NotifyEngineHost />);
    await settle();
    expect(callsOf('setResolver')).toHaveLength(0);

    await openGate(open);

    // The superseded run installs nothing — only the router
    // that is actually rendered gets the hub
    await waitFor(() => expect(callsOf('setResolver')).toHaveLength(1));
    await settle();
    expect(callsOf('setResolver')).toHaveLength(1);
    const tap = intent('news');
    installedResolver()?.(tap);
    expect(mockRoute).toHaveBeenCalledWith(tap, nextRouter);
  });

  it('is not installed by a run that unmounted before the gate settled', async () => {
    const open = holdGate();
    const { unmount } = await render(<NotifyEngineHost />);
    await settle();

    await unmount();
    await openGate(open);
    await settle();

    expect(callsOf('setResolver')).toHaveLength(0);
  });

  it('leaves the singleton alive on unmount — no dispose, resolver still in place', async () => {
    const { unmount } = await render(<NotifyEngineHost />);
    await waitFor(() => expect(callsOf('setResolver')).toHaveLength(1));
    await settle();

    await unmount();
    await settle();

    expect(callsOf('dispose')).toHaveLength(0);
    expect(callsOf('setResolver')).toHaveLength(1);
  });
});


describe('channel names', () => {
  it('are applied in the active language once readiness settles, with the real mapping', async () => {
    await render(<NotifyEngineHost />);

    await waitFor(() => expect(callsOf('applyChannels')).toHaveLength(1));
    expect(callsOf('applyChannels')[0].args).toEqual([CHANNEL_NAMES]);
  });

  it('wait for readiness — nothing is applied while init is still pending', async () => {
    mockReady.mockImplementation(() => new Promise<NotifyEngine>(() => {}));

    await render(<NotifyEngineHost />);
    await settle();

    expect(callsOf('applyChannels')).toHaveLength(0);
  });

  it('are re-applied on a language switch', async () => {
    const { rerender } = await render(<NotifyEngineHost />);
    await waitFor(() => expect(callsOf('applyChannels')).toHaveLength(1));

    mockI18n.language = 'en';
    await rerender(<NotifyEngineHost />);

    await waitFor(() => expect(callsOf('applyChannels')).toHaveLength(2));
    expect(callsOf('applyChannels')[1].args).toEqual([CHANNEL_NAMES]);
  });

  it('are not re-applied by a re-render that changes nothing', async () => {
    const { rerender } = await render(<NotifyEngineHost />);
    await waitFor(() => expect(callsOf('applyChannels')).toHaveLength(1));

    await rerender(<NotifyEngineHost />);
    await settle();

    expect(callsOf('applyChannels')).toHaveLength(1);
  });

  it('log a failed apply instead of throwing', async () => {
    const failure = new Error('channel exploded');
    const spy = jest.spyOn(stub, 'applyChannels').mockRejectedValueOnce(failure);
    try {
      await render(<NotifyEngineHost />);
      await waitFor(() => expect(mockLogError).toHaveBeenCalledWith('notify:language', failure));
    } finally {
      spy.mockRestore();
    }
  });
});


describe('language-switch re-registration', () => {
  const switchLanguage = async () => {
    const { rerender } = await render(<NotifyEngineHost />);
    await waitFor(() => expect(callsOf('applyChannels')).toHaveLength(1));
    await settle();

    mockI18n.language = 'en';
    await rerender(<NotifyEngineHost />);
    await waitFor(() => expect(callsOf('applyChannels')).toHaveLength(2));
    await settle();
  };

  it("fires register('language') for a signed-in user with the master switch on", async () => {
    mockAuth.isAuthenticated = true;

    await switchLanguage();

    expect(registersFor('language')).toHaveLength(1);
    expect(callsOf('register')).toHaveLength(1);
  });

  it('never registers on the FIRST run, even signed in with the master on', async () => {
    mockAuth.isAuthenticated = true;

    await render(<NotifyEngineHost />);
    await waitFor(() => expect(callsOf('applyChannels')).toHaveLength(1));
    await settle();

    expect(callsOf('register')).toHaveLength(0);
  });

  it('skips the register for a guest', async () => {
    mockAuth.isAuthenticated = false;

    await switchLanguage();

    expect(callsOf('register')).toHaveLength(0);
  });

  it('skips the register when the master switch is off', async () => {
    mockAuth.isAuthenticated = true;
    stub.prefs.set({ ...stub.prefs.get(), masterEnabled: false });

    await switchLanguage();

    expect(callsOf('register')).toHaveLength(0);
  });

  it('applies the names even when the register itself rejects, and logs it', async () => {
    mockAuth.isAuthenticated = true;
    const failure = new Error('wire down');
    const spy = jest.spyOn(stub, 'register').mockRejectedValueOnce(failure);
    try {
      await switchLanguage();

      expect(callsOf('applyChannels')).toHaveLength(2);
      expect(mockLogError).toHaveBeenCalledWith('notify:language', failure);
    } finally {
      spy.mockRestore();
    }
  });
});


describe('permission grant', () => {
  it("registers once with 'restore' for a signed-in, master-on, unregistered user", async () => {
    mockAuth.isAuthenticated = true;
    stub.permission.set(DENIED);
    await render(<NotifyEngineHost />);
    await settle();

    await grantPermission();

    await waitFor(() => expect(registersFor('restore')).toHaveLength(1));

    // A later snapshot that keeps canDeliver true is not a new
    // edge — only the flip registers
    await act(async () => {
      stub.permission.set({ ...GRANTED, canAskAgain: false });
    });
    await settle();
    expect(registersFor('restore')).toHaveLength(1);
  });

  it('waits for readiness before the register goes out', async () => {
    mockAuth.isAuthenticated = true;
    stub.permission.set(DENIED);
    let becomeReady: ((engine: NotifyEngine) => void) | null = null;
    mockReady.mockImplementation(
      () =>
        new Promise<NotifyEngine>((resolve) => {
          becomeReady = resolve;
        }),
    );
    await render(<NotifyEngineHost />);
    await settle();

    await grantPermission();
    await settle();
    expect(registersFor('restore')).toHaveLength(0);

    await act(async () => {
      becomeReady?.(asEngine(stub));
    });

    await waitFor(() => expect(registersFor('restore')).toHaveLength(1));
  });

  it('does nothing for a guest', async () => {
    mockAuth.isAuthenticated = false;
    stub.permission.set(DENIED);
    await render(<NotifyEngineHost />);
    await settle();

    await grantPermission();
    await settle();

    expect(callsOf('register')).toHaveLength(0);
  });

  it('does nothing when the master switch is off', async () => {
    mockAuth.isAuthenticated = true;
    stub.prefs.set({ ...stub.prefs.get(), masterEnabled: false });
    stub.permission.set(DENIED);
    await render(<NotifyEngineHost />);
    await settle();

    await grantPermission();
    await settle();

    expect(callsOf('register')).toHaveLength(0);
  });

  it('does nothing when a token is already registered', async () => {
    mockAuth.isAuthenticated = true;
    stub.registration.set({ phase: 'registered', token: 'ExponentPushToken[x]', lastError: null, registeredAt: 1 });
    stub.permission.set(DENIED);
    await render(<NotifyEngineHost />);
    await settle();

    await grantPermission();
    await settle();

    expect(callsOf('register')).toHaveLength(0);
  });

  it('treats the replayed current value as no edge', async () => {
    // subscribe fires immediately with GRANTED — the seed was
    // already GRANTED, so nothing was granted just now
    mockAuth.isAuthenticated = true;
    await render(<NotifyEngineHost />);
    await settle();

    expect(callsOf('register')).toHaveLength(0);
  });

  it("treats the startup poll's 'unknown' → granted as a read, not a grant", async () => {
    // The store starts at 'unknown' on every cold start; init's
    // first poll turning it into GRANTED is the OS telling us
    // what it already had — a restored session registers via
    // AuthContext after /me, never from here
    mockAuth.isAuthenticated = true;
    stub.permission.set(UNKNOWN);
    await render(<NotifyEngineHost />);
    await settle();

    await grantPermission();
    await settle();

    expect(callsOf('register')).toHaveLength(0);
  });

  it("registers on a real denied → granted edge after the 'unknown' read", async () => {
    mockAuth.isAuthenticated = true;
    stub.permission.set(UNKNOWN);
    await render(<NotifyEngineHost />);
    await settle();

    await grantPermission();
    await settle();
    expect(callsOf('register')).toHaveLength(0);

    await denyPermission();
    await grantPermission();

    await waitFor(() => expect(registersFor('restore')).toHaveLength(1));
    expect(callsOf('register')).toHaveLength(1);
  });

  it("does not treat 'unknown' → denied → granted's first step as a baseline grant either", async () => {
    // The first real read may itself be DENIED (a fresh install
    // that refused the prompt); the later grant from the
    // settings deep-link is the one true edge
    mockAuth.isAuthenticated = true;
    stub.permission.set(UNKNOWN);
    await render(<NotifyEngineHost />);
    await settle();

    await denyPermission();
    await settle();
    expect(callsOf('register')).toHaveLength(0);

    await grantPermission();

    await waitFor(() => expect(registersFor('restore')).toHaveLength(1));
  });

  it('reads auth at grant time — a login after mount counts', async () => {
    mockAuth.isAuthenticated = false;
    stub.permission.set(DENIED);
    const { rerender } = await render(<NotifyEngineHost />);
    await settle();

    mockAuth.isAuthenticated = true;
    await rerender(<NotifyEngineHost />);
    await grantPermission();

    await waitFor(() => expect(registersFor('restore')).toHaveLength(1));
  });

  it('stops listening after unmount', async () => {
    mockAuth.isAuthenticated = true;
    stub.permission.set(DENIED);
    const { unmount } = await render(<NotifyEngineHost />);
    await settle();

    await unmount();
    await grantPermission();
    await settle();

    expect(callsOf('register')).toHaveLength(0);
  });
});
