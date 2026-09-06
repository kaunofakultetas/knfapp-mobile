// -----------------------------------------------------------
//  [*] Tests — AssistantMessage: the two bubbles and the parts
//
//  The user's words sit right in a brand bubble as plain text;
//  the assistant's answer sits left in a surface bubble and
//  goes through the markdown renderer (stubbed here to a Text
//  that also reports the streaming flag it was given): true
//  while the part streams, false once the message settled. A
//  reasoning part is a closed "thinking" row that opens on a
//  tap; history handed in as initial messages renders both
//  roles; a system message renders nothing; the action bar
//  stays away while the message is still running. A bubble
//  mounted with NO kit provider above it throws the named
//  error at render time — the guard hosts grep for, pinned so
//  it cannot drift.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { MessageByIndexProvider, useAuiState } from '@assistant-ui/react-native';
import type { TestInstance } from 'test-renderer';

import AssistantMessage from '../AssistantMessage';
import AssistantThread from '../AssistantThread';
import { defaultColors } from '../core/types';
import { LABELS, ScriptedThread, createScriptedModel, running, send, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

const renderThread = (model: ReturnType<typeof createScriptedModel>, extra: Partial<React.ComponentProps<typeof ScriptedThread>> = {}) =>
  render(
    <ScriptedThread model={model} {...extra}>
      <AssistantThread labels={LABELS} />
    </ScriptedThread>,
  );

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));

// The bubble is the row's first host child; the row itself
// carries the testID
const bubbleOf = (row: TestInstance): TestInstance => {
  const first = row.children[0];
  if (typeof first === 'string') throw new Error('a bubble row cannot start with text');
  return first;
};

describe('the two bubbles', () => {
  it('the user row sits right in a brand bubble with the words verbatim', async () => {
    const model = createScriptedModel([[{ text: 'Atsakymas' }]]);
    const view = await renderThread(model);
    await send(view, 'Kas **naujo**?');
    await settled(view);
    const row = view.getByTestId('assistantuikit-message-user');
    expect(flat(row.props.style).alignItems).toBe('flex-end');
    expect(flat(bubbleOf(row).props.style).backgroundColor).toBe(defaultColors.brand);
    // Never parsed: the asterisks are the user's, not markdown
    expect(view.getByText('Kas **naujo**?')).toBeTruthy();
    expect(flat(view.getByText('Kas **naujo**?').props.style).color).toBe(defaultColors.onBrand);
  });

  it('the assistant row sits left in a surface bubble and renders through the markdown renderer', async () => {
    const model = createScriptedModel([[{ text: 'Atsakymas' }]]);
    const view = await renderThread(model);
    await send(view, 'Klausimas');
    await settled(view);
    const row = view.getByTestId('assistantuikit-message-assistant');
    expect(flat(row.props.style).alignItems).toBe('flex-start');
    expect(flat(bubbleOf(row).props.style).backgroundColor).toBe(defaultColors.surface);
    expect(view.getByTestId('markdown-settled').props.children).toBe('Atsakymas');
  });

  it('a custom palette reaches both bubbles', async () => {
    const colors = { ...defaultColors, brand: '#7B003F', surface: '#FAFAFA' };
    const model = createScriptedModel([[{ text: 'Atsakymas' }]]);
    const view = await render(
      <ScriptedThread model={model}>
        <AssistantThread labels={LABELS} colors={colors} />
      </ScriptedThread>,
    );
    await send(view, 'Klausimas');
    await settled(view);
    expect(flat(bubbleOf(view.getByTestId('assistantuikit-message-user')).props.style).backgroundColor).toBe('#7B003F');
    expect(flat(bubbleOf(view.getByTestId('assistantuikit-message-assistant')).props.style).backgroundColor).toBe('#FAFAFA');
  });
});

describe('streaming', () => {
  it('the text part streams while the run is in flight and settles after', async () => {
    const model = createScriptedModel([[{ text: 'Pirma dalis' }, { wait: true }, { text: ' ir antra' }]]);
    const view = await renderThread(model);
    await send(view, 'Klausimas');
    await running(view);
    expect(view.getByTestId('markdown-streaming').props.children).toBe('Pirma dalis');
    expect(view.queryByTestId('markdown-settled')).toBeNull();
    await act(async () => {
      model.release();
    });
    await settled(view);
    expect(view.getByTestId('markdown-settled').props.children).toBe('Pirma dalis ir antra');
    expect(view.queryByTestId('markdown-streaming')).toBeNull();
  });

  it('the action bar stays away while the message runs', async () => {
    const model = createScriptedModel([[{ text: 'Pirma' }, { wait: true }]]);
    const view = await renderThread(model);
    await send(view, 'Klausimas');
    await running(view);
    expect(view.queryByTestId('assistantuikit-regenerate')).toBeNull();
    await act(async () => {
      model.release();
    });
    await settled(view);
    expect(view.getByTestId('assistantuikit-regenerate')).toBeTruthy();
  });
});

describe('reasoning', () => {
  it('renders as a closed thinking row that opens and closes on a tap', async () => {
    const model = createScriptedModel([[{ reasoning: 'Reikia patikrinti tvarkaraštį' }, { text: 'Rytoj 9:00' }]]);
    const view = await renderThread(model);
    await send(view, 'Kada?');
    await settled(view);
    expect(view.getByText('Mąstoma')).toBeTruthy();
    expect(view.queryByText('Reikia patikrinti tvarkaraštį')).toBeNull();
    await fireEvent.press(view.getByText('Mąstoma'));
    expect(view.getByText('Reikia patikrinti tvarkaraštį')).toBeTruthy();
    await fireEvent.press(view.getByText('Mąstoma'));
    expect(view.queryByText('Reikia patikrinti tvarkaraštį')).toBeNull();
    // The answer itself is untouched by the row
    expect(view.getByTestId('markdown-settled').props.children).toBe('Rytoj 9:00');
  });
});

describe('history and roles', () => {
  it('initial messages render both roles, in order, with no run', async () => {
    const model = createScriptedModel([]);
    const view = await renderThread(model, {
      initialMessages: [
        { role: 'user', content: 'Ankstesnis klausimas' },
        { role: 'assistant', content: 'Ankstesnis atsakymas' },
        { role: 'user', content: 'Dar vienas' },
        { role: 'assistant', content: [{ type: 'text', text: 'Ir dar vienas' }] },
      ],
    });
    expect(view.getAllByTestId('assistantuikit-message-user')).toHaveLength(2);
    expect(view.getAllByTestId('assistantuikit-message-assistant')).toHaveLength(2);
    expect(view.getByText('Ankstesnis klausimas')).toBeTruthy();
    expect(view.getAllByTestId('markdown-settled').map((node) => node.props.children)).toEqual([
      'Ankstesnis atsakymas',
      'Ir dar vienas',
    ]);
    expect(model.calls).toHaveLength(0);
    expect(view.queryByText('Sveiki!')).toBeNull();
  });

  it('a system message renders nothing', async () => {
    const view = await renderThread(createScriptedModel([]), {
      initialMessages: [
        { role: 'system', content: 'Tu esi fakulteto asistentas' },
        { role: 'user', content: 'Labas' },
      ],
    });
    expect(view.queryByText('Tu esi fakulteto asistentas')).toBeNull();
    expect(view.getByText('Labas')).toBeTruthy();
  });
});

// The runtime imports its initial messages after the first
// render, so the first message's scope opens once it exists
function FirstMessageScope({ children }: { children: ReactNode }) {
  const count = useAuiState((s) => s.thread.messages.length);
  if (count === 0) return null;
  return <MessageByIndexProvider index={0}>{children}</MessageByIndexProvider>;
}

describe('outside the kit provider', () => {
  it('a bubble throws the named error at render time, never an empty frame', async () => {
    // React logs the throw before it surfaces — kept out of the
    // test output
    const silence = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const model = createScriptedModel([]);
      await expect(
        render(
          <ScriptedThread model={model} initialMessages={[{ role: 'user', content: 'Labas' }]}>
            <FirstMessageScope>
              <AssistantMessage />
            </FirstMessageScope>
          </ScriptedThread>,
        ),
      ).rejects.toThrow(/assistantuikit: render inside/);
    } finally {
      silence.mockRestore();
    }
  });
});
