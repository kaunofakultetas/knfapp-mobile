// -----------------------------------------------------------
//  [*] Tests — services/cache
//
//  The cache is best-effort by contract: corrupt and legacy
//  blobs read as misses, TTLs expire (a maxAgeMs of 0 means
//  "always expired"), and cacheClearAll wipes ONLY the
//  'cache:' namespace — the auth record and app settings live
//  in the same storage and must survive a logout wipe.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';

import { cacheClearAll, cacheGet, cacheSet } from '@/services/cache';


describe('cache', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('round-trips a value with its write time', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await cacheSet('k', { a: 1 });
    await expect(cacheGet('k')).resolves.toEqual({ data: { a: 1 }, cachedAt: 1_000 });
  });

  it('expires with maxAgeMs 0 as soon as any time has passed', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await cacheSet('k', 'v');
    now.mockReturnValue(1_001);
    await expect(cacheGet('k', 0)).resolves.toBeNull();
  });

  it('serves within the TTL and expires past it', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await cacheSet('k', 'v');
    now.mockReturnValue(1_050);
    await expect(cacheGet('k', 100)).resolves.toEqual({ data: 'v', cachedAt: 1_000 });
    now.mockReturnValue(1_101);
    await expect(cacheGet('k', 100)).resolves.toBeNull();
  });

  it('reads a corrupt blob as a miss', async () => {
    await AsyncStorage.setItem('cache:k', 'not json {');
    await expect(cacheGet('k')).resolves.toBeNull();
  });

  it('reads legacy-shaped blobs as misses', async () => {
    // Pre-versioning entries had no v/cachedAt wrapper
    await AsyncStorage.setItem('cache:k', JSON.stringify({ data: [1, 2] }));
    await expect(cacheGet('k')).resolves.toBeNull();
    // A wrapper from an older schema version is a miss too
    await AsyncStorage.setItem('cache:k', JSON.stringify({ v: 0, data: [1], cachedAt: Date.now() }));
    await expect(cacheGet('k')).resolves.toBeNull();
  });

  it('clears only the cache: namespace', async () => {
    await cacheSet('news:feed:guest', ['x']);
    await cacheSet('info:lt', ['y']);
    await AsyncStorage.setItem('auth', 'token-record');
    await AsyncStorage.setItem('app_settings', '{"language":"lt"}');

    await expect(cacheClearAll()).resolves.toBe(true);

    await expect(cacheGet('news:feed:guest')).resolves.toBeNull();
    await expect(cacheGet('info:lt')).resolves.toBeNull();
    await expect(AsyncStorage.getItem('auth')).resolves.toBe('token-record');
    await expect(AsyncStorage.getItem('app_settings')).resolves.toBe('{"language":"lt"}');
  });
});
