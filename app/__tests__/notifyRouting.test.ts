// -----------------------------------------------------------
//  [*] Tests — services/notifyRouting map and launch gate
//
//  Every branch of the one routing map, both wake modes: a
//  cold start replaces the startup gate, a warm tap dismisses
//  to the messages tab (chat) or navigates (tabs); a chat type
//  without a conversationId and any unknown or empty type
//  return false without touching the router.
//
//  The launch gate, over a fresh module per test (its state is
//  module-level) and fake timers: settle releases every waiter
//  and is idempotent, a waiter after settle resolves at once
//  with no timer, the fallback resolves a waiter after its
//  timeout (5 s by default) without any settle, and a settle
//  that arrives after the timeout is harmless.
// -----------------------------------------------------------

import { routeNotificationIntent, type NotifyRouter } from '@/services/notifyRouting';

import type { RouteIntent } from '@knf/notifyengine';


const intent = (type: string, data: Record<string, string> = {}, coldStart = false): RouteIntent => ({
  type,
  data,
  coldStart,
  actionId: null,
});

const makeRouter = () => ({
  replace: jest.fn(),
  push: jest.fn(),
  navigate: jest.fn(),
  dismissTo: jest.fn(),
});

const callCount = (router: ReturnType<typeof makeRouter>) =>
  router.replace.mock.calls.length +
  router.push.mock.calls.length +
  router.navigate.mock.calls.length +
  router.dismissTo.mock.calls.length;

const CHAT_ROOM = { pathname: '/(main)/chat-room', params: { conversationId: 'c1', title: '' } };


describe('chat_message / chat_mention', () => {
  it.each(['chat_message', 'chat_mention'])('%s warm: dismissTo messages, then push the room', (type) => {
    const router = makeRouter();

    expect(routeNotificationIntent(intent(type, { conversationId: 'c1' }), router as NotifyRouter)).toBe(true);

    expect(router.dismissTo).toHaveBeenCalledWith('/(main)/tabs/messages');
    expect(router.push).toHaveBeenCalledWith(CHAT_ROOM);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    // The tab collapse must land BEFORE the room push
    expect(router.dismissTo.mock.invocationCallOrder[0]).toBeLessThan(router.push.mock.invocationCallOrder[0]);
  });

  it.each(['chat_message', 'chat_mention'])('%s cold: replace with messages, then push the room', (type) => {
    const router = makeRouter();

    expect(routeNotificationIntent(intent(type, { conversationId: 'c1' }, true), router as NotifyRouter)).toBe(true);

    expect(router.replace).toHaveBeenCalledWith('/(main)/tabs/messages');
    expect(router.push).toHaveBeenCalledWith(CHAT_ROOM);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.replace.mock.invocationCallOrder[0]).toBeLessThan(router.push.mock.invocationCallOrder[0]);
  });

  it('a chat type without a conversationId routes nowhere', () => {
    const router = makeRouter();

    expect(routeNotificationIntent(intent('chat_message'), router as NotifyRouter)).toBe(false);
    expect(routeNotificationIntent(intent('chat_mention', { conversationId: '' }, true), router as NotifyRouter)).toBe(false);
    expect(callCount(router)).toBe(0);
  });
});


describe('news / admin_announcement', () => {
  it.each(['news', 'admin_announcement'])('%s warm: navigate to the news tab', (type) => {
    const router = makeRouter();

    expect(routeNotificationIntent(intent(type, { postId: 'n1' }), router as NotifyRouter)).toBe(true);

    expect(router.navigate).toHaveBeenCalledWith('/(main)/tabs/news');
    expect(callCount(router)).toBe(1);
  });

  it.each(['news', 'admin_announcement'])('%s cold: replace with the news tab', (type) => {
    const router = makeRouter();

    expect(routeNotificationIntent(intent(type, {}, true), router as NotifyRouter)).toBe(true);

    expect(router.replace).toHaveBeenCalledWith('/(main)/tabs/news');
    expect(callCount(router)).toBe(1);
  });
});


describe('schedule_update', () => {
  it('warm: navigate to the schedule tab', () => {
    const router = makeRouter();

    expect(routeNotificationIntent(intent('schedule_update'), router as NotifyRouter)).toBe(true);

    expect(router.navigate).toHaveBeenCalledWith('/(main)/tabs/schedule');
    expect(callCount(router)).toBe(1);
  });

  it('cold: replace with the schedule tab', () => {
    const router = makeRouter();

    expect(routeNotificationIntent(intent('schedule_update', {}, true), router as NotifyRouter)).toBe(true);

    expect(router.replace).toHaveBeenCalledWith('/(main)/tabs/schedule');
    expect(callCount(router)).toBe(1);
  });
});


describe('everything else', () => {
  it.each(['', 'unknown_type', 'CHAT_MESSAGE', 'friend_request'])('type %p returns false with zero router calls', (type) => {
    const router = makeRouter();

    expect(routeNotificationIntent(intent(type, { conversationId: 'c1' }), router as NotifyRouter)).toBe(false);
    expect(routeNotificationIntent(intent(type, { conversationId: 'c1' }, true), router as NotifyRouter)).toBe(false);
    expect(callCount(router)).toBe(0);
  });
});


describe('the launch gate', () => {
  type Gate = Pick<typeof import('@/services/notifyRouting'), 'settleLaunchRouting' | 'launchRoutingSettled'>;
  let gate: Gate;

  // Module-level state — a fresh registry per test; fake timers
  // drive the fallback without waiting the real seconds
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    gate = jest.requireActual<Gate>('@/services/notifyRouting');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Whether a promise has resolved, read after the microtasks
  // it queued had their turn
  const settledFlag = (promise: Promise<void>) => {
    let done = false;
    void promise.then(() => {
      done = true;
    });
    return () => done;
  };
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('a waiter stays pending until settle, then resolves — every waiter at once', async () => {
    const first = settledFlag(gate.launchRoutingSettled());
    const second = settledFlag(gate.launchRoutingSettled());
    await flush();
    expect(first()).toBe(false);
    expect(second()).toBe(false);

    gate.settleLaunchRouting();
    await flush();

    expect(first()).toBe(true);
    expect(second()).toBe(true);
    // The fallback timers went with the waiters — nothing ticks
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a waiter after settle resolves at once and starts no timer', async () => {
    gate.settleLaunchRouting();

    const late = settledFlag(gate.launchRoutingSettled());
    expect(jest.getTimerCount()).toBe(0);
    await flush();

    expect(late()).toBe(true);
  });

  it('settle is idempotent — repeated calls neither throw nor re-arm anything', async () => {
    const waiter = settledFlag(gate.launchRoutingSettled());

    gate.settleLaunchRouting();
    gate.settleLaunchRouting();
    expect(() => gate.settleLaunchRouting()).not.toThrow();
    await flush();

    expect(waiter()).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('the fallback resolves a waiter after 5 s by default when nothing ever settles', async () => {
    const waiter = settledFlag(gate.launchRoutingSettled());

    jest.advanceTimersByTime(4_999);
    await flush();
    expect(waiter()).toBe(false);

    jest.advanceTimersByTime(1);
    await flush();
    expect(waiter()).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a custom timeout is honoured per call, and a later waiter still waits its own', async () => {
    const short = settledFlag(gate.launchRoutingSettled(100));
    const long = settledFlag(gate.launchRoutingSettled(1_000));

    jest.advanceTimersByTime(100);
    await flush();
    expect(short()).toBe(true);
    expect(long()).toBe(false);

    jest.advanceTimersByTime(900);
    await flush();
    expect(long()).toBe(true);
  });

  it('a settle after the timeout already released the waiter is harmless', async () => {
    const timedOut = settledFlag(gate.launchRoutingSettled(50));
    jest.advanceTimersByTime(50);
    await flush();
    expect(timedOut()).toBe(true);

    expect(() => gate.settleLaunchRouting()).not.toThrow();

    // And the gate is open from here on
    const after = settledFlag(gate.launchRoutingSettled());
    expect(jest.getTimerCount()).toBe(0);
    await flush();
    expect(after()).toBe(true);
  });

  it('the gate is module-scoped — a fresh module starts closed again', async () => {
    gate.settleLaunchRouting();

    jest.resetModules();
    const fresh = jest.requireActual<Gate>('@/services/notifyRouting');
    const waiter = settledFlag(fresh.launchRoutingSettled());
    await flush();

    expect(waiter()).toBe(false);
    expect(jest.getTimerCount()).toBe(1);
  });
});
