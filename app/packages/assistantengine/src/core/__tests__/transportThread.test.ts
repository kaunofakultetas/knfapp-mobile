// -----------------------------------------------------------
//  [*] Tests — the threadId injection
//
//  The lazy-thread seam pinned: a configured resolver's id
//  lands in the chat body as `threadId` beside the
//  upstream's own fields, asked fresh on every send; a
//  null answer and an absent resolver leave the body
//  byte-identical; a rejecting resolver fails the request
//  as a reported 'network' failure (never a silently
//  stateless turn); a non-object body passes through
//  untouched.
// -----------------------------------------------------------

import { createAssistantFetch } from '../transport';
import { ASSISTANT_CHAT_PATH, AssistantTransportError, type AssistantFailure, type AssistantTransportConfig } from '../types';
import { createFakeAssistantServer, textReply } from '../../testing';


const BASE = 'https://knf.example.lt';
const URL_CHAT = `${BASE}${ASSISTANT_CHAT_PATH}`;

const rig = (overrides: Partial<AssistantTransportConfig> = {}) => {
  const server = createFakeAssistantServer();
  const failures: AssistantFailure[] = [];
  const config: AssistantTransportConfig = {
    baseUrl: BASE,
    getAuthToken: async () => null,
    language: () => 'lt',
    clientVersion: '1.0.0',
    fetch: server.fetch,
    onFailure: (failure) => {
      failures.push(failure);
    },
    ...overrides,
  };
  return { server, failures, run: createAssistantFetch(config) };
};

// Every send scripts its own one-shot reply first — the fake
// serves scripts in FIFO order
const post = (rigged: ReturnType<typeof rig>, body = '{"messages":[],"trigger":"submit-message"}') => {
  rigged.server.script(textReply(['Labas!']));
  return rigged.run(URL_CHAT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
};


describe('threadId injection', () => {
  it('stamps the resolved id beside the upstream fields, fresh per send', async () => {
    const ids = ['thread-1', 'thread-1'];
    let resolved = 0;
    const rigged = rig({ threadId: async () => ids[resolved++] });
    const { server } = rigged;

    await post(rigged);
    await post(rigged);

    expect(resolved).toBe(2);
    for (const call of server.calls) {
      expect(call.body).toEqual({ messages: [], trigger: 'submit-message', threadId: 'thread-1' });
    }
  });

  it('a null id and an absent resolver both leave the body untouched', async () => {
    const withNull = rig({ threadId: () => null });
    await post(withNull);
    expect(withNull.server.calls[0].body).toEqual({ messages: [], trigger: 'submit-message' });

    const without = rig();
    await post(without);
    expect(without.server.calls[0].body).toEqual({ messages: [], trigger: 'submit-message' });
  });

  it('a rejecting resolver fails the request, keeping the HTTP identity when it has one', async () => {
    const rigged = rig({
      threadId: async () => {
        throw new Error('backend down');
      },
    });
    const { server, failures } = rigged;

    await expect(post(rigged)).rejects.toBeInstanceOf(AssistantTransportError);
    expect(failures).toEqual([{ code: 'network', message: 'Thread could not be created' }]);
    // The request never reached the wire — the thread the host
    // meant to persist must not degrade to a stateless turn
    expect(server.calls).toHaveLength(0);

    // A rejection carrying an HTTP status maps like the wire's
    // own failures — a 429 on thread-create reads as quota
    const limited = rig({
      threadId: async () => {
        throw Object.assign(new Error('slow down'), { status: 429 });
      },
    });
    await expect(post(limited)).rejects.toBeInstanceOf(AssistantTransportError);
    expect(limited.failures).toEqual([{ code: 'quota', status: 429, message: 'Thread could not be created' }]);
  });

  it('a non-object JSON body passes through byte-identical', async () => {
    const rigged = rig({ threadId: () => 'thread-9' });
    await post(rigged, '[1,2,3]');
    const { server } = rigged;
    expect(server.calls[0].body).toEqual([1, 2, 3]);
  });
});
