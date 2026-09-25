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
//  Also the shape of the provider's poll store (PollEntry)
//  and the two keys its seed rule compares.
//
//  Used by:
//    - hooks/usePoll.ts — canVote gating, the store entries
//    - provider/index.tsx — the env's `polls` store
//    - @knf/socialuikit — option bars, leader bolding, the
//      results-vs-choices switch
// -----------------------------------------------------------

import type { Poll, PollOption } from './types';







// -----------------------------------------------------------
// PollEntry
// -----------------------------------------------------------
//
// One poll in the provider's store — the newest known state
// every usePoll on that id renders, so a card that remounts
// (list windowing) or a second surface (the article screen
// over the feed) shows the viewer's vote at once instead of
// re-fetching or losing it. Per-field roles are inline; the
// seed rule itself lives in hooks/usePoll.ts.
//
// Used by:
//   - provider/index.tsx — the env's `polls` ShadowStore
//   - hooks/usePoll.ts — every read and write
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface PollEntry {
  // The newest known state; absent while `gone`
  poll?: Poll;
  // The server answered "no poll here" (fetchPoll → null)
  gone?: boolean;
  // Written by the viewer's own vote — a host seed that
  // disagrees with that choice predates the vote and is skipped
  fromVote?: boolean;
  // The last host seed weighed, by CONTENT (pollSeedKey) — the
  // same answer is never adopted twice: a remounted card
  // re-offers its old feed row, and a host mapping its row
  // inline hands an equal object every render; only a row with
  // different content is a new server answer
  seedKey?: string;
  // Write counter — a fetch that finds it moved on landing
  // lost the race to something newer (a vote, a seed)
  rev: number;
}







// -----------------------------------------------------------
// pollChoiceKey
// -----------------------------------------------------------
//
// The viewer's choice on a poll as one comparable string:
// the voted option ids, sorted and joined ('' = no vote).
// Two answers with different keys disagree about what the
// viewer picked — the older one predates a vote.
//
// Used by:
//   - hooks/usePoll.ts — the seed rule
// -----------------------------------------------------------

export function pollChoiceKey(poll: Poll): string {
  return poll.options.filter((option) => option.votedByMe).map((option) => option.id).sort().join(',');
}







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
  // Clamped to the promised 0..100 — inconsistent host data (a
  // voterCount lagging the option sums, a negative count) must
  // not hand a bar renderer an overflowing width
  return Math.min(100, Math.max(0, (option.voteCount / denominator) * 100));
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







// -----------------------------------------------------------
// pollSeedKey
// -----------------------------------------------------------
//
// A host seed's whole content as one comparable string — a
// poll is a handful of short options, so the plain JSON form
// is cheap and exact. Equal content means the same server
// answer, whatever the object identity.
//
// Used by:
//   - hooks/usePoll.ts — the seed rule
// -----------------------------------------------------------

export function pollSeedKey(poll: Poll): string {
  return JSON.stringify(poll);
}
