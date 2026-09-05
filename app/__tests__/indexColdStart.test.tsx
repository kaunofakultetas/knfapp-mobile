// -----------------------------------------------------------
//  [*] Tests — app/index.tsx cold-start routing
//
//  The entry redirect's decision table with the notify engine
//  in the loop: nothing moves until hydration AND the onboarded
//  read are in; a first-run guest goes to login and the launch
//  response is consumed but DISCARDED — never routed; everyone
//  else consumes it exactly once and either routes the tap
//  through the app's map or falls back to the news tab — also
//  when the map declines or the consume fails; a dependency
//  change mid-consume routes the already-consumed intent once
//  without asking the engine again; an unmount mid-consume
//  cancels the redirect instead of navigating over whatever
//  replaced this screen. Every branch that navigates settles
//  the launch gate exactly once, AFTER its navigation; the
//  unmounted run leaves the gate to its own timeout.
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';

import type { RouteIntent } from '@knf/notifyengine';

import type { NotifyRouter } from '@/services/notifyRouting';

// Relative on purpose: under jest the '@/' mapper resolves
// exactly '@/app/index' to app.json, not to the screen
import IndexScreen from '../app/index';


jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ colors: { onBrand: '#FFFFFF' }, scheme: 'light' }) }));

const mockRouter = { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockAuth = { isAuthenticated: false, hydrated: true };
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mockAuth.isAuthenticated, hydrated: mockAuth.hydrated }),
}));

// Only the routing hub's consume is reached from this screen
const mockConsume = jest.fn<Promise<RouteIntent | null>, []>(async () => null);
jest.mock('@/services/notifyEngine', () => ({
  notifyEngine: { routing: { consumeInitial: () => mockConsume() } },
}));

// The map and the launch gate's settle side — the gate's
// waiting side belongs to the host and is not reached here
const mockRoute = jest.fn<boolean, [RouteIntent, NotifyRouter]>(() => true);
const mockSettle = jest.fn();
jest.mock('@/services/notifyRouting', () => ({
  routeNotificationIntent: (...args: [RouteIntent, NotifyRouter]) => mockRoute(...args),
  settleLaunchRouting: () => mockSettle(),
}));


const NEWS = '/(main)/tabs/news';

const coldTap: RouteIntent = {
  type: 'chat_message',
  data: { conversationId: 'c1' },
  coldStart: true,
  actionId: null,
};

const routerCalls = () =>
  mockRouter.replace.mock.calls.length +
  mockRouter.push.mock.calls.length +
  mockRouter.navigate.mock.calls.length +
  mockRouter.dismissTo.mock.calls.length;

// jest.fn keeps one global invocation counter, so "settled
// after navigating" is an order check between the two mocks
const settledAfter = (navigation: jest.Mock) =>
  mockSettle.mock.invocationCallOrder[0] > navigation.mock.invocationCallOrder[0];

// A macrotask boundary drains the storage read and the consume
// chain — the negative assertions rely on it
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

// A consume the test resolves by hand, for the mid-flight cases
const heldConsume = (): ((intent: RouteIntent | null) => void) => {
  let deliver: (intent: RouteIntent | null) => void = () => undefined;
  mockConsume.mockImplementation(
    () =>
      new Promise<RouteIntent | null>((resolve) => {
        deliver = resolve;
      }),
  );
  return (intent) => deliver(intent);
};


beforeEach(async () => {
  await AsyncStorage.clear();
  mockAuth.isAuthenticated = false;
  mockAuth.hydrated = true;
  mockConsume.mockReset();
  mockConsume.mockImplementation(async () => null);
  mockRoute.mockReset();
  mockRoute.mockImplementation(() => true);
  mockSettle.mockClear();
  for (const fn of Object.values(mockRouter)) fn.mockClear();
});


describe('the gates', () => {
  it('decides nothing until the session is hydrated', async () => {
    await AsyncStorage.setItem('onboarded', '1');
    mockAuth.hydrated = false;

    const { rerender } = await render(<IndexScreen />);
    await settle();
    expect(routerCalls()).toBe(0);
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();

    mockAuth.hydrated = true;
    await rerender(<IndexScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(NEWS));
  });

  it('sends a first-run guest to login, consuming the launch response WITHOUT routing it', async () => {
    mockConsume.mockImplementation(async () => coldTap);

    await render(<IndexScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/login'));
    await settle();
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockRoute).not.toHaveBeenCalled();
    expect(routerCalls()).toBe(1);
  });

  it('settles the launch gate for a first-run guest once the discard is done, after the redirect', async () => {
    const deliver = heldConsume();

    await render(<IndexScreen />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/login'));
    await settle();
    expect(mockSettle).not.toHaveBeenCalled();

    await act(async () => {
      deliver(coldTap);
    });

    await waitFor(() => expect(mockSettle).toHaveBeenCalledTimes(1));
    expect(settledAfter(mockRouter.replace)).toBe(true);
    expect(mockRoute).not.toHaveBeenCalled();
  });

  it('lets a signed-in user through even without the onboarded flag', async () => {
    mockAuth.isAuthenticated = true;

    await render(<IndexScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(NEWS));
    expect(mockConsume).toHaveBeenCalledTimes(1);
  });
});


describe('the landing decision', () => {
  beforeEach(async () => {
    await AsyncStorage.setItem('onboarded', '1');
  });

  it('a returning guest with no tap lands on news, then settles the gate', async () => {
    await render(<IndexScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(NEWS));
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockRoute).not.toHaveBeenCalled();
    expect(routerCalls()).toBe(1);
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(settledAfter(mockRouter.replace)).toBe(true);
  });

  it('a launch tap picks the screen through the app map, with the router, then settles the gate', async () => {
    mockAuth.isAuthenticated = true;
    mockConsume.mockImplementation(async () => coldTap);

    await render(<IndexScreen />);

    await waitFor(() => expect(mockRoute).toHaveBeenCalledWith(coldTap, mockRouter));
    await settle();
    // The map navigated — the default route must not follow
    expect(mockRouter.replace).not.toHaveBeenCalledWith(NEWS);
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(settledAfter(mockRoute)).toBe(true);
  });

  it('a tap the map declines falls back to news, then settles the gate', async () => {
    mockConsume.mockImplementation(async () => ({ ...coldTap, type: 'unknown_type' }));
    mockRoute.mockImplementation(() => false);

    await render(<IndexScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(NEWS));
    expect(mockRoute).toHaveBeenCalledTimes(1);
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(settledAfter(mockRouter.replace)).toBe(true);
  });

  it('a failing consume falls back to news, then settles the gate', async () => {
    mockConsume.mockImplementation(async () => {
      throw new Error('no native module');
    });

    await render(<IndexScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(NEWS));
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(settledAfter(mockRouter.replace)).toBe(true);
  });

  it('a dependency change mid-consume routes the already-consumed tap once, without a second consume', async () => {
    // The /me 401 window: the session expires while the consume
    // is in flight. The intent was already handed out by the
    // engine, so the re-run must route THAT one — not ask again
    // and get null
    mockAuth.isAuthenticated = true;
    const deliver = heldConsume();

    const { rerender } = await render(<IndexScreen />);
    await waitFor(() => expect(mockConsume).toHaveBeenCalledTimes(1));

    mockAuth.isAuthenticated = false;
    await rerender(<IndexScreen />);
    await settle();
    expect(mockConsume).toHaveBeenCalledTimes(1);

    await act(async () => {
      deliver(coldTap);
    });

    await waitFor(() => expect(mockRoute).toHaveBeenCalledWith(coldTap, mockRouter));
    await settle();
    expect(mockRoute).toHaveBeenCalledTimes(1);
    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalledWith(NEWS);
    expect(mockSettle).toHaveBeenCalledTimes(1);
  });

  it('an unmount mid-consume cancels the redirect and leaves the gate to its timeout', async () => {
    const deliver = heldConsume();

    const { unmount } = await render(<IndexScreen />);
    await waitFor(() => expect(mockConsume).toHaveBeenCalledTimes(1));

    await unmount();
    await act(async () => {
      deliver(coldTap);
    });
    await settle();

    expect(mockRoute).not.toHaveBeenCalled();
    expect(routerCalls()).toBe(0);
    expect(mockSettle).not.toHaveBeenCalled();
  });
});
