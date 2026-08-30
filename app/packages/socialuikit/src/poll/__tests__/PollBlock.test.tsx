// -----------------------------------------------------------
//  [*] Tests — socialuikit PollBlock
//
//  The poll contract clause by clause: the results-gating
//  matrix (voted / closed / expired by the frozen clock / the
//  one-way local reveal), the tap-is-the-vote single flow, the
//  tick-then-submit multiple flow with its disabled button,
//  exact bar widths under a rounded label, the shared crown on
//  a tie, the four-option fold with its one-way expander, the
//  guest hint, the submitting lock, and the footer's tally +
//  countdown pairs. env.now is frozen throughout so expiry and
//  countdowns are pure functions of the fixture.
// -----------------------------------------------------------

import { fireEvent, render, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import type { KitPoll, KitPollOption } from '../../core/types';
import { SocialUiKitProvider } from '../../provider';
import PollBlock from '../PollBlock';


const NOW = new Date(Date.UTC(2026, 7, 30, 12, 0, 0));
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * 3_600_000).toISOString();

const opt = (id: string, voteCount = 0, votedByMe = false): KitPollOption => ({
  id,
  text: `Option ${id.toUpperCase()}`,
  voteCount,
  votedByMe,
});

const buildPoll = (over: Partial<KitPoll> = {}): KitPoll => ({
  id: 'p1',
  question: 'Kur susitinkam?',
  options: [opt('a'), opt('b')],
  answerType: 'single',
  totalVotes: 0,
  closed: false,
  votedByMe: false,
  ...over,
});

// English labels for readable assertions; the frozen clock
// makes 'expired' a property of the fixture, not of wall time
const wrap = (ui: ReactElement) =>
  render(
    <SocialUiKitProvider locale="en" env={{ now: () => NOW }}>
      {ui}
    </SocialUiKitProvider>,
  );

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style) as Record<string, unknown>;

const base = { canVote: true, onVote: () => {} };




describe('PollBlock gating', () => {

  it('shows ballots on an open unvoted poll and results once votedByMe', async () => {
    const open = await wrap(<PollBlock {...base} poll={buildPoll()} />);
    expect(open.getByTestId('socialuikit-poll')).toBeTruthy();
    expect(open.queryByTestId('socialuikit-poll-bar-a')).toBeNull();
    expect(open.getByTestId('socialuikit-poll-option-a').props.accessibilityRole).toBe('radio');

    const voted = await wrap(
      <PollBlock {...base} poll={buildPoll({ votedByMe: true, totalVotes: 1, options: [opt('a', 1, true), opt('b')] })} />,
    );
    expect(voted.getByTestId('socialuikit-poll-bar-a')).toBeTruthy();
    expect(voted.queryByRole('radio')).toBeNull();
  });


  it('shows results when the poll carries the closed flag', async () => {
    const r = await wrap(<PollBlock {...base} poll={buildPoll({ closed: true, totalVotes: 2, options: [opt('a', 2), opt('b')] })} />);

    expect(r.getByTestId('socialuikit-poll-bar-a')).toBeTruthy();
    expect(r.getByText('Poll closed')).toBeTruthy();
  });


  it('shows results when expiresAt sits behind the frozen clock, with the closed footer', async () => {
    const r = await wrap(<PollBlock {...base} poll={buildPoll({ expiresAt: at(-1), totalVotes: 1, options: [opt('a', 1), opt('b')] })} />);

    expect(r.getByTestId('socialuikit-poll-bar-a')).toBeTruthy();
    expect(r.getByText('Poll closed')).toBeTruthy();
    expect(r.queryByText('See results')).toBeNull();
  });


  it("reveals results one-way through 'see results' on an open poll", async () => {
    const onVote = jest.fn();
    const r = await wrap(<PollBlock {...base} onVote={onVote} poll={buildPoll({ expiresAt: at(3), totalVotes: 1, options: [opt('a', 1), opt('b')] })} />);

    expect(r.queryByTestId('socialuikit-poll-bar-a')).toBeNull();
    await fireEvent.press(r.getByText('See results'));


    // Revealed: bars up, the link gone, no way back to ballots
    expect(r.getByTestId('socialuikit-poll-bar-a')).toBeTruthy();
    expect(r.queryByText('See results')).toBeNull();
    expect(onVote).not.toHaveBeenCalled();
  });
});




describe('PollBlock voting', () => {

  it('fires onVote([id]) on the tap itself for a single-answer poll', async () => {
    const onVote = jest.fn();
    const r = await wrap(<PollBlock {...base} onVote={onVote} poll={buildPoll()} />);

    await fireEvent.press(r.getByTestId('socialuikit-poll-option-b'));

    expect(onVote).toHaveBeenCalledTimes(1);
    expect(onVote).toHaveBeenCalledWith(['b']);
    expect(r.queryByText('Vote')).toBeNull();
  });


  it('collects checkbox ticks and submits them, with the button locked until one is set', async () => {
    const onVote = jest.fn();
    const poll = buildPoll({ answerType: 'multiple', options: [opt('a'), opt('b'), opt('c')] });
    const r = await wrap(<PollBlock {...base} onVote={onVote} poll={poll} />);

    const rowA = r.getByTestId('socialuikit-poll-option-a');
    expect(rowA.props.accessibilityRole).toBe('checkbox');
    expect(rowA.props.accessibilityState.checked).toBe(false);


    // Nothing ticked: the submit button refuses the press
    const submit = r.getByText('Vote');
    await fireEvent.press(submit);
    expect(onVote).not.toHaveBeenCalled();


    // Tick a and c, untick a — the submission is what remains
    await fireEvent.press(rowA);
    expect(r.getByTestId('socialuikit-poll-option-a').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(r.getByTestId('socialuikit-poll-option-c'));
    await fireEvent.press(r.getByTestId('socialuikit-poll-option-a'));
    await fireEvent.press(r.getByText('Vote'));

    expect(onVote).toHaveBeenCalledTimes(1);
    expect(onVote).toHaveBeenCalledWith(['c']);
  });


  it('locks the options and swaps the submit affordance for a spinner while submitting', async () => {
    const onVote = jest.fn();
    const poll = buildPoll({ answerType: 'multiple', options: [opt('a'), opt('b')] });
    const r = await wrap(<PollBlock {...base} onVote={onVote} poll={poll} submitting />);

    expect(r.getByTestId('socialuikit-poll-spinner')).toBeTruthy();
    expect(r.queryByText('Vote')).toBeNull();
    expect(r.getByTestId('socialuikit-poll-option-a').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(r.getByTestId('socialuikit-poll-option-a'));
    expect(onVote).not.toHaveBeenCalled();


    // The single-answer shape gets the same lock and spinner
    const single = await wrap(<PollBlock {...base} onVote={onVote} poll={buildPoll()} submitting />);
    expect(single.getByTestId('socialuikit-poll-spinner')).toBeTruthy();
    await fireEvent.press(single.getByTestId('socialuikit-poll-option-a'));
    expect(onVote).not.toHaveBeenCalled();
  });


  it('renders a guest a tappable sign-in hint over read-only options', async () => {
    const onVote = jest.fn();
    const onPressSignIn = jest.fn();
    const r = await wrap(<PollBlock {...base} onVote={onVote} onPressSignIn={onPressSignIn} poll={buildPoll()} signedOut />);

    await fireEvent.press(r.getByTestId('socialuikit-poll-option-a'));
    expect(onVote).not.toHaveBeenCalled();
    expect(r.getByTestId('socialuikit-poll-option-a').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(r.getByText('Sign in to vote'));
    expect(onPressSignIn).toHaveBeenCalledTimes(1);
  });
});




describe('PollBlock results', () => {

  it('draws bars at the exact share while the label shows the rounded percent', async () => {
    const poll = buildPoll({ votedByMe: true, totalVotes: 3, options: [opt('a', 1, true), opt('b', 2), opt('c', 0)] });
    const r = await wrap(<PollBlock {...base} poll={poll} />);

    expect(String(flat(r.getByTestId('socialuikit-poll-bar-a')).width)).toMatch(/^33\.3333/);
    expect(String(flat(r.getByTestId('socialuikit-poll-bar-b')).width)).toMatch(/^66\.6666/);
    expect(flat(r.getByTestId('socialuikit-poll-bar-c')).width).toBe('0%');

    expect(within(r.getByTestId('socialuikit-poll-option-a')).getByText('33%')).toBeTruthy();
    expect(within(r.getByTestId('socialuikit-poll-option-b')).getByText('67%')).toBeTruthy();
    expect(within(r.getByTestId('socialuikit-poll-option-c')).getByText('0%')).toBeTruthy();
  });


  it('divides by voterCount when the host knows the crowd, not by totalVotes', async () => {
    const poll = buildPoll({
      answerType: 'multiple',
      votedByMe: true,
      totalVotes: 6,
      voterCount: 4,
      options: [opt('a', 2, true), opt('b', 4)],
    });
    const r = await wrap(<PollBlock {...base} poll={poll} />);

    expect(flat(r.getByTestId('socialuikit-poll-bar-a')).width).toBe('50%');
    expect(flat(r.getByTestId('socialuikit-poll-bar-b')).width).toBe('100%');
    expect(r.getByText('4 people voted')).toBeTruthy();
  });


  it('emphasizes every option sharing the top count on a tie', async () => {
    const poll = buildPoll({ closed: true, totalVotes: 7, options: [opt('a', 3), opt('b', 3), opt('c', 1)] });
    const r = await wrap(<PollBlock {...base} poll={poll} />);


    // Both leaders bold in the brand ink; the trailer stays plain
    const labelA = flat(within(r.getByTestId('socialuikit-poll-option-a')).getByText('Option A'));
    const labelB = flat(within(r.getByTestId('socialuikit-poll-option-b')).getByText('Option B'));
    const labelC = flat(within(r.getByTestId('socialuikit-poll-option-c')).getByText('Option C'));

    expect(labelA.fontWeight).toBe('700');
    expect(labelA.color).toBe('#7B003F');
    expect(labelB.fontWeight).toBe('700');
    expect(labelB.color).toBe('#7B003F');
    expect(labelC.fontWeight).toBe('400');
    expect(labelC.color).not.toBe('#7B003F');
  });


  it("marks the viewer's own pick with the labelled check glyph", async () => {
    const poll = buildPoll({ votedByMe: true, totalVotes: 2, options: [opt('a', 1), opt('b', 1, true)] });
    const r = await wrap(<PollBlock {...base} poll={poll} />);

    expect(within(r.getByTestId('socialuikit-poll-option-b')).getByLabelText('Your vote')).toBeTruthy();
    expect(within(r.getByTestId('socialuikit-poll-option-a')).queryByLabelText('Your vote')).toBeNull();
  });


  it('offers the refresh link only when the host wires onRefreshResults', async () => {
    const onRefreshResults = jest.fn();
    const poll = buildPoll({ closed: true, totalVotes: 1, options: [opt('a', 1), opt('b')] });

    const with_ = await wrap(<PollBlock {...base} poll={poll} onRefreshResults={onRefreshResults} />);
    await fireEvent.press(with_.getByText('Refresh results'));
    expect(onRefreshResults).toHaveBeenCalledTimes(1);

    const without = await wrap(<PollBlock {...base} poll={poll} />);
    expect(without.queryByText('Refresh results')).toBeNull();
  });
});




describe('PollBlock collapse', () => {

  it('folds a five-option ballot to four and expands one-way', async () => {
    const poll = buildPoll({ options: [opt('a'), opt('b'), opt('c'), opt('d'), opt('e')] });
    const r = await wrap(<PollBlock {...base} poll={poll} />);

    expect(r.queryByTestId('socialuikit-poll-option-e')).toBeNull();
    const more = r.getByTestId('socialuikit-poll-more');
    expect(within(more).getByText('Show 1 more option')).toBeTruthy();

    await fireEvent.press(more);

    expect(r.getByTestId('socialuikit-poll-option-e')).toBeTruthy();
    expect(r.queryByTestId('socialuikit-poll-more')).toBeNull();
  });


  it('folds the results face too, counting all hidden options', async () => {
    const poll = buildPoll({
      closed: true,
      totalVotes: 6,
      options: [opt('a', 1), opt('b', 1), opt('c', 1), opt('d', 1), opt('e', 1), opt('f', 1)],
    });
    const r = await wrap(<PollBlock {...base} poll={poll} />);

    expect(r.getByTestId('socialuikit-poll-bar-a')).toBeTruthy();
    expect(r.queryByTestId('socialuikit-poll-option-f')).toBeNull();
    expect(within(r.getByTestId('socialuikit-poll-more')).getByText('Show 2 more options')).toBeTruthy();

    await fireEvent.press(r.getByTestId('socialuikit-poll-more'));
    expect(r.getByTestId('socialuikit-poll-bar-f')).toBeTruthy();
  });
});




describe('PollBlock footer', () => {

  it('prefers the people tally over the vote tally, and vice versa without voterCount', async () => {
    const people = await wrap(<PollBlock {...base} poll={buildPoll({ voterCount: 5, totalVotes: 8 })} />);
    expect(people.getByText('5 people voted')).toBeTruthy();
    expect(people.queryByText('8 votes')).toBeNull();

    const votes = await wrap(<PollBlock {...base} poll={buildPoll({ totalVotes: 8 })} />);
    expect(votes.getByText('8 votes')).toBeTruthy();
  });


  it('counts down in floored whole units off the frozen clock', async () => {
    const hours = await wrap(<PollBlock {...base} poll={buildPoll({ expiresAt: at(3.5) })} />);
    expect(hours.getByText('3 hours left')).toBeTruthy();

    const days = await wrap(<PollBlock {...base} poll={buildPoll({ expiresAt: at(49) })} />);
    expect(days.getByText('2 days left')).toBeTruthy();

    const minutes = await wrap(<PollBlock {...base} poll={buildPoll({ expiresAt: at(0.5) })} />);
    expect(minutes.getByText('30 minutes left')).toBeTruthy();

    const soon = await wrap(<PollBlock {...base} poll={buildPoll({ expiresAt: at(0.005) })} />);
    expect(soon.getByText('Ending soon')).toBeTruthy();


    // No deadline on an open poll: the tally stands alone
    const bare = await wrap(<PollBlock {...base} poll={buildPoll({ totalVotes: 2 })} />);
    expect(bare.queryByText('Poll closed')).toBeNull();
    expect(bare.getByText('2 votes')).toBeTruthy();
  });
});
