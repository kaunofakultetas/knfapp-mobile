// -----------------------------------------------------------
//  [*] assistantengine — testing doubles
//
//  The package proves itself (and lets hosts prove themselves)
//  without a container or a model: a fake server behind the
//  fetch seam whose every reply is built by the upstream's own
//  stream writer — so a frame is protocol-correct by
//  construction — with a recorded call log and a reply queue;
//  a scripted model adapter for the upstream's local runtime,
//  for screens that want no wire at all; a probe that mounts
//  the REAL runtime hook under the REAL provider and reads the
//  thread back through the upstream hooks; the transport
//  conformance suite any server must also pass; and named
//  fixtures in the tool output shapes. Left unscripted, the
//  fake is the REFERENCE CONTAINER: it answers the contract
//  prompts below exactly as the live service must in its
//  contract mode, which is what lets one describe run against
//  both.
//
//  One thing every fake here knows: under jest the runtime's
//  stream globals are the on-device polyfill while Response
//  stays the host's, so a streamed reply is a Response-LIKE
//  object whose body was built in the test realm — the
//  transport and the upstream read only the fields it carries.
//
//  Used by:
//    - this package's own test battery
//    - hosts, via '@knf/assistantengine/testing'
//    - the container's integration job (the contract describe)
// -----------------------------------------------------------

import { useAISDKChat, useAISDKError } from '@assistant-ui/ai-sdk';
import {
  AssistantRuntimeProvider,
  useAuiState,
  type AssistantRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ChatModelRunResult,
  type MessageState,
  type ThreadAssistantMessagePart,
  type ThreadMessage,
  type ToolCallMessagePart,
} from '@assistant-ui/react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { createUIMessageStream, JsonToSseTransformStream, UI_MESSAGE_STREAM_HEADERS, type UIMessage, type UIMessageChunk } from 'ai';
import { useEffect } from 'react';

import { createKnfAssistantTransport } from '../core/transport';
import { ASSISTANT_CHAT_PATH, ASSISTANT_TOOLS_PATH, type AssistantFailure } from '../core/types';
import { useAssistantFailure } from '../hooks/useAssistantFailure';
import { useKnfAssistantRuntime, type KnfAssistantRuntimeOptions } from '../hooks/useKnfAssistantRuntime';
import {
  ASSISTANT_TOOL_NAMES,
  ASSISTANT_TOOL_SCHEMAS,
  type AssistantHandbookEntry,
  type AssistantLesson,
  type AssistantNewsPost,
  type AssistantToolDescriptor,
} from '../tools/contract';

export { useLocalRuntime } from '@assistant-ui/react-native';


// The shape a real fetch rejects with on a cancel — the same
// one the transport's own abort race produces
const abortError = (): Error => Object.assign(new Error('Request aborted'), { name: 'AbortError' });

// Real timers on purpose: a delayed reply is there to let a
// test cancel mid-stream, and a cancel resolves it early
const sleep = (ms: number, signal?: AbortSignal | null): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });


// -----------------------------------------------------------
// createRecordingFetch
// -----------------------------------------------------------
//
// Any fetch, with every request written down first: the URL,
// the method, the headers as one lowercase record, the body
// parsed back from JSON when it was JSON, and an `aborted`
// flag that flips when the request's own signal fires — the
// proof a cancel reached the wire. The fake server writes the
// same record, so a host asserts on one shape whether the
// wire was fake or real.
//
// Used by:
//   - describeTransportContract (below) — around whatever
//     fetch the job hands in
//   - hosts recording a real fetch
//   - toRecordedCall — shared with createFakeAssistantServer
// -----------------------------------------------------------

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  aborted: boolean;
}

export interface RecordingFetch {
  fetch: typeof fetch;
  calls: RecordedCall[];
}

export function createRecordingFetch(inner: typeof fetch): RecordingFetch {
  const calls: RecordedCall[] = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push(toRecordedCall(input, init));
      return inner(input, init);
    },
  };
}

function toRecordedCall(input: RequestInfo | URL, init: RequestInit | undefined): RecordedCall {
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, name) => {
    headers[name] = value;
  });
  const call: RecordedCall = {
    url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    method: init?.method ?? 'GET',
    headers,
    body: parseBody(init?.body),
    aborted: init?.signal?.aborted ?? false,
  };
  init?.signal?.addEventListener('abort', () => {
    call.aborted = true;
  }, { once: true });
  return call;
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') return body ?? null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}


// -----------------------------------------------------------
// The replies
// -----------------------------------------------------------
//
// A FakeReply answers ONE request. The streamed kinds build
// their body with the upstream's own writer — chunks in, the
// SSE framing and the [DONE] terminator out — encoded in the
// test realm and cut with an AbortError the moment the
// request's signal fires, exactly like a real body. They are
// also continuation-aware: handed the recorded request, a
// reply to a thread that ends in an assistant message (the
// automatic continuation after a tool round trip) stamps THAT
// message's id on its start frame — a different id there makes
// the client push a second assistant message. The plain kinds
// are ordinary Responses: only status, headers and text are
// ever read from them.
//
//   textReply(chunks, { delayMs? })
//     start → start-step → text-start/delta*/text-end →
//     finish-step → finish
//   toolReply({ name, input, output, text? })
//     the tool step (tool-input-start → tool-input-available →
//     tool-output-available → finish-step) and then finish —
//     so the runtime resends the thread and the fake must be
//     scripted for that SECOND request; with `text` the answer
//     rides in a second step of the same response instead,
//     and nothing is resent
//   streamReply(chunks, { delayMs? })   — any chunk list
//   errorReply(status, body?, headers?) — JSON when the body
//     is an object, text when a string, empty otherwise
//   jsonReply(body, { status?, headers? }) — the tools endpoint
//   networkFailure(message?)            — rejects with a TypeError
//   hangForever()                       — no headers, ever
//
// Used by:
//   - createFakeAssistantServer (below) — its queue and its
//     reference routing
//   - hosts scripting a screen's wire
// -----------------------------------------------------------

export interface FakeReply {
  // Answers one request; `signal` is the request's own, and a
  // streaming body is cut with an AbortError when it fires —
  // exactly like a real fetch. `call` is the recorded request,
  // when there is one — a streamed reply reads it to continue
  // the right assistant message
  respond(signal: AbortSignal | null, call?: RecordedCall): Promise<Response>;
}

export interface StreamReplyOptions {
  // A pause before EVERY chunk, on real timers
  delayMs?: number;
}

export interface ToolReplyOptions {
  name: string;
  input: unknown;
  output: unknown;
  text?: string;
  toolCallId?: string;
}

export function streamReply(chunks: UIMessageChunk[], options: StreamReplyOptions = {}): FakeReply {
  const delayMs = options.delayMs ?? 0;
  return {
    respond: async (signal, call) => {
      const body = createUIMessageStream({
        // The continuation rule: handed the thread it is
        // continuing, the upstream writer stamps the LAST
        // assistant message's id on a bare start frame — the
        // client then keeps building that message instead of
        // pushing a second one
        originalMessages: continuedMessages(call),
        execute: async ({ writer }) => {
          for (const chunk of chunks) {
            if (delayMs > 0) await sleep(delayMs, signal);
            if (signal?.aborted) return;
            writer.write(chunk);
          }
        },
      })
        .pipeThrough(new JsonToSseTransformStream())
        .pipeThrough(new TextEncoderStream());
      return streamResponse(cutOnAbort(body, signal));
    },
  };
}

export function textReply(chunks: string[], options: StreamReplyOptions = {}): FakeReply {
  return streamReply([{ type: 'start' }, { type: 'start-step' }, ...textChunks('t1', chunks), { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' }], options);
}

export function toolReply(options: ToolReplyOptions): FakeReply {
  const toolCallId = options.toolCallId ?? 'call_1';
  const toolStep: UIMessageChunk[] = [
    { type: 'start' },
    { type: 'start-step' },
    { type: 'tool-input-start', toolCallId, toolName: options.name },
    { type: 'tool-input-available', toolCallId, toolName: options.name, input: options.input },
    { type: 'tool-output-available', toolCallId, output: options.output },
    { type: 'finish-step' },
  ];
  const answer: UIMessageChunk[] =
    options.text === undefined
      ? [{ type: 'finish', finishReason: 'tool-calls' }]
      : [{ type: 'start-step' }, ...textChunks('t1', [options.text]), { type: 'finish-step' }, { type: 'finish', finishReason: 'stop' }];
  return streamReply([...toolStep, ...answer]);
}

export function errorReply(status: number, body?: unknown, headers?: Record<string, string>): FakeReply {
  return plainReply(status, body, headers);
}

export function jsonReply(body: unknown, options: { status?: number; headers?: Record<string, string> } = {}): FakeReply {
  return plainReply(options.status ?? 200, body, options.headers);
}

export function networkFailure(message = 'Network request failed'): FakeReply {
  return { respond: () => Promise.reject(new TypeError(message)) };
}

export function hangForever(): FakeReply {
  return {
    // A real fetch that never answers still rejects on a
    // cancel — so does this one, and never otherwise
    respond: (signal) =>
      new Promise<Response>((_, reject) => {
        if (signal?.aborted) return reject(abortError());
        signal?.addEventListener('abort', () => reject(abortError()), { once: true });
      }),
  };
}

function textChunks(id: string, chunks: string[]): UIMessageChunk[] {
  return [{ type: 'text-start', id }, ...chunks.map((delta): UIMessageChunk => ({ type: 'text-delta', id, delta })), { type: 'text-end', id }];
}

// The request's messages, when the reply continues them: a
// thread ending in an assistant message with an id is the
// automatic continuation, and the writer must reuse that id.
// Anything else — a first turn, a hand-made body, no request
// at all — answers a fresh message with a fresh id.
function continuedMessages(call: RecordedCall | undefined): UIMessage[] | undefined {
  const messages = (call?.body as { messages?: unknown } | null | undefined)?.messages;
  if (!Array.isArray(messages)) return undefined;
  const last = messages[messages.length - 1] as { role?: unknown; id?: unknown } | undefined;
  return last?.role === 'assistant' && typeof last.id === 'string' ? (messages as UIMessage[]) : undefined;
}

function plainReply(status: number, body: unknown, headers: Record<string, string> | undefined): FakeReply {
  return {
    respond: async () => {
      const shaped = new Headers(headers);
      if (body !== undefined && typeof body !== 'string' && !shaped.has('content-type')) shaped.set('content-type', 'application/json');
      const text = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
      return new Response(text, { status, headers: shaped });
    },
  };
}

// The Response-like a streamed reply resolves: the upstream's
// own headers, a test-realm body, and the few fields the
// transport reads on the way through
function streamResponse(body: ReadableStream<Uint8Array>): Response {
  const shaped = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(UI_MESSAGE_STREAM_HEADERS),
    body,
    bodyUsed: false,
    text: async () => '',
  };
  return shaped as unknown as Response;
}

function cutOnAbort(source: ReadableStream<Uint8Array>, signal: AbortSignal | null): ReadableStream<Uint8Array> {
  if (!signal) return source;
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const cut = () => {
        controller.error(abortError());
        reader.cancel().catch(() => undefined);
      };
      if (signal.aborted) cut();
      else signal.addEventListener('abort', cut, { once: true });
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      // Errored by the cut meanwhile — nothing left to enqueue
      if (signal.aborted) return;
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
}


// -----------------------------------------------------------
// createFakeAssistantServer
// -----------------------------------------------------------
//
// The container in memory, behind a fetch. Every request is
// recorded; the reply comes from the script queue — a
// FakeReply, or a function of the recorded call that returns
// one — and, when the queue is empty, from the reference
// routing: the chat path answers the CONTRACT_PROMPTS the way
// the live service must in its contract mode (the automatic
// continuation after a tool round trip included), the tools
// path serves our schema mirrors, and an unknown prompt
// rejects loudly rather than answering something plausible.
// The host part of a URL is ignored — only the fixed paths
// route.
//
// Used by:
//   - engine tests, and the conformance suite below
//   - hosts, as the wire under a screen
// -----------------------------------------------------------

export type FakeScript = FakeReply | ((call: RecordedCall) => FakeReply);

export interface FakeAssistantServer {
  fetch: typeof fetch;
  calls: RecordedCall[];
  script(reply: FakeScript): void;
}

export function createFakeAssistantServer(): FakeAssistantServer {
  const queue: FakeScript[] = [];
  const calls: RecordedCall[] = [];
  return {
    calls,
    script: (reply) => {
      queue.push(reply);
    },
    fetch: (input, init) => {
      const call = toRecordedCall(input, init);
      calls.push(call);
      const scripted = queue.shift();
      const reply = scripted === undefined ? referenceReply(call) : typeof scripted === 'function' ? scripted(call) : scripted;
      return reply.respond(init?.signal ?? null, call);
    },
  };
}

function referenceReply(call: RecordedCall): FakeReply {
  const path = pathOf(call.url);
  if (path.endsWith(ASSISTANT_TOOLS_PATH)) return jsonReply({ tools: referenceTools() });
  if (!path.endsWith(ASSISTANT_CHAT_PATH)) return unscripted(`no route for ${call.method} ${path}`);

  const messages = messagesOf(call.body);
  const last = messages[messages.length - 1];
  // The continuation after a server-executed tool: the thread
  // ends in the assistant's tool step, the answer is owed
  if (last?.role === 'assistant' && last.parts.some(isToolOutputPart)) return textReply([...CONTRACT_REPLIES.toolText.chunks]);

  const prompt = lastUserText(messages);
  switch (prompt) {
    case CONTRACT_PROMPTS.text:
      return textReply([...CONTRACT_REPLIES.text.chunks]);
    case CONTRACT_PROMPTS.tool:
      return toolReply(CONTRACT_REPLIES.tool);
    case CONTRACT_PROMPTS.slow:
      return textReply([...CONTRACT_REPLIES.slow.chunks], { delayMs: CONTRACT_REPLIES.slow.delayMs });
    case CONTRACT_PROMPTS.auth:
      return errorReply(CONTRACT_REPLIES.auth.status, CONTRACT_REPLIES.auth.body);
    case CONTRACT_PROMPTS.quota:
      return errorReply(CONTRACT_REPLIES.quota.status, CONTRACT_REPLIES.quota.body, { 'retry-after': String(CONTRACT_REPLIES.quota.retryAfterSeconds) });
    default:
      return unscripted(`no reply scripted and no contract prompt in ${JSON.stringify(prompt)}`);
  }
}

// What the reference container serves on the tools path — the
// mirrors, verbatim, one descriptor per frozen name
export function referenceTools(): AssistantToolDescriptor[] {
  return ASSISTANT_TOOL_NAMES.map((name) => ({ name, ...ASSISTANT_TOOL_SCHEMAS[name] }));
}

function unscripted(reason: string): FakeReply {
  return { respond: () => Promise.reject(new Error(`fake assistant server: ${reason}`)) };
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

// The upstream's wire message shape, read defensively — a
// host's hand-made body must not crash the fake
interface WireMessage {
  role: string;
  parts: { type: string; text?: string; state?: string }[];
}

function messagesOf(body: unknown): WireMessage[] {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages)) return [];
  return messages.filter((message): message is WireMessage => {
    const shaped = message as { role?: unknown; parts?: unknown };
    return typeof shaped?.role === 'string' && Array.isArray(shaped.parts);
  });
}

function lastUserText(messages: WireMessage[]): string {
  const user = [...messages].reverse().find((message) => message.role === 'user');
  return (user?.parts ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

function isToolOutputPart(part: { type: string; state?: string }): boolean {
  return part.type.startsWith('tool-') && (part.state === 'output-available' || part.state === 'output-error');
}


// -----------------------------------------------------------
// createScriptedModelAdapter
// -----------------------------------------------------------
//
// A model adapter for the upstream's local runtime: each run
// plays a step list — text deltas growing one part, a tool
// call with or without its output (a later step with the same
// toolCallId fills the output in), a wait on real timers that
// a cancel cuts short, an error that ends the run in an error
// status — yielding the cumulative content after every step
// and a complete/stop status at the end. script() queues a
// list for the NEXT run; the constructor's list answers when
// the queue is empty. Every run's messages are recorded, with
// an `aborted` flag that flips on cancel.
//
// Used by:
//   - the app's screen tests over useLocalRuntime, where no
//     wire is wanted
//   - this package's doubles tests
// -----------------------------------------------------------

export type ScriptedJson = null | string | number | boolean | readonly ScriptedJson[] | { readonly [key: string]: ScriptedJson };

export type ScriptedStep =
  | { kind: 'text'; delta: string }
  | { kind: 'tool'; name: string; input: { readonly [key: string]: ScriptedJson }; output?: unknown; errorText?: string; toolCallId?: string }
  | { kind: 'wait'; ms: number }
  | { kind: 'error'; message: string };

export interface ScriptedRun {
  messages: readonly ThreadMessage[];
  aborted: boolean;
}

export interface ScriptedModelAdapter extends ChatModelAdapter {
  runs: ScriptedRun[];
  script(steps: ScriptedStep[]): void;
}

export function createScriptedModelAdapter(defaultSteps: ScriptedStep[] = []): ScriptedModelAdapter {
  const queue: ScriptedStep[][] = [];
  const runs: ScriptedRun[] = [];
  let serial = 0;
  const nextCallId = () => {
    serial += 1;
    return `call_${serial}`;
  };

  return {
    runs,
    script: (steps) => {
      queue.push(steps);
    },
    run: (options) => {
      const run: ScriptedRun = { messages: options.messages, aborted: options.abortSignal.aborted };
      options.abortSignal.addEventListener('abort', () => {
        run.aborted = true;
      }, { once: true });
      runs.push(run);
      return play(queue.shift() ?? defaultSteps, options, nextCallId);
    },
  };
}

async function* play(steps: ScriptedStep[], options: ChatModelRunOptions, nextCallId: () => string): AsyncGenerator<ChatModelRunResult, void> {
  let content: ThreadAssistantMessagePart[] = [];
  for (const step of steps) {
    if (options.abortSignal.aborted) return;
    if (step.kind === 'wait') {
      await sleep(step.ms, options.abortSignal);
      continue;
    }
    if (step.kind === 'error') {
      yield { content, status: { type: 'incomplete', reason: 'error', error: step.message } };
      return;
    }
    content = step.kind === 'text' ? withTextDelta(content, step.delta) : withToolCall(content, step, nextCallId);
    yield { content };
  }
  yield { content, status: { type: 'complete', reason: 'stop' } };
}

function withTextDelta(content: ThreadAssistantMessagePart[], delta: string): ThreadAssistantMessagePart[] {
  const tail = content[content.length - 1];
  if (tail?.type === 'text') return [...content.slice(0, -1), { type: 'text', text: tail.text + delta }];
  return [...content, { type: 'text', text: delta }];
}

function withToolCall(content: ThreadAssistantMessagePart[], step: Extract<ScriptedStep, { kind: 'tool' }>, nextCallId: () => string): ThreadAssistantMessagePart[] {
  const existing = step.toolCallId === undefined ? -1 : content.findIndex((part) => part.type === 'tool-call' && part.toolCallId === step.toolCallId);
  const part: ToolCallMessagePart = {
    type: 'tool-call',
    toolCallId: step.toolCallId ?? nextCallId(),
    toolName: step.name,
    args: step.input,
    argsText: JSON.stringify(step.input),
    ...(step.errorText !== undefined ? { result: step.errorText, isError: true } : step.output !== undefined ? { result: step.output } : {}),
  };
  if (existing === -1) return [...content, part];
  return content.map((candidate, index) => (index === existing ? part : candidate));
}


// -----------------------------------------------------------
// Readers
// -----------------------------------------------------------
//
// The two things every thread assertion wants from a message:
// its text, and its tool calls.
//
// Used by:
//   - describeTransportContract (below), the probe's callers
// -----------------------------------------------------------

export function textOf(message: ThreadMessage | undefined): string {
  return (message?.content ?? [])
    .filter((part): part is Extract<ThreadAssistantMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function toolCallsOf(message: ThreadMessage | undefined): ToolCallMessagePart[] {
  return (message?.content ?? []).filter((part): part is ToolCallMessagePart => part.type === 'tool-call');
}


// -----------------------------------------------------------
// mountRuntimeProbe / mountAssistantProbe
// -----------------------------------------------------------
//
// A runtime hook under the REAL provider, rendered under the
// test renderer, with a reader component that publishes the
// thread's messages, its running flag, its error and the raw
// chat messages under the joined view — read through the
// upstream hooks, the way a screen reads them — after every
// commit. mountAssistantProbe mounts our own hook over a
// transport; mountRuntimeProbe mounts any hook that answers a
// runtime (the local runtime over a scripted model, say).
// send() appends a user message and starts the run; until()
// polls a predicate the way a screen would wait; settle()
// waits for the run to end; rerender() forces one commit that
// changes nothing — for identity assertions across renders.
// rawMessages() is the chat state itself, BEFORE the runtime
// joins consecutive assistant messages: the only view where a
// split assistant message is visible. Nothing here waits for a
// run to START: a fake with no delays can finish inside the
// append itself, so callers wait for outcomes by name.
//
// Used by:
//   - describeTransportContract (below)
//   - the runtime hook tests, the doubles tests
// -----------------------------------------------------------

export interface AssistantProbe {
  readonly runtime: AssistantRuntime;
  messages(): readonly MessageState[];
  // The chat state's own messages, unjoined — a continuation
  // that split the assistant message shows up ONLY here
  rawMessages(): readonly UIMessage[];
  isRunning(): boolean;
  failure(): AssistantFailure | null;
  error(): Error | undefined;
  send(text: string): Promise<void>;
  cancel(): Promise<void>;
  until(predicate: () => boolean, what: string): Promise<void>;
  settle(): Promise<void>;
  // One commit that changes no state — what identity-across-
  // renders assertions need between two reads
  rerender(): Promise<void>;
  unmount(): Promise<void>;
}

interface ProbeSnapshot {
  runtime: AssistantRuntime;
  messages: readonly MessageState[];
  rawMessages: readonly UIMessage[];
  isRunning: boolean;
  failure: AssistantFailure | null;
  error: Error | undefined;
}

const UNTIL_TIMEOUT_MS = 5_000;

export function mountAssistantProbe(options: KnfAssistantRuntimeOptions): Promise<AssistantProbe> {
  const useRuntime = () => useKnfAssistantRuntime(options);
  return mountRuntimeProbe(useRuntime);
}

export async function mountRuntimeProbe(useRuntime: () => AssistantRuntime): Promise<AssistantProbe> {
  let latest: ProbeSnapshot | null = null;
  const publish = (snapshot: ProbeSnapshot) => {
    latest = snapshot;
  };
  const host = () => <ProbeHost useRuntime={useRuntime} publish={publish} />;
  const view = await render(host());
  const current = (): ProbeSnapshot => {
    if (!latest) throw new Error('assistant probe: nothing published yet');
    return latest;
  };

  const until = (predicate: () => boolean, what: string): Promise<void> =>
    waitFor(
      () => {
        if (!predicate()) throw new Error(`assistant probe: still waiting for ${what}`);
      },
      { timeout: UNTIL_TIMEOUT_MS, interval: 10 },
    );

  return {
    get runtime() {
      return current().runtime;
    },
    messages: () => current().messages,
    rawMessages: () => current().rawMessages,
    isRunning: () => current().isRunning,
    failure: () => current().failure,
    error: () => current().error,
    send: (text) =>
      act(async () => {
        current().runtime.thread.append(text);
      }),
    cancel: () =>
      act(async () => {
        current().runtime.thread.cancelRun();
      }),
    until,
    settle: () => until(() => !current().isRunning, 'the run to end'),
    // The same element again: the host and the reader re-render
    // with nothing changed, and the reader publishes afresh
    rerender: () => act(async () => view.rerender(host())),
    unmount: () => view.unmount(),
  };
}

function ProbeHost({ useRuntime, publish }: { useRuntime: () => AssistantRuntime; publish: (snapshot: ProbeSnapshot) => void }) {
  const runtime = useRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ProbeReader runtime={runtime} publish={publish} />
    </AssistantRuntimeProvider>
  );
}

function ProbeReader({ runtime, publish }: { runtime: AssistantRuntime; publish: (snapshot: ProbeSnapshot) => void }) {
  const messages = useAuiState((state) => state.thread.messages);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const failure = useAssistantFailure();
  const error = useAISDKError();
  // The chat state under the thread view — undefined only over
  // a runtime that is not chat-backed (the local runtime, say)
  const chat = useAISDKChat();
  useEffect(() => {
    publish({ runtime, messages, rawMessages: chat?.messages ?? [], isRunning, failure, error });
  });
  return null;
}


// -----------------------------------------------------------
// describeTransportContract
// -----------------------------------------------------------
//
// The behaviours EVERY server must exhibit, run through the
// REAL transport and the REAL runtime under the probe — against
// the fake here and against the live container in its
// integration job, where `baseUrl` names the service and the
// container's contract mode answers the CONTRACT_PROMPTS. Six
// of the seven cases are the server's; the throwing fetch is
// the client's own promise and needs no server at all.
//
// Used by:
//   - this package's conformance test
//   - the container's integration job
// -----------------------------------------------------------

export interface TransportContractOptions {
  // The origin the transport aims at — the fake ignores it, an
  // integration job names the live container
  baseUrl?: string;
  firstByteTimeoutMs?: number;
}

const CONTRACT_CLIENT_VERSION = '0.0.0-contract';
const CONTRACT_TOKEN = 'contract-session-token';

export function describeTransportContract(
  name: string,
  makeFetch: () => Promise<typeof fetch> | typeof fetch,
  options: TransportContractOptions = {},
): void {
  const baseUrl = options.baseUrl ?? 'https://knf.example.lt';

  interface Rig {
    probe: AssistantProbe;
    calls: RecordedCall[];
    failures: AssistantFailure[];
    transport: ReturnType<typeof createKnfAssistantTransport>;
  }

  const rig = async (token: string | null = null, seam?: typeof fetch): Promise<Rig> => {
    const recording = createRecordingFetch(seam ?? (await makeFetch()));
    const failures: AssistantFailure[] = [];
    const transport = createKnfAssistantTransport({
      baseUrl,
      fetch: recording.fetch,
      getAuthToken: async () => token,
      language: () => 'lt',
      clientVersion: CONTRACT_CLIENT_VERSION,
      onFailure: (failure) => {
        failures.push(failure);
      },
      ...(options.firstByteTimeoutMs !== undefined ? { firstByteTimeoutMs: options.firstByteTimeoutMs } : {}),
    });
    const probe = await mountAssistantProbe({ transport });
    return { probe, calls: recording.calls, failures, transport };
  };

  const withRig = async (token: string | null, body: (rig: Rig) => Promise<void>, seam?: typeof fetch): Promise<void> => {
    const built = await rig(token, seam);
    try {
      await body(built);
    } finally {
      await built.probe.unmount();
    }
  };

  const lastMessage = (probe: AssistantProbe) => probe.messages()[probe.messages().length - 1];

  describe(`transport contract: ${name}`, () => {
    it('a text reply accumulates into ONE assistant message with the full text', () =>
      withRig(null, async ({ probe, failures }) => {
        await probe.send(CONTRACT_PROMPTS.text);
        await probe.until(() => textOf(lastMessage(probe)) === CONTRACT_REPLIES.text.full, 'the full reply');
        await probe.settle();

        expect(probe.messages()).toHaveLength(2);
        expect(probe.messages()[0].role).toBe('user');
        expect(probe.messages()[1].role).toBe('assistant');
        expect(probe.failure()).toBeNull();
        expect(failures).toEqual([]);
      }));

    it('a tool reply auto-continues — the second request carries the output, the answer lands in the same message', () =>
      withRig(null, async ({ probe, calls }) => {
        await probe.send(CONTRACT_PROMPTS.tool);
        await probe.until(() => calls.length === 2, 'the continuation request');
        await probe.until(() => textOf(lastMessage(probe)) === CONTRACT_REPLIES.toolText.full, 'the answer after the tool');
        await probe.settle();

        const continuation = calls[1].body as { trigger: string; messageId?: string; messages: { role: string; parts: Record<string, unknown>[] }[] };
        expect(continuation.trigger).toBe('submit-message');
        expect(typeof continuation.messageId).toBe('string');
        const resent = continuation.messages[continuation.messages.length - 1];
        expect(resent.role).toBe('assistant');
        expect(resent.parts).toContainEqual(
          expect.objectContaining({
            type: `tool-${CONTRACT_REPLIES.tool.name}`,
            state: 'output-available',
            input: CONTRACT_REPLIES.tool.input,
            output: CONTRACT_REPLIES.tool.output,
          }),
        );

        expect(probe.messages()).toHaveLength(2);
        const toolCalls = toolCallsOf(lastMessage(probe));
        expect(toolCalls).toHaveLength(1);
        expect(toolCalls[0].toolName).toBe(CONTRACT_REPLIES.tool.name);
        expect(toolCalls[0].args).toEqual(CONTRACT_REPLIES.tool.input);
        expect(toolCalls[0].result).toEqual(CONTRACT_REPLIES.tool.output);
        expect(probe.failure()).toBeNull();

        // The chat state itself, not the joined thread view: a
        // continuation start frame minting its own id would
        // leave TWO assistant messages here while every
        // assertion above still passed
        expect(probe.rawMessages().map((message) => message.role)).toEqual(['user', 'assistant']);

        // And the next turn resends ONE assistant message with
        // ONE tool part — the shape every later model input
        // gets; a split thread doubles both
        await probe.send(CONTRACT_PROMPTS.text);
        await probe.until(() => textOf(lastMessage(probe)) === CONTRACT_REPLIES.text.full, 'the next answer');
        await probe.settle();
        const next = calls[2].body as { messages: { role: string; parts: { type: string }[] }[] };
        expect(next.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
        expect(next.messages.flatMap((message) => message.parts.filter((part) => part.type === `tool-${CONTRACT_REPLIES.tool.name}`))).toHaveLength(1);
      }));

    it('401 reads as auth, reported to onFailure exactly once, and ends the thread in an error-status assistant message', () =>
      withRig(CONTRACT_TOKEN, async ({ probe, failures }) => {
        await probe.send(CONTRACT_PROMPTS.auth);
        await probe.until(() => probe.failure() !== null, 'the failure');
        await probe.settle();

        expect(probe.failure()).toMatchObject({ code: 'auth', status: 401 });
        expect(failures).toHaveLength(1);
        expect(failures[0]).toEqual(probe.failure());

        // The seam an error banner keys on: the runtime ends
        // the thread in an assistant message whose status
        // carries the error — failure hook or not
        const failed = lastMessage(probe);
        expect(failed.role).toBe('assistant');
        expect(failed.status).toMatchObject({ type: 'incomplete', reason: 'error', error: CONTRACT_REPLIES.auth.body.error });
      }));

    it('429 with Retry-After: 30 reads as quota with retryAfterMs 30 000', () =>
      withRig(null, async ({ probe, failures }) => {
        await probe.send(CONTRACT_PROMPTS.quota);
        await probe.until(() => probe.failure() !== null, 'the failure');
        await probe.settle();

        expect(probe.failure()).toMatchObject({ code: 'quota', status: 429, retryAfterMs: 30_000 });
        expect(failures).toHaveLength(1);
      }));

    it('a fetch that throws reads as network', () =>
      withRig(
        null,
        async ({ probe, failures }) => {
          await probe.send(CONTRACT_PROMPTS.text);
          await probe.until(() => probe.failure() !== null, 'the failure');
          await probe.settle();

          expect(probe.failure()).toEqual({ code: 'network', message: 'Network request failed' });
          expect(failures).toEqual([{ code: 'network', message: 'Network request failed' }]);
        },
        () => Promise.reject(new TypeError('Network request failed')),
      ));

    it('the request carries Authorization only with a session, Accept-Language and the client header always', async () => {
      await withRig(null, async ({ probe, calls }) => {
        await probe.send(CONTRACT_PROMPTS.text);
        await probe.until(() => calls.length === 1, 'the request');
        await probe.settle();

        expect(calls[0].method).toBe('POST');
        expect(calls[0].url).toBe(`${baseUrl.replace(/\/+$/, '')}${ASSISTANT_CHAT_PATH}`);
        expect(calls[0].headers['accept-language']).toBe('lt');
        expect(calls[0].headers['x-knf-assistant-client']).toBe(`knfapp-mobile/${CONTRACT_CLIENT_VERSION}`);
        expect(calls[0].headers['content-type']).toBe('application/json');
        expect(calls[0].headers).not.toHaveProperty('authorization');
      });
      await withRig(CONTRACT_TOKEN, async ({ probe, calls }) => {
        await probe.send(CONTRACT_PROMPTS.text);
        await probe.until(() => calls.length === 1, 'the request');
        await probe.settle();

        expect(calls[0].headers.authorization).toBe(`Bearer ${CONTRACT_TOKEN}`);
        expect(calls[0].headers['accept-language']).toBe('lt');
        expect(calls[0].headers['x-knf-assistant-client']).toBe(`knfapp-mobile/${CONTRACT_CLIENT_VERSION}`);
      });
    });

    it('a cancel mid-stream ends the run with no error and no onFailure; a cancel before headers reads as aborted', () =>
      withRig(null, async ({ probe, calls, failures, transport }) => {
        await probe.send(CONTRACT_PROMPTS.slow);
        await probe.until(() => textOf(lastMessage(probe)).length > 0, 'the first delta');
        await probe.cancel();
        await probe.settle();

        expect(calls).toHaveLength(1);
        expect(calls[0].aborted).toBe(true);
        expect(probe.messages()).toHaveLength(2);
        expect(CONTRACT_REPLIES.slow.chunks.join('').startsWith(textOf(lastMessage(probe)))).toBe(true);
        expect(probe.failure()).toBeNull();
        expect(failures).toEqual([]);

        const cancelled = new AbortController();
        cancelled.abort();
        await expect(
          transport.sendMessages({ chatId: 'contract', messages: [], trigger: 'submit-message', messageId: undefined, abortSignal: cancelled.signal }),
        ).rejects.toMatchObject({ name: 'AssistantTransportError', failure: { code: 'aborted' } });
        expect(calls).toHaveLength(1);
        expect(failures).toEqual([]);
      }));
  });
}


// -----------------------------------------------------------
// Fixtures
// -----------------------------------------------------------
//
// Named, realistic payloads in the tool output shapes — and the
// contract vocabulary: the prompts the reference container
// answers by convention, and the exact answers it gives, which
// the live service reproduces in its contract mode.
//
// Used by:
//   - engine and host tests
//   - the reference routing and the conformance suite above
// -----------------------------------------------------------

export const fixtureLessons: AssistantLesson[] = [
  {
    title: 'Duomenų bazės',
    start: '2026-09-08T09:00:00+03:00',
    end: '2026-09-08T10:30:00+03:00',
    room: '201',
    teacher: 'J. Jonaitis',
    group: 'IS-3',
    kind: 'paskaita',
  },
  {
    title: 'Programų sistemų inžinerija',
    start: '2026-09-08T10:45:00+03:00',
    end: '2026-09-08T12:15:00+03:00',
    room: '305',
    teacher: 'A. Petraitienė',
    group: 'IS-3',
    kind: 'pratybos',
  },
];

export const fixtureNewsPosts: AssistantNewsPost[] = [
  {
    id: 'n-2026-0901',
    title: 'Rugsėjo 1-osios šventė fakultete',
    summary: 'Mokslo metų atidarymas Muitinės g. 8 kieme.',
    date: '2026-09-01T09:00:00+03:00',
    source: 'knf.vu.lt',
    url: 'https://knf.vu.lt/naujienos/rugsejo-1-oji',
  },
  {
    id: 'n-2026-0903',
    title: 'Stipendijų konkursas paskelbtas',
    date: '2026-09-03T12:00:00+03:00',
    source: 'knf.vu.lt',
  },
];

export const fixtureHandbookEntries: AssistantHandbookEntry[] = [
  {
    id: 'h-egzaminai',
    title: 'Egzaminų perlaikymas',
    excerpt: 'Egzaminą perlaikyti galima du kartus; trečias bandymas — komisijoje.',
    section: 'Studijų tvarka',
    language: 'lt',
  },
  {
    id: 'h-library',
    title: 'Library hours',
    excerpt: 'The faculty library is open 8:00–20:00 on weekdays.',
    section: 'Campus',
    language: 'en',
  },
];

export const CONTRACT_PROMPTS = {
  text: 'contract:text',
  tool: 'contract:tool',
  slow: 'contract:slow',
  auth: 'contract:auth',
  quota: 'contract:quota',
} as const;

export const CONTRACT_REPLIES = {
  text: { chunks: ['Labas! ', 'Sutartis ', 'veikia.'], full: 'Labas! Sutartis veikia.' },
  tool: {
    name: 'lookupSchedule',
    input: { group: 'IS-3', range: 'day' },
    output: { lessons: fixtureLessons, source: 'live' },
  },
  toolText: { chunks: ['Rytoj IS-3 grupei ', 'dvi paskaitos.'], full: 'Rytoj IS-3 grupei dvi paskaitos.' },
  slow: { chunks: ['Lėtas ', 'atsakymas ', 'dalimis ', 'per ', 'laiką.'], delayMs: 40 },
  auth: { status: 401, body: { error: 'contract: bearer refused' } },
  quota: { status: 429, body: { error: 'contract: quota spent' }, retryAfterSeconds: 30 },
} as const;
