// -----------------------------------------------------------
//  [*] Tests — the threadId injection
//
//  The lazy-thread seam pinned: a configured resolver's id
//  lands in the chat body as `threadId` beside the
//  upstream's own fields, asked fresh on every send; a
//  null answer and an absent resolver leave the body
//  byte-identical; a rejecting resolver fails the request
//  as a reported failure keeping the refusal's status,
//  server code and words (never a silently stateless turn);
//  a non-object body passes through untouched. The history window beside it: a short
//  conversation goes out untouched, a long one is cut to the
//  newest 40 messages opening on a user turn, and tool parts
//  older than the newest ten are dropped — so a long thread
//  never crosses the container's 60-message / body ceilings
//  and dies on a 400 forever.
// -----------------------------------------------------------

import { createAssistantFetch, trimHistory } from '../transport';
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

  it('the thread-create refusal keeps its whole identity — status, server code and words', async () => {
    // The host's HTTP client error, by shape: status, the body
    // as `data` (the container's envelope), maybe a serverCode
    const refusal = (fields: Record<string, unknown>) =>
      rig({ threadId: async () => { throw Object.assign(new Error('http'), fields); } });

    const sandbox = refusal({ status: 503, data: { message: 'Assistant is not part of the QA sandbox', error: { code: 'QA_SANDBOX' } } });
    await expect(post(sandbox)).rejects.toThrow('unavailable 503 QA_SANDBOX: Thread could not be created — Assistant is not part of the QA sandbox');
    expect(sandbox.failures).toEqual([{
      code: 'unavailable', status: 503, serverCode: 'QA_SANDBOX',
      message: 'Thread could not be created — Assistant is not part of the QA sandbox',
    }]);

    // A 500 is the server, never "check your connection"
    const broken = refusal({ status: 500, data: { error: 'Internal', code: 'boom' } });
    await expect(post(broken)).rejects.toBeInstanceOf(AssistantTransportError);
    expect(broken.failures[0]).toMatchObject({ code: 'server', status: 500, serverCode: 'boom' });

    // No status: the client's own timeout, or the network
    const slow = refusal({ status: 0, code: 'timeout' });
    await expect(post(slow)).rejects.toBeInstanceOf(AssistantTransportError);
    expect(slow.failures).toEqual([{ code: 'timeout', message: 'Thread could not be created' }]);
  });

  it('a non-object JSON body passes through byte-identical', async () => {
    const rigged = rig({ threadId: () => 'thread-9' });
    await post(rigged, '[1,2,3]');
    const { server } = rigged;
    expect(server.calls[0].body).toEqual([1, 2, 3]);
  });
});


// A conversation of `pairs` exchanges, every answer carrying
// one tool part and its text
const conversation = (pairs: number) =>
  Array.from({ length: pairs }, (_, index) => [
    { id: `u${index}`, role: 'user', parts: [{ type: 'text', text: `klausimas ${index}` }] },
    {
      id: `a${index}`,
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        { type: 'tool-searchHandbook', toolCallId: `c${index}`, state: 'output-available', input: { query: 'q' }, output: { entries: [] } },
        { type: 'text', text: `atsakymas ${index}` },
      ],
    },
  ]).flat();

const toolParts = (message: unknown) =>
  ((message as { parts: { type: string }[] }).parts).filter((part) => part.type.startsWith('tool-'));


describe('the history window', () => {
  it('a short conversation is returned AS IS — same array, nothing stripped', () => {
    const messages = conversation(4);
    expect(trimHistory(messages)).toBe(messages);
  });

  it('a long one keeps the newest 40, opening on a user turn, tool parts only on the newest 10', () => {
    const messages = conversation(30);
    const kept = trimHistory(messages);
    expect(kept).toHaveLength(40);
    expect((kept[0] as { role: string }).role).toBe('user');
    expect((kept[kept.length - 1] as { id: string }).id).toBe('a29');
    // The newest ten are untouched objects — the container
    // persists exactly these, so they must not change
    expect(kept.slice(-10)).toEqual(messages.slice(-10));
    kept.slice(-10).forEach((message, index) => expect(message).toBe(messages[messages.length - 10 + index]));
    // Older answers keep their text, lose their tool parts
    const older = kept.slice(0, -10).filter((message) => (message as { role: string }).role === 'assistant');
    expect(older.length).toBeGreaterThan(0);
    older.forEach((message) => {
      expect(toolParts(message)).toHaveLength(0);
      expect((message as { parts: { type: string; text?: string }[] }).parts.some((part) => part.type === 'text')).toBe(true);
    });
  });

  it('a window whose cut lands on an answer steps forward to the next question', () => {
    // 41 messages: the cut at index 1 is an assistant turn
    const messages = [...conversation(20), { id: 'u20', role: 'user', parts: [{ type: 'text', text: 'dar' }] }];
    const kept = trimHistory(messages);
    expect((kept[0] as { role: string; id: string }).role).toBe('user');
    expect((kept[0] as { id: string }).id).toBe('u1');
    expect(kept).toHaveLength(39);
  });

  it('the wire body carries the window; a long thread no longer crosses the 60-message ceiling', async () => {
    const rigged = rig({ threadId: () => 'thread-long' });
    await post(rigged, JSON.stringify({ messages: conversation(35), trigger: 'submit-message' }));
    const sent = rigged.server.calls[0].body as { messages: unknown[]; threadId: string; trigger: string };
    expect(sent.messages).toHaveLength(40);
    expect(sent.threadId).toBe('thread-long');
    expect(sent.trigger).toBe('submit-message');
  });
});
