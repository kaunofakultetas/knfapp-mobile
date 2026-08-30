// -----------------------------------------------------------
//  [*] socialengine — testing: fakeSocialTransport
//
//  An in-memory SocialTransport for tests and demos, and the
//  reference every adapter is measured against (it passes the
//  conformance suite in testing/socialContract.ts). Likes are
//  authoritative counters keyed per target, polls live as full
//  rows that vote() rewrites under the real rules (closed and
//  expired refuse, 'single' replaces), relationships walk the
//  legal transition table and refuse everything else, and the
//  activity list pages newest-first by an index cursor.
//
//  Every request is recorded so a test can assert what reached
//  the "server", and any method can be made to fail or stall
//  through `fail` / `stall`. Refusals reject with bare
//  { status, code } objects — the same shapes the engine's
//  error judgements (isRetryableError / isAuthError) read off
//  a real HTTP adapter.
//
//  Used by:
//    - the engine's own hook tests
//    - hosts' tests (render a screen against a fake backend)
//    - src/__tests__/contract.test.ts — the reference run of
//      the conformance suite
// -----------------------------------------------------------

import type { LikeResult, LikeTarget, NotificationsPage, RelationshipAction, SocialTransport } from '../core/transport';
import type { Poll, RelationshipState, SocialNotification } from '../core/types';


export interface FakeSocialTransportOptions {
  // Seeded polls, stored by their own ids
  polls?: Poll[];
  // Seeded activity rows, OLDEST first (the order they happened)
  notifications?: SocialNotification[];
  // Each user's standing with the viewer; absent users read 'none'
  relationships?: Record<string, RelationshipState>;
  // Authoritative like state keyed 'post:<id>' / 'comment:<id>';
  // an unseeded target starts { liked: false, count: 0 }
  likes?: Record<string, { liked: boolean; count: number }>;
  // Activity rows per page
  pageSize?: number;
}

type Method =
  | 'setLiked'
  | 'fetchPoll'
  | 'vote'
  | 'setRelationship'
  | 'setBlocked'
  | 'report'
  | 'fetchNotifications'
  | 'markNotificationsRead'
  | 'fetchUnreadCount';

export interface FakeSocialTransport extends SocialTransport {
  // Every request, in order
  calls: { method: Method; args: unknown[] }[];
  // The "server's" stores, live — tests may read and reseed them
  polls: Record<string, Poll>;
  notifications: SocialNotification[];
  relationships: Record<string, RelationshipState>;
  likes: Record<string, { liked: boolean; count: number }>;
  blocked: Set<string>;
  reports: { target: { type: 'post' | 'comment' | 'user'; id: string }; reason: string }[];
  // Make the next N calls of a method reject with this error
  fail(method: Method, error: unknown, times?: number): void;
  // Hold the next call of a method until the returned release runs
  stall(method: Method): () => void;
  // Reset the calls log (the stores stay)
  reset(): void;
  // Append one activity row (the newest); the id is generated
  // when absent. Answers the stored row
  seedNotification(n: Omit<SocialNotification, 'id'> & { id?: string }): SocialNotification;
  // Force one user's standing — how the suite reaches 'incoming'
  // and the other states no action can produce
  setRelationshipState(userId: string, state: RelationshipState): void;

  // The optional half of the contract, present here — the fake is
  // the full-featured backend
  setRelationship(userId: string, action: RelationshipAction): Promise<RelationshipState>;
  setBlocked(userId: string, blocked: boolean): Promise<void>;
  report(target: { type: 'post' | 'comment' | 'user'; id: string }, reason: string): Promise<void>;
  fetchNotifications(cursor?: string): Promise<NotificationsPage>;
  markNotificationsRead(): Promise<void>;
  fetchUnreadCount(): Promise<number>;
}


let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

const likeKey = (target: LikeTarget) => `${target.type}:${target.id}`;

// Answers leave the store by copy — voting is pessimistic and
// the caller replaces local state wholesale, so a shared
// reference would let one side mutate the other
const clonePoll = (poll: Poll): Poll => ({ ...poll, options: poll.options.map((o) => ({ ...o })) });

// Reject the way an HTTP adapter surfaces a refusal: a bare
// object with the status the engine's error judgements read
const refuse = (status: number, code?: string): never => {
  throw code ? { status, code } : { status };
};

// Every action's one legal starting state, and where it lands.
// This fake is request-style: connect answers 'outgoing' (an
// instant-connect backend would answer 'connected' — the
// conformance suite accepts both)
const TRANSITIONS: Record<RelationshipAction, { from: RelationshipState; to: RelationshipState }> = {
  connect: { from: 'none', to: 'outgoing' },
  cancel: { from: 'outgoing', to: 'none' },
  accept: { from: 'incoming', to: 'connected' },
  decline: { from: 'incoming', to: 'none' },
  disconnect: { from: 'connected', to: 'none' },
};

export function fakeSocialTransport(options: FakeSocialTransportOptions = {}): FakeSocialTransport {
  const pageSize = options.pageSize ?? 50;

  // Seeds are copied in so a caller's fixture objects never get
  // mutated behind its back
  const polls: Record<string, Poll> = {};
  for (const poll of options.polls ?? []) polls[poll.id] = clonePoll(poll);
  const notifications: SocialNotification[] = (options.notifications ?? []).map((n) => ({ ...n }));
  const relationships: Record<string, RelationshipState> = { ...(options.relationships ?? {}) };
  const likes: Record<string, { liked: boolean; count: number }> = {};
  for (const [key, value] of Object.entries(options.likes ?? {})) likes[key] = { ...value };

  const calls: FakeSocialTransport['calls'] = [];
  const reports: FakeSocialTransport['reports'] = [];
  const blocked = new Set<string>();
  const failures = new Map<Method, { error: unknown; times: number }>();
  const stalls = new Map<Method, Promise<void>>();


  const gate = async (method: Method, args: unknown[]) => {
    calls.push({ method, args });
    const stall = stalls.get(method);
    if (stall) {
      stalls.delete(method);
      await stall;
    }
    const failure = failures.get(method);
    if (failure) {
      failure.times -= 1;
      if (failure.times <= 0) failures.delete(method);
      throw failure.error;
    }
  };


  const transport: FakeSocialTransport = {
    calls,
    polls,
    notifications,
    relationships,
    likes,
    blocked,
    reports,
    fail: (method, error, times = 1) => {
      failures.set(method, { error, times });
    },
    stall: (method) => {
      let release: () => void = () => {};
      stalls.set(method, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    reset: () => {
      calls.length = 0;
    },
    seedNotification: (n) => {
      const row: SocialNotification = { ...n, id: n.id ?? nextId('ntf') };
      notifications.push(row);
      return row;
    },
    setRelationshipState: (userId, state) => {
      relationships[userId] = state;
    },

    async setLiked(target, liked): Promise<LikeResult> {
      await gate('setLiked', [target, liked]);
      const key = likeKey(target);
      const entry = likes[key] ?? (likes[key] = { liked: false, count: 0 });
      // Idempotent per DESIRED state — a repeated "like" answers
      // the same pair instead of double-counting a tap replay
      if (entry.liked !== liked) {
        entry.count = Math.max(0, entry.count + (liked ? 1 : -1));
        entry.liked = liked;
      }
      return { liked: entry.liked, likeCount: entry.count };
    },

    async fetchPoll(pollId): Promise<Poll | null> {
      await gate('fetchPoll', [pollId]);
      // An unknown id is the "post has no poll" case — null, never
      // a rejection
      const poll = polls[pollId];
      return poll ? clonePoll(poll) : null;
    },

    async vote(pollId, optionIds): Promise<Poll> {
      await gate('vote', [pollId, optionIds]);
      const poll = polls[pollId];
      if (!poll) refuse(404, 'poll_not_found');


      if (poll.closed || (poll.expiresAt != null && Date.parse(poll.expiresAt) <= Date.now())) refuse(409, 'poll_closed');
      if (poll.answerType === 'single' && optionIds.length !== 1) refuse(400, 'invalid_vote');
      if (optionIds.some((id) => !poll.options.some((o) => o.id === id))) refuse(400, 'invalid_vote');


      // A vote replaces the viewer's previous choice wholesale:
      // strip the old marks, apply the new ones, then rebuild the
      // derived numbers so totalVotes stays the sum of the options
      const hadVote = poll.votedByMe;
      for (const option of poll.options) {
        if (option.votedByMe) {
          option.voteCount = Math.max(0, option.voteCount - 1);
          option.votedByMe = false;
        }
      }
      for (const id of optionIds) {
        const option = poll.options.find((o) => o.id === id)!;
        option.voteCount += 1;
        option.votedByMe = true;
      }
      poll.votedByMe = poll.options.some((o) => o.votedByMe);
      poll.totalVotes = poll.options.reduce((sum, o) => sum + o.voteCount, 0);


      // voterCount moves only when the viewer enters or leaves the
      // voter set — replacing a choice keeps it still
      if (!hadVote && poll.votedByMe) poll.voterCount = (poll.voterCount ?? 0) + 1;
      if (hadVote && !poll.votedByMe && poll.voterCount != null) poll.voterCount = Math.max(0, poll.voterCount - 1);
      return clonePoll(poll);
    },

    async setRelationship(userId, action): Promise<RelationshipState> {
      await gate('setRelationship', [userId, action]);
      const current = relationships[userId] ?? 'none';
      const transition = TRANSITIONS[action];
      if (!transition || transition.from !== current) refuse(409, 'relationship_conflict');
      relationships[userId] = transition.to;
      return transition.to;
    },

    async setBlocked(userId, isBlocked): Promise<void> {
      await gate('setBlocked', [userId, isBlocked]);
      if (isBlocked) {
        blocked.add(userId);
        relationships[userId] = 'blocking';
      } else {
        blocked.delete(userId);
        // Only undo what blocking itself wrote — an unblock of a
        // never-blocked user must not clobber a real standing
        if (relationships[userId] === 'blocking') relationships[userId] = 'none';
      }
    },

    async report(target, reason): Promise<void> {
      await gate('report', [target, reason]);
      reports.push({ target, reason });
    },

    async fetchNotifications(cursor): Promise<NotificationsPage> {
      await gate('fetchNotifications', [cursor]);
      // Newest first, as an activity list reads. The cursor is the
      // index of the next row in that view — honest as long as
      // nothing is seeded between pages (a deliberate fake-only
      // simplification)
      const newestFirst = [...notifications].reverse();
      const start = cursor ? Number.parseInt(cursor, 10) : 0;
      const page = newestFirst.slice(start, start + pageSize);
      const nextIndex = start + page.length;
      const hasMore = nextIndex < newestFirst.length;
      return {
        notifications: page.map((n) => ({ ...n })),
        hasMore,
        cursor: hasMore ? String(nextIndex) : undefined,
      };
    },

    async markNotificationsRead(): Promise<void> {
      await gate('markNotificationsRead', []);
      for (const n of notifications) n.read = true;
    },

    async fetchUnreadCount(): Promise<number> {
      await gate('fetchUnreadCount', []);
      return notifications.filter((n) => !n.read).length;
    },
  };

  return transport;
}
