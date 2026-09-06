// -----------------------------------------------------------
//  [*] Tests — tool cards: the registry, the fallback, the shell
//
//  A tool-call part reaches the host's renderer reduced to
//  the kit's contract — name, input, output, status, error
//  text — under the stable per-name testID: 'running' while
//  the result is owed, 'done' once it landed, 'failed' when
//  the result is an error. A name with no renderer falls to
//  the generic card: the shell titled with the tool name, the
//  raw input and output behind the show/hide toggle. The
//  lookup is an own-property read, so a tool named after an
//  Object.prototype member still falls to the generic card.
//  The shell on its own is pinned status by status, and the
//  pure reduction is pinned as a table.
// -----------------------------------------------------------

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { ToolCallMessagePartProps } from '@assistant-ui/react-native';

import AssistantThread from '../AssistantThread';
import ToolCardShell, { toToolCardPart } from '../ToolCardShell';
import type { ToolCardPart, ToolCardRenderer } from '../core/types';
import { LABELS, ScriptedThread, createScriptedModel, running, send, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

const LESSONS = { lessons: [{ title: 'Matematika', start: '09:00', end: '10:30' }], source: 'live' };

const renderThread = (model: ReturnType<typeof createScriptedModel>, tools?: Record<string, ToolCardRenderer>) =>
  render(
    <ScriptedThread model={model}>
      <AssistantThread labels={LABELS} tools={tools} />
    </ScriptedThread>,
  );

// A renderer that records what it was handed and paints the status
const recordingRenderer = () => {
  const seen: ToolCardPart[] = [];
  const renderer: ToolCardRenderer = (part) => {
    seen.push(part);
    return <Text testID="host-card">{`${part.toolName}:${part.status}`}</Text>;
  };
  return { seen, renderer };
};

describe('the registry', () => {
  it('a registered renderer is called with the reduced part and its output lands under the stable testID', async () => {
    const { seen, renderer } = recordingRenderer();
    const model = createScriptedModel([
      [{ tool: { name: 'lookupSchedule', input: { group: 'IT-1', range: 'day' }, output: LESSONS } }, { text: 'Rytoj Matematika.' }],
    ]);
    const view = await renderThread(model, { lookupSchedule: renderer });
    await send(view, 'Kada matematika?');
    await settled(view);
    const card = view.getByTestId('assistantuikit-tool-lookupSchedule');
    expect(card).toBeTruthy();
    expect(view.getByTestId('host-card').props.children).toBe('lookupSchedule:done');
    const last = seen[seen.length - 1];
    expect(last).toEqual({ toolName: 'lookupSchedule', input: { group: 'IT-1', range: 'day' }, output: LESSONS, status: 'done' });
    // The generic card is not there beside it
    expect(view.queryByText('Rasta')).toBeNull();
  });

  it("a tool still owed its result renders 'running', then 'done' when it lands", async () => {
    const { seen, renderer } = recordingRenderer();
    const model = createScriptedModel([
      [{ tool: { name: 'searchNews', input: { query: 'sesija' } } }, { wait: true }, { toolResult: { output: { posts: [] } } }, { text: 'Nieko naujo.' }],
    ]);
    const view = await renderThread(model, { searchNews: renderer });
    await send(view, 'Kas naujo?');
    await running(view);
    await waitFor(() => expect(view.getByTestId('host-card').props.children).toBe('searchNews:running'));
    expect(seen[seen.length - 1]).toMatchObject({ status: 'running', input: { query: 'sesija' } });
    expect(seen[seen.length - 1].output).toBeUndefined();
    await act(async () => {
      model.release();
    });
    await settled(view);
    expect(view.getByTestId('host-card').props.children).toBe('searchNews:done');
    expect(seen[seen.length - 1]).toMatchObject({ status: 'done', output: { posts: [] } });
  });

  it("an error result renders 'failed' with the error text", async () => {
    const { seen, renderer } = recordingRenderer();
    const model = createScriptedModel([
      [{ tool: { name: 'searchHandbook', input: { query: 'x' }, output: 'Vadovas nepasiekiamas', isError: true } }, { text: 'Atsiprašau.' }],
    ]);
    const view = await renderThread(model, { searchHandbook: renderer });
    await send(view, 'Kur rasti?');
    await settled(view);
    expect(view.getByTestId('host-card').props.children).toBe('searchHandbook:failed');
    expect(seen[seen.length - 1]).toEqual({
      toolName: 'searchHandbook',
      input: { query: 'x' },
      output: 'Vadovas nepasiekiamas',
      status: 'failed',
      errorText: 'Vadovas nepasiekiamas',
    });
  });

  it('a name without a renderer falls to the generic card — the name, the status, the raw payload behind the toggle', async () => {
    const model = createScriptedModel([[{ tool: { name: 'lookupSchedule', input: { group: 'IT-1' }, output: LESSONS } }, { text: 'Štai.' }]]);
    const view = await renderThread(model, {});
    await send(view, 'Kada?');
    await settled(view);
    expect(view.getByTestId('assistantuikit-tool-lookupSchedule')).toBeTruthy();
    expect(view.getByText('lookupSchedule')).toBeTruthy();
    expect(view.getByText('Rasta')).toBeTruthy();
    expect(view.queryByText(/"group": "IT-1"/)).toBeNull();
    await fireEvent.press(view.getByText('Rodyti detales'));
    expect(view.getByText(/"group": "IT-1"/)).toBeTruthy();
    expect(view.getByText(/"title": "Matematika"/)).toBeTruthy();
    expect(view.getByText('Slėpti detales')).toBeTruthy();
    await fireEvent.press(view.getByText('Slėpti detales'));
    expect(view.queryByText(/"group": "IT-1"/)).toBeNull();
  });

  it('the generic card shows a failed tool in the failed voice with its error text', async () => {
    const model = createScriptedModel([[{ tool: { name: 'searchNews', input: {}, output: { message: 'Serveris neatsako' }, isError: true } }]]);
    const view = await renderThread(model);
    await send(view, 'Naujienos?');
    await settled(view);
    expect(view.getByText('Nepavyko')).toBeTruthy();
    expect(view.getByText('Serveris neatsako')).toBeTruthy();
  });

  it("a tool named 'constructor' with no renderer falls to the generic card, not Object.prototype", async () => {
    const model = createScriptedModel([[{ tool: { name: 'constructor', input: {}, output: 1 } }]]);
    const view = await renderThread(model, { searchNews: () => <Text>never</Text> });
    await send(view, 'x');
    await settled(view);
    expect(view.getByTestId('assistantuikit-tool-constructor')).toBeTruthy();
    expect(view.getByText('constructor')).toBeTruthy();
    expect(view.getByText('Rasta')).toBeTruthy();
    expect(view.queryByText('never')).toBeNull();
  });
});

describe('ToolCardShell on its own', () => {
  it.each([
    ['running', 'Ieškoma…'],
    ['done', 'Rasta'],
    ['failed', 'Nepavyko'],
  ] as const)("status '%s' shows the host's %s", async (status, label) => {
    const view = await render(
      <ToolCardShell title="lookupSchedule" status={status} labels={LABELS}>
        <Text>kūnas</Text>
      </ToolCardShell>,
    );
    expect(view.getByText('lookupSchedule')).toBeTruthy();
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByText('kūnas')).toBeTruthy();
    expect(view.queryByText('Rodyti detales')).toBeNull();
  });

  it('details sit behind the toggle, closed by default, and the toggle says whether it is open', async () => {
    const view = await render(
      <ToolCardShell title="t" status="done" labels={LABELS} details={<Text>slapta</Text>} />,
    );
    expect(view.queryByText('slapta')).toBeNull();
    // The Pressable above the label carries the expanded state a
    // screen reader announces
    const toggle = () => view.getByText(/detales/).parent;
    expect(toggle()?.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(view.getByText('Rodyti detales'));
    expect(view.getByText('slapta')).toBeTruthy();
    expect(view.getByText('Slėpti detales')).toBeTruthy();
    expect(toggle()?.props.accessibilityState).toMatchObject({ expanded: true });
  });
});

describe('toToolCardPart', () => {
  const base = { type: 'tool-call', toolCallId: 'c1', toolName: 'searchNews', args: { query: 'q' }, argsText: '{"query":"q"}' } as const;
  const part = (over: Partial<ToolCallMessagePartProps>) =>
    ({ ...base, addResult: () => {}, resume: () => {}, respondToApproval: async () => {}, ...over }) as ToolCallMessagePartProps;

  it.each([
    ['running', { status: { type: 'running' } }, { status: 'running' }],
    ['requires-action', { status: { type: 'requires-action', reason: 'tool-calls' } }, { status: 'running' }],
    ['complete with a result', { status: { type: 'complete' }, result: { posts: [] } }, { status: 'done', output: { posts: [] } }],
    ['complete with no result', { status: { type: 'complete' } }, { status: 'done', output: undefined }],
    ['incomplete with an error', { status: { type: 'incomplete', reason: 'error', error: 'boom' } }, { status: 'failed', errorText: 'boom' }],
    ['incomplete cancelled', { status: { type: 'incomplete', reason: 'cancelled' } }, { status: 'failed' }],
    ['isError string', { status: { type: 'complete' }, result: 'blogai', isError: true }, { status: 'failed', errorText: 'blogai' }],
    ['isError message object', { status: { type: 'complete' }, result: { message: 'ne' }, isError: true }, { status: 'failed', errorText: 'ne' }],
    // The envelope a streamed tool error arrives in from the
    // production runtime — the text inside it, never the blob
    ['isError runtime envelope', { status: { type: 'complete' }, result: { error: 'ne' }, isError: true }, { status: 'failed', errorText: 'ne' }],
    [
      'isError nested message envelope',
      { status: { type: 'complete' }, result: { error: { message: 'blogai' } }, isError: true },
      { status: 'failed', errorText: 'blogai' },
    ],
    ['isError other', { status: { type: 'complete' }, result: { code: 7 }, isError: true }, { status: 'failed', errorText: '{"code":7}' }],
  ])('%s', (_name, over, expected) => {
    const reduced = toToolCardPart(part(over as Partial<ToolCallMessagePartProps>));
    expect(reduced).toMatchObject({ toolName: 'searchNews', input: { query: 'q' }, ...expected });
    if (!('errorText' in expected)) expect(reduced.errorText).toBeUndefined();
  });
});
