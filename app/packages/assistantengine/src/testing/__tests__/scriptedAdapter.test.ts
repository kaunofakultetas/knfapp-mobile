// -----------------------------------------------------------
//  [*] Tests — the scripted model under the real local runtime
//
//  createScriptedModelAdapter mounted through the upstream's
//  own local runtime hook under the probe: text deltas grow
//  one part; a tool call lands with its output, or first
//  without and then with it when a later step names the same
//  call; an error step ends the run in an error status; a wait
//  is where a cancel lands, and the run is marked cancelled
//  and its record flagged; the queue answers the next run and
//  the default answers after it; every run's messages are
//  recorded. Nothing here touches a wire.
// -----------------------------------------------------------

import {
  createScriptedModelAdapter,
  mountRuntimeProbe,
  textOf,
  toolCallsOf,
  useLocalRuntime,
  type AssistantProbe,
  type ScriptedModelAdapter,
  type ScriptedStep,
} from '../index';


interface Rig {
  adapter: ScriptedModelAdapter;
  probe: AssistantProbe;
}

const mount = async (steps: ScriptedStep[] = []): Promise<Rig> => {
  const adapter = createScriptedModelAdapter(steps);
  const useRuntime = () => useLocalRuntime(adapter);
  const probe = await mountRuntimeProbe(useRuntime);
  return { adapter, probe };
};

const last = (probe: AssistantProbe) => probe.messages()[probe.messages().length - 1];

let mounted: Rig | null = null;

afterEach(async () => {
  await mounted?.probe.unmount();
  mounted = null;
});


describe('createScriptedModelAdapter', () => {
  it('text deltas grow ONE text part and the message completes', async () => {
    mounted = await mount([{ kind: 'text', delta: 'Labas, ' }, { kind: 'text', delta: 'KNF!' }]);
    const { probe, adapter } = mounted;

    await probe.send('Sveiki');
    await probe.until(() => textOf(last(probe)) === 'Labas, KNF!', 'the full text');
    await probe.settle();

    expect(probe.messages()).toHaveLength(2);
    expect(last(probe).content).toEqual([{ type: 'text', text: 'Labas, KNF!' }]);
    expect(last(probe).status).toEqual({ type: 'complete', reason: 'stop' });
    expect(adapter.runs).toHaveLength(1);
    expect(adapter.runs[0].messages.map((message) => message.role)).toEqual(['user']);
    expect(textOf(adapter.runs[0].messages[0])).toBe('Sveiki');
    expect(adapter.runs[0].aborted).toBe(false);
    expect(probe.failure()).toBeNull();
  });

  it('a tool step lands as a tool-call part with its input and output; the ids count up', async () => {
    mounted = await mount([
      { kind: 'tool', name: 'lookupSchedule', input: { group: 'IS-3' }, output: { lessons: [], source: 'live' } },
      { kind: 'tool', name: 'searchNews', input: { query: 'x' }, output: { posts: [] } },
      { kind: 'text', delta: 'Štai.' },
    ]);
    const { probe } = mounted;

    await probe.send('Kas vyksta?');
    await probe.until(() => textOf(last(probe)) === 'Štai.', 'the answer');
    await probe.settle();

    expect(toolCallsOf(last(probe))).toEqual([
      { type: 'tool-call', toolCallId: 'call_1', toolName: 'lookupSchedule', args: { group: 'IS-3' }, argsText: '{"group":"IS-3"}', result: { lessons: [], source: 'live' } },
      { type: 'tool-call', toolCallId: 'call_2', toolName: 'searchNews', args: { query: 'x' }, argsText: '{"query":"x"}', result: { posts: [] } },
    ]);
    expect(last(probe).content.map((part) => part.type)).toEqual(['tool-call', 'tool-call', 'text']);
  });

  it('a tool without output is running until a later step with the same id fills it in', async () => {
    mounted = await mount([
      { kind: 'tool', toolCallId: 'c1', name: 'searchHandbook', input: { query: 'biblioteka' } },
      { kind: 'wait', ms: 60 },
      { kind: 'tool', toolCallId: 'c1', name: 'searchHandbook', input: { query: 'biblioteka' }, output: { entries: [] } },
    ]);
    const { probe } = mounted;

    await probe.send('Kada dirba biblioteka?');
    await probe.until(() => toolCallsOf(last(probe)).length === 1, 'the call');
    expect(toolCallsOf(last(probe))[0]).not.toHaveProperty('result');
    expect(probe.isRunning()).toBe(true);

    await probe.until(() => toolCallsOf(last(probe))[0]?.result !== undefined, 'the output');
    await probe.settle();

    expect(toolCallsOf(last(probe))).toHaveLength(1);
    expect(toolCallsOf(last(probe))[0]).toMatchObject({ toolCallId: 'c1', result: { entries: [] } });
  });

  it('an errorText marks the tool result as an error', async () => {
    mounted = await mount([{ kind: 'tool', name: 'searchNews', input: {}, errorText: 'index down' }]);
    const { probe } = mounted;

    await probe.send('naujienos');
    await probe.until(() => toolCallsOf(last(probe)).length === 1, 'the call');
    await probe.settle();

    expect(toolCallsOf(last(probe))[0]).toMatchObject({ result: 'index down', isError: true });
  });

  it('an error step ends the run in an error status with the message, the text so far kept', async () => {
    mounted = await mount([{ kind: 'text', delta: 'Pradedu…' }, { kind: 'error', message: 'model overloaded' }]);
    const { probe } = mounted;

    await probe.send('Labas');
    await probe.until(() => last(probe)?.status?.type === 'incomplete', 'the error status');
    await probe.settle();

    expect(last(probe).status).toEqual({ type: 'incomplete', reason: 'error', error: 'model overloaded' });
    expect(textOf(last(probe))).toBe('Pradedu…');
  });

  it('a cancel during a wait ends the run as cancelled, keeps the text so far and flags the run', async () => {
    mounted = await mount([{ kind: 'text', delta: 'vienas ' }, { kind: 'wait', ms: 5_000 }, { kind: 'text', delta: 'du' }]);
    const { probe, adapter } = mounted;

    await probe.send('Skaičiuok');
    await probe.until(() => textOf(last(probe)) === 'vienas ', 'the first delta');
    await probe.cancel();
    await probe.settle();

    expect(textOf(last(probe))).toBe('vienas ');
    expect(last(probe).status).toEqual({ type: 'incomplete', reason: 'cancelled' });
    expect(adapter.runs[0].aborted).toBe(true);
  });

  it('script() answers the NEXT run; the constructor\'s steps answer once the queue is empty', async () => {
    mounted = await mount([{ kind: 'text', delta: 'numatytas' }]);
    const { probe, adapter } = mounted;
    adapter.script([{ kind: 'text', delta: 'pirmas' }]);
    adapter.script([{ kind: 'text', delta: 'antras' }]);

    for (const expected of ['pirmas', 'antras', 'numatytas']) {
      await probe.send(expected);
      await probe.until(() => textOf(last(probe)) === expected, `the answer ${expected}`);
      await probe.settle();
    }

    expect(adapter.runs).toHaveLength(3);
    expect(adapter.runs[2].messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
  });

  it('an empty script completes at once with no content', async () => {
    mounted = await mount();
    const { probe } = mounted;

    await probe.send('Labas');
    await probe.until(() => last(probe)?.status?.type === 'complete', 'completion');

    expect(last(probe).content).toEqual([]);
  });
});
