// -----------------------------------------------------------
//  [*] Tests — the channel registry, pinned call by call
//
//  Channel ids are versioned and the applier may delete ONLY
//  what it has owned, so every scenario here pins the exact
//  setChannel/deleteChannel traffic, the surviving device
//  state, and the persisted ownership record — plus the spec
//  validator's loud, id-naming rejections.
// -----------------------------------------------------------

import { createChannelApplier, validateChannelSpecs } from '../channels';
import type { ChannelSpec } from '../types';
import { createFakeDevice, createMemoryStorage } from '../../testing';

const OWNED_KEY = 'notify.ownedChannels';

const S = (id: string, nameKey: ChannelSpec['nameKey'], importance: number, extra: Partial<ChannelSpec> = {}): ChannelSpec => ({
  id, nameKey, importance, ...extra,
});

const SPECS_V1: ChannelSpec[] = [
  S('default.v1', 'default', 3),
  S('chat.v1', 'chat', 4, { vibration: true, sound: true }),
];

describe('createChannelApplier', () => {
  it('creates every spec on an empty device with the localized name — payloads exact', async () => {
    const device = createFakeDevice({ platform: 'android' });
    const storage = createMemoryStorage();
    const applier = createChannelApplier({ device, storage, specs: SPECS_V1 });

    await applier.apply({ default: 'Bendra', chat: 'Pokalbiai' });

    expect(device.calls).toEqual([
      { method: 'setChannel', args: [{ id: 'default.v1', nameKey: 'default', importance: 3, name: 'Bendra' }] },
      { method: 'setChannel', args: [{ id: 'chat.v1', nameKey: 'chat', importance: 4, vibration: true, sound: true, name: 'Pokalbiai' }] },
    ]);
    expect([...device.channels.values()]).toEqual([
      { id: 'default.v1', name: 'Bendra', importance: 3 },
      { id: 'chat.v1', name: 'Pokalbiai', importance: 4 },
    ]);
    // Ownership persisted, sorted — the license for future deletes
    expect(storage.map.get(OWNED_KEY)).toBe(JSON.stringify(['chat.v1', 'default.v1']));
  });

  it('version bump deletes the owned stale id but spares a foreign channel', async () => {
    const device = createFakeDevice({ platform: 'android' });
    const storage = createMemoryStorage();

    // Seed: v1 applied once (installed AND owned), plus a channel
    // some other module created — installed, never owned
    await createChannelApplier({ device, storage, specs: [S('default.v1', 'default', 3)] })
      .apply({ default: 'Bendra' });
    const foreign = { id: 'host.private', name: 'Not ours', importance: 2 };
    device.channels.set('host.private', foreign);
    device.calls.length = 0;

    await createChannelApplier({ device, storage, specs: [S('default.v2', 'default', 4)] })
      .apply({ default: 'Bendra' });

    expect(device.calls).toEqual([
      { method: 'setChannel', args: [{ id: 'default.v2', nameKey: 'default', importance: 4, name: 'Bendra' }] },
      { method: 'deleteChannel', args: ['default.v1'] },
    ]);
    expect(device.channels.has('default.v1')).toBe(false);
    expect(device.channels.get('default.v2')).toEqual({ id: 'default.v2', name: 'Bendra', importance: 4 });
    expect(device.channels.get('host.private')).toEqual(foreign);
    expect(storage.map.get(OWNED_KEY)).toBe(JSON.stringify(['default.v2']));
  });

  it('re-apply with new names renames in place — same ids, zero deletes', async () => {
    const device = createFakeDevice({ platform: 'android' });
    const storage = createMemoryStorage();
    const applier = createChannelApplier({ device, storage, specs: SPECS_V1 });

    await applier.apply({ default: 'Bendra', chat: 'Pokalbiai' });
    await applier.apply({ default: 'General', chat: 'Chat' });

    expect(device.calls).toEqual([
      { method: 'setChannel', args: [{ id: 'default.v1', nameKey: 'default', importance: 3, name: 'Bendra' }] },
      { method: 'setChannel', args: [{ id: 'chat.v1', nameKey: 'chat', importance: 4, vibration: true, sound: true, name: 'Pokalbiai' }] },
      { method: 'setChannel', args: [{ id: 'default.v1', nameKey: 'default', importance: 3, name: 'General' }] },
      { method: 'setChannel', args: [{ id: 'chat.v1', nameKey: 'chat', importance: 4, vibration: true, sound: true, name: 'Chat' }] },
    ]);
    expect(device.calls.filter((call) => call.method === 'deleteChannel')).toHaveLength(0);
    expect([...device.channels.values()]).toEqual([
      { id: 'default.v1', name: 'General', importance: 3 },
      { id: 'chat.v1', name: 'Chat', importance: 4 },
    ]);
  });

  it('is a silent no-op off android — zero device calls, storage untouched', async () => {
    const device = createFakeDevice({ platform: 'ios' });
    const storage = createMemoryStorage();
    const applier = createChannelApplier({ device, storage, specs: SPECS_V1 });

    await applier.apply({ default: 'Bendra', chat: 'Pokalbiai' });

    expect(device.calls).toEqual([]);
    expect(device.channels.size).toBe(0);
    expect(storage.map.size).toBe(0);
  });
});

describe('validateChannelSpecs', () => {
  it('rejects separator characters and uppercase, naming the offending id', () => {
    for (const bad of ['default:v1', 'default-v1', 'default|v1', 'Default.v1']) {
      expect(() => validateChannelSpecs([S(bad, 'default', 3)]))
        .toThrow(`Channel id "${bad}" is invalid — allowed charset is [a-z0-9.]`);
    }
  });

  it('rejects a duplicate id, naming it', () => {
    expect(() => validateChannelSpecs([
      S('default.v1', 'default', 3),
      S('chat.v1', 'chat', 4),
      S('chat.v1', 'news', 4),
    ])).toThrow('Channel id "chat.v1" is declared twice');
  });

  it('rejects a spec list without the guaranteed default channel', () => {
    expect(() => validateChannelSpecs([S('chat.v1', 'chat', 4)]))
      .toThrow('Channel registry needs the guaranteed default channel (nameKey "default")');
    expect(() => validateChannelSpecs([]))
      .toThrow('Channel registry needs the guaranteed default channel (nameKey "default")');
  });

  it('accepts a well-formed versioned list', () => {
    expect(() => validateChannelSpecs(SPECS_V1)).not.toThrow();
  });
});
