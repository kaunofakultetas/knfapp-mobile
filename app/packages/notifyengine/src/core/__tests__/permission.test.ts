// -----------------------------------------------------------
//  [*] Tests — the permission machine
//
//  Every snapshot is pinned as an exact three-field payload:
//  poll normalization (undetermined / provisional / the
//  first-class 'unsupported'), the request() short-circuits,
//  single-flight prompting, and the store's contracts —
//  immediate subscribe, edge-dedup on identical re-polls,
//  and a dead-silent unsubscribe.
// -----------------------------------------------------------

import { createPermissionMachine } from '../permission';
import type { PermissionSnapshot } from '../types';
import { createFakeDevice, fixtureDeniedForever, type FakeDevice } from '../../testing';

const UNKNOWN: PermissionSnapshot = { status: 'unknown', canAskAgain: false, canDeliver: false };

const callsTo = (device: FakeDevice, method: string) =>
  device.calls.filter((c) => c.method === method).length;


describe('poll normalization', () => {
  it('undetermined comes back complete: not deliverable, still askable', async () => {
    const device = createFakeDevice(); // scripted default: undetermined, canAskAgain true
    const machine = createPermissionMachine(device);

    const snapshot = await machine.poll();

    expect(snapshot).toEqual({ status: 'undetermined', canAskAgain: true, canDeliver: false });
    expect(machine.store.get()).toEqual({ status: 'undetermined', canAskAgain: true, canDeliver: false });
    expect(callsTo(device, 'getPermissions')).toBe(1);
  });

  it('provisional counts as deliverable', async () => {
    const device = createFakeDevice({ permission: { status: 'provisional', canAskAgain: true } });
    const machine = createPermissionMachine(device);

    const snapshot = await machine.poll();

    expect(snapshot).toEqual({ status: 'provisional', canAskAgain: true, canDeliver: true });
  });

  it('a runtime without remote push lands "unsupported" and never reads the OS', async () => {
    const device = createFakeDevice({ remotePushSupported: false });
    const machine = createPermissionMachine(device);

    const snapshot = await machine.poll();

    expect(snapshot).toEqual({ status: 'unsupported', canAskAgain: false, canDeliver: false });
    expect(machine.store.get()).toEqual({ status: 'unsupported', canAskAgain: false, canDeliver: false });
    expect(callsTo(device, 'getPermissions')).toBe(0);
  });
});


describe('request', () => {
  it('prompting from undetermined resolves granted and updates the store', async () => {
    const device = createFakeDevice(); // scripted default outcome: granted
    const machine = createPermissionMachine(device);
    await machine.poll();

    const snapshot = await machine.request();

    expect(snapshot).toEqual({ status: 'granted', canAskAgain: true, canDeliver: true });
    expect(machine.store.get()).toEqual({ status: 'granted', canAskAgain: true, canDeliver: true });
    expect(callsTo(device, 'requestPermissions')).toBe(1);
  });

  it('denied-forever is terminal: request() answers the current state without prompting', async () => {
    const device = createFakeDevice({ permission: fixtureDeniedForever });
    const machine = createPermissionMachine(device);
    await machine.poll();

    const snapshot = await machine.request();

    expect(snapshot).toEqual({ status: 'denied', canAskAgain: false, canDeliver: false });
    expect(callsTo(device, 'requestPermissions')).toBe(0);
  });

  it('two concurrent request() calls share ONE OS prompt and one resolved snapshot', async () => {
    const device = createFakeDevice();
    const machine = createPermissionMachine(device);
    await machine.poll();

    const first = machine.request();
    const second = machine.request();
    const [a, b] = await Promise.all([first, second]);

    expect(callsTo(device, 'requestPermissions')).toBe(1);
    expect(a).toBe(b); // one shared promise ⇒ the very same snapshot object
    expect(a).toEqual({ status: 'granted', canAskAgain: true, canDeliver: true });
  });
});


describe('store contracts', () => {
  it('three identical re-polls emit exactly ONE notification past the immediate subscribe', async () => {
    const device = createFakeDevice();
    const machine = createPermissionMachine(device);

    const emissions: PermissionSnapshot[] = [];
    machine.store.subscribe((snapshot) => emissions.push(snapshot));

    await machine.poll();
    await machine.poll();
    await machine.poll();

    // [0] is the immediate subscribe echo; the three polls read
    // the same device state, so edge-dedup lets ONE through
    expect(emissions).toEqual([
      UNKNOWN,
      { status: 'undetermined', canAskAgain: true, canDeliver: false },
    ]);
    expect(callsTo(device, 'getPermissions')).toBe(3);
  });

  it('subscribe fires immediately with the current value; unsubscribe goes silent', async () => {
    const device = createFakeDevice();
    const machine = createPermissionMachine(device);

    const emissions: PermissionSnapshot[] = [];
    const unsubscribe = machine.store.subscribe((snapshot) => emissions.push(snapshot));

    expect(emissions).toEqual([UNKNOWN]);

    unsubscribe();
    await machine.poll(); // unknown → undetermined would have emitted

    expect(emissions).toEqual([UNKNOWN]);
    expect(machine.store.get()).toEqual({ status: 'undetermined', canAskAgain: true, canDeliver: false });
  });
});


describe('cross-platform shape parity', () => {
  it('the snapshot carries all three fields on every platform fake', async () => {
    for (const platform of ['ios', 'android'] as const) {
      const device = createFakeDevice({ platform });
      const machine = createPermissionMachine(device);

      const snapshot = await machine.poll();

      expect(Object.keys(snapshot).sort()).toEqual(['canAskAgain', 'canDeliver', 'status']);
      expect(snapshot).toEqual({ status: 'undetermined', canAskAgain: true, canDeliver: false });
    }
  });
});
