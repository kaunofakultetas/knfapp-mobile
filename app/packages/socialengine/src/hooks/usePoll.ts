// -----------------------------------------------------------
//  [*] socialengine — usePoll
//
//  One poll's live state, read from the provider's poll store
//  (env.polls) — every usePoll on the same id renders the
//  same newest state, so a feed card that remounts under list
//  windowing, or the feed card still mounted under the
//  article screen, shows the viewer's vote at once instead of
//  re-fetching it or losing it. Voting is PESSIMISTIC — the
//  one interaction in this package that is: percentages shown
//  on tap must be the server's truth, so nothing moves until
//  transport.vote answers, and its resolved poll replaces the
//  stored state wholesale. A rejection changes nothing
//  visible and surfaces as a 'vote_failed' notice.
//
//  A host that already HOLDS the poll (a feed page ships it
//  inline) passes it as `initial`: it renders on the first
//  frame and nothing is fetched — the wire is asked only when
//  neither the store nor the host has the poll, on refresh(),
//  and by a vote (KNF-172). The seed rule: a seed is weighed
//  once per CONTENT (a remounted card re-offers its old row,
//  a host mapping inline hands an equal object every render —
//  only a row with different content is a new server answer),
//  and a seed that disagrees with the viewer's own vote in
//  the store predates that vote and is skipped. A fetch that finds the store
//  moved on while it was on the wire (a vote, a seed) lost
//  the race and is dropped; within one hook a sequence
//  ticket keeps only the newest request's flags.
//
//  A null fetchPoll answer is NOT an error — the post simply
//  has no poll (`missing`); the host renders nothing. A
//  rejection is (`error`), and refresh() retries.
//
//  Guests read everything; a guest tap on vote() routes to
//  env.requireAuth() and never touches the transport.
//
//  Used by:
//    - components/news/PollWidget.tsx — the poll block in a
//      feed card and on the article screen
//    - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { isPollExpired, pollChoiceKey, pollSeedKey } from '../core/poll';
import type { Poll } from '../core/types';
import { useSocialEngine } from '../provider';







// -----------------------------------------------------------
// UsePollResult
// -----------------------------------------------------------
//
// What the hook hands the poll block — the fetch facets, the
// pessimistic vote and the local one-way reveal.
//
// Used by:
//   - usePoll (below) — the return shape
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface UsePollResult {
  poll: Poll | null;
  loading: boolean;
  error: boolean;
  missing: boolean;
  refresh: () => void;
  vote: (optionIds: string[]) => Promise<void>;
  submitting: boolean;
  // One-way local "peek at results" — see core/poll.ts
  revealed: boolean;
  revealResults: () => void;
  canVote: boolean;
}







// -----------------------------------------------------------
// UsePollOptions
// -----------------------------------------------------------
//
// The host's optional seed — a poll it already holds, in the
// engine's shape (the KNF adapter's knfToPoll maps the wire).
// Counts only when its id is the hook's poll id.
//
// Used by:
//   - usePoll (below)
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface UsePollOptions {
  initial?: Poll | null;
}


// The per-hook request facets; the poll itself lives in the
// provider's store
interface PollFlags {
  loading: boolean;
  error: boolean;
  missing: boolean;
}

// The flags a nullish id (or a held poll) renders with — one
// frozen shape so idle renders never churn identity
const IDLE: PollFlags = { loading: false, error: false, missing: false };







// -----------------------------------------------------------
// noSubscription
// -----------------------------------------------------------
//
// The store subscription for a nullish poll id: nothing to
// listen to, so the unsubscribe it answers is a no-op.
//
// Used by:
//   - usePoll (below) — its useSyncExternalStore subscribe
// -----------------------------------------------------------

const noSubscription = (): (() => void) => () => {};







// -----------------------------------------------------------
// usePoll
// -----------------------------------------------------------
//
//   const p = usePoll(post.pollId)      — nullish id = idle
//   usePoll(id, { initial: seed })      — a held poll renders
//                                         at once, no fetch
//   p.poll / p.loading / p.missing / p.error — render states
//   p.vote(['o1'])                      — pessimistic;
//                                         p.submitting in flight
//   p.revealResults()                   — local one-way peek
//   p.canVote                           — signed in + not over
//
// Used by:
//   - components/news/PollWidget.tsx
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export function usePoll(pollId: string | null | undefined, options: UsePollOptions = {}): UsePollResult {

  const env = useSocialEngine();
  const store = env.polls;
  // The store is wiped on an account switch (a held poll carries
  // the viewer's own vote) — the wipe bumps its epoch and pings
  // this id's listener, and the seed and fetch effects re-run on
  // the new epoch, so a mounted widget re-reads as the new
  // viewer (keying on the viewer id instead would re-run them
  // BEFORE the provider's wipe — child effects run first)
  const storeEpoch = store.epoch();
  const [flags, setFlags] = useState<PollFlags>(IDLE);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState(false);


  // The host's seed counts only for THIS poll
  const seed = options.initial != null && pollId != null && options.initial.id === pollId ? options.initial : null;
  // Read by the mount effect without re-running it per seed
  const seedRef = useRef(seed);
  seedRef.current = seed;


  // The store entry for this id — a stable snapshot until the
  // next write replaces it wholesale
  const subscribe = useCallback(
    (onChange: () => void) => (pollId == null ? noSubscription() : store.subscribe(pollId, onChange)),
    [store, pollId],
  );
  const entry = useSyncExternalStore(subscribe, () => (pollId == null ? undefined : store.get(pollId)));


  // Monotonic fetch ticket: a response's FLAGS land only while
  // its ticket is still the newest
  const seqRef = useRef(0);

  // The poll the hook is on RIGHT NOW — a vote that resolves
  // after the hook moved on still reaches the store (under its
  // own id), but not this hook's flags or notices
  const pollIdRef = useRef(pollId);
  pollIdRef.current = pollId;

  // vote()'s re-entrancy latch (state alone lags a render)
  const submittingRef = useRef(false);


  const load = useCallback(
    (id: string) => {
      const seq = ++seqRef.current;
      const rev = store.get(id)?.rev ?? 0;
      setFlags((prev) => ({ ...prev, loading: true, error: false }));
      env.transport.fetchPoll(id).then(
        (poll) => {
          if (seq !== seqRef.current) return;
          // Something newer landed while this was on the wire —
          // the fetch lost the race and writes nothing
          const current = store.get(id);
          if ((current?.rev ?? 0) === rev) {
            store.patch(id, poll ? { poll, gone: undefined, fromVote: undefined, rev: rev + 1 } : { poll: undefined, gone: true, fromVote: undefined, rev: rev + 1 });
          }
          setFlags({ loading: false, error: false, missing: poll === null });
        },
        () => {
          if (seq !== seqRef.current) return;
          // The flag renders inline (a retry row) — no notice;
          // notices are for failures with no surface of their own
          setFlags((prev) => ({ ...prev, loading: false, error: true }));
        },
      );
    },
    [env, store],
  );


  // The seed rule (file banner): a seed with NEW content is
  // adopted, unless it disagrees with the viewer's own vote in
  // the store — then it predates the vote, and is only
  // remembered as weighed. Declared before the mount effect: a
  // seed in the store means there is nothing to fetch
  useEffect(() => {
    if (pollId == null || seed == null) return;
    const current = store.get(pollId);
    const seedKey = pollSeedKey(seed);
    if (current?.seedKey === seedKey) return;
    if (current?.fromVote && current.poll && pollChoiceKey(current.poll) !== pollChoiceKey(seed)) {
      store.patch(pollId, { seedKey });
      return;
    }
    store.patch(pollId, { poll: seed, seedKey, gone: undefined, fromVote: undefined, rev: (current?.rev ?? 0) + 1 });
  }, [store, pollId, seed, storeEpoch]);


  // A new id starts clean; the wire is asked only when neither
  // the store nor the host holds the poll. The cleanup bump
  // orphans any in-flight response's flags for the departing
  // id, which also makes late responses after unmount inert
  useEffect(() => {
    setRevealed(false);
    setFlags(IDLE);
    if (pollId == null) {
      seqRef.current += 1;
      return;
    }
    if (!store.get(pollId) && seedRef.current == null) load(pollId);
    return () => {
      seqRef.current += 1;
    };
  }, [pollId, load, store, storeEpoch]);


  const refresh = useCallback(() => {
    if (pollId != null) load(pollId);
  }, [pollId, load]);


  // PESSIMISTIC: nothing moves until the server answers, then
  // the resolved poll replaces the stored state wholesale —
  // counts, votedByMe, closed, everything — for every surface
  // showing this poll
  const vote = useCallback(
    async (optionIds: string[]) => {
      if (env.currentUser === null) {
        env.requireAuth();
        return;
      }
      if (pollId == null) return;
      // Single-flight: the hook is the package contract, not the
      // UI — a host without a disabled state must still never
      // double-vote (a multiple-answer backend may count both)
      if (submittingRef.current) return;
      submittingRef.current = true;


      const epoch = store.epoch();
      setSubmitting(true);
      try {
        const updated = await env.transport.vote(pollId, optionIds);
        // The viewer's vote is newest truth for this poll — unless
        // the account changed meanwhile (the store was wiped)
        if (store.epoch() === epoch) {
          const rev = store.get(pollId)?.rev ?? 0;
          store.patch(pollId, { poll: updated, gone: undefined, fromVote: true, rev: rev + 1 });
        }
        if (pollIdRef.current === pollId) {
          // Claim the ticket — an older fetch still in flight must
          // not flip the flags back
          seqRef.current += 1;
          setFlags(IDLE);
        }
      } catch {
        // The old poll stays exactly as it was; a failure for a
        // poll the hook has left is stale context, not news
        if (pollIdRef.current === pollId) env.notify({ level: 'error', code: 'vote_failed' });
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [env, store, pollId],
  );


  const revealResults = useCallback(() => setRevealed(true), []);


  // The store's word first; a seed not yet written stands in on
  // the very first frame; the server's "no poll" beats both
  const poll = entry ? (entry.gone ? null : (entry.poll ?? null)) : seed;


  // isPollExpired already folds in the server's closed flag, so
  // one check covers both gates
  const canVote = env.currentUser !== null && poll !== null && !isPollExpired(poll, env.now());


  return {
    poll,
    loading: flags.loading,
    error: flags.error,
    missing: poll === null && flags.missing,
    refresh,
    vote,
    submitting,
    revealed,
    revealResults,
    canVote,
  };
}
