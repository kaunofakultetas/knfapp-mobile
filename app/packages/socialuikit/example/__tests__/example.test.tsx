// -----------------------------------------------------------
//  [*] Tests — socialuikit example
//
//  The showcase proven live, whole: the screen mounts with
//  every card face on it, an optimistic like flips a row's
//  tally in place, a poll vote swaps the ballot face for
//  results, accepting the connect request flips the button,
//  and a sent comment clears the bar and moves the thread's
//  count. What passes here is the wiring a host copies.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';

import ExampleFeedScreen from '../ExampleFeedScreen';


// RelativeTime aims wake-up timeouts at its next band edge;
// fake timers keep the suite from holding real handles open
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// Settles promise chains (the composer's await onSubmit)
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
};




describe('ExampleFeedScreen', () => {

  it('mounts with every card face, the header pair and the comment bar', async () => {
    const r = await render(<ExampleFeedScreen />);

    // The five dataset rows
    expect(r.getByText('Bendruomenės dienos akimirkos — ačiū visiems atėjusiems!')).toBeTruthy();
    expect(r.getByText('Verta perskaityti prieš registraciją:')).toBeTruthy();
    expect(r.getByText('Padėkite išsirinkti!')).toBeTruthy();
    expect(r.getByText('Paskaita perkelta į 402 auditoriją (ne 401 — atsiprašau!).')).toBeTruthy();
    expect(r.getByText(/Registracija į rudens semestro būrelius/)).toBeTruthy();


    // The faces: a four-tile album, a link card, the poll's
    // ballot rows, the edited mark, the source chip
    expect(r.getByTestId('socialuikit-gallery')).toBeTruthy();
    expect(r.getByTestId('socialuikit-gallery-item-3')).toBeTruthy();
    expect(r.getByTestId('socialuikit-link-card')).toBeTruthy();
    expect(r.getByTestId('socialuikit-poll')).toBeTruthy();
    expect(r.getByTestId('socialuikit-poll-option-a').props.accessibilityRole).toBe('radio');
    expect(r.getByText('· redaguota')).toBeTruthy();
    expect(r.getByTestId('socialuikit-post-source')).toBeTruthy();
    expect(r.getByText('KNF naujienos')).toBeTruthy();


    // The header pair: the unread activity row and the incoming
    // request's two-button face
    expect(r.getByTestId('socialuikit-notification-row-unread')).toBeTruthy();
    expect(r.getByText('Jonas Kazlauskas nori užmegzti ryšį')).toBeTruthy();
    expect(r.getByTestId('socialuikit-connect-accept')).toBeTruthy();
    expect(r.getByTestId('socialuikit-connect-decline')).toBeTruthy();


    // The comment bar is signed in, so the field renders
    expect(r.getByTestId('socialuikit-comment-input')).toBeTruthy();
  });


  it('flips a like optimistically — the tally moves on the row itself', async () => {
    const r = await render(<ExampleFeedScreen />);

    // The album post opens the feed with 12 likes
    expect(r.getByText('12')).toBeTruthy();

    await fireEvent.press(r.getAllByTestId('socialuikit-action-like')[0]);
    expect(r.getByText('13')).toBeTruthy();
    expect(r.queryByText('12')).toBeNull();

    // The same tap undoes it — the flip is a toggle, not a one-way
    await fireEvent.press(r.getAllByTestId('socialuikit-action-like')[0]);
    expect(r.getByText('12')).toBeTruthy();
  });


  it('votes in the poll and the results face swaps in', async () => {
    const r = await render(<ExampleFeedScreen />);

    // Ballots up-front: radios, no bars
    expect(r.queryByTestId('socialuikit-poll-bar-b')).toBeNull();

    // Single answer type — the tap IS the vote
    await fireEvent.press(r.getByTestId('socialuikit-poll-option-b'));

    // Results: bars for every option, the voted row at its new
    // share (15 of 28 people → 54%), the tally line grown by one
    expect(r.getByTestId('socialuikit-poll-bar-a')).toBeTruthy();
    expect(r.getByTestId('socialuikit-poll-bar-b')).toBeTruthy();
    expect(r.getByTestId('socialuikit-poll-bar-c')).toBeTruthy();
    expect(r.getByText('54%')).toBeTruthy();
    expect(r.getByText('Balsavo 28 žmonės')).toBeTruthy();
  });


  it('accepts the connect request and marks the activity row read', async () => {
    const r = await render(<ExampleFeedScreen />);

    await fireEvent.press(r.getByTestId('socialuikit-connect-accept'));
    expect(r.getByTestId('socialuikit-connect-disconnect')).toBeTruthy();
    expect(r.getByText('Ryšys užmegztas')).toBeTruthy();
    expect(r.queryByTestId('socialuikit-connect-accept')).toBeNull();

    await fireEvent.press(r.getByTestId('socialuikit-notification-row-unread'));
    expect(r.getByTestId('socialuikit-notification-row')).toBeTruthy();
    expect(r.queryByTestId('socialuikit-notification-dot')).toBeNull();
  });


  it('sends a comment — the field clears and the thread count moves', async () => {
    const r = await render(<ExampleFeedScreen />);

    // The album post's comment tally opens at 3
    expect(r.getByText('3')).toBeTruthy();

    await fireEvent.changeText(r.getByTestId('socialuikit-comment-input'), '  Puiku! ');
    await fireEvent.press(r.getByTestId('socialuikit-comment-send'));
    await flush();

    expect(r.getByText('4')).toBeTruthy();
    expect(r.getByTestId('socialuikit-comment-input').props.value).toBe('');
  });
});
