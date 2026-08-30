// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine poll arithmetic
//
//  The percent table (voterCount preferred, exact values,
//  0-safe), leader ties, expiry via both the server flag and
//  the frozen client clock, and the showPollResults gating
//  truth table.
// -----------------------------------------------------------

import { isPollExpired, pollLeaders, pollPercent, showPollResults } from '../poll';
import type { Poll, PollOption } from '../types';


const option = (id: string, voteCount: number): PollOption => ({ id, text: id, voteCount, votedByMe: false });

const makePoll = (over: Partial<Poll> = {}): Poll => ({
  id: 'p1',
  question: 'Kava ar arbata?',
  options: [option('o1', 2), option('o2', 1)],
  answerType: 'single',
  totalVotes: 3,
  closed: false,
  votedByMe: false,
  ...over,
});

// Frozen clock for every expiry assertion (TZ is pinned to UTC
// by the package globalSetup)
const NOW = new Date('2026-03-01T12:00:00.000Z');
const PAST = '2026-03-01T10:00:00.000Z';
const FUTURE = '2026-03-01T14:00:00.000Z';


describe('pollPercent', () => {
  it('prefers voterCount over totalVotes as the denominator', () => {
    const poll = makePoll({ voterCount: 4, totalVotes: 10 });
    expect(pollPercent(option('o1', 3), poll)).toBe(75);
  });

  it('falls back to totalVotes when voterCount is null or absent', () => {
    expect(pollPercent(option('o1', 2), makePoll({ voterCount: null, totalVotes: 8 }))).toBe(25);
    expect(pollPercent(option('o1', 2), makePoll({ totalVotes: 8 }))).toBe(25);
  });

  it('returns the EXACT percent — rounding is the label\'s job, never the bar\'s', () => {
    const poll = makePoll({ voterCount: 3 });
    expect(pollPercent(option('o1', 1), poll)).toBe((1 / 3) * 100);
    expect(pollPercent(option('o1', 2), poll)).toBe((2 / 3) * 100);
  });

  it('is 0-safe, and a voterCount of 0 means zero — not "fall back to totalVotes"', () => {
    expect(pollPercent(option('o1', 0), makePoll({ totalVotes: 0 }))).toBe(0);
    expect(pollPercent(option('o1', 2), makePoll({ voterCount: 0, totalVotes: 5 }))).toBe(0);
  });
});


describe('pollLeaders', () => {
  it('names the single highest option', () => {
    const poll = makePoll({ options: [option('o1', 5), option('o2', 3), option('o3', 1)] });
    expect(pollLeaders(poll)).toEqual(['o1']);
  });

  it('a tie makes every sharer a leader, in option order', () => {
    const poll = makePoll({ options: [option('o1', 4), option('o2', 1), option('o3', 4)] });
    expect(pollLeaders(poll)).toEqual(['o1', 'o3']);
  });

  it('an untouched poll has no leaders', () => {
    const poll = makePoll({ options: [option('o1', 0), option('o2', 0)], totalVotes: 0 });
    expect(pollLeaders(poll)).toEqual([]);
  });
});


describe('isPollExpired', () => {
  it('the server closed flag alone ends the poll, even with a future expiresAt', () => {
    expect(isPollExpired(makePoll({ closed: true }), NOW)).toBe(true);
    expect(isPollExpired(makePoll({ closed: true, expiresAt: FUTURE }), NOW)).toBe(true);
  });

  it('the client clock alone ends the poll once expiresAt is behind now', () => {
    expect(isPollExpired(makePoll({ expiresAt: PAST }), NOW)).toBe(true);
    expect(isPollExpired(makePoll({ expiresAt: FUTURE }), NOW)).toBe(false);
  });

  it('the comparison is strict — expiring exactly now is not yet expired', () => {
    expect(isPollExpired(makePoll({ expiresAt: NOW.toISOString() }), NOW)).toBe(false);
  });

  it('no expiresAt means never expires', () => {
    expect(isPollExpired(makePoll({ expiresAt: null }), NOW)).toBe(false);
    expect(isPollExpired(makePoll(), NOW)).toBe(false);
  });
});


describe('showPollResults', () => {
  it('a fresh poll shows plain choices', () => {
    expect(showPollResults(makePoll(), false, NOW)).toBe(false);
  });

  it('any single gate opens results: voted, expired (either way), or revealed', () => {
    expect(showPollResults(makePoll({ votedByMe: true }), false, NOW)).toBe(true);
    expect(showPollResults(makePoll({ closed: true }), false, NOW)).toBe(true);
    expect(showPollResults(makePoll({ expiresAt: PAST }), false, NOW)).toBe(true);
    expect(showPollResults(makePoll(), true, NOW)).toBe(true);
  });
});
