// -----------------------------------------------------------
//  [*] Tests — @knf/dataengine storage + network
//
//  The zero-dependency defaults: memoryStorage behaves like the
//  AsyncStorage surface it stands in for (enumeration, bulk
//  delete, snapshot dumps), and manualNetwork fires only on
//  real transitions with working unsubscribes.
// -----------------------------------------------------------

import { manualNetwork } from '../network';
import { memoryStorage } from '../storage';


describe('memoryStorage', () => {
  it('round-trips values, enumerates keys and bulk-deletes', async () => {
    const storage = memoryStorage();
    expect(await storage.getItem('missing')).toBeNull();


    await storage.setItem('a', '1');
    await storage.setItem('b', '2');
    await storage.setItem('c', '3');
    expect(await storage.getItem('a')).toBe('1');
    expect(await storage.getAllKeys()).toEqual(['a', 'b', 'c']);


    await storage.removeItem('a');
    await storage.removeItem('never-stored');
    expect(await storage.getItem('a')).toBeNull();


    // multiRemove tolerates keys that are already gone
    await storage.multiRemove?.(['b', 'ghost']);
    expect(storage.dump()).toEqual({ c: '3' });
  });


  it('dump() is a snapshot — mutating it never leaks back into the store', async () => {
    const storage = memoryStorage();
    await storage.setItem('a', '1');


    const snapshot = storage.dump();
    snapshot.b = 'sneaky';
    delete snapshot.a;
    expect(await storage.getItem('b')).toBeNull();
    expect(await storage.getItem('a')).toBe('1');
  });
});




describe('manualNetwork', () => {
  it('fires on real transitions only, never on a same-state set', () => {
    const net = manualNetwork();
    expect(net.isOnline()).toBe(true);


    const seen: boolean[] = [];
    net.subscribe((online) => seen.push(online));
    net.set(true);
    expect(seen).toEqual([]);


    net.set(false);
    expect(net.isOnline()).toBe(false);
    net.set(false);
    net.set(true);
    expect(net.isOnline()).toBe(true);
    expect(seen).toEqual([false, true]);
  });


  it('honors unsubscribes without disturbing other listeners', () => {
    const net = manualNetwork(false);
    expect(net.isOnline()).toBe(false);


    const first: boolean[] = [];
    const second: boolean[] = [];
    const offFirst = net.subscribe((online) => first.push(online));
    net.subscribe((online) => second.push(online));


    net.set(true);
    offFirst();
    offFirst();
    net.set(false);
    expect(first).toEqual([true]);
    expect(second).toEqual([true, false]);


    // isOnline keeps tracking even with nobody listening
    expect(net.isOnline()).toBe(false);
  });
});
