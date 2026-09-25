// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine usePoll
//
//  Fetch on mount + refresh, the null answer (missing, not
//  error), error + retry, out-of-order responses dropped, the
//  pessimistic vote (success replaces wholesale, failure keeps
//  the old poll and notifies), the guest path, and expiry
//  gating canVote against the provider's frozen clock. Then
//  the provider's poll store and the host seed (KNF-172): a
//  held poll renders with no fetch, every surface on one id
//  agrees, a remount re-offering its OLD row keeps the vote,
//  a new row that predates the vote is skipped, a fetch that
//  lost the race to a vote writes nothing, and an account
//  switch wipes the store.
// -----------------------------------------------------------

import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import type { SocialNotice, SocialTransport } from '../../core/transport';
import type { Poll, SocialUser } from '../../core/types';
import { SocialEngineProvider } from '../../provider';
import { usePoll } from '../usePoll';


// The signed-in viewer the engine runs as
const VIEWER: SocialUser = { id: 'u1', displayName: 'Me' };







// -----------------------------------------------------------
// makePoll
// -----------------------------------------------------------
//
// One open single-answer poll, overridable.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// stubTransport
// -----------------------------------------------------------
//
// A full transport with inert defaults — each test overrides
// only the calls it exercises.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const stubTransport = (over: Partial<SocialTransport> = {}): SocialTransport => ({
  setLiked: jest.fn(async () => ({ liked: false, likeCount: 0 })),
  fetchPoll: jest.fn(async () => makePoll()),
  vote: jest.fn(async () => makePoll()),
  ...over,
});







// -----------------------------------------------------------
// deferred
// -----------------------------------------------------------
//
// A promise settled by hand, for holding a response in flight.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};







// -----------------------------------------------------------
// flush
// -----------------------------------------------------------
//
// Drains the microtask chains a load or vote settles through.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });







// -----------------------------------------------------------
// wrapperFor
// -----------------------------------------------------------
//
// The provider around a hook under test: signed in as VIEWER
// unless the options say otherwise ("not given" and an
// explicit null guest are told apart), with the optional
// notice, auth and clock hooks.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

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

  it('vote is single-flight: a second vote while one is on the wire never reaches the transport', async () => {
    let release: (poll: Poll) => void = () => {};
    const vote = jest.fn(
      () =>
        new Promise<Poll>((resolve) => {
          release = resolve;
        }),
    );
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ fetchPoll: async () => makePoll(), vote })) });
    await flush();

    await act(async () => {
      void h.result.current.vote(['o1']);
    });
    await act(async () => {
      void h.result.current.vote(['o2']);
    });
    expect(vote).toHaveBeenCalledTimes(1);

    await act(async () => release(makePoll({ votedByMe: true })));
    await flush();
    // Settled — the latch reopens for the next deliberate vote
    await act(async () => {
      void h.result.current.vote(['o2']);
    });
    expect(vote).toHaveBeenCalledTimes(2);
    await h.unmount();
  });
});







// -----------------------------------------------------------
// votedO1
// -----------------------------------------------------------
//
// The poll as the viewer sees it after voting o1.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const votedO1 = () =>
  makePoll({
    options: [
      { id: 'o1', text: 'Kava', voteCount: 3, votedByMe: true },
      { id: 'o2', text: 'Arbata', voteCount: 1, votedByMe: false },
    ],
    totalVotes: 4,
    voterCount: 4,
    votedByMe: true,
  });







// -----------------------------------------------------------
// PollProbe
// -----------------------------------------------------------
//
// A card-shaped probe: its seed is the "feed row", its text
// the state it renders, a press casts o1.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function PollProbe({ seed, id = 'p1' }: { seed?: Poll | null; id?: string }) {
  const p = usePoll(id, { initial: seed });
  return (
    <Text testID="probe" onPress={() => void p.vote(['o1'])}>
      {p.poll ? `${p.poll.totalVotes}:${p.poll.votedByMe ? 'voted' : 'open'}` : 'none'}
    </Text>
  );
}


describe('usePoll — the provider store and the host seed', () => {
  it('a held poll renders on the first frame and nothing is fetched', async () => {
    const fetchPoll = jest.fn(async () => makePoll());
    const seed = makePoll({ totalVotes: 7, voterCount: 7 });
    const h = await renderHook(() => usePoll('p1', { initial: seed }), { wrapper: wrapperFor(stubTransport({ fetchPoll })) });
    await flush();

    expect(h.result.current.poll).toBe(seed);
    expect(h.result.current.loading).toBe(false);
    expect(fetchPoll).not.toHaveBeenCalled();

    // refresh() is the explicit door to the wire
    await act(async () => h.result.current.refresh());
    await flush();
    expect(fetchPoll).toHaveBeenCalledTimes(1);
    await h.unmount();
  });

  it('a seed for another poll id is ignored — the hook fetches its own', async () => {
    const fetchPoll = jest.fn(async () => makePoll());
    const h = await renderHook(() => usePoll('p1', { initial: makePoll({ id: 'other' }) }), {
      wrapper: wrapperFor(stubTransport({ fetchPoll })),
    });
    await flush();
    expect(fetchPoll).toHaveBeenCalledWith('p1');
    expect(h.result.current.poll?.id).toBe('p1');
    await h.unmount();
  });

  it('every surface on one poll agrees — a vote in one shows in the other', async () => {
    const vote = jest.fn(async () => votedO1());
    const fetchPoll = jest.fn(async () => makePoll());
    const h = await renderHook(() => ({ card: usePoll('p1', { initial: makePoll() }), article: usePoll('p1') }), {
      wrapper: wrapperFor(stubTransport({ fetchPoll, vote })),
    });
    await flush();
    // The article's hook found the card's seed in the store
    expect(fetchPoll).not.toHaveBeenCalled();

    await act(async () => h.result.current.article.vote(['o1']));
    await flush();
    expect(h.result.current.card.poll?.votedByMe).toBe(true);
    expect(h.result.current.card.poll?.totalVotes).toBe(4);
    await h.unmount();
  });

  it("a remounted card re-offering its OLD row keeps the viewer's vote — and fetches nothing", async () => {
    const fetchPoll = jest.fn(async () => makePoll());
    const transport = stubTransport({ fetchPoll, vote: jest.fn(async () => votedO1()) });
    const Wrapper = wrapperFor(transport);
    const row = makePoll();
    const view = await render(<Wrapper><PollProbe seed={row} /></Wrapper>);
    await fireEvent.press(view.getByTestId('probe'));
    await flush();
    expect(view.getByTestId('probe').props.children).toBe('4:voted');

    // Scrolled away (unmounted) and back — the feed row is the
    // same pre-vote object it always was
    await view.rerender(<Wrapper><Text>away</Text></Wrapper>);
    await view.rerender(<Wrapper><PollProbe seed={row} /></Wrapper>);
    await flush();
    expect(view.getByTestId('probe').props.children).toBe('4:voted');
    expect(fetchPoll).not.toHaveBeenCalled();
  });

  it('a NEW row that predates the vote is skipped; one that agrees with it is adopted', async () => {
    const transport = stubTransport({ vote: jest.fn(async () => votedO1()) });
    const Wrapper = wrapperFor(transport);
    const view = await render(<Wrapper><PollProbe seed={makePoll()} /></Wrapper>);
    await fireEvent.press(view.getByTestId('probe'));
    await flush();

    // A feed refresh that started before the vote lands after it
    await view.rerender(<Wrapper><PollProbe seed={makePoll({ totalVotes: 5, voterCount: 5 })} /></Wrapper>);
    await flush();
    expect(view.getByTestId('probe').props.children).toBe('4:voted');

    // A later refresh carries the vote — fresher counts win
    const later = votedO1();
    later.totalVotes = 9;
    await view.rerender(<Wrapper><PollProbe seed={later} /></Wrapper>);
    await flush();
    expect(view.getByTestId('probe').props.children).toBe('9:voted');
  });

  it('a fetch that lost the race to a vote writes nothing', async () => {
    const slow = deferred<Poll | null>();
    const fetchPoll = jest.fn(() => slow.promise);
    const vote = jest.fn(async () => votedO1());
    const h = await renderHook(() => usePoll('p1'), { wrapper: wrapperFor(stubTransport({ fetchPoll, vote })) });
    await flush();

    // The vote lands while the mount fetch is still on the wire…
    await act(async () => h.result.current.vote(['o1']));
    await flush();
    expect(h.result.current.poll?.votedByMe).toBe(true);

    // …and the stale pre-vote answer arrives last
    slow.resolve(makePoll());
    await flush();
    expect(h.result.current.poll?.votedByMe).toBe(true);
    expect(h.result.current.loading).toBe(false);
    await h.unmount();
  });

  it("an account switch wipes the store — the next viewer never sees the last one's vote", async () => {
    const fetchPoll = jest.fn(async () => makePoll());
    const transport = stubTransport({ fetchPoll, vote: jest.fn(async () => votedO1()) });
    const at = (user: SocialUser) => (
      <SocialEngineProvider transport={transport} currentUser={user}>
        <PollProbe />
      </SocialEngineProvider>
    );
    const view = await render(at(VIEWER));
    await flush();
    await fireEvent.press(view.getByTestId('probe'));
    await flush();
    expect(view.getByTestId('probe').props.children).toBe('4:voted');

    // The widget stays mounted across the switch: the store is
    // empty for the new viewer, and their own poll is asked
    await view.rerender(at({ id: 'u2', displayName: 'Kitas' }));
    await flush();
    expect(view.getByTestId('probe').props.children).toBe('3:open');
    expect(fetchPoll).toHaveBeenCalledTimes(2);
  });
});
