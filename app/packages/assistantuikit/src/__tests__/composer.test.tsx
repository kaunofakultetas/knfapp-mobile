// -----------------------------------------------------------
//  [*] Tests — AssistantComposer over the real local runtime
//
//  The strip's contract: Send is disabled on an empty field
//  and live once there is text; a send clears the field and
//  lands the text as the user's bubble; while a run is in
//  flight the one button is Cancel, and pressing it aborts the
//  run — the model's hold is released by the abort, the thread
//  settles, and Send is back. Submit is the button ALONE: even
//  on the web platform, where the upstream field would send on
//  Enter by default, the key inserts and nothing runs. The
//  field grows with its text up to six lines and no further.
//  The placeholder is the host's word. The markdown renderer
//  is stubbed to a plain Text so this suite stands on its own.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import AssistantThread from '../AssistantThread';
import { LABELS, ScriptedThread, createScriptedModel, running, send, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

const renderThread = (model: ReturnType<typeof createScriptedModel>) =>
  render(
    <ScriptedThread model={model}>
      <AssistantThread labels={LABELS} />
    </ScriptedThread>,
  );

describe('AssistantComposer', () => {
  it('shows the host placeholder and disables Send on an empty field', async () => {
    const view = await renderThread(createScriptedModel([[{ text: 'Labas' }]]));
    expect(view.getByTestId('assistantuikit-composer-input').props.placeholder).toBe('Klauskite asistento…');
    expect(view.getByTestId('assistantuikit-composer-send')).toBeDisabled();
    expect(view.getByText('Siųsti')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-composer-cancel')).toBeNull();
  });

  it('enables Send once there is text, and whitespace alone does not count', async () => {
    const view = await renderThread(createScriptedModel([[{ text: 'Labas' }]]));
    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), '   ');
    expect(view.getByTestId('assistantuikit-composer-send')).toBeDisabled();
    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Kada paskaita?');
    expect(view.getByTestId('assistantuikit-composer-send')).toBeEnabled();
  });

  it('a send clears the field and lands the text as the user bubble', async () => {
    const model = createScriptedModel([[{ text: 'Rytoj 9:00' }]]);
    const view = await renderThread(model);
    await send(view, 'Kada paskaita?');
    await settled(view);
    expect(view.getByTestId('assistantuikit-composer-input').props.value).toBe('');
    expect(view.getByTestId('assistantuikit-message-user')).toBeTruthy();
    expect(view.getByText('Kada paskaita?')).toBeTruthy();
    expect(view.getByText('Rytoj 9:00')).toBeTruthy();
    // The runtime handed the model exactly the one user turn
    expect(model.calls).toHaveLength(1);
    const lastMessage = model.calls[0].messages[model.calls[0].messages.length - 1];
    expect(lastMessage.role).toBe('user');
  });

  it('while a run is in flight the one button is Cancel, and Send is gone', async () => {
    const model = createScriptedModel([[{ text: 'Ieškau' }, { wait: true }, { text: '…' }]]);
    const view = await renderThread(model);
    await send(view, 'Kas naujo?');
    await running(view);
    expect(view.getByText('Stabdyti')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-composer-send')).toBeNull();
    await act(async () => {
      model.release();
    });
    await settled(view);
    expect(view.queryByTestId('assistantuikit-composer-cancel')).toBeNull();
  });

  it('pressing Cancel aborts the run — the thread settles and Send returns', async () => {
    const model = createScriptedModel([[{ text: 'Ieškau' }, { wait: true }, { text: ' ir radau' }]]);
    const view = await renderThread(model);
    await send(view, 'Kas naujo?');
    await running(view);
    await fireEvent.press(view.getByTestId('assistantuikit-composer-cancel'));
    await settled(view);
    // The abort released the hold; the tail after it never landed
    expect(model.calls[0].abortSignal.aborted).toBe(true);
    expect(view.getByText('Ieškau')).toBeTruthy();
    expect(view.queryByText('Ieškau ir radau')).toBeNull();
    expect(view.getByTestId('assistantuikit-composer-send')).toBeTruthy();
  });

  it('grows with its text to six lines and no further', async () => {
    const view = await renderThread(createScriptedModel([[{ text: 'Labas' }]]));
    const style = view.getByTestId('assistantuikit-composer-input').props.style;
    const flatStyle = Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));
    // One line of 20 plus the vertical padding, capped at six
    expect(flatStyle.minHeight).toBe(20 + 10 * 2);
    expect(flatStyle.maxHeight).toBe(20 * 6 + 10 * 2);
  });

  it('a second send is a second run with the whole history', async () => {
    const model = createScriptedModel([[{ text: 'Pirmas' }], [{ text: 'Antras' }]]);
    const view = await renderThread(model);
    await send(view, 'Vienas');
    await settled(view);
    await send(view, 'Du');
    await settled(view);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(view.getByText('Antras')).toBeTruthy();
  });
});

// The upstream field only ever submits on a key on the web
// platform, so the button-only contract is pinned there: with
// the kit's submit mode, Enter must insert, never send. The
// platform flips only around the keypress — the upstream
// field's mount effect expects a DOM element under 'web'
describe('submit is the button alone', () => {
  it('Enter on the web keeps the text and runs nothing', async () => {
    const model = createScriptedModel([[{ text: 'Labas' }]]);
    const view = await renderThread(model);
    const input = view.getByTestId('assistantuikit-composer-input');
    await fireEvent.changeText(input, 'Kada paskaita?');

    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      await act(async () => {
        fireEvent(input, 'keyPress', {
          isDefaultPrevented: () => false,
          preventDefault: () => {},
          nativeEvent: { key: 'Enter', shiftKey: false },
        });
      });
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }

    expect(model.calls).toHaveLength(0);
    expect(view.getByTestId('assistantuikit-composer-input').props.value).toBe('Kada paskaita?');
    expect(view.queryByTestId('assistantuikit-message-user')).toBeNull();
  });
});
