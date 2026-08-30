// -----------------------------------------------------------
//  [*] Tests — the KNF adapter over a stubbed backend
//
//  The conformance suite run against createKnfSocialTransport
//  with an in-memory stand-in for the real routes (toggle
//  like, single-answer poll under its post id, request
//  listing with accept/reject, unfriend, blocks, reports),
//  plus the mappings the suite cannot see: the 409 vote
//  absorbed into a refetch, the same-404-for-everything poll
//  answered as null, and the definitive cancel refusal.
// -----------------------------------------------------------

import { describeSocialContract, type SocialTransportHarness } from '../../../testing/socialContract';
import type { Poll } from '../../../core/types';
import { createKnfSocialTransport } from '../index';
import type { ApiPoll, HttpClient } from '../wire';


interface StubBackend {
  http: HttpClient;
  polls: Map<string, ApiPoll & { userVoteBy: string | null }>;
  likes: Map<string, { liked: boolean; count: number }>;
  received: { id: string; userId: string; displayName: string; username: string; createdAt: string }[];
  friends: Set<string>;
  blocked: Set<string>;
  reports: { target_type: string; target_id: string; reason: string }[];
}

const reject = (status: number, error: string) => Promise.reject(Object.assign(new Error(error), { status }));


// The routes, as data. Only the paths the adapter actually
// takes are answered; anything else 404s like the real server
function stubBackend(): StubBackend {
  const polls = new Map<string, ApiPoll & { userVoteBy: string | null }>();
  const likes = new Map<string, { liked: boolean; count: number }>();
  const received: StubBackend['received'] = [];
  const friends = new Set<string>();
  const blocked = new Set<string>();
  const reports: StubBackend['reports'] = [];
  let seq = 0;

  const http: HttpClient = {
    async get<T>(path: string, options?: { params?: Record<string, unknown> }): Promise<T> {
      const poll = path.match(/^\/news\/([^/]+)\/poll$/);
      if (poll) {
        const row = polls.get(decodeURIComponent(poll[1]));
        if (!row) return reject(404, 'No poll found for this post') as Promise<T>;
        return { ...row, options: row.options.map((o) => ({ ...o })) } as T;
      }
      if (path === '/social/friends/requests' && options?.params?.direction === 'received') {
        return { requests: received.map((row) => ({ ...row })) } as T;
      }
      return reject(404, 'not found') as Promise<T>;
    },

    async post<T>(path: string, body?: unknown): Promise<T> {
      const like = path.match(/^\/news\/([^/]+)\/like$/);
      if (like) {
        const id = decodeURIComponent(like[1]);
        const row = likes.get(id) ?? { liked: false, count: 0 };
        const next = { liked: !row.liked, count: row.count + (row.liked ? -1 : 1) };
        likes.set(id, next);
        return { liked: next.liked, likes: next.count } as T;
      }

      const vote = path.match(/^\/news\/([^/]+)\/poll\/vote$/);
      if (vote) {
        const row = polls.get(decodeURIComponent(vote[1]));
        const optionId = (body as { option_id: string }).option_id;
        if (!row) return reject(404, 'No poll found for this post') as Promise<T>;
        if (row.endDate && new Date(row.endDate) < new Date()) return reject(400, 'Poll has ended') as Promise<T>;
        const option = row.options.find((o) => o.id === optionId);
        if (!option) return reject(400, 'Invalid option') as Promise<T>;
        if (row.userVoteBy === optionId) return reject(409, 'Already voted for this option') as Promise<T>;
        const previous = row.options.find((o) => o.id === row.userVoteBy);
        if (previous) previous.votes -= 1;
        else row.totalVotes += 1;
        option.votes += 1;
        row.userVoteBy = optionId;
        row.userVote = optionId;
        return { ...row, options: row.options.map((o) => ({ ...o })) } as T;
      }

      if (path === '/social/friends/request') {
        const target = (body as { user_id: string }).user_id;
        const reverse = received.find((row) => row.userId === target);
        if (reverse) {
          received.splice(received.indexOf(reverse), 1);
          friends.add(target);
          return { status: 'accepted' } as T;
        }
        return { id: `req-${++seq}`, status: 'pending' } as T;
      }

      const answer = path.match(/^\/social\/friends\/requests\/([^/]+)\/(accept|reject)$/);
      if (answer) {
        const index = received.findIndex((row) => row.id === decodeURIComponent(answer[1]));
        if (index < 0) return reject(404, 'Request not found') as Promise<T>;
        const [row] = received.splice(index, 1);
        if (answer[2] === 'accept') friends.add(row.userId);
        return { status: answer[2] === 'accept' ? 'accepted' : 'rejected' } as T;
      }

      if (path === '/social/blocks') {
        blocked.add((body as { user_id: string }).user_id);
        return { status: 'blocked' } as T;
      }
      if (path === '/social/reports') {
        reports.push(body as StubBackend['reports'][number]);
        return { status: 'reported' } as T;
      }
      return reject(404, 'not found') as Promise<T>;
    },

    async put<T>(): Promise<T> {
      return reject(404, 'not found') as Promise<T>;
    },

    async delete<T>(path: string): Promise<T> {
      const unfriend = path.match(/^\/social\/friends\/([^/]+)$/);
      if (unfriend) {
        if (!friends.delete(decodeURIComponent(unfriend[1]))) return reject(404, 'Not friends') as Promise<T>;
        return { status: 'unfriended' } as T;
      }
      const unblock = path.match(/^\/social\/blocks\/([^/]+)$/);
      if (unblock) {
        blocked.delete(decodeURIComponent(unblock[1]));
        return { status: 'unblocked' } as T;
      }
      return reject(404, 'not found') as Promise<T>;
    },
  };

  return { http, polls, likes, received, friends, blocked, reports };
}


// Engine Poll → the wire row the stub serves. The engine's
// pollId is the post id, so the seed keys on poll.id
const toApiPoll = (poll: Poll): ApiPoll & { userVoteBy: string | null } => {
  const mine = poll.options.find((o) => o.votedByMe);
  return {
    id: `poll-${poll.id}`,
    postId: poll.id,
    title: poll.question ?? '',
    endDate: poll.closed ? new Date(Date.now() - 60_000).toISOString() : (poll.expiresAt ?? null),
    totalVotes: poll.totalVotes,
    createdAt: new Date(0).toISOString(),
    userVote: mine?.id ?? null,
    userVoteBy: mine?.id ?? null,
    options: poll.options.map((o) => ({ id: o.id, text: o.text, votes: o.voteCount })),
  };
};


let seededRequests = 0;

function knfHarness(): SocialTransportHarness & { backend: StubBackend } {
  const backend = stubBackend();
  return {
    backend,
    transport: createKnfSocialTransport({ http: backend.http }),
    supportsCancel: false,
    async seedPoll(poll) {
      backend.polls.set(poll.id, toApiPoll(poll));
      return poll.id;
    },
    async seedNotification() {
      // No activity endpoints exist on this backend; the suite
      // skips those legs because the methods are absent
      return `n-${++seededRequests}`;
    },
    async setRelationship(userId, state) {
      backend.friends.delete(userId);
      const index = backend.received.findIndex((row) => row.userId === userId);
      if (index >= 0) backend.received.splice(index, 1);
      if (state === 'connected') backend.friends.add(userId);
      if (state === 'incoming') {
        backend.received.push({ id: `req-seed-${++seededRequests}`, userId, displayName: 'Ona', username: 'ona', createdAt: new Date(0).toISOString() });
      }
      // 'outgoing' needs no stub state: the only verb that reads
      // it is cancel, which this backend refuses
    },
  };
}


describeSocialContract('KNF adapter over stubbed routes', knfHarness);


describe('KNF adapter mappings', () => {
  it('passes the toggled answer through even when it disagrees with the desired state', async () => {
    const h = knfHarness();
    h.backend.likes.set('p1', { liked: true, count: 7 });
    // Desired "like", but the toggle lands on unlike — the
    // server's word comes back untouched for the shadow to adopt
    const result = await h.transport.setLiked({ type: 'post', id: 'p1' }, true);
    expect(result).toEqual({ liked: false, likeCount: 6 });
  });

  it('absorbs the already-voted 409 into a refetch of the current poll', async () => {
    const h = knfHarness();
    await h.seedPoll({
      id: 'post-9',
      question: 'Kur?',
      options: [
        { id: 'a', text: 'A', voteCount: 3, votedByMe: true },
        { id: 'b', text: 'B', voteCount: 1, votedByMe: false },
      ],
      answerType: 'single',
      totalVotes: 4,
      closed: false,
      votedByMe: true,
    });
    const poll = await h.transport.vote('post-9', ['a']);
    expect(poll.votedByMe).toBe(true);
    expect(poll.options.find((o) => o.id === 'a')?.voteCount).toBe(3);
  });

  it('refuses a multi-option vote before touching the wire', async () => {
    const h = knfHarness();
    await expect(h.transport.vote('post-9', ['a', 'b'])).rejects.toMatchObject({ status: 400 });
  });

  it('refuses cancel definitively — a non-retryable status the hook reverts on', async () => {
    const h = knfHarness();
    await expect(h.transport.setRelationship!('u1', 'cancel')).rejects.toMatchObject({ status: 501 });
  });

  it('refuses comment likes and comment reports as unsupported', async () => {
    const h = knfHarness();
    await expect(h.transport.setLiked({ type: 'comment', id: 'c1' }, true)).rejects.toMatchObject({ status: 501 });
    await expect(h.transport.report!({ type: 'comment', id: 'c1' }, 'spam')).rejects.toMatchObject({ status: 501 });
  });

  it('resolves accept through the received-requests listing', async () => {
    const h = knfHarness();
    await h.setRelationship('u-ask', 'incoming');
    await expect(h.transport.setRelationship!('u-ask', 'accept')).resolves.toBe('connected');
    expect(h.backend.friends.has('u-ask')).toBe(true);
    // A second accept finds nothing pending
    await expect(h.transport.setRelationship!('u-ask', 'accept')).rejects.toMatchObject({ status: 404 });
  });

  it('reports posts and users through the moderation lane', async () => {
    const h = knfHarness();
    await h.transport.report!({ type: 'post', id: 'p1' }, 'spam');
    await h.transport.report!({ type: 'user', id: 'u1' }, 'abuse');
    expect(h.backend.reports).toEqual([
      { target_type: 'post', target_id: 'p1', reason: 'spam' },
      { target_type: 'user', target_id: 'u1', reason: 'abuse' },
    ]);
  });
});
