// -----------------------------------------------------------
//  [*] Tests — the sources footer and the thumbs pair
//
//  The two answer-surface additions, over the real scripted
//  runtime: an answer whose searchHandbook call returned
//  entries grows the numbered sources footer inside the
//  bubble (tool order = citation order, section appended
//  when present), an answer without such a call shows no
//  footer; the thumbs render only when the host handed an
//  onFeedback callback, report (messageId, 1 / -1) on a
//  tap, clear with (messageId, 0) on the same thumb again,
//  and carry the selected state for the screen reader.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';

import AssistantThread from '../AssistantThread';
import { LABELS, ScriptedThread, createScriptedModel, send, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));


const ENTRIES = {
  entries: [
    { id: 'handbook:lt-faq:1-0', title: 'Kaip prisijungti prie VU Wi-Fi?', excerpt: 'eduroam...', section: 'faq', language: 'lt' },
    { id: 'handbook:lt-contacts:0-0', title: 'Kontaktai', excerpt: 'Studijų skyrius...', language: 'lt' },
  ],
};

type View = Awaited<ReturnType<typeof render>>;

const renderThread = (model: ReturnType<typeof createScriptedModel>, onFeedback?: (id: string, rating: 1 | -1 | 0) => void) =>
  render(
    <ScriptedThread model={model}>
      <AssistantThread labels={LABELS} onFeedback={onFeedback} />
    </ScriptedThread>,
  );


describe('the sources footer', () => {
  it('numbers searchHandbook entries in tool order, section appended when present', async () => {
    const model = createScriptedModel([[
      { tool: { name: 'searchHandbook', input: { query: 'wifi' }, output: ENTRIES } },
      { text: 'Junkitės prie eduroam [1].' },
    ]]);
    const view = await renderThread(model);
    await send(view, 'Kaip prisijungti prie Wi-Fi?');
    await settled(view);

    expect(view.getByTestId('assistantuikit-sources')).toBeTruthy();
    expect(view.getByText(LABELS.sourcesTitle)).toBeTruthy();
    expect(view.getByText(/\[1\] Kaip prisijungti prie VU Wi-Fi\? — faq/)).toBeTruthy();
    expect(view.getByText(/\[2\] Kontaktai/)).toBeTruthy();

    // A tap expands the entry's excerpt in place; tapping the
    // other entry closes the first (one open at a time)
    expect(view.queryByTestId('assistantuikit-source-excerpt-0')).toBeNull();
    await fireEvent.press(view.getByTestId('assistantuikit-source-0'));
    expect(view.getByTestId('assistantuikit-source-excerpt-0')).toBeTruthy();
    expect(view.getByText('eduroam...')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-source-0').props.accessibilityState.expanded).toBe(true);
    await fireEvent.press(view.getByTestId('assistantuikit-source-1'));
    expect(view.queryByTestId('assistantuikit-source-excerpt-0')).toBeNull();
    expect(view.getByTestId('assistantuikit-source-excerpt-1')).toBeTruthy();
  });

  it('an answer without a searchHandbook call shows no footer', async () => {
    const model = createScriptedModel([[
      { tool: { name: 'lookupSchedule', input: {}, output: { lessons: [], source: 'live' } } },
      { text: 'Šiandien paskaitų nėra.' },
    ]]);
    const view = await renderThread(model);
    await send(view, 'Kada paskaitos?');
    await settled(view);

    expect(view.queryByTestId('assistantuikit-sources')).toBeNull();
  });
});


describe('the thumbs pair', () => {
  it('reports up, clears on the same thumb, and flips to down — with the selected state carried', async () => {
    const verdicts: [string, 1 | -1 | 0][] = [];
    const model = createScriptedModel([[{ text: 'Atsakymas.' }]]);
    const view = await renderThread(model, (id, rating) => verdicts.push([id, rating]));
    await send(view, 'Klausimas?');
    await settled(view);

    const up = view.getByTestId('assistantuikit-feedback-up');
    const down = view.getByTestId('assistantuikit-feedback-down');
    expect(up.props.accessibilityLabel).toBe(LABELS.feedbackUp);

    await fireEvent.press(up);
    await fireEvent.press(up);
    await fireEvent.press(down);

    expect(verdicts.map(([, rating]) => rating)).toEqual([1, 0, -1]);
    const [messageId] = verdicts[0];
    expect(verdicts.every(([id]) => id === messageId)).toBe(true);
    expect(view.getByTestId('assistantuikit-feedback-down').props.accessibilityState.selected).toBe(true);
  });

  it('without an onFeedback callback the thumbs are not rendered at all', async () => {
    const model = createScriptedModel([[{ text: 'Atsakymas.' }]]);
    const view = await renderThread(model);
    await send(view, 'Klausimas?');
    await settled(view);

    expect(view.queryByTestId('assistantuikit-feedback-up')).toBeNull();
    expect(view.queryByTestId('assistantuikit-feedback-down')).toBeNull();
  });
});
