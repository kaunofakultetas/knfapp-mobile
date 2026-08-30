// -----------------------------------------------------------
//  [*] Tests — @knf/dataengine public surface
//
//  The package's runtime export list and the cache handle's
//  method list, pinned. Adding is deliberate; removing or
//  renaming is a breaking change for every host.
// -----------------------------------------------------------

import * as engine from '../index';


describe('@knf/dataengine surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(engine).sort()).toEqual(
      [
        'DataEngineProvider',
        'alwaysOnline',
        'createCache',
        'manualNetwork',
        'memoryStorage',
        'useDataEngine',
        'useFeed',
        'useLoad',
        'useNetworkRestore',
      ].sort(),
    );
  });

  it('a CacheHandle carries these methods and nothing is optional', () => {
    const cache = engine.createCache(engine.memoryStorage());
    expect(Object.keys(cache).sort()).toEqual(['clearAll', 'epoch', 'get', 'remove', 'set', 'sweepPrefix'].sort());
    for (const m of ['set', 'get', 'remove', 'sweepPrefix', 'clearAll', 'epoch'] as const) {
      expect(typeof cache[m]).toBe('function');
    }
  });

  it('the zero-dependency sources answer the NetworkSource surface', () => {
    const always = engine.alwaysOnline();
    expect(always.isOnline()).toBe(true);
    expect(typeof always.subscribe(() => {})).toBe('function');

    const manual = engine.manualNetwork(false);
    expect(manual.isOnline()).toBe(false);
    expect(typeof manual.set).toBe('function');
  });
});
