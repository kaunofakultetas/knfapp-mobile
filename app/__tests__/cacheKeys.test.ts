// -----------------------------------------------------------
//  [*] Tests — cache key scoping and the wipe fence
//
//  The privacy contract behind the cache: every viewer-
//  specific dataset gets its own key (one account's private
//  rows must never surface for the next), and cacheClearAll
//  bumps cacheEpoch FIRST so an in-flight writer that started
//  before the wipe can see it happened.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import * as cache from '@/services/cache';


describe('cache key builders', () => {
  it('scopes the news feed per account, guests included', () => {
    const anna = cache.cacheKeyNews('user-anna');
    const bob = cache.cacheKeyNews('user-bob');
    const guest = cache.cacheKeyNews('guest');
    expect(new Set([anna, bob, guest]).size).toBe(3);
  });

  it('scopes conversation previews per account', () => {
    expect(cache.cacheKeyConversations('u1')).not.toBe(cache.cacheKeyConversations('u2'));
  });

  it('keeps filtered schedule variants distinct from the unfiltered one', () => {
    const plain = cache.cacheKeySchedule(1);
    const grouped = cache.cacheKeySchedule(1, 'IF-23');
    const semestered = cache.cacheKeySchedule(1, 'IF-23', '2026-ruduo');
    expect(new Set([plain, grouped, semestered]).size).toBe(3);
    // '' and null both mean "no filter" — the same variant
    expect(cache.cacheKeySchedule(2, '', null)).toBe(cache.cacheKeySchedule(2, null, ''));
  });

  it('separates info pages per language', () => {
    expect(cache.cacheKeyInfo('lt')).not.toBe(cache.cacheKeyInfo('en'));
  });
});


describe('cacheEpoch wipe fence', () => {
  it('bumps on every cacheClearAll', async () => {
    const before = cache.cacheEpoch;
    await cache.cacheClearAll();
    expect(cache.cacheEpoch).toBe(before + 1);
    await cache.cacheClearAll();
    expect(cache.cacheEpoch).toBe(before + 2);
  });

  it('lets an in-flight writer detect a wipe that happened mid-write', async () => {
    // The pattern useFeed uses: capture the epoch before the
    // fetch, compare after — a mismatch means the write must
    // be dropped
    const captured = cache.cacheEpoch;
    await cache.cacheClearAll();
    expect(cache.cacheEpoch).not.toBe(captured);
  });

  it('round-trips values across a wipe only for writes after it', async () => {
    await cache.cacheSet('epoch-probe', { value: 1 });
    await cache.cacheClearAll();
    expect(await cache.cacheGet('epoch-probe', 60_000)).toBeNull();

    await cache.cacheSet('epoch-probe', { value: 2 });
    const hit = await cache.cacheGet<{ value: number }>('epoch-probe', 60_000);
    expect(hit?.data).toEqual({ value: 2 });
  });
});
