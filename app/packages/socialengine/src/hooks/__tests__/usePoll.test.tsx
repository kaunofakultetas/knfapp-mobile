// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine usePoll
//
//  Fetch on mount + refresh, the null answer (missing, not
//  error), error + retry, out-of-order responses dropped, the
//  pessimistic vote (success replaces wholesale, failure keeps
//  the old poll and notifies), the guest path, and expiry
//  gating canVote against the provider's frozen clock.
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { SocialNotice, SocialTransport } from '../../core/transport';
import type { Poll, SocialUser } from '../../core/types';
import { SocialEngineProvider } from '../../provider';
import { usePoll } from '../usePoll';


const VIEWER: SocialUser = { id: 'u1', displayName: 'Me' };

const makePoll = (over: Partial<Poll> = {}): Poll => ({
  id: 'p1',
  question: 'Kava ar arbata?',
  options: [
    { id: 'o1', text: 'Kava', voteCount: 2, votedByMe: false },
    { id: 'o2', text: 'Arbata', voteCount: 1, votedByMe: false },
  ],
  answerType: 'single',
  totalVotes: 3,
  voterCount: 3,
  expiresAt: null,
  closed: false,
  votedByMe: false,
  ...over,
});

// A full transport with inert defaults — each test overrides
// only the calls it exercises
const stubTransport = (over: Partial<SocialTransport> = {}): SocialTransport => ({
  setLiked: jest.fn(async () => ({ liked: false, likeCount: 0 })),
  fetchPoll: jest.fn(async () => makePoll()),
  vote: jest.fn(async () => makePoll()),
  ...over,
});

// A promise settled by hand, for holding a response in flight
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

const wrapperFor = (
  transport: SocialTransport,
  opts: { currentUser?: SocialUser | null; notify?: (notice: SocialNotice) => void; onRequireAuth?: () => void; now?: () => Date } = {},
) => {
  // Distinguish "not given" (signed-in viewer) from an explicit
  // null (guest)
  const currentUser = 'currentUser' in opts ? opts.currentUser : VIEWER;
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SocialEngineProvider transport={transport} currentUser={currentUser} notify={opts.notify} onRequireAuth={opts.onRequireAuth} now={opts.now}>
      {children}
    </SocialEngineProvider>
  );
  return Wrapper;
};


describe('usePoll', () => {
  it('fetches on mount and refresh re-reads the transport', async () => {
    let served = makePoll();
    const fetchPoll = jest.fn(async () => served);
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ fetchPoll })) });
    await flush();

    expect(fetchPoll).toHaveBeenCalledWith('p1');
    expect(h.result.current.poll?.totalVotes).toBe(3);
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.error).toBe(false);
    expect(h.result.current.missing).toBe(false);
    expect(h.result.current.canVote).toBe(true);

    served = makePoll({ totalVotes: 9, voterCount: 9 });
    await act(async () => h.result.current.refresh());
    await flush();
    expect(h.result.current.poll?.totalVotes).toBe(9);
    await h.unmount();
  });

  it('a nullish id is idle — nothing fetched, nothing missing', async () => {
    const fetchPoll = jest.fn(async () => makePoll());
    const h = await renderHook(() => usePoll(null), { wrapper: wrapperFor(stubTransport({ fetchPoll })) });
    await flush();

    expect(fetchPoll).not.toHaveBeenCalled();
    expect(h.result.current.poll).toBeNull();
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.missing).toBe(false);
    expect(h.result.current.error).toBe(false);
    await h.unmount();
  });

  it('a null answer means the post has no poll — missing, not error', async () => {
    const fetchPoll = jest.fn(async () => null);
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ fetchPoll })) });
    await flush();

    expect(h.result.current.missing).toBe(true);
    expect(h.result.current.error).toBe(false);
    expect(h.result.current.poll).toBeNull();
    expect(h.result.current.canVote).toBe(false);
    await h.unmount();
  });

  it('a rejection sets error, and refresh retries', async () => {
    let fail = true;
    const fetchPoll = jest.fn(async () => {
      if (fail) throw new Error('boom');
      return makePoll();
    });
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ fetchPoll })) });
    await flush();

    expect(h.result.current.error).toBe(true);
    expect(h.result.current.poll).toBeNull();
    expect(h.result.current.missing).toBe(false);

    fail = false;
    await act(async () => h.result.current.refresh());
    await flush();
    expect(h.result.current.error).toBe(false);
    expect(h.result.current.poll?.totalVotes).toBe(3);
    expect(fetchPoll).toHaveBeenCalledTimes(2);
    await h.unmount();
  });

  it('drops an out-of-order response — the newest request wins', async () => {
    const first = deferred<Poll | null>();
    const second = deferred<Poll | null>();
    const answers = [first, second];
    const fetchPoll = jest.fn(() => answers.shift()!.promise);
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ fetchPoll })) });

    await act(async () => h.result.current.refresh());
    second.resolve(makePoll({ totalVotes: 9, voterCount: 9 }));
    await flush();
    expect(h.result.current.poll?.totalVotes).toBe(9);
    expect(h.result.current.loading).toBe(false);

    // The slow original settles LAST — its stale answer must not land
    first.resolve(makePoll({ totalVotes: 1, voterCount: 1 }));
    await flush();
    expect(h.result.current.poll?.totalVotes).toBe(9);
    await h.unmount();
  });

  it('vote is pessimistic — nothing moves in flight, then the answer replaces wholesale', async () => {
    const voted = makePoll({
      options: [
        { id: 'o1', text: 'Kava', voteCount: 3, votedByMe: true },
        { id: 'o2', text: 'Arbata', voteCount: 1, votedByMe: false },
      ],
      totalVotes: 4,
      voterCount: 4,
      votedByMe: true,
    });
    const pending = deferred<Poll>();
    const vote = jest.fn(() => pending.promise);
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ vote })) });
    await flush();

    let votePromise: Promise<void> = Promise.resolve();
    await act(async () => {
      votePromise = h.result.current.vote(['o1']);
    });
    expect(h.result.current.submitting).toBe(true);
    // Still the server's old truth — no optimistic bump
    expect(h.result.current.poll?.options[0].voteCount).toBe(2);
    expect(h.result.current.poll?.votedByMe).toBe(false);

    pending.resolve(voted);
    await act(async () => votePromise);
    await flush();
    expect(vote).toHaveBeenCalledWith('p1', ['o1']);
    expect(h.result.current.submitting).toBe(false);
    expect(h.result.current.poll).toEqual(voted);
    await h.unmount();
  });

  it('a failed vote keeps the old poll untouched and notifies vote_failed', async () => {
    const notify = jest.fn();
    const vote = jest.fn(async () => {
      throw Object.assign(new Error('refused'), { httpStatus: 409 });
    });
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ vote }), { notify }) });
    await flush();
    const before = h.result.current.poll;

    await act(async () => h.result.current.vote(['o1']));
    await flush();
    expect(h.result.current.poll).toBe(before);
    expect(h.result.current.submitting).toBe(false);
    expect(notify).toHaveBeenCalledWith({ level: 'error', code: 'vote_failed' });
    await h.unmount();
  });

  it('a guest tap routes to requireAuth and never touches the transport', async () => {
    const onRequireAuth = jest.fn();
    const vote = jest.fn(async () => makePoll());
    const h = await renderHook(() => usePoll('p1'), {
      wrapper: wrapperFor(stubTransport({ vote }), { currentUser: null, onRequireAuth }),
    });
    await flush();

    expect(h.result.current.canVote).toBe(false);
    await act(async () => h.result.current.vote(['o1']));
    expect(onRequireAuth).toHaveBeenCalledTimes(1);
    expect(vote).not.toHaveBeenCalled();
    expect(h.result.current.submitting).toBe(false);
    await h.unmount();
  });

  it('canVote turns false once the provider clock passes expiresAt', async () => {
    const fetchPoll = jest.fn(async () => makePoll({ expiresAt: '2026-03-01T10:00:00.000Z' }));
    const now = () => new Date('2026-03-01T12:00:00.000Z');
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ fetchPoll }), { now }) });
    await flush();

    expect(h.result.current.poll).not.toBeNull();
    expect(h.result.current.canVote).toBe(false);
    await h.unmount();
  });

  it('canVote is false on a server-closed poll even before expiresAt', async () => {
    const fetchPoll = jest.fn(async () => makePoll({ closed: true, expiresAt: '2026-03-01T14:00:00.000Z' }));
    const now = () => new Date('2026-03-01T12:00:00.000Z');
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ fetchPoll }), { now }) });
    await flush();

    expect(h.result.current.canVote).toBe(false);
    await h.unmount();
  });
});
