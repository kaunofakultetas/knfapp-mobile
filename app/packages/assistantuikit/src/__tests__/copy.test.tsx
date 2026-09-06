// -----------------------------------------------------------
//  [*] Tests — the copy action
//
//  Copy is the host's clipboard: without a copyToClipboard the
//  action is not rendered at all (a dead button is worse than
//  none); with one, a press hands it the assistant's text, the
//  label flips to the host's "copied" word and flips back once
//  the upstream hook's window closes (fake timers — the window
//  is a real three-second hold). A message with no text to
//  copy shows the action dimmed: the upstream primitive
//  disables the press, the dim makes that visible. A user
//  bubble carries no action bar, so no copy there.
// -----------------------------------------------------------

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import AssistantThread from '../AssistantThread';
import { LABELS, ScriptedThread, createScriptedModel, send, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

const renderThread = (model: ReturnType<typeof createScriptedModel>, copyToClipboard?: (text: string) => Promise<void> | void) =>
  render(
    <ScriptedThread model={model}>
      <AssistantThread labels={LABELS} copyToClipboard={copyToClipboard} />
    </ScriptedThread>,
  );

describe('copy', () => {
  it('is not rendered without a clipboard', async () => {
    const model = createScriptedModel([[{ text: 'Atsakymas' }]]);
    const view = await renderThread(model);
    await send(view, 'Klausimas');
    await settled(view);
    expect(view.queryByTestId('assistantuikit-copy')).toBeNull();
    expect(view.queryByText('Kopijuoti')).toBeNull();
    // The rest of the bar is still there
    expect(view.getByTestId('assistantuikit-regenerate')).toBeTruthy();
  });

  it('hands the assistant text to the clipboard and flips the label, then flips back', async () => {
    jest.useFakeTimers();
    try {
      const copyToClipboard = jest.fn(async () => {});
      const model = createScriptedModel([[{ text: 'Rytoj 9:00 Matematika' }]]);
      const view = await renderThread(model, copyToClipboard);
      await send(view, 'Kada?');
      await settled(view);
      expect(view.getByTestId('assistantuikit-copy')).toBeTruthy();
      expect(view.getByText('Kopijuoti')).toBeTruthy();

      await fireEvent.press(view.getByTestId('assistantuikit-copy'));
      expect(copyToClipboard).toHaveBeenCalledTimes(1);
      expect(copyToClipboard).toHaveBeenCalledWith('Rytoj 9:00 Matematika');
      await waitFor(() => expect(view.getByText('Nukopijuota')).toBeTruthy());
      expect(view.queryByText('Kopijuoti')).toBeNull();

      // The upstream hook holds the copied state for three
      // seconds — advanced here, never slept through
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(view.getByText('Kopijuoti')).toBeTruthy();
      expect(view.queryByText('Nukopijuota')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a clipboard that rejects leaves the label alone', async () => {
    const copyToClipboard = jest.fn(async () => {
      throw new Error('iškarpinė užimta');
    });
    const model = createScriptedModel([[{ text: 'Tekstas' }]]);
    const view = await renderThread(model, copyToClipboard);
    await send(view, 'Klausimas');
    await settled(view);
    await act(async () => {
      fireEvent.press(view.getByTestId('assistantuikit-copy'));
    });
    expect(copyToClipboard).toHaveBeenCalledWith('Tekstas');
    expect(view.getByText('Kopijuoti')).toBeTruthy();
    expect(view.queryByText('Nukopijuota')).toBeNull();
  });

  it('is only on the assistant bubble — the user row has no action bar', async () => {
    const model = createScriptedModel([[{ text: 'Atsakymas' }]]);
    const view = await renderThread(model, async () => {});
    await send(view, 'Klausimas');
    await settled(view);
    expect(view.getAllByTestId('assistantuikit-copy')).toHaveLength(1);
    expect(view.getAllByText('Kopijuoti')).toHaveLength(1);
  });

  it('is dimmed on a message with no text to copy, full strength with one', async () => {
    const flat = (style: unknown): Record<string, unknown> =>
      Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));
    // A tool-only answer: nothing the clipboard could take
    const model = createScriptedModel([
      [{ tool: { name: 'searchNews', input: {}, output: { posts: [] } } }],
      [{ text: 'Atsakymas' }],
    ]);
    const view = await renderThread(model, async () => {});
    await send(view, 'Naujienos?');
    await settled(view);
    expect(flat(view.getByTestId('assistantuikit-copy').props.style).opacity).toBe(0.4);
    expect(view.getByTestId('assistantuikit-copy')).toBeDisabled();

    await send(view, 'Klausimas');
    await settled(view);
    const bars = view.getAllByTestId('assistantuikit-copy');
    expect(flat(bars[bars.length - 1].props.style).opacity).toBe(1);
    expect(bars[bars.length - 1]).toBeEnabled();
  });
});
