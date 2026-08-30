// -----------------------------------------------------------
//  [*] Tests — the fake transport's own levers
//
//  What the conformance suite does not cover: the failure and
//  stall controls a test drives the fake with, the refusal
//  shapes ({ status, code }), and the validation edges — an
//  illegal relationship transition, the exactly-one rule of a
//  single-answer poll, expiry read from the clock.
// -----------------------------------------------------------

import { fakeSocialTransport } from '../fakeSocialTransport';
import type { Poll } from '../../core/types';


const singlePoll = (over: Partial<Poll> = {}): Poll => ({
  id: 'p-1',
  question: 'Kada?',
  options: [
    { id: 'a', text: 'Rytoj', voteCount: 0, votedByMe: false },
    { id: 'b', text: 'Poryt', voteCount: 0, votedByMe: false },
  ],
  answerType: 'single',
  totalVotes: 0,
  voterCount: 0,
  closed: false,
  votedByMe: false,
  ...over,
});


describe('fakeSocialTransport levers', () => {
  it('fail() rejects the next N calls with the given error, then heals', async () => {
    const fake = fakeSocialTransport();
    fake.fail('setLiked', { status: 500 }, 2);
    await expect(fake.setLiked({ type: 'post', id: 'p1' }, true)).rejects.toMatchObject({ status: 500 });
    await expect(fake.setLiked({ type: 'post', id: 'p1' }, true)).rejects.toMatchObject({ status: 500 });
    await expect(fake.setLiked({ type: 'post', id: 'p1' }, true)).resolves.toEqual({ liked: true, likeCount: 1 });
  });

  it('stall() holds a call until the release runs', async () => {
    const fake = fakeSocialTransport();
    const release = fake.stall('fetchPoll');
    let settled = false;
    const pending = fake.fetchPoll('anything').then((value) => {
      settled = true;
      return value;
    });


    // Give the microtask chain every chance to finish — it must not
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(settled).toBe(false);


    release();
    await expect(pending).resolves.toBeNull();
    expect(settled).toBe(true);
  });

  it('refuses an illegal relationship transition with a conflict', async () => {
    const fake = fakeSocialTransport({ relationships: { ona: 'none' } });
    await expect(fake.setRelationship('ona', 'cancel')).rejects.toMatchObject({ status: 409 });
    await expect(fake.setRelationship('ona', 'accept')).rejects.toMatchObject({ status: 409 });
    await expect(fake.setRelationship('ona', 'disconnect')).rejects.toMatchObject({ status: 409 });


    // The legal move from the same state still lands — and cannot
    // be repeated from where it lands
    await expect(fake.setRelationship('ona', 'connect')).resolves.toBe('outgoing');
    await expect(fake.setRelationship('ona', 'connect')).rejects.toMatchObject({ status: 409 });
  });

  it('a single-answer vote takes exactly one KNOWN option', async () => {
    const fake = fakeSocialTransport({ polls: [singlePoll()] });
    await expect(fake.vote('p-1', [])).rejects.toMatchObject({ status: 400 });
    await expect(fake.vote('p-1', ['a', 'b'])).rejects.toMatchObject({ status: 400 });
    await expect(fake.vote('p-1', ['not-an-option'])).rejects.toMatchObject({ status: 400 });
    await expect(fake.vote('p-1', ['a'])).resolves.toMatchObject({ votedByMe: true, totalVotes: 1 });
  });

  it('refuses a vote once the poll is closed or past its expiry', async () => {
    const fake = fakeSocialTransport({
      polls: [
        singlePoll({ id: 'p-closed', closed: true }),
        singlePoll({ id: 'p-expired', expiresAt: new Date(Date.now() - 1000).toISOString() }),
      ],
    });
    await expect(fake.vote('p-closed', ['a'])).rejects.toMatchObject({ status: 409, code: 'poll_closed' });
    await expect(fake.vote('p-expired', ['a'])).rejects.toMatchObject({ status: 409, code: 'poll_closed' });
  });

  it('answers the like pair idempotently for a repeated desired state', async () => {
    const fake = fakeSocialTransport({ likes: { 'post:p1': { liked: false, count: 4 } } });
    await expect(fake.setLiked({ type: 'post', id: 'p1' }, true)).resolves.toEqual({ liked: true, likeCount: 5 });
    await expect(fake.setLiked({ type: 'post', id: 'p1' }, true)).resolves.toEqual({ liked: true, likeCount: 5 });
    await expect(fake.setLiked({ type: 'post', id: 'p1' }, false)).resolves.toEqual({ liked: false, likeCount: 4 });
  });

  it('records every request and reset() clears the log but keeps the stores', async () => {
    const fake = fakeSocialTransport();
    await fake.setLiked({ type: 'comment', id: 'c1' }, true);
    await fake.report({ type: 'post', id: 'p9' }, 'spam');
    expect(fake.calls.map((c) => c.method)).toEqual(['setLiked', 'report']);
    expect(fake.calls[0].args).toEqual([{ type: 'comment', id: 'c1' }, true]);
    expect(fake.reports).toEqual([{ target: { type: 'post', id: 'p9' }, reason: 'spam' }]);


    fake.reset();
    expect(fake.calls).toEqual([]);
    expect(fake.likes['comment:c1']).toEqual({ liked: true, count: 1 });
  });
});
