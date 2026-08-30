// -----------------------------------------------------------
//  [*] socialengine — poll arithmetic
//
//  Pure derivations over the Poll shape — no react, no
//  transport — so hooks and any UI share one set of answers.
//  Percentages are EXACT, never rounded here: labels round for
//  display, but bar widths must not, or a three-way split
//  renders 33% + 33% + 33% and leaves a visible gap. The
//  percent denominator prefers voterCount (distinct people)
//  over totalVotes (sum of option counts), because on a
//  multiple-answer poll the sum exceeds the people and every
//  bar would read too short.
//
//  Expiry is judged twice on purpose: the server's closed flag
//  AND the client clock against expiresAt — whichever says
//  "over" first wins, so a poll ending between refetches locks
//  its UI without waiting for the server to notice.
//
//  Used by:
//    - hooks/usePoll.ts — canVote gating
//    - @knf/socialuikit — option bars, leader bolding, the
//      results-vs-choices switch
// -----------------------------------------------------------

import type { Poll, PollOption } from './types';








// -----------------------------------------------------------
// pollPercent
// -----------------------------------------------------------
//
// One option's share of the vote, as an EXACT percent in
// 0..100. Callers round the label; the bar takes the raw value.
//
// Used by:
//   - @knf/socialuikit — option rows (fill width + label)
// -----------------------------------------------------------

export function pollPercent(option: PollOption, poll: Poll): number {

  // ?? and not ||: a backend reporting voterCount 0 means "no
  // voters yet", not "count unknown — fall back to totalVotes"
  const denominator = poll.voterCount ?? poll.totalVotes;


  if (denominator <= 0) return 0;
  return (option.voteCount / denominator) * 100;
}








// -----------------------------------------------------------
// pollLeaders
// -----------------------------------------------------------
//
// The ids of every option sharing the highest voteCount — a
// tie makes them all leaders. An untouched poll (max 0) has
// none: bolding every row of an all-zero poll would read as a
// tie that never happened.
//
// Used by:
//   - @knf/socialuikit — highlighting the winning option(s)
//     once results show
// -----------------------------------------------------------

export function pollLeaders(poll: Poll): string[] {

  const max = poll.options.reduce((best, option) => Math.max(best, option.voteCount), 0);


  if (max <= 0) return [];
  return poll.options.filter((option) => option.voteCount === max).map((option) => option.id);
}








// -----------------------------------------------------------
// isPollExpired
// -----------------------------------------------------------
//
// Server flag OR client clock, whichever says so first. `now`
// is a parameter (never `new Date()` inline) so the provider's
// frozen clock governs tests.
//
// Used by:
//   - hooks/usePoll.ts — canVote
//   - showPollResults (below)
//   - @knf/socialuikit — the "ended" footer line
// -----------------------------------------------------------

export function isPollExpired(poll: Poll, now: Date): boolean {

  if (poll.closed) return true;
  if (poll.expiresAt == null) return false;


  // An unparseable stamp yields NaN and NaN compares false on
  // every side — a garbled expiresAt leaves the poll open
  // rather than killing it
  return new Date(poll.expiresAt).getTime() < now.getTime();
}








// -----------------------------------------------------------
// showPollResults
// -----------------------------------------------------------
//
// Whether option rows render counts and bars instead of plain
// choices: the viewer voted, the poll is over, or the viewer
// chose to peek. `revealed` is the caller's LOCAL, one-way
// choice (usePoll holds it) — it never travels to the server
// and never flips back.
//
// Used by:
//   - @knf/socialuikit — the results-vs-choices switch per row
// -----------------------------------------------------------

export function showPollResults(poll: Poll, revealed: boolean, now: Date): boolean {
  return poll.votedByMe || isPollExpired(poll, now) || revealed;
}
