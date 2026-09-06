// -----------------------------------------------------------
//  [*] Tests — the runtime hook over the real upstream
//
//  useKnfAssistantRuntime mounted under the real provider with
//  the real transport and the fake server behind it: a text
//  reply grows one assistant message; a tool reply ends the
//  response and the hook resends the thread on its own — the
//  second request carrying the tool part with its output and
//  the message id being continued — and the answer lands in
//  the SAME message, in the raw chat state too, so the turn
//  after resends one assistant message with one tool part; a
//  tool reply that carries its answer in a second step is one
//  request; a thread handed in as initialMessages is shown
//  before any wire traffic; a transport failure reads back
//  through useAssistantFailure verbatim — and ends the thread
//  in the error-status assistant message a banner keys on —
//  while a mid-stream error chunk reads as 'server'; a cancel
//  keeps the partial text and raises no failure; the request
//  body is the upstream's, with no client tools and no client
//  system prompt.
// -----------------------------------------------------------

import {
  createFakeAssistantServer,
  errorReply,
  mountAssistantProbe,
  networkFailure,
  streamReply,
  textOf,
  textReply,
  toolCallsOf,
  toolReply,
  type AssistantProbe,
} from '../../testing';
import { createKnfAssistantTransport } from '../../core/transport';
import type { AssistantFailure } from '../../core/types';


const BASE = 'https://knf.example.lt';

interface Rig {
  probe: AssistantProbe;
  server: ReturnType<typeof createFakeAssistantServer>;
  failures: AssistantFailure[];
}

const mount = async (options: { token?: string | null; initialMessages?: unknown[] } = {}): Promise<Rig> => {
  const server = createFakeAssistantServer();
  const failures: AssistantFailure[] = [];
  const transport = createKnfAssistantTransport({
    baseUrl: BASE,
    fetch: server.fetch,
    getAuthToken: async () => options.token ?? null,
    language: () => 'lt',
    clientVersion: '1.2.3',
    onFailure: (failure) => {
      failures.push(failure);
    },
  });
  const probe = await mountAssistantProbe({ transport, ...(options.initialMessages ? { initialMessages: options.initialMessages } : {}) });
  return { probe, server, failures };
};

const last = (probe: AssistantProbe) => probe.messages()[probe.messages().length - 1];

let rig: Rig | null = null;

afterEach(async () => {
  await rig?.probe.unmount();
  rig = null;
});


describe('a text reply', () => {
  it('accumulates into one assistant message, running while it streams, idle after', async () => {
    rig = await mount();
    const { probe, server } = rig;
    server.script(textReply(['Rytoj ', 'paskaitų ', 'nėra.']));

    expect(probe.messages()).toEqual([]);
    expect(probe.isRunning()).toBe(false);

    await probe.send('Kada rytoj paskaitos?');
    await probe.until(() => textOf(last(probe)) === 'Rytoj paskaitų nėra.', 'the full text');
    await probe.settle();

    expect(probe.messages()).toHaveLength(2);
    expect(probe.messages()[0].role).toBe('user');
    expect(textOf(probe.messages()[0])).toBe('Kada rytoj paskaitos?');
    expect(probe.messages()[1].role).toBe('assistant');
    // The upstream marks the finished message complete but keeps
    // its own 'unknown' reason — the wire's finishReason is not
    // carried across
    expect(probe.messages()[1].status).toMatchObject({ type: 'complete' });
    expect(probe.failure()).toBeNull();
  });

  it('posts the upstream body: the thread id, the messages, the trigger, NO client tools, NO client system prompt', async () => {
    rig = await mount({ token: 'tok' });
    const { probe, server } = rig;
    server.script(textReply(['Labas']));

    await probe.send('Labas');
    await probe.until(() => server.calls.length === 1, 'the request');
    await probe.settle();

    const body = server.calls[0].body as Record<string, unknown>;
    expect(typeof body.id).toBe('string');
    expect(body.trigger).toBe('submit-message');
    expect(body.messages).toEqual([
      expect.objectContaining({ role: 'user', parts: [{ type: 'text', text: 'Labas' }] }),
    ]);
    expect(body.tools).toEqual({});
    expect(body).not.toHaveProperty('system');
    expect(server.calls[0].headers.authorization).toBe('Bearer tok');
  });

  it('a second turn resends the whole thread', async () => {
    rig = await mount();
    const { probe, server } = rig;
    server.script(textReply(['Vienas']));
    server.script(textReply(['Du']));

    await probe.send('pirmas');
    await probe.until(() => textOf(last(probe)) === 'Vienas', 'the first answer');
    await probe.settle();
    await probe.send('antras');
    await probe.until(() => textOf(last(probe)) === 'Du', 'the second answer');
    await probe.settle();

    expect(probe.messages().map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    const resent = (server.calls[1].body as { messages: { role: string }[] }).messages;
    expect(resent.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
  });
});


describe('a tool reply', () => {
  it('auto-continues: the second request carries the output and continues the assistant message; the answer lands in it', async () => {
    rig = await mount();
    const { probe, server } = rig;
    const output = { lessons: [], source: 'live', note: 'laisva diena' };
    server.script(toolReply({ name: 'lookupSchedule', input: { group: 'IS-3', range: 'day' }, output }));
    server.script(textReply(['Rytoj ', 'laisva.']));

    await probe.send('Kada rytoj paskaitos IS-3?');
    await probe.until(() => server.calls.length === 2, 'the continuation');
    await probe.until(() => textOf(last(probe)) === 'Rytoj laisva.', 'the answer');
    await probe.settle();

    const first = server.calls[0].body as { messageId?: string };
    expect(first).not.toHaveProperty('messageId');
    const second = server.calls[1].body as { trigger: string; messageId: string; messages: { id: string; role: string; parts: Record<string, unknown>[] }[] };
    expect(second.trigger).toBe('submit-message');
    const resentAssistant = second.messages[second.messages.length - 1];
    expect(resentAssistant.role).toBe('assistant');
    expect(second.messageId).toBe(resentAssistant.id);
    expect(resentAssistant.parts).toEqual([
      { type: 'step-start' },
      { type: 'tool-lookupSchedule', toolCallId: 'call_1', state: 'output-available', input: { group: 'IS-3', range: 'day' }, output },
    ]);

    expect(probe.messages()).toHaveLength(2);
    const toolCalls = toolCallsOf(last(probe));
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ toolName: 'lookupSchedule', toolCallId: 'call_1', args: { group: 'IS-3', range: 'day' }, result: output });
    expect(probe.failure()).toBeNull();

    // The thread view joins consecutive assistant messages, so
    // only the raw chat state can prove the continuation landed
    // in the SAME message rather than pushing a second one
    expect(probe.rawMessages().map((message) => message.role)).toEqual(['user', 'assistant']);

    // The turn after: one assistant message resent, its tool
    // part exactly once — the duplicate a split would feed the
    // model on every later turn
    server.script(textReply(['Prašom.']));
    await probe.send('Ačiū');
    await probe.until(() => textOf(last(probe)) === 'Prašom.', 'the third answer');
    await probe.settle();
    const third = (server.calls[2].body as { messages: { role: string; parts: { type: string }[] }[] }).messages;
    expect(third.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    expect(third.flatMap((message) => message.parts.filter((part) => part.type === 'tool-lookupSchedule'))).toHaveLength(1);
  });

  it('with its answer in a second step is ONE request — tool and text in one message', async () => {
    rig = await mount();
    const { probe, server } = rig;
    server.script(toolReply({ name: 'searchNews', input: { query: 'stipendijos' }, output: { posts: [] }, text: 'Naujienų nėra.' }));

    await probe.send('Ar yra naujienų apie stipendijas?');
    await probe.until(() => textOf(last(probe)) === 'Naujienų nėra.', 'the answer');
    await probe.settle();

    expect(server.calls).toHaveLength(1);
    expect(probe.messages()).toHaveLength(2);
    expect(toolCallsOf(last(probe))).toHaveLength(1);
    expect(toolCallsOf(last(probe))[0]).toMatchObject({ toolName: 'searchNews', result: { posts: [] } });
  });

  it('a tool that failed is carried as an error result and the continuation still runs', async () => {
    rig = await mount();
    const { probe, server } = rig;
    server.script(
      streamReply([
        { type: 'start' },
        { type: 'start-step' },
        { type: 'tool-input-available', toolCallId: 'call_9', toolName: 'searchHandbook', input: { query: 'biblioteka' } },
        { type: 'tool-output-error', toolCallId: 'call_9', errorText: 'index unavailable' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'tool-calls' },
      ]),
    );
    server.script(textReply(['Žinyno šiuo metu nepasiekiu.']));

    await probe.send('Kada dirba biblioteka?');
    await probe.until(() => server.calls.length === 2, 'the continuation');
    await probe.until(() => textOf(last(probe)) === 'Žinyno šiuo metu nepasiekiu.', 'the answer');
    await probe.settle();

    const resent = (server.calls[1].body as { messages: { parts: Record<string, unknown>[] }[] }).messages;
    expect(resent[resent.length - 1].parts).toContainEqual(
      expect.objectContaining({ type: 'tool-searchHandbook', state: 'output-error', errorText: 'index unavailable' }),
    );
    expect(toolCallsOf(last(probe))[0]).toMatchObject({ toolName: 'searchHandbook', isError: true });
    expect(probe.failure()).toBeNull();
  });
});


describe('initialMessages', () => {
  it('a persisted thread is shown at once, with no wire traffic', async () => {
    rig = await mount({
      initialMessages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Labas' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Sveiki! Kuo galiu padėti?', state: 'done' }] },
      ],
    });
    const { probe, server } = rig;

    expect(probe.messages().map((message) => [message.role, textOf(message)])).toEqual([
      ['user', 'Labas'],
      ['assistant', 'Sveiki! Kuo galiu padėti?'],
    ]);
    expect(server.calls).toEqual([]);
    expect(probe.isRunning()).toBe(false);
  });

  it('the next turn resends the persisted thread ahead of the new message', async () => {
    rig = await mount({
      initialMessages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Labas' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Sveiki!', state: 'done' }] },
      ],
    });
    const { probe, server } = rig;
    server.script(textReply(['Rytoj.']));

    await probe.send('Kada?');
    await probe.until(() => textOf(last(probe)) === 'Rytoj.', 'the answer');
    await probe.settle();

    const sent = (server.calls[0].body as { messages: { id: string }[] }).messages;
    expect(sent.slice(0, 2).map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(sent).toHaveLength(3);
  });
});


describe('failures', () => {
  it('a 401 reads back through useAssistantFailure verbatim, reported to onFailure once, the run idle', async () => {
    rig = await mount({ token: 'stale' });
    const { probe, server, failures } = rig;
    server.script(errorReply(401, { error: 'expired' }));

    await probe.send('Labas');
    await probe.until(() => probe.failure() !== null, 'the failure');
    await probe.settle();

    expect(probe.failure()).toEqual({ code: 'auth', status: 401, message: 'expired' });
    expect(probe.error()?.name).toBe('AssistantTransportError');
    expect(failures).toEqual([{ code: 'auth', status: 401, message: 'expired' }]);
    expect(probe.isRunning()).toBe(false);

    // The upstream ends the thread in an assistant message
    // whose status carries the error — the one signal an error
    // banner renders from, pinned here at the transport seam
    expect(last(probe).role).toBe('assistant');
    expect(last(probe).status).toMatchObject({ type: 'incomplete', reason: 'error', error: 'expired' });
  });

  it('a throwing wire reads as network', async () => {
    rig = await mount();
    const { probe, server } = rig;
    server.script(networkFailure('Network request failed'));

    await probe.send('Labas');
    await probe.until(() => probe.failure() !== null, 'the failure');

    expect(probe.failure()).toEqual({ code: 'network', message: 'Network request failed' });
  });

  it('an error chunk mid-stream reads as server with the chunk\'s words — the model layer\'s failure, not the wire\'s — memoized on the error', async () => {
    rig = await mount();
    const { probe, server, failures } = rig;
    server.script(
      streamReply([
        { type: 'start' },
        { type: 'start-step' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Pradedu…' },
        { type: 'error', errorText: 'model overloaded' },
      ]),
    );

    await probe.send('Labas');
    await probe.until(() => probe.failure() !== null, 'the failure');
    await probe.settle();

    expect(probe.failure()).toEqual({ code: 'server', message: 'model overloaded' });
    expect(probe.error()?.name).not.toBe('AssistantTransportError');
    // The wire itself was fine — nothing for the transport to report
    expect(failures).toEqual([]);

    // A 'server' failure is a FRESH object per compute, so only
    // the hook's memo on the error's identity keeps the
    // reference stable across a commit that changes nothing —
    // the pin an effect keyed on the failure depends on
    const first = probe.failure();
    await probe.rerender();
    expect(probe.failure()).toBe(first);
  });

  it('a transport failure keeps one identity across commits and clears once a later turn succeeds', async () => {
    rig = await mount();
    const { probe, server } = rig;
    server.script(errorReply(503, { error: 'restarting' }, { 'retry-after': '5' }));
    server.script(textReply(['Grįžau.']));

    await probe.send('Labas');
    await probe.until(() => probe.failure() !== null, 'the failure');
    await probe.settle();
    const first = probe.failure();
    expect(first).toEqual({ code: 'unavailable', status: 503, retryAfterMs: 5_000, message: 'restarting' });
    // A transport failure is the error's own failure object —
    // a commit that changes nothing must answer the same one
    await probe.rerender();
    expect(probe.failure()).toBe(first);

    await probe.send('Dar kartą');
    await probe.until(() => textOf(last(probe)) === 'Grįžau.', 'the recovery');
    await probe.settle();

    expect(probe.failure()).toBeNull();
  });
});


describe('a cancel', () => {
  it('mid-stream keeps the partial text, ends the run, raises no failure and reports nothing', async () => {
    rig = await mount();
    const { probe, server, failures } = rig;
    server.script(textReply(['vienas ', 'du ', 'trys ', 'keturi ', 'penki'], { delayMs: 40 }));

    await probe.send('Skaičiuok');
    await probe.until(() => textOf(last(probe)).length > 0, 'the first delta');
    await probe.cancel();
    await probe.settle();

    const partial = textOf(last(probe));
    expect(partial.length).toBeGreaterThan(0);
    expect('vienas du trys keturi penki'.startsWith(partial)).toBe(true);
    expect(partial).not.toBe('vienas du trys keturi penki');
    expect(server.calls[0].aborted).toBe(true);
    expect(probe.failure()).toBeNull();
    expect(failures).toEqual([]);
    expect(probe.isRunning()).toBe(false);
  });
});
