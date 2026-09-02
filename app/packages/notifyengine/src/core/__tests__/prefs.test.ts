// -----------------------------------------------------------
//  [*] Tests — the prefs machine, pinned to exact snapshots
//
//  Three truths under one store: refresh hydration from the
//  server, rapid channel flips collapsing through the 300ms
//  debounce into ONE merged PUT whose ANSWER becomes the
//  confirmed state, the three-way merge that reverts only a
//  failed batch's keys while an in-flight flip keeps its
//  optimistic value, the guarded channel union, the
//  client-only master switch, and the chat-preview flag's
//  optimistic/revert/answer-commit dance.
// -----------------------------------------------------------

import { createPrefsMachine, type PrefsMachine } from '../prefs';
import { TransportFailure, type ChannelKey } from '../types';
import { createFakeTransport, createMemoryStorage } from '../../testing';

const DEBOUNCE_MS = 300;

let machines: PrefsMachine[] = [];

const setup = () => {
  const transport = createFakeTransport();
  const storage = createMemoryStorage();
  const machine = createPrefsMachine({ transport, storage });
  machines.push(machine);
  return { transport, storage, machine };
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


describe('chat preview (scenario 47)', () => {
  it('flips optimistically, then reverts when the transport fails', async () => {
    const { transport, machine } = setup();
    transport.overrides.putChatPreview = async () => {
      throw new TransportFailure('network');
    };

    const flight = machine.setChatPreview(false);
    expect(machine.store.get().chatPreview).toBe(false); // optimistic

    await flight;
    expect(machine.store.get().chatPreview).toBe(true); // reverted
    expect(transport.calls.filter((c) => c.method === 'putChatPreview')).toEqual([
      { method: 'putChatPreview', payload: false },
    ]);
  });

  it('commits the transport ANSWER on success, not the requested value', async () => {
    const { transport, machine } = setup();
    // The server clamps the flag back on — its answer disagrees
    transport.putChatPreview = async (on) => {
      transport.calls.push({ method: 'putChatPreview', payload: on });
      return true;
    };

    await machine.setChatPreview(false);

    expect(transport.calls.filter((c) => c.method === 'putChatPreview')).toEqual([
      { method: 'putChatPreview', payload: false },
    ]);
    expect(machine.store.get().chatPreview).toBe(true);
  });
});
