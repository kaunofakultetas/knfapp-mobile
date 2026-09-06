// -----------------------------------------------------------
//  [*] Tests — the fake server, proven against the protocol
//
//  A fake that lies makes every test built on it lie too, so
//  its replies are read back with the upstream's own reader:
//  the frames, the terminator, the message each reply
//  assembles into, and the continuation rule — a reply to a
//  thread ending in an assistant message stamps THAT
//  message's id on its start frame, scripted or routed. Then
//  the plain replies' status/body/header rules, the hang that
//  only a cancel ends, the body cut by a cancel, the call
//  log's exact shape, the queue's order and the function form,
//  and the reference routing — every contract prompt, the tool
//  continuation, the tools path, an unknown prompt refused out
//  loud.
// -----------------------------------------------------------

import { readUIMessageStream, UI_MESSAGE_STREAM_HEADERS, type UIMessage, type UIMessageChunk } from 'ai';

import {
  CONTRACT_PROMPTS,
  CONTRACT_REPLIES,
  createFakeAssistantServer,
  createRecordingFetch,
  errorReply,
  fixtureLessons,
  hangForever,
  jsonReply,
  networkFailure,
  referenceTools,
  streamReply,
  textReply,
  toolReply,
  type FakeReply,
  type RecordedCall,
} from '../index';


const CHAT = 'https://knf.example.lt/api/assistant/chat';
const TOOLS = 'https://knf.example.lt/api/assistant/tools';

// The whole body as text — read chunk by chunk through the
// stream's own reader, decoded here
const bodyText = async (response: Response): Promise<string> => {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
};

// SSE frames → parsed chunks; the terminator is checked and dropped
const chunksOf = (text: string): UIMessageChunk[] => {
  const frames = text.split('\n\n').filter((frame) => frame.length > 0);
  expect(frames[frames.length - 1]).toBe('data: [DONE]');
  return frames.slice(0, -1).map((frame) => {
    expect(frame.startsWith('data: ')).toBe(true);
    return JSON.parse(frame.slice('data: '.length)) as UIMessageChunk;
  });
};

// The message a chunk list assembles into, by the upstream's reader
const assemble = async (chunks: UIMessageChunk[]): Promise<UIMessage> => {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  let last: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream })) last = message;
  if (!last) throw new Error('no message assembled');
  return last;
};

const replyMessage = async (reply: FakeReply): Promise<{ chunks: UIMessageChunk[]; message: UIMessage }> => {
  const chunks = chunksOf(await bodyText(await reply.respond(null)));
  return { chunks, message: await assemble(chunks) };
};

const userTurn = (text: string) => JSON.stringify({ id: 't', trigger: 'submit-message', messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }] });

const post = (server: ReturnType<typeof createFakeAssistantServer>, body: string, init: RequestInit = {}) =>
  server.fetch(CHAT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, ...init });


describe('textReply', () => {
  it('answers a Response-like with the upstream stream headers and a 200', async () => {
    const response = await textReply(['Labas']).respond(null);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');
    expect(response.bodyUsed).toBe(false);
    for (const [name, value] of Object.entries(UI_MESSAGE_STREAM_HEADERS)) expect(response.headers.get(name)).toBe(value);
    await expect(response.text()).resolves.toBe('');
  });

  it('frames start → start-step → text-start / delta* / text-end → finish-step → finish, then [DONE]', async () => {
    const { chunks } = await replyMessage(textReply(['Labas, ', 'KNF!']));
    expect(chunks.map((chunk) => chunk.type)).toEqual(['start', 'start-step', 'text-start', 'text-delta', 'text-delta', 'text-end', 'finish-step', 'finish']);
    expect(chunks[3]).toEqual({ type: 'text-delta', id: 't1', delta: 'Labas, ' });
    expect(chunks[7]).toEqual({ type: 'finish', finishReason: 'stop' });
  });

  it('assembles into one assistant message with the full text, done', async () => {
    const { message } = await replyMessage(textReply(['Labas, ', 'KNF!']));
    expect(message.role).toBe('assistant');
    expect(message.parts).toEqual([{ type: 'step-start' }, { type: 'text', text: 'Labas, KNF!', state: 'done' }]);
  });

  it('with no chunks still frames an empty, well-formed reply', async () => {
    const { chunks, message } = await replyMessage(textReply([]));
    expect(chunks.map((chunk) => chunk.type)).toEqual(['start', 'start-step', 'text-start', 'text-end', 'finish-step', 'finish']);
    expect(message.parts).toEqual([{ type: 'step-start' }, { type: 'text', text: '', state: 'done' }]);
  });

  it('delayMs paces every chunk on real timers', async () => {
    const started = Date.now();
    await bodyText(await streamReply([{ type: 'start' }, { type: 'finish' }], { delayMs: 30 }).respond(null));
    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
  });
});


describe('toolReply', () => {
  it('without text: the tool step then finish with tool-calls — the runtime resends', async () => {
    const { chunks, message } = await replyMessage(toolReply({ name: 'lookupSchedule', input: { group: 'IS-3' }, output: { lessons: [], source: 'live' } }));
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'start', 'start-step', 'tool-input-start', 'tool-input-available', 'tool-output-available', 'finish-step', 'finish',
    ]);
    expect(chunks[6]).toEqual({ type: 'finish', finishReason: 'tool-calls' });
    expect(message.parts).toEqual([
      { type: 'step-start' },
      { type: 'tool-lookupSchedule', toolCallId: 'call_1', state: 'output-available', input: { group: 'IS-3' }, output: { lessons: [], source: 'live' } },
    ]);
  });

  it('with text: a second step carries the answer — one response, nothing resent', async () => {
    const { chunks, message } = await replyMessage(toolReply({ name: 'searchNews', input: { query: 'x' }, output: { posts: [] }, text: 'Nieko.', toolCallId: 'c-9' }));
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'start', 'start-step', 'tool-input-start', 'tool-input-available', 'tool-output-available', 'finish-step',
      'start-step', 'text-start', 'text-delta', 'text-end', 'finish-step', 'finish',
    ]);
    expect(message.parts).toEqual([
      { type: 'step-start' },
      { type: 'tool-searchNews', toolCallId: 'c-9', state: 'output-available', input: { query: 'x' }, output: { posts: [] } },
      { type: 'step-start' },
      { type: 'text', text: 'Nieko.', state: 'done' },
    ]);
  });
});


describe('streamReply', () => {
  it('frames any chunk list as given — reasoning and a mid-stream error included', async () => {
    const chunks: UIMessageChunk[] = [
      { type: 'start' },
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'galvoju' },
      { type: 'reasoning-end', id: 'r1' },
      { type: 'error', errorText: 'model overloaded' },
    ];
    const framed = chunksOf(await bodyText(await streamReply(chunks).respond(null)));
    // The writer stamps a messageId onto a bare start; the rest is verbatim
    expect(framed[0]).toMatchObject({ type: 'start' });
    expect(framed.slice(1)).toEqual(chunks.slice(1));
  });

  it('cuts the body with an AbortError when the request\'s signal fires', async () => {
    const controller = new AbortController();
    const response = await streamReply([{ type: 'start' }, { type: 'text-start', id: 't' }, { type: 'text-end', id: 't' }, { type: 'finish' }], { delayMs: 30 }).respond(controller.signal);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    controller.abort();
    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('an already-cancelled request gets a body that errors on the first read', async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await textReply(['x']).respond(controller.signal);
    await expect((response.body as ReadableStream<Uint8Array>).getReader().read()).rejects.toMatchObject({ name: 'AbortError' });
  });
});


describe('errorReply and jsonReply', () => {
  it('an object body is JSON with the content type set', async () => {
    const response = await errorReply(429, { error: 'slow down' }, { 'retry-after': '30' }).respond(null);
    expect(response.ok).toBe(false);
    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('retry-after')).toBe('30');
    await expect(response.json()).resolves.toEqual({ error: 'slow down' });
  });

  it('a string body is sent as is — text, as the platform types it, never JSON', async () => {
    const response = await errorReply(502, 'Bad Gateway').respond(null);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    await expect(response.text()).resolves.toBe('Bad Gateway');
  });

  it('no body is an empty body', async () => {
    const response = await errorReply(500).respond(null);
    await expect(response.text()).resolves.toBe('');
  });

  it('a caller\'s content type wins over the JSON default', async () => {
    const response = await errorReply(200, { html: true }, { 'content-type': 'text/html' }).respond(null);
    expect(response.headers.get('content-type')).toBe('text/html');
  });

  it('jsonReply is a 200 unless told otherwise', async () => {
    expect((await jsonReply({ tools: [] }).respond(null)).status).toBe(200);
    expect((await jsonReply({ tools: [] }, { status: 201 }).respond(null)).status).toBe(201);
  });
});


describe('networkFailure and hangForever', () => {
  it('networkFailure rejects with a TypeError carrying the message', async () => {
    await expect(networkFailure().respond(null)).rejects.toEqual(new TypeError('Network request failed'));
    await expect(networkFailure('offline').respond(null)).rejects.toEqual(new TypeError('offline'));
  });

  it('hangForever stays pending, and rejects with an AbortError only on a cancel', async () => {
    const controller = new AbortController();
    const pending = hangForever().respond(controller.signal);
    const raced = await Promise.race([pending.then(() => 'answered', () => 'rejected'), new Promise((resolve) => setTimeout(() => resolve('still pending'), 30))]);
    expect(raced).toBe('still pending');

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('hangForever on an already-cancelled request rejects at once', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(hangForever().respond(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});


describe('the call log', () => {
  it('records the URL, the method, lowercase headers, the parsed body and the abort flag', async () => {
    const server = createFakeAssistantServer();
    server.script(textReply(['x']));
    const controller = new AbortController();

    await post(server, '{"messages":[]}', { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' }, signal: controller.signal });

    expect(server.calls).toEqual([{
      url: CHAT,
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer tok' },
      body: { messages: [] },
      aborted: false,
    }]);
    controller.abort();
    expect(server.calls[0].aborted).toBe(true);
  });

  it('keeps a non-JSON body raw, a missing body as null, a URL object as its href, a GET by default', async () => {
    const server = createFakeAssistantServer();
    server.script(jsonReply({}));
    server.script(jsonReply({}));

    await server.fetch(CHAT, { method: 'POST', body: 'not json' });
    await server.fetch(new URL(TOOLS));

    expect(server.calls[0].body).toBe('not json');
    expect(server.calls[1]).toEqual({ url: TOOLS, method: 'GET', headers: {}, body: null, aborted: false });
  });

  it('a fresh server starts with an empty log', () => {
    expect(createFakeAssistantServer().calls).toEqual([]);
  });

  it('createRecordingFetch wraps any fetch, hands its answer through and records the same shape', async () => {
    const recording = createRecordingFetch(async () => new Response('ok', { status: 200 }));

    const response = await recording.fetch(TOOLS, { headers: { Accept: 'application/json' } });

    await expect(response.text()).resolves.toBe('ok');
    expect(recording.calls).toEqual([{ url: TOOLS, method: 'GET', headers: { accept: 'application/json' }, body: null, aborted: false }]);
  });
});


describe('the script queue', () => {
  it('answers in FIFO order, then falls back to the reference routing', async () => {
    const server = createFakeAssistantServer();
    server.script(errorReply(500, { error: 'first' }));
    server.script(errorReply(503, { error: 'second' }));

    expect((await post(server, userTurn('x'))).status).toBe(500);
    expect((await post(server, userTurn('x'))).status).toBe(503);
    const third = await post(server, userTurn(CONTRACT_PROMPTS.text));
    expect(third.status).toBe(200);
    expect((await assemble(chunksOf(await bodyText(third)))).parts).toContainEqual({ type: 'text', text: CONTRACT_REPLIES.text.full, state: 'done' });
  });

  it('a function script sees the recorded call and its answer is used', async () => {
    const server = createFakeAssistantServer();
    const seen: RecordedCall[] = [];
    server.script((call) => {
      seen.push(call);
      return errorReply(418, { error: `teapot for ${call.method}` });
    });

    const response = await post(server, userTurn('x'));

    expect(response.status).toBe(418);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(server.calls[0]);
  });

  it('an unscripted, unknown prompt rejects out loud, naming the prompt', async () => {
    const server = createFakeAssistantServer();
    await expect(post(server, userTurn('kas naujo?'))).rejects.toThrow('fake assistant server: no reply scripted and no contract prompt in "kas naujo?"');
  });

  it('an unscripted, unknown path rejects out loud, naming the route', async () => {
    const server = createFakeAssistantServer();
    await expect(server.fetch('https://knf.example.lt/api/news')).rejects.toThrow('fake assistant server: no route for GET /api/news');
  });
});


describe('the reference routing', () => {
  it('contract:text streams the contract text', async () => {
    const server = createFakeAssistantServer();
    const message = await assemble(chunksOf(await bodyText(await post(server, userTurn(CONTRACT_PROMPTS.text)))));
    expect(message.parts).toContainEqual({ type: 'text', text: CONTRACT_REPLIES.text.full, state: 'done' });
  });

  it('contract:tool streams the lookupSchedule call with the fixture lessons and ends the response', async () => {
    const server = createFakeAssistantServer();
    const chunks = chunksOf(await bodyText(await post(server, userTurn(CONTRACT_PROMPTS.tool))));
    expect(chunks[chunks.length - 1]).toEqual({ type: 'finish', finishReason: 'tool-calls' });
    expect((await assemble(chunks)).parts).toContainEqual({
      type: 'tool-lookupSchedule',
      toolCallId: 'call_1',
      state: 'output-available',
      input: { group: 'IS-3', range: 'day' },
      output: { lessons: fixtureLessons, source: 'live' },
    });
  });

  it('a thread ending in the assistant\'s tool output — the continuation — streams the tool answer under the SAME message id', async () => {
    const server = createFakeAssistantServer();
    const continuation = JSON.stringify({
      id: 't',
      trigger: 'submit-message',
      messageId: 'a1',
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: CONTRACT_PROMPTS.tool }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'step-start' }, { type: 'tool-lookupSchedule', toolCallId: 'call_1', state: 'output-available', input: {}, output: {} }] },
      ],
    });
    const chunks = chunksOf(await bodyText(await post(server, continuation)));
    // The continuation rule on the wire: the start frame echoes
    // the continued assistant message's id — a fresh id here
    // would push a SECOND assistant message on the client
    expect(chunks[0]).toEqual({ type: 'start', messageId: 'a1' });
    expect((await assemble(chunks)).parts).toContainEqual({ type: 'text', text: CONTRACT_REPLIES.toolText.full, state: 'done' });
  });

  it('a thread ending in a tool ERROR is a continuation too', async () => {
    const server = createFakeAssistantServer();
    const continuation = JSON.stringify({
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'anything' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'tool-searchNews', toolCallId: 'c', state: 'output-error', input: {}, errorText: 'down' }] },
      ],
    });
    const chunks = chunksOf(await bodyText(await post(server, continuation)));
    expect(chunks[0]).toEqual({ type: 'start', messageId: 'a1' });
    expect((await assemble(chunks)).parts).toContainEqual({ type: 'text', text: CONTRACT_REPLIES.toolText.full, state: 'done' });
  });

  it('a SCRIPTED streamed reply continues the thread\'s last assistant message too — the rule lives in the builders', async () => {
    const server = createFakeAssistantServer();
    server.script(textReply(['Baigta.']));
    const continuation = JSON.stringify({
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'bet kas' }] },
        { id: 'a-77', role: 'assistant', parts: [{ type: 'tool-lookupSchedule', toolCallId: 'c1', state: 'output-available', input: {}, output: {} }] },
      ],
    });
    const chunks = chunksOf(await bodyText(await post(server, continuation)));
    expect(chunks[0]).toEqual({ type: 'start', messageId: 'a-77' });
  });

  it('a first turn — the thread ending in the user\'s message — gets a fresh message id, never the user\'s', async () => {
    const server = createFakeAssistantServer();
    server.script(textReply(['Labas.']));
    const chunks = chunksOf(await bodyText(await post(server, userTurn('labas'))));
    const start = chunks[0] as { type: string; messageId?: string };
    expect(start.type).toBe('start');
    expect(typeof start.messageId).toBe('string');
    expect(start.messageId).not.toBe('u1');
  });

  it('contract:auth answers 401 with the contract body', async () => {
    const server = createFakeAssistantServer();
    const response = await post(server, userTurn(CONTRACT_PROMPTS.auth));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(CONTRACT_REPLIES.auth.body);
  });

  it('contract:quota answers 429 with Retry-After: 30 and the contract body', async () => {
    const server = createFakeAssistantServer();
    const response = await post(server, userTurn(CONTRACT_PROMPTS.quota));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    await expect(response.json()).resolves.toEqual(CONTRACT_REPLIES.quota.body);
  });

  it('contract:slow streams the slow chunks, paced', async () => {
    const server = createFakeAssistantServer();
    const started = Date.now();
    const message = await assemble(chunksOf(await bodyText(await post(server, userTurn(CONTRACT_PROMPTS.slow)))));
    expect(message.parts).toContainEqual({ type: 'text', text: CONTRACT_REPLIES.slow.chunks.join(''), state: 'done' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(CONTRACT_REPLIES.slow.delayMs * 5);
  });

  it('the last USER text routes — an assistant text after it does not', async () => {
    const server = createFakeAssistantServer();
    const body = JSON.stringify({
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: CONTRACT_PROMPTS.auth }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Sveiki' }] },
      ],
    });
    expect((await post(server, body)).status).toBe(401);
  });

  it('the tools path serves the mirrors, guest or not, whatever the host', async () => {
    const server = createFakeAssistantServer();
    const response = await server.fetch('http://localhost:5000/api/assistant/tools');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({ tools: referenceTools() });
  });

  it('routes on the path alone — a bare path and a prefixed host both reach the chat', async () => {
    const server = createFakeAssistantServer();
    expect((await post(server, userTurn(CONTRACT_PROMPTS.auth))).status).toBe(401);
    expect((await server.fetch('/api/assistant/chat', { method: 'POST', body: userTurn(CONTRACT_PROMPTS.auth) })).status).toBe(401);
    expect((await server.fetch('https://knf.example.lt/mobile/api/assistant/chat', { method: 'POST', body: userTurn(CONTRACT_PROMPTS.auth) })).status).toBe(401);
  });
});
