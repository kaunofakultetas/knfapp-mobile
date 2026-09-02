// -----------------------------------------------------------
//  [*] Tests — the transport contract, run on the fake
//
//  The conformance suite is the promise every transport keeps;
//  the in-memory fake must keep it too, or every engine test
//  built on the fake proves nothing. Alongside it, the fake's
//  own recording contract is pinned: hosts assert on the calls
//  array, so its growth and payload shapes are guarantees.
// -----------------------------------------------------------

import { createFakeTransport, describeTransportContract } from '../testing';

describeTransportContract('in-memory fake', () => createFakeTransport());

describe('fake transport call recording', () => {
  it('records every method by name, in call order, with the exact payload', async () => {
    const transport = createFakeTransport();

    await transport.register({ token: 'ExponentPushToken[recording-0001]', platform: 'android', language: 'lt' });
    await transport.getChannels();
    await transport.putChannels({ news: false });
    await transport.getChatPreview();
    await transport.putChatPreview(false);
    await transport.unregister({ token: 'ExponentPushToken[recording-0001]' });

    expect(transport.calls).toEqual([
      { method: 'register', payload: { token: 'ExponentPushToken[recording-0001]', platform: 'android', language: 'lt' } },
      { method: 'getChannels', payload: null },
      { method: 'putChannels', payload: { news: false } },
      { method: 'getChatPreview', payload: null },
      { method: 'putChatPreview', payload: false },
      { method: 'unregister', payload: { token: 'ExponentPushToken[recording-0001]' } },
    ]);
  });

  it('records the call even when an injected failure makes the method throw', async () => {
    const transport = createFakeTransport();
    transport.overrides.putChannels = () => Promise.reject(new Error('backend down'));

    await expect(transport.putChannels({ chat: false })).rejects.toThrow('backend down');

    expect(transport.calls).toEqual([{ method: 'putChannels', payload: { chat: false } }]);
    // The injected failure also left state untouched — nothing was applied
    expect(transport.channels).toEqual({ news: true, chat: true, schedule: true, admin: true });
  });

  it('a fresh fake starts with an empty recording — no ambient calls', () => {
    const transport = createFakeTransport();
    expect(transport.calls).toEqual([]);
  });
});
