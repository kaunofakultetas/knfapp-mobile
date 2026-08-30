// -----------------------------------------------------------
//  [*] Tests — the example screen end to end
//
//  ExampleSocialScreen against its own seeded fake: the feed,
//  the poll and the badge come up; a like tap flips the shown
//  count instantly and holds it once the fake settles; a vote
//  swaps choices for the server's arithmetic; the connect
//  button walks none → outgoing. Everything runs over real
//  timers — the fake settles through microtasks alone.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';

import ExampleSocialScreen from '../ExampleSocialScreen';


// The fake settles through chained microtasks (the toggle
// queue's .then/.finally plus the hooks' handlers) — drain them
const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });


describe('ExampleSocialScreen', () => {
  it('mounts with the seeded feed, poll and unread badge', async () => {
    const screen = await render(<ExampleSocialScreen />);
    await flush();

    expect(screen.getByText('The engine runs with no server behind it.')).toBeTruthy();
    expect(screen.getByText('Kur švenčiam sesijos pabaigą?')).toBeTruthy();
    // Choices, not results — nobody voted and the poll is open
    expect(screen.getByText('Kavinėje')).toBeTruthy();
    // Two seeded unread activity rows
    expect(screen.getByTestId('unread-badge').props.children).toBe('2');
  });

  it('a like tap shows the optimistic count and the fake settles on it', async () => {
    const screen = await render(<ExampleSocialScreen />);
    await flush();
    expect(screen.getByText('♡ 3')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('like-p-1'));
    // The flip is instant — base 3 plus the viewer's intent
    expect(screen.getByText('❤ 4')).toBeTruthy();

    await flush();
    // The server agreed; the diff-merge holds 4, never 5
    expect(screen.getByText('❤ 4')).toBeTruthy();
  });

  it('a vote swaps choices for results carrying the server arithmetic', async () => {
    const screen = await render(<ExampleSocialScreen />);
    await flush();

    await fireEvent.press(screen.getByTestId('poll-opt-a'));
    await flush();

    // 2+1 of now-6 voters on the chosen option, 3 of 6 on the
    // other — the resolved poll replaced local state wholesale
    expect(screen.getByText('Kavinėje — 50% (3) ✓')).toBeTruthy();
    expect(screen.getByText('Prie Nemuno — 50% (3)')).toBeTruthy();
    expect(screen.getByText('6 voted')).toBeTruthy();
  });

  it('the connect button walks none → outgoing through the fake', async () => {
    const screen = await render(<ExampleSocialScreen />);
    await flush();
    expect(screen.getByText('Connect')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('connect'));
    // Optimistic 'outgoing' the instant the tap lands
    expect(screen.getByText('Requested')).toBeTruthy();

    await flush();
    // The request-style fake confirmed the same word
    expect(screen.getByText('Requested')).toBeTruthy();
  });
});
