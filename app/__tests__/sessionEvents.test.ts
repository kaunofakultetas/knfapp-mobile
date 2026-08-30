// -----------------------------------------------------------
//  [*] Tests — session-events channel
//
//  The invalidation channel between client.ts and AuthContext:
//  subscribers fire on emit, unsubscribe really detaches, and
//  one throwing subscriber cannot starve the rest — the
//  guarantee session teardown depends on.
// -----------------------------------------------------------

import { emitSessionInvalid, onSessionInvalid } from '@/services/api/session-events';


describe('session events', () => {
  it('notifies every subscriber on emit', () => {
    const a = jest.fn();
    const b = jest.fn();
    const offA = onSessionInvalid(a);
    const offB = onSessionInvalid(b);

    emitSessionInvalid();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    offB();
  });

  it('stops notifying after unsubscribe', () => {
    const cb = jest.fn();
    const off = onSessionInvalid(cb);
    off();

    emitSessionInvalid();
    expect(cb).not.toHaveBeenCalled();
  });

  it('isolates a throwing subscriber from the rest', () => {
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    const offBad = onSessionInvalid(bad);
    const offGood = onSessionInvalid(good);

    expect(() => emitSessionInvalid()).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);

    offBad();
    offGood();
  });
});
