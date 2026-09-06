// -----------------------------------------------------------
//  [*] Tests — TextPart wiring, through the REAL renderer
//
//  Every other thread-level suite stubs the markdown renderer,
//  so this one runs without the stub: the line that carries the
//  host's link callback and palette into an assistant bubble is
//  pinned end to end — a link in the answer presses through to
//  onPressLink with its URL, and the paragraph text wears the
//  palette's ink, not a default.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';

import AssistantThread from '../AssistantThread';
import { defaultColors } from '../core/types';
import { LABELS, ScriptedThread, createScriptedModel, send, settled } from './support/scriptedRuntime';

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));

describe('TextPart through the real markdown renderer', () => {
  it('hands the host onPressLink the URL and paints the palette ink', async () => {
    const onPressLink = jest.fn();
    const colors = { ...defaultColors, ink: '#101010' };
    const model = createScriptedModel([[{ text: 'Žr. [VU](https://knf.vu.lt) svetainę' }]]);
    const view = await render(
      <ScriptedThread model={model}>
        <AssistantThread labels={LABELS} colors={colors} onPressLink={onPressLink} />
      </ScriptedThread>,
    );
    await send(view, 'Kur rasti?');
    await settled(view);

    await fireEvent.press(view.getByText('VU'));
    expect(onPressLink).toHaveBeenCalledTimes(1);
    expect(onPressLink).toHaveBeenCalledWith('https://knf.vu.lt');

    expect(flat(view.getByText(/svetainę/).props.style).color).toBe('#101010');
  });
});
