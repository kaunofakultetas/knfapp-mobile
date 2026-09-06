// -----------------------------------------------------------
//  [*] Tests — regenerate and the branch picker
//
//  One answer has no siblings and no picker. Regenerate runs
//  the model again under the same user turn; the new answer is
//  a sibling, the picker appears reading "2 / 2", the previous
//  arrow shows the first answer again and the next arrow the
//  second, each end disabled AND dimmed at its edge — the dim
//  is what tells the reader which arrow still works. Regenerate
//  sits on the LAST assistant message only — history with two
//  answers offers one button.
// -----------------------------------------------------------

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import AssistantThread from '../AssistantThread';
import { LABELS, ScriptedThread, createScriptedModel, send, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

const renderThread = (model: ReturnType<typeof createScriptedModel>, extra: Partial<React.ComponentProps<typeof ScriptedThread>> = {}) =>
  render(
    <ScriptedThread model={model} {...extra}>
      <AssistantThread labels={LABELS} />
    </ScriptedThread>,
  );

const opacityOf = (node: TestInstance): unknown =>
  (Object.assign({}, ...([node.props.style].flat(Infinity).filter(Boolean) as object[])) as { opacity?: unknown }).opacity;

describe('regenerate and branches', () => {
  it('one answer: regenerate is offered, the picker is not', async () => {
    const model = createScriptedModel([[{ text: 'Pirmas atsakymas' }]]);
    const view = await renderThread(model);
    await send(view, 'Klausimas');
    await settled(view);
    expect(view.getByTestId('assistantuikit-regenerate')).toBeTruthy();
    expect(view.getByText('Generuoti iš naujo')).toBeTruthy();
    expect(view.queryByLabelText('Ankstesnis atsakymas')).toBeNull();
    expect(view.queryByLabelText('Kitas atsakymas')).toBeNull();
  });

  it('regenerate makes a sibling; the picker appears and walks between the two answers', async () => {
    const model = createScriptedModel([[{ text: 'Pirmas atsakymas' }], [{ text: 'Antras atsakymas' }]]);
    const view = await renderThread(model);
    await send(view, 'Klausimas');
    await settled(view);

    await fireEvent.press(view.getByTestId('assistantuikit-regenerate'));
    await settled(view);
    await waitFor(() => expect(view.getByText('Antras atsakymas')).toBeTruthy());
    expect(model.calls).toHaveLength(2);
    // The same user turn, run again — not a second question
    expect(model.calls[1].messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(view.queryByText('Pirmas atsakymas')).toBeNull();
    expect(view.getByText('2 / 2')).toBeTruthy();
    expect(view.getByLabelText('Kitas atsakymas')).toBeDisabled();
    expect(view.getByLabelText('Ankstesnis atsakymas')).toBeEnabled();
    // The edge arrow is dimmed, the live one is not
    expect(opacityOf(view.getByLabelText('Kitas atsakymas'))).toBe(0.4);
    expect(opacityOf(view.getByLabelText('Ankstesnis atsakymas'))).toBe(1);

    await fireEvent.press(view.getByLabelText('Ankstesnis atsakymas'));
    await waitFor(() => expect(view.getByText('Pirmas atsakymas')).toBeTruthy());
    expect(view.queryByText('Antras atsakymas')).toBeNull();
    expect(view.getByText('1 / 2')).toBeTruthy();
    expect(view.getByLabelText('Ankstesnis atsakymas')).toBeDisabled();
    expect(opacityOf(view.getByLabelText('Ankstesnis atsakymas'))).toBe(0.4);
    expect(opacityOf(view.getByLabelText('Kitas atsakymas'))).toBe(1);

    await fireEvent.press(view.getByLabelText('Kitas atsakymas'));
    await waitFor(() => expect(view.getByText('Antras atsakymas')).toBeTruthy());
    expect(view.getByText('2 / 2')).toBeTruthy();
    // Only one message row on screen — siblings, not a list of both
    expect(view.getAllByTestId('assistantuikit-message-assistant')).toHaveLength(1);
  });

  it('regenerate sits on the last assistant message only', async () => {
    const view = await renderThread(createScriptedModel([]), {
      initialMessages: [
        { role: 'user', content: 'Vienas' },
        { role: 'assistant', content: 'Pirmas' },
        { role: 'user', content: 'Du' },
        { role: 'assistant', content: 'Antras' },
      ],
    });
    await waitFor(() => expect(view.getAllByTestId('assistantuikit-message-assistant')).toHaveLength(2));
    expect(view.getAllByTestId('assistantuikit-regenerate')).toHaveLength(1);
    expect(view.queryByLabelText('Ankstesnis atsakymas')).toBeNull();
  });
});
