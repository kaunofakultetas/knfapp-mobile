// -----------------------------------------------------------
//  [*] Tests — AssistantErrorBanner over a failing model
//
//  A model that throws ends the run in an error, and the strip
//  appears above the composer: the host's title and body, the
//  runtime's own message under them, and a retry that reloads
//  the failed message — the model is asked again, and a
//  second run that succeeds takes the strip down and lands
//  its text. A run that died before ANY content leaves no
//  assistant bubble behind — the strip is the whole story, no
//  empty pill with a second retry beside it. Nothing shows
//  before the failure, and a thread whose last message is fine
//  shows no strip. The banner on its own under an error-free
//  message scope renders nothing.
// -----------------------------------------------------------

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { MessageByIndexProvider, useAuiState } from '@assistant-ui/react-native';

import AssistantErrorBanner from '../AssistantErrorBanner';
import AssistantThread from '../AssistantThread';
import { LABELS, ScriptedThread, createScriptedModel, send, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

const renderThread = (model: ReturnType<typeof createScriptedModel>) =>
  render(
    <ScriptedThread model={model}>
      <AssistantThread labels={LABELS} />
    </ScriptedThread>,
  );

describe('AssistantErrorBanner in the thread', () => {
  it('appears when the run fails, with the host words and the runtime message', async () => {
    const model = createScriptedModel([[{ throw: 'Serveris neatsako (503)' }]]);
    const view = await renderThread(model);
    expect(view.queryByTestId('assistantuikit-error')).toBeNull();
    await send(view, 'Labas');
    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    expect(view.getByText('Nepavyko atsakyti')).toBeTruthy();
    expect(view.getByText('Patikrinkite ryšį ir bandykite dar kartą.')).toBeTruthy();
    expect(view.getByText('Serveris neatsako (503)')).toBeTruthy();
    expect(view.getByText('Bandyti dar kartą')).toBeTruthy();
    // The thread settled — Send is back, and the message that
    // died with nothing in it paints NO bubble: the strip owns
    // the failure, and its retry is the only one
    await settled(view);
    expect(view.queryByTestId('assistantuikit-message-assistant')).toBeNull();
    expect(view.queryByTestId('assistantuikit-regenerate')).toBeNull();
    expect(view.getAllByText('Bandyti dar kartą')).toHaveLength(1);
  });

  it('a failure after some text keeps the bubble with what arrived, beside the strip', async () => {
    const model = createScriptedModel([[{ text: 'Rytoj bus' }, { throw: 'Ryšys dingo' }]]);
    const view = await renderThread(model);
    await send(view, 'Kada?');
    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    await settled(view);
    expect(view.getByTestId('assistantuikit-message-assistant')).toBeTruthy();
    expect(view.getByText('Rytoj bus')).toBeTruthy();
  });

  it('retry asks the model again; a run that succeeds takes the strip down', async () => {
    const model = createScriptedModel([[{ throw: 'Laikinai nepasiekiama' }], [{ text: 'Dabar pavyko' }]]);
    const view = await renderThread(model);
    await send(view, 'Labas');
    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    expect(model.calls).toHaveLength(1);
    await fireEvent.press(view.getByText('Bandyti dar kartą'));
    await settled(view);
    await waitFor(() => expect(view.queryByTestId('assistantuikit-error')).toBeNull());
    expect(model.calls).toHaveLength(2);
    expect(view.getByText('Dabar pavyko')).toBeTruthy();
    // The retry re-ran the same user turn, not a new one
    expect(model.calls[1].messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('shows nothing while the last message is fine', async () => {
    const model = createScriptedModel([[{ text: 'Viskas gerai' }]]);
    const view = await renderThread(model);
    await send(view, 'Labas');
    await settled(view);
    expect(view.queryByTestId('assistantuikit-error')).toBeNull();
    expect(view.queryByText('Bandyti dar kartą')).toBeNull();
  });
});

// The runtime imports its initial messages after the first
// render, so the first message's scope opens once it exists
function FirstMessageScope({ children }: { children: ReactNode }) {
  const count = useAuiState((s) => s.thread.messages.length);
  if (count === 0) return null;
  return <MessageByIndexProvider index={0}>{children}</MessageByIndexProvider>;
}

describe('AssistantErrorBanner on its own', () => {
  it('renders nothing under a message scope with no error', async () => {
    const model = createScriptedModel([]);
    const view = await render(
      <ScriptedThread model={model} initialMessages={[{ role: 'assistant', content: 'Sveiki' }]}>
        <FirstMessageScope>
          <AssistantErrorBanner labels={LABELS} onRetry={() => {}} />
        </FirstMessageScope>
      </ScriptedThread>,
    );
    await waitFor(() => expect(model.calls).toHaveLength(0));
    expect(view.queryByTestId('assistantuikit-error')).toBeNull();
    expect(view.toJSON()).toBeNull();
  });

  it('shows under a message scope whose status is an error, and retry is the host callback', async () => {
    const onRetry = jest.fn();
    const model = createScriptedModel([]);
    const view = await render(
      <ScriptedThread
        model={model}
        initialMessages={[
          { role: 'assistant', content: 'Nutrūko', status: { type: 'incomplete', reason: 'error', error: 'Ryšys dingo' } },
        ]}
      >
        <FirstMessageScope>
          <AssistantErrorBanner labels={LABELS} onRetry={onRetry} />
        </FirstMessageScope>
      </ScriptedThread>,
    );
    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    expect(view.getByText('Ryšys dingo')).toBeTruthy();
    await fireEvent.press(view.getByText('Bandyti dar kartą'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(model.calls).toHaveLength(0);
  });
});
