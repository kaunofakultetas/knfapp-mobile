// -----------------------------------------------------------
//  [*] Tests — the prefs machine, pinned to exact snapshots
//
//  Three truths under one store: refresh hydration from the
//  server (taking the wire lock, so a flip made during the GET
//  queues its PUT behind it instead of racing it), rapid
//  channel flips collapsing through the 300ms debounce into
//  ONE merged PUT whose ANSWER becomes the confirmed state,
//  the three-way merge that reverts only a
//  failed batch's keys while an in-flight flip keeps its
//  optimistic value, the guarded channel union, the
//  client-only master switch (hydrated from disk once, never
//  reverted by a refresh that was already in flight), and the
//  chat-preview flag's optimistic/revert/answer-commit dance
//  with its confirmed/reverted verdict — its PUT queued on the
//  same wire lock, only the newest write painting, a failure
//  snapping back to server truth.
// -----------------------------------------------------------

import { createPrefsMachine, type PrefsMachine } from '../prefs';
import { TransportFailure, type ChannelKey } from '../types';
import { createFakeTransport, createMemoryStorage } from '../../testing';

const DEBOUNCE_MS = 300;

let machines: PrefsMachine[] = [];

const setup = (seed: Record<string, string> = {}) => {
  const transport = createFakeTransport();
  const storage = createMemoryStorage(seed);
  const machine = createPrefsMachine({ transport, storage });
  machines.push(machine);
  return { transport, storage, machine };
};

// A GET the test releases by hand — the master switch is
// toggled while it hangs
const deferredChannels = (transport: ReturnType<typeof createFakeTransport>) => {
  let resolve!: (state: Record<ChannelKey, boolean>) => void;
  let reject!: (error: Error) => void;
  transport.getChannels = () =>
    new Promise((res, rej) => {
      transport.calls.push({ method: 'getChannels', payload: null });
      resolve = res;
      reject = rej;
    });
  return { resolve: (state: Record<ChannelKey, boolean>) => resolve(state), reject: (error: Error) => reject(error) };
};

const putCalls = (transport: ReturnType<typeof createFakeTransport>) =>
  transport.calls.filter((c) => c.method === 'putChannels');

beforeEach(() => {
  jest.useFakeTimers();
  machines = [];
});

afterEach(() => {
  for (const machine of machines) machine.dispose();
  jest.useRealTimers();
});


describe('refresh', () => {
  it('pulls channels and preview from the transport and lands fresh (scenario 41)', async () => {
    const { transport, machine } = setup();
    transport.channels = { news: false, chat: true, schedule: true, admin: false };
    transport.chatPreview = false;

    await machine.refresh();

    expect(machine.store.get()).toEqual({
      masterEnabled: true,
      channels: { news: false, chat: true, schedule: true, admin: false },
      chatPreview: false,
      syncState: 'fresh',
    });
    expect(transport.calls.filter((c) => c.method === 'getChannels')).toHaveLength(1);
    expect(transport.calls.filter((c) => c.method === 'getChatPreview')).toHaveLength(1);
  });

  it('a master toggle-off while the GET is in flight survives the answer landing', async () => {
    const { transport, machine } = setup();
    const gate = deferredChannels(transport);

    const flight = machine.refresh();
    await jest.advanceTimersByTimeAsync(0);
    await machine.setMasterEnabled(false);
    expect(machine.store.get().masterEnabled).toBe(false);

    gate.resolve({ news: false, chat: true, schedule: true, admin: true });
    await flight;

    expect(machine.store.get()).toEqual({
      masterEnabled: false,
      channels: { news: false, chat: true, schedule: true, admin: true },
      chatPreview: true,
      syncState: 'fresh',
    });
  });

  it('the same toggle survives a GET that FAILS — the error branch never writes the switch either', async () => {
    const { transport, machine } = setup();
    const gate = deferredChannels(transport);

    const flight = machine.refresh();
    await jest.advanceTimersByTimeAsync(0);
    await machine.setMasterEnabled(false);

    gate.reject(new Error('backend down'));
    await flight;

    expect(machine.store.get()).toEqual({
      masterEnabled: false,
      channels: { news: true, chat: true, schedule: true, admin: true },
      chatPreview: true,
      syncState: 'error',
    });
  });

  it('the mirror case: a toggle-ON during the GET is not reverted to off', async () => {
    const { transport, machine } = setup({ 'notify.masterEnabled': '0' });
    await machine.hydrate();
    expect(machine.store.get().masterEnabled).toBe(false);
    const gate = deferredChannels(transport);

    const flight = machine.refresh();
    await jest.advanceTimersByTimeAsync(0);
    await machine.setMasterEnabled(true);

    gate.resolve({ news: true, chat: true, schedule: true, admin: true });
    await flight;

    expect(machine.store.get().masterEnabled).toBe(true);
    expect(machine.store.get().syncState).toBe('fresh');
  });

  it('a channel flip made while the GET is on the wire queues its PUT BEHIND the GET — the older body never lands last', async () => {
    const { transport, machine } = setup();
    // A real server answers the GET from the state it had when
    // the request ARRIVED; only the response is slow. Capturing
    // the body at arrival is what makes the race reproducible
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.getChannels = async () => {
      transport.calls.push({ method: 'getChannels', payload: null });
      const body = { ...transport.channels };
      order.push('GET arrived');
      await gate;
      order.push('GET answered');
      return body;
    };
    const put = transport.putChannels;
    transport.putChannels = async (patch) => {
      order.push('PUT committed');
      return put(patch);
    };

    // Pull-to-refresh on a slow link, then the switch flips OFF
    const flight = machine.refresh();
    await jest.advanceTimersByTimeAsync(0);
    machine.setChannelEnabled('chat', false);
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    // The debounce fired, but the PUT is waiting its turn
    expect(order).toEqual(['GET arrived']);
    expect(machine.store.get().channels.chat).toBe(false);

    release();
    await flight;
    await jest.advanceTimersByTimeAsync(0);

    expect(order).toEqual(['GET arrived', 'GET answered', 'PUT committed']);
    expect(transport.channels.chat).toBe(false);
    expect(machine.store.get()).toEqual({
      masterEnabled: true,
      channels: { news: true, chat: false, schedule: true, admin: true },
      chatPreview: true,
      syncState: 'fresh',
    });
  });
});


describe('channel flips and the debounce', () => {
  it('two rapid flips merge into ONE PUT after the debounce (scenario 42)', async () => {
    const { transport, machine } = setup();

    machine.setChannelEnabled('news', false);
    machine.setChannelEnabled('chat', false);

    // Optimistic before any wire traffic
    expect(putCalls(transport)).toHaveLength(0);
    expect(machine.store.get().channels).toEqual({ news: false, chat: false, schedule: true, admin: true });
    expect(machine.store.get().syncState).toBe('stale');

    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(putCalls(transport)).toEqual([
      { method: 'putChannels', payload: { news: false, chat: false } },
    ]);
    expect(machine.store.get()).toEqual({
      masterEnabled: true,
      channels: { news: false, chat: false, schedule: true, admin: true },
      chatPreview: true,
      syncState: 'fresh',
    });
  });

  it('a disagreeing full-state answer overrides the optimistic flip (scenario 43)', async () => {
    const { transport, machine } = setup();
    // The server refuses the opt-out — its answer says news stays ON
    transport.putChannels = async (patch) => {
      transport.calls.push({ method: 'putChannels', payload: patch });
      return { news: true, chat: true, schedule: true, admin: true };
    };

    machine.setChannelEnabled('news', false);
    expect(machine.store.get().channels.news).toBe(false);

    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(putCalls(transport)).toEqual([{ method: 'putChannels', payload: { news: false } }]);
    expect(machine.store.get().channels).toEqual({ news: true, chat: true, schedule: true, admin: true });
    expect(machine.store.get().syncState).toBe('fresh');
  });

  it('a failed batch reverts ONLY its keys — an in-flight flip keeps its value and later flushes (scenario 44)', async () => {
    const { transport, machine } = setup();
    const flights: {
      patch: unknown;
      resolve: (state: Record<ChannelKey, boolean>) => void;
      reject: (error: Error) => void;
    }[] = [];
    transport.putChannels = (patch) =>
      new Promise((resolve, reject) => {
        transport.calls.push({ method: 'putChannels', payload: patch });
        flights.push({ patch, resolve, reject });
      });

    // Flip news, let the flush START and hang in flight
    machine.setChannelEnabled('news', false);
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(flights).toHaveLength(1);
    expect(flights[0].patch).toEqual({ news: false });
    expect(machine.store.get().syncState).toBe('flushing');

    // Flip chat DURING the flight — it joins pending, not the batch
    machine.setChannelEnabled('chat', false);
    expect(machine.store.get().channels).toEqual({ news: false, chat: false, schedule: true, admin: true });

    // The flight dies: news reverts to its pre-flight value,
    // chat keeps its optimistic false
    flights[0].reject(new Error('boom'));
    await jest.advanceTimersByTimeAsync(0);
    expect(machine.store.get().channels).toEqual({ news: true, chat: false, schedule: true, admin: true });
    expect(machine.store.get().syncState).toBe('error');

    // The in-flight flip flushes on its own debounce, alone
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(flights).toHaveLength(2);
    expect(flights[1].patch).toEqual({ chat: false });

    flights[1].resolve({ news: true, chat: false, schedule: true, admin: true });
    await jest.advanceTimersByTimeAsync(0);
    expect(machine.store.get()).toEqual({
      masterEnabled: true,
      channels: { news: true, chat: false, schedule: true, admin: true },
      chatPreview: true,
      syncState: 'fresh',
    });
  });

  it('an unknown channel key throws by name before anything reaches the wire (scenario 45)', async () => {
    const { transport, machine } = setup();

    expect(() => machine.setChannelEnabled('bogus' as unknown as ChannelKey, false)).toThrow(
      'Unknown notification channel "bogus"',
    );

    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(putCalls(transport)).toHaveLength(0);
    expect(machine.store.get()).toEqual({
      masterEnabled: true,
      channels: { news: true, chat: true, schedule: true, admin: true },
      chatPreview: true,
      syncState: 'stale',
    });
  });
});


describe('master switch (scenario 46)', () => {
  it('setMasterEnabled(false) persists "0" and flips the snapshot', async () => {
    const { storage, machine } = setup();

    await machine.setMasterEnabled(false);

    expect(storage.map.get('notify.masterEnabled')).toBe('0');
    expect(machine.store.get().masterEnabled).toBe(false);
    await expect(machine.isMasterEnabled()).resolves.toBe(false);
  });

  it('an absent key reads as enabled — new installs deliver by default', async () => {
    const { storage, machine } = setup();

    expect(storage.map.has('notify.masterEnabled')).toBe(false);
    await expect(machine.isMasterEnabled()).resolves.toBe(true);
  });

  it('a throwing storage reads as enabled, even over a stored "0"', async () => {
    const { storage, machine } = setup();
    storage.map.set('notify.masterEnabled', '0');
    storage.failing = true;

    await expect(machine.isMasterEnabled()).resolves.toBe(true);
  });
});


describe('hydrate — the one disk→snapshot projection', () => {
  it('a stored "0" lands the snapshot OFF with no wire traffic', async () => {
    const { transport, machine } = setup({ 'notify.masterEnabled': '0' });
    expect(machine.store.get().masterEnabled).toBe(true); // the pre-hydrate default

    await machine.hydrate();

    expect(machine.store.get()).toEqual({
      masterEnabled: false,
      channels: { news: true, chat: true, schedule: true, admin: true },
      chatPreview: true,
      syncState: 'stale',
    });
    expect(transport.calls).toEqual([]);
  });

  it('a stored "1" and an absent key both read ON', async () => {
    const stored = setup({ 'notify.masterEnabled': '1' });
    await stored.machine.hydrate();
    expect(stored.machine.store.get().masterEnabled).toBe(true);

    const fresh = setup();
    await fresh.machine.hydrate();
    expect(fresh.machine.store.get().masterEnabled).toBe(true);
  });

  it('a toggle made while hydrate() is reading the disk wins over the older stored value', async () => {
    const { storage, machine } = setup({ 'notify.masterEnabled': '1' });
    // The disk answers only when released — the user taps OFF in
    // the meantime
    let release!: (value: string | null) => void;
    const read = storage.get;
    storage.get = (key) =>
      key === 'notify.masterEnabled'
        ? new Promise<string | null>((resolve) => {
            release = resolve;
          })
        : read(key);

    const hydrating = machine.hydrate();
    await jest.advanceTimersByTimeAsync(0);
    await machine.setMasterEnabled(false);

    release('1');
    await hydrating;

    expect(machine.store.get().masterEnabled).toBe(false);
    expect(storage.map.get('notify.masterEnabled')).toBe('0');
  });

  it('a throwing disk leaves the snapshot as it was', async () => {
    const { storage, machine } = setup({ 'notify.masterEnabled': '0' });
    storage.failing = true;

    await expect(machine.hydrate()).resolves.toBeUndefined();

    expect(machine.store.get().masterEnabled).toBe(true);
  });
});


describe('chat preview (scenario 47)', () => {
  it('flips optimistically, then reverts when the transport fails', async () => {
    const { transport, machine } = setup();
    transport.overrides.putChatPreview = async () => {
      throw new TransportFailure('network');
    };

    const flight = machine.setChatPreview(false);
    expect(machine.store.get().chatPreview).toBe(false); // optimistic

    // The revert is the caller's verdict too
    await expect(flight).resolves.toBe(false);
    expect(machine.store.get().chatPreview).toBe(true); // reverted
    expect(transport.calls.filter((c) => c.method === 'putChatPreview')).toEqual([
      { method: 'putChatPreview', payload: false },
    ]);
  });

  it('commits the transport ANSWER on success, not the requested value — and a disagreeing answer reads false', async () => {
    const { transport, machine } = setup();
    // The server clamps the flag back on — its answer disagrees
    transport.putChatPreview = async (on) => {
      transport.calls.push({ method: 'putChatPreview', payload: on });
      return true;
    };

    await expect(machine.setChatPreview(false)).resolves.toBe(false);

    expect(transport.calls.filter((c) => c.method === 'putChatPreview')).toEqual([
      { method: 'putChatPreview', payload: false },
    ]);
    expect(machine.store.get().chatPreview).toBe(true);
  });

  it('resolves true when the wire confirms the requested value', async () => {
    const { transport, machine } = setup();

    await expect(machine.setChatPreview(false)).resolves.toBe(true);

    expect(machine.store.get().chatPreview).toBe(false);
    expect(transport.chatPreview).toBe(false);
  });

  it('a preview flip made while a GET is on the wire queues its PUT behind it — the older body never reverts the flag', async () => {
    const { transport, machine } = setup();
    // The GET answers from the state it had when it ARRIVED,
    // released by hand — the same model the channel race uses
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.getChatPreview = async () => {
      transport.calls.push({ method: 'getChatPreview', payload: null });
      const body = transport.chatPreview;
      order.push('GET arrived');
      await gate;
      order.push('GET answered');
      return body;
    };
    const put = transport.putChatPreview;
    transport.putChatPreview = async (on) => {
      order.push('PUT committed');
      return put(on);
    };

    const flight = machine.refresh();
    await jest.advanceTimersByTimeAsync(0);
    const saving = machine.setChatPreview(false);
    // Optimistic at once; the PUT waits its turn
    expect(machine.store.get().chatPreview).toBe(false);
    await jest.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['GET arrived']);

    release();
    await flight;
    // The GET's pre-PUT `true` landed while the write was still
    // queued — the switch never flickered back
    expect(machine.store.get().chatPreview).toBe(false);

    await expect(saving).resolves.toBe(true);
    expect(order).toEqual(['GET arrived', 'GET answered', 'PUT committed']);
    expect(transport.chatPreview).toBe(false);
    expect(machine.store.get().chatPreview).toBe(false);
  });

  it('two quick flips that both land: only the newest paints — the older answer never flickers the switch back', async () => {
    const { transport, machine } = setup();
    const seen: boolean[] = [];
    machine.store.subscribe((snapshot) => seen.push(snapshot.chatPreview));

    // OFF, then straight back ON — both PUTs succeed
    const first = machine.setChatPreview(false);
    const second = machine.setChatPreview(true);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);

    // The first write's `false` answer landed while the second
    // was pending, and painted nothing: OFF, ON, and it stayed
    expect(seen).toEqual([true, false, true]);
    expect(transport.calls.filter((c) => c.method === 'putChatPreview').map((c) => c.payload)).toEqual([false, true]);
    expect(transport.chatPreview).toBe(true);
  });

  it('two quick flips that both fail: the switch snaps back to SERVER truth, never to the first flip\'s optimistic guess', async () => {
    const { transport, machine } = setup();
    transport.overrides.putChatPreview = async () => {
      throw new TransportFailure('network');
    };

    // Server holds ON. OFF, then back ON — the second flip's
    // "before" is the first flip's unconfirmed OFF
    const first = machine.setChatPreview(false);
    const second = machine.setChatPreview(true);
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);

    expect(transport.chatPreview).toBe(true);
    expect(machine.store.get().chatPreview).toBe(true);
  });

  it('a lone failed flip reverts to what the last GET confirmed', async () => {
    const { transport, machine } = setup();
    transport.chatPreview = false;
    await machine.refresh();
    expect(machine.store.get().chatPreview).toBe(false);

    transport.overrides.putChatPreview = async () => {
      throw new TransportFailure('network');
    };
    await expect(machine.setChatPreview(true)).resolves.toBe(false);
    expect(machine.store.get().chatPreview).toBe(false);
  });
});
