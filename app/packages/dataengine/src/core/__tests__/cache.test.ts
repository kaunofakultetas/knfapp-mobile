// -----------------------------------------------------------
//  [*] Tests — @knf/dataengine cache
//
//  The hostile-input suite: expiry evicts on read, a zero TTL
//  never serves, a backwards clock refetches, wrong-version /
//  corrupt / throwing storage all read as misses, the sweep
//  only touches its own prefix, and clearAll bumps the wipe
//  fence before it touches storage.
// -----------------------------------------------------------

import { createCache } from '../cache';
import { memoryStorage, type KeyValueStorage } from '../storage';


describe('createCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
  });
  afterEach(() => jest.useRealTimers());


  it('serves fresh entries and evicts expired ones on the read that finds them', async () => {
    const storage = memoryStorage();
    const cache = createCache(storage);
    await cache.set('k', { n: 1 });


    jest.advanceTimersByTime(5_000);
    expect(await cache.get('k', 10_000)).toEqual({ data: { n: 1 }, cachedAt: 1_000_000 });


    // Past the TTL the entry is gone from storage too — a later
    // read with no TTL at all must not resurrect it
    jest.advanceTimersByTime(6_000);
    expect(await cache.get('k', 10_000)).toBeNull();
    expect(await cache.get('k')).toBeNull();
    expect(storage.dump()).toEqual({});
  });


  it('treats maxAgeMs 0 as always expired, not as "no TTL"', async () => {
    const storage = memoryStorage();
    const cache = createCache(storage);
    await cache.set('k', 'v');


    jest.advanceTimersByTime(1);
    expect(await cache.get('k', 0)).toBeNull();
    expect(storage.dump()).toEqual({});
  });


  it('evicts on a negative age (clock moved backwards), even without a TTL', async () => {
    const storage = memoryStorage();
    const cache = createCache(storage);
    jest.setSystemTime(10_000_000);
    await cache.set('k', 'v');


    // Skew must fail toward refetch, never toward stale data
    jest.setSystemTime(9_000_000);
    expect(await cache.get('k')).toBeNull();
    expect(storage.dump()).toEqual({});
  });


  it('evicts an entry stored under a different schema version', async () => {
    const storage = memoryStorage();
    const cache = createCache(storage);
    await storage.setItem('cache:k', JSON.stringify({ v: 999, data: 'x', cachedAt: Date.now() }));


    expect(await cache.get('k')).toBeNull();
    expect(storage.dump()).toEqual({});
  });


  it('reads corrupt JSON and non-object entries as misses', async () => {
    const storage = memoryStorage();
    const cache = createCache(storage);
    await storage.setItem('cache:broken', '{not json');
    await storage.setItem('cache:number', '42');
    await storage.setItem('cache:null', 'null');
    await storage.setItem('cache:string', '"hello"');
    await storage.setItem('cache:nostamp', JSON.stringify({ v: 1, data: 'x', cachedAt: 'yesterday' }));
    await storage.setItem('cache:empty', '');


    expect(await cache.get('broken')).toBeNull();
    expect(await cache.get('number')).toBeNull();
    expect(await cache.get('null')).toBeNull();
    expect(await cache.get('string')).toBeNull();
    expect(await cache.get('nostamp')).toBeNull();
    expect(await cache.get('empty')).toBeNull();
    expect(await cache.get('missing')).toBeNull();
  });


  it('reads a throwing storage as a miss and swallows a failing write', async () => {
    const storage: KeyValueStorage = {
      getItem: async () => {
        throw new Error('io');
      },
      setItem: async () => {
        throw new Error('disk full');
      },
      removeItem: async () => {
        throw new Error('io');
      },
      getAllKeys: async () => {
        throw new Error('io');
      },
    };
    const cache = createCache(storage);


    expect(await cache.get('k')).toBeNull();
    await expect(cache.set('k', 'v')).resolves.toBeUndefined();
    await expect(cache.remove('k')).resolves.toBeUndefined();
    await expect(cache.sweepPrefix('feed:', 1_000)).resolves.toBeUndefined();
  });


  it('sweeps expired, corrupt and wrong-version entries under its prefix only', async () => {
    const storage = memoryStorage();
    const cache = createCache(storage);
    await cache.set('feed:old', 1);


    jest.advanceTimersByTime(100_000);
    await cache.set('feed:fresh', 2);
    await cache.set('profile:me', 3);
    await storage.setItem('cache:feed:broken', '{{{');
    await storage.setItem('cache:feed:v0', JSON.stringify({ v: 0, data: 4, cachedAt: Date.now() }));
    await storage.setItem('unrelated', 'not ours');


    await cache.sweepPrefix('feed:', 50_000);


    // The stale profile entry sits outside the swept key prefix
    // and the raw host key outside the cache prefix — both stay
    expect(Object.keys(storage.dump()).sort()).toEqual(['cache:feed:fresh', 'cache:profile:me', 'unrelated']);
  });


  it('clearAll wipes only its own prefix and reports success', async () => {
    const storage = memoryStorage();
    const cache = createCache(storage);
    await cache.set('a', 1);
    await cache.set('b', 2);
    await storage.setItem('session:token', 'keep-me');


    expect(cache.epoch()).toBe(0);
    expect(await cache.clearAll()).toBe(true);
    expect(storage.dump()).toEqual({ 'session:token': 'keep-me' });
    expect(cache.epoch()).toBe(1);
  });


  it('clearAll bumps the epoch BEFORE the wipe attempt and resolves false when storage throws', async () => {
    // The storage observes the fence at the moment the wipe
    // starts — an in-flight fetch checking epoch() during a
    // failing wipe must already see it moved
    let epochDuringWipe = -1;
    const storage: KeyValueStorage = {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
      getAllKeys: async () => {
        epochDuringWipe = cache.epoch();
        throw new Error('io');
      },
    };
    const cache = createCache(storage);


    expect(await cache.clearAll()).toBe(false);
    expect(epochDuringWipe).toBe(1);
    expect(cache.epoch()).toBe(1);


    // Every retry moves the fence again, success or not
    expect(await cache.clearAll()).toBe(false);
    expect(cache.epoch()).toBe(2);
  });


  it('clearAll still wipes through a storage without multiRemove', async () => {
    const backing = memoryStorage();
    const noBulk: KeyValueStorage = {
      getItem: (key) => backing.getItem(key),
      setItem: (key, value) => backing.setItem(key, value),
      removeItem: (key) => backing.removeItem(key),
      getAllKeys: () => backing.getAllKeys(),
    };
    const cache = createCache(noBulk);
    await cache.set('a', 1);
    await cache.set('b', 2);
    await backing.setItem('foreign', 'keep');


    expect(await cache.clearAll()).toBe(true);
    expect(backing.dump()).toEqual({ foreign: 'keep' });
  });


  it('sweepPrefix falls back to per-key removes when multiRemove is absent', async () => {
    const backing = memoryStorage();
    const noBulk: KeyValueStorage = {
      getItem: (key) => backing.getItem(key),
      setItem: (key, value) => backing.setItem(key, value),
      removeItem: (key) => backing.removeItem(key),
      getAllKeys: () => backing.getAllKeys(),
    };
    const cache = createCache(noBulk);
    await cache.set('feed:old', 1);


    jest.advanceTimersByTime(100_000);
    await cache.set('feed:fresh', 2);
    await cache.sweepPrefix('feed:', 50_000);


    expect(Object.keys(backing.dump())).toEqual(['cache:feed:fresh']);
  });


  it('honors a custom prefix end to end', async () => {
    const storage = memoryStorage();
    const mine = createCache(storage, { prefix: 'mine:' });
    const theirs = createCache(storage, { prefix: 'theirs:' });
    await mine.set('k', 1);
    await theirs.set('k', 2);


    expect(await mine.get<number>('k')).toEqual({ data: 1, cachedAt: 1_000_000 });
    expect(await mine.clearAll()).toBe(true);
    expect(Object.keys(storage.dump())).toEqual(['theirs:k']);
    expect((await theirs.get<number>('k'))?.data).toBe(2);
  });
});
