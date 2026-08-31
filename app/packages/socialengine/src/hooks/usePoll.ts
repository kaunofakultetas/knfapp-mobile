// -----------------------------------------------------------
//  [*] socialengine — usePoll
//
//  One poll's live state, fetched by id (posts carry pollId,
//  never the poll itself). Voting is PESSIMISTIC — the one
//  interaction in this package that is: percentages shown on
//  tap must be the server's truth, so nothing moves until
//  transport.vote answers, and its resolved poll replaces
//  local state wholesale. A rejection changes nothing visible
//  and surfaces as a 'vote_failed' notice.
//
//  A null fetchPoll answer is NOT an error — the post simply
//  has no poll (`missing`); the host renders nothing. A
//  rejection is (`error`), and refresh() retries. Responses
//  race-proof themselves with a sequence ticket: only the
//  newest request may land, so a slow old fetch can never
//  overwrite a fresher refresh or a vote result.
//
//  Guests read everything; a guest tap on vote() routes to
//  env.requireAuth() and never touches the transport.
//
//  Used by:
//    - @knf/socialuikit — the poll block inside a post card
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';

import { isPollExpired } from '../core/poll';
import type { Poll } from '../core/types';
import { useSocialEngine } from '../provider';


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


// The four fetch facets travel as one object so a settling
// response cannot tear (loading false beside a stale error)
interface PollFetchState {
  poll: Poll | null;
  loading: boolean;
  error: boolean;
  missing: boolean;
}

const IDLE: PollFetchState = { poll: null, loading: false, error: false, missing: false };







// -----------------------------------------------------------
// usePoll
// -----------------------------------------------------------
//
//   const p = usePoll(post.pollId)      — nullish id = idle
//   p.poll / p.loading / p.missing / p.error — render states
//   p.vote(['o1'])                      — pessimistic;
//                                         p.submitting in flight
//   p.revealResults()                   — local one-way peek
//   p.canVote                           — signed in + not over
//
// Used by:
//   - @knf/socialuikit — the poll block inside a post card
// -----------------------------------------------------------

export function usePoll(pollId: string | null | undefined): UsePollResult {

  const env = useSocialEngine();
  const [state, setState] = useState<PollFetchState>(IDLE);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState(false);


  // Monotonic fetch ticket: a response lands only while its
  // ticket is still the newest
  const seqRef = useRef(0);

  // The poll the hook is on RIGHT NOW — a vote result that
  // resolves after the hook moved to another poll is dropped,
  // never written over the new poll's state
  const pollIdRef = useRef(pollId);
  pollIdRef.current = pollId;

  // vote()'s re-entrancy latch (state alone lags a render)
  const submittingRef = useRef(false);


  const load = useCallback(
    (id: string) => {
      const seq = ++seqRef.current;
      setState((prev) => ({ ...prev, loading: true, error: false }));
      env.transport.fetchPoll(id).then(
        (poll) => {
          if (seq !== seqRef.current) return;
          setState({ poll, loading: false, error: false, missing: poll === null });
        },
        () => {
          if (seq !== seqRef.current) return;
          // The flag renders inline (a retry row) — no notice;
          // notices are for failures with no surface of their own
          setState((prev) => ({ ...prev, loading: false, error: true }));
        },
      );
    },
    [env],
  );


  // Fetch on mount and on every id change; a nullish id is idle
  // (the post has no poll to begin with). The cleanup bump
  // orphans any in-flight response for the departing id, which
  // also makes late responses after unmount inert
  useEffect(() => {
    setRevealed(false);
    if (pollId == null) {
      seqRef.current += 1;
      setState(IDLE);
      return;
    }
    load(pollId);
    return () => {
      seqRef.current += 1;
    };
  }, [pollId, load]);


  const refresh = useCallback(() => {
    if (pollId != null) load(pollId);
  }, [pollId, load]);


  // PESSIMISTIC: nothing moves until the server answers, then
  // the resolved poll replaces state wholesale — counts,
  // votedByMe, closed, everything
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


      setSubmitting(true);
      try {
        const updated = await env.transport.vote(pollId, optionIds);
        // The hook moved to another poll while the vote was on
        // the wire — this result belongs to the old poll and is
        // dropped whole (the new poll's own fetch owns the state)
        if (pollIdRef.current !== pollId) return;
        // Claim the ticket — an older fetch still in flight must
        // not overwrite the fresher vote result
        seqRef.current += 1;
        setState({ poll: updated, loading: false, error: false, missing: false });
      } catch {
        // The old poll stays exactly as it was; a failure for a
        // poll the hook has left is stale context, not news
        if (pollIdRef.current === pollId) env.notify({ level: 'error', code: 'vote_failed' });
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [env, pollId],
  );


  const revealResults = useCallback(() => setRevealed(true), []);


  // isPollExpired already folds in the server's closed flag, so
  // one check covers both gates
  const canVote = env.currentUser !== null && state.poll !== null && !isPollExpired(state.poll, env.now());


  return {
    poll: state.poll,
    loading: state.loading,
    error: state.error,
    missing: state.missing,
    refresh,
    vote,
    submitting,
    revealed,
    revealResults,
    canVote,
  };
}
