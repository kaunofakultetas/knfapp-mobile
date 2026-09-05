// -----------------------------------------------------------
//  [*] Tests — tap routing, pinned to exact intents
//
//  Every scenario asserts the full RouteIntent shape and exact
//  call counts: warm ingest, the consume-exactly-once cold
//  path (device copy cleared, identifier persisted so a hub
//  rebuilt over the same storage never replays), the pre-
//  resolver buffer with its order and cap, the launch tap that
//  reached the warm listener first and is adopted as the cold
//  start while no resolver exists, action-id mapping, throwing
//  resolvers, garbage payloads, and the normalizer's stringify
//  / drop-null / legacy-envelope rules.
// -----------------------------------------------------------

import { createRoutingHub, normalizeData } from '../routing';
import type { DeviceNotificationResponse, RouteIntent } from '../types';
import { createMemoryStorage, fixtureChatMessage, fixtureNewsPush, fixtureResponse } from '../../testing';

// Mirror the module's private constants — the persisted marker
// key and the platform's identifier for the plain default tap
const CONSUMED_KEY = 'notify.lastConsumedResponse';
const PLATFORM_DEFAULT_TAP = 'expo.modules.notifications.actions.DEFAULT';

// A hand-rolled device slot: readLastResponse re-returns the
// held response until clearLastResponse empties it, and a log
// records the read/clear order the hub drove
const makeSlot = (initial: DeviceNotificationResponse | null) => {
  let last = initial;
  const log: string[] = [];
  return {
    log,
    readLastResponse: async () => {
      log.push('read');
      return last;
    },
    clearLastResponse: () => {
      log.push('clear');
      last = null;
    },
  };
};

const makeHub = (slot: ReturnType<typeof makeSlot>, storage = createMemoryStorage()) => ({
  storage,
  hub: createRoutingHub({ storage, ...slot }),
});


describe('warm ingest', () => {
  it('a response with a resolver set becomes one exact intent (26)', async () => {
    const { hub } = makeHub(makeSlot(null));
    const received: RouteIntent[] = [];
    hub.setResolver((intent) => received.push(intent));

    await hub.ingest(fixtureChatMessage, false);

    expect(received).toEqual([
      {
        type: 'chat_message',
        data: { type: 'chat_message', conversationId: 'c1' },
        coldStart: false,
        actionId: null,
      },
    ]);
  });

  it('the same identifier delivered twice emits ONE intent (33)', async () => {
    const { hub } = makeHub(makeSlot(null));
    const viaResolver: RouteIntent[] = [];
    const viaListener: RouteIntent[] = [];
    hub.setResolver((intent) => viaResolver.push(intent));
    hub.onIntent((intent) => viaListener.push(intent));

    const response = fixtureResponse('news', { postId: 'n1' }, 'dup-1');
    await hub.ingest(response, false);
    await hub.ingest(response, false);

    const expected: RouteIntent = {
      type: 'news',
      data: { type: 'news', postId: 'n1' },
      coldStart: false,
      actionId: null,
    };
    expect(viaResolver).toEqual([expected]);
    expect(viaListener).toEqual([expected]);
  });

  it('a garbage data string still delivers — empty type, empty data (31)', async () => {
    const { hub } = makeHub(makeSlot(null));
    const received: RouteIntent[] = [];
    hub.setResolver((intent) => received.push(intent));

    await hub.ingest({ identifier: 'garbage-1', actionIdentifier: null, data: '{{{' }, false);

    expect(received).toEqual([{ type: '', data: {}, coldStart: false, actionId: null }]);
  });
});


describe('action identifiers', () => {
  it('a custom action rides on the intent; the default tap maps to null (29)', async () => {
    const { hub } = makeHub(makeSlot(null));
    const received: RouteIntent[] = [];
    hub.setResolver((intent) => received.push(intent));

    await hub.ingest(
      { identifier: 'act-1', actionIdentifier: 'custom.action', data: { type: 'news' } },
      false,
    );
    await hub.ingest(
      { identifier: 'act-2', actionIdentifier: PLATFORM_DEFAULT_TAP, data: { type: 'news' } },
      false,
    );

    expect(received).toEqual([
      { type: 'news', data: { type: 'news' }, coldStart: false, actionId: 'custom.action' },
      { type: 'news', data: { type: 'news' }, coldStart: false, actionId: null },
    ]);
  });
});


describe('pre-resolver buffering', () => {
  it('intents before setResolver are buffered and flushed IN ORDER (28)', async () => {
    const { hub } = makeHub(makeSlot(null));

    await hub.ingest(fixtureResponse('news', { postId: 'n1' }, 'buf-1'), false);
    await hub.ingest(fixtureResponse('chat_message', { conversationId: 'c1' }, 'buf-2'), false);

    const received: RouteIntent[] = [];
    hub.setResolver((intent) => received.push(intent));

    expect(received).toEqual([
      { type: 'news', data: { type: 'news', postId: 'n1' }, coldStart: false, actionId: null },
      {
        type: 'chat_message',
        data: { type: 'chat_message', conversationId: 'c1' },
        coldStart: false,
        actionId: null,
      },
    ]);
  });

  it('the buffer caps at 20 — 25 ingests flush #6 through #25 (28)', async () => {
    const { hub } = makeHub(makeSlot(null));

    for (let i = 1; i <= 25; i += 1) {
      await hub.ingest(fixtureResponse('news', { n: String(i) }, `cap-${i}`), false);
    }

    const received: RouteIntent[] = [];
    hub.setResolver((intent) => received.push(intent));

    expect(received).toHaveLength(20);
    expect(received[0].data.n).toBe('6');
    expect(received[19].data.n).toBe('25');
    expect(received.map((intent) => intent.data.n)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 6)),
    );
  });
});


describe('throwing resolvers', () => {
  it('a resolver that throws on the first intent still gets the second (30)', async () => {
    const { hub } = makeHub(makeSlot(null));
    const resolved: RouteIntent[] = [];
    const heard: RouteIntent[] = [];
    hub.onIntent((intent) => heard.push(intent));
    hub.setResolver((intent) => {
      resolved.push(intent);
      if (resolved.length === 1) throw new Error('router exploded');
    });

    await hub.ingest(fixtureResponse('news', { postId: 'n1' }, 'boom-1'), false);
    await hub.ingest(fixtureResponse('news', { postId: 'n2' }, 'boom-2'), false);

    expect(resolved).toHaveLength(2);
    expect(resolved[1]).toEqual({
      type: 'news',
      data: { type: 'news', postId: 'n2' },
      coldStart: false,
      actionId: null,
    });
    expect(heard).toHaveLength(2);
  });

  it('a throw during the setResolver flush never drops the rest of the buffer (30)', async () => {
    const { hub } = makeHub(makeSlot(null));
    await hub.ingest(fixtureResponse('news', { postId: 'n1' }, 'flush-1'), false);
    await hub.ingest(fixtureResponse('news', { postId: 'n2' }, 'flush-2'), false);

    const resolved: RouteIntent[] = [];
    hub.setResolver((intent) => {
      resolved.push(intent);
      if (resolved.length === 1) throw new Error('router exploded');
    });

    expect(resolved).toHaveLength(2);
    expect(resolved.map((intent) => intent.data.postId)).toEqual(['n1', 'n2']);
  });
});


describe('cold-start consume', () => {
  it('consumeInitial yields the intent ONCE — device cleared, then null (27)', async () => {
    const slot = makeSlot(fixtureChatMessage);
    const { hub, storage } = makeHub(slot);

    const first = await hub.consumeInitial();
    expect(first).toEqual({
      type: 'chat_message',
      data: { type: 'chat_message', conversationId: 'c1' },
      coldStart: true,
      actionId: null,
    });
    // Clear landed before the intent came back, right after the read
    expect(slot.log).toEqual(['read', 'clear']);
    expect(JSON.parse(storage.map.get(CONSUMED_KEY) as string)).toContain('resp-chat-1');

    const second = await hub.consumeInitial();
    expect(second).toBeNull();
    // The empty slot is read but never re-cleared
    expect(slot.log).toEqual(['read', 'clear', 'read']);
  });

  it('a device that ignores clear still yields null the second time (27)', async () => {
    let clears = 0;
    const sticky = {
      readLastResponse: async () => fixtureChatMessage,
      clearLastResponse: () => {
        clears += 1;
      },
    };
    const storage = createMemoryStorage();
    const hub = createRoutingHub({ storage, ...sticky });

    const first = await hub.consumeInitial();
    expect(first).toEqual({
      type: 'chat_message',
      data: { type: 'chat_message', conversationId: 'c1' },
      coldStart: true,
      actionId: null,
    });
    expect(clears).toBe(1);

    const second = await hub.consumeInitial();
    expect(second).toBeNull();
    // Clear still ran BEFORE the dedupe verdict — the device
    // copy is always emptied, even on a suppressed replay
    expect(clears).toBe(2);
    expect(JSON.parse(storage.map.get(CONSUMED_KEY) as string)).toContain('resp-chat-1');
  });

  it('with NO resolver installed, a buffered warm intent is adopted as the cold start — oldest first, coldStart true', async () => {
    const slot = makeSlot(null);
    const { hub } = makeHub(slot);
    const heard: RouteIntent[] = [];
    hub.onIntent((intent) => heard.push(intent));

    // The launch tap lands through the warm listener before the
    // launch consumer ever asks — then a second tap queues
    await hub.ingest(fixtureChatMessage, false);
    await hub.ingest(fixtureResponse('news', { postId: 'n1' }, 'later-1'), false);
    expect(heard).toHaveLength(2);

    const cold = await hub.consumeInitial();

    expect(cold).toEqual({
      type: 'chat_message',
      data: { type: 'chat_message', conversationId: 'c1' },
      coldStart: true,
      actionId: null,
    });
    // The device was never consulted — the parked intent was the answer
    expect(slot.log).toEqual([]);
    // Adoption returns to the caller only; listeners already heard it warm
    expect(heard).toHaveLength(2);

    // The second tap is still parked for the resolver
    const flushed: RouteIntent[] = [];
    hub.setResolver((intent) => flushed.push(intent));
    expect(flushed).toEqual([
      { type: 'news', data: { type: 'news', postId: 'n1' }, coldStart: false, actionId: null },
    ]);
  });

  it('the later device read of the adopted response answers null — one tap, one navigation', async () => {
    // The primitive holds the very response the warm listener
    // already delivered (the launch tap fires both)
    const slot = makeSlot(fixtureChatMessage);
    const { hub, storage } = makeHub(slot);
    await hub.ingest(fixtureChatMessage, false);

    await expect(hub.consumeInitial()).resolves.toMatchObject({ coldStart: true, type: 'chat_message' });

    hub.setResolver(() => undefined);
    await expect(hub.consumeInitial()).resolves.toBeNull();
    // The device copy was read and cleared on that second pass,
    // and the identifier is in the persisted ring
    expect(slot.log).toEqual(['read', 'clear']);
    expect(JSON.parse(storage.map.get(CONSUMED_KEY) as string)).toContain('resp-chat-1');
  });

  it('with a resolver installed the warm path is untouched — consumeInitial reads the device', async () => {
    const slot = makeSlot(fixtureNewsPush);
    const { hub } = makeHub(slot);
    const resolved: RouteIntent[] = [];
    hub.setResolver((intent) => resolved.push(intent));

    // A warm tap routes straight through; nothing is parked
    await hub.ingest(fixtureChatMessage, false);
    expect(resolved).toHaveLength(1);

    const cold = await hub.consumeInitial();

    expect(cold).toEqual({
      type: 'news',
      data: { type: 'news', postId: 'n1' },
      coldStart: true,
      actionId: null,
    });
    expect(slot.log).toEqual(['read', 'clear']);
    // The warm intent was never re-delivered as a cold one
    expect(resolved).toHaveLength(1);
  });

  it('a NEW hub over the same storage never replays the consumed response (34)', async () => {
    const storage = createMemoryStorage();

    const firstBoot = createRoutingHub({ storage, ...makeSlot(fixtureChatMessage) });
    const first = await firstBoot.consumeInitial();
    expect(first).toEqual({
      type: 'chat_message',
      data: { type: 'chat_message', conversationId: 'c1' },
      coldStart: true,
      actionId: null,
    });

    // Fast-refresh / remount: fresh hub, fresh session dedupe,
    // and the primitive hands the same response out again
    const secondBoot = createRoutingHub({ storage, ...makeSlot(fixtureChatMessage) });
    await expect(secondBoot.consumeInitial()).resolves.toBeNull();
    expect(JSON.parse(storage.map.get(CONSUMED_KEY) as string)).toContain('resp-chat-1');
  });
});


describe('normalizeData', () => {
  it('stringifies non-strings, drops null, keeps the type key (32)', () => {
    expect(normalizeData({ type: 'news', count: 7, nested: { a: 1 }, nothing: null })).toEqual({
      type: 'news',
      data: { type: 'news', count: '7', nested: '{"a":1}' },
    });
  });

  it('parses the legacy dataString envelope one level down (32)', () => {
    expect(normalizeData({ dataString: '{"type":"chat_message","conversationId":"c9"}' })).toEqual({
      type: 'chat_message',
      data: { type: 'chat_message', conversationId: 'c9' },
    });
  });

  it('a broken envelope keeps the outer fields (32)', () => {
    expect(normalizeData({ dataString: '{{{', type: 'news' })).toEqual({
      type: 'news',
      data: { dataString: '{{{', type: 'news' },
    });
  });

  it('a raw JSON string parses like an object payload (32)', () => {
    expect(normalizeData('{"type":"news","postId":"7"}')).toEqual({
      type: 'news',
      data: { type: 'news', postId: '7' },
    });
  });
});
