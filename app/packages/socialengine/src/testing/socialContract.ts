// -----------------------------------------------------------
//  [*] socialengine — testing: socialContract
//
//  The conformance suite for a SocialTransport. An adapter
//  author calls describeSocialContract('my adapter', makeHarness)
//  inside a jest file and gets the behaviours the engine relies
//  on checked against their implementation: the authoritative
//  like pair and its round trip, null for a missing poll, the
//  vote-replacement arithmetic and the closed-poll refusal, the
//  relationship machine's legal walk, and the activity list's
//  cursor and unread probe. The fake transport passes it; so
//  must any real adapter (with its HTTP client stubbed).
//
//  The optional half of the contract is proved only where the
//  transport offers it — a likes-and-polls-only backend passes
//  with the relationship and activity checks quietly skipped.
//
//  The harness answers a fresh transport plus the levers the
//  suite needs to shape the other side: seed a poll, append an
//  activity row, force a relationship state no action can reach
//  (there is no client-side way to become 'incoming').
//
//  Used by:
//    - src/__tests__/contract.test.ts — the fake's run
//    - any adapter's own test file
// -----------------------------------------------------------

import type { SocialTransport } from '../core/transport';
import type { Poll, RelationshipState, SocialNotification } from '../core/types';


export interface SocialTransportHarness {
  transport: SocialTransport;
  // Put a poll into the backend's store; answers its id
  seedPoll(poll: Poll): Promise<string>;
  // Append one activity row as the NEWEST; answers the stored id
  seedNotification(n: Omit<SocialNotification, 'id'> & { id?: string }): Promise<string>;
  // Force one user's standing with the viewer
  setRelationship(userId: string, state: RelationshipState): Promise<void>;
  // Whether the backend can withdraw an outgoing request
  // (default true) — one without the lever refuses 'cancel'
  // definitively and the standing stays 'outgoing'
  supportsCancel?: boolean;
}


const iso = (minute: number) => new Date(Date.UTC(2026, 7, 30, 12, minute, 0)).toISOString();

const basePoll = (id: string, over: Partial<Poll> = {}): Poll => ({
  id,
  question: 'Kur susitinkam?',
  options: [
    { id: 'opt-a', text: 'Auditorija', voteCount: 2, votedByMe: false },
    { id: 'opt-b', text: 'Biblioteka', voteCount: 3, votedByMe: false },
  ],
  answerType: 'single',
  totalVotes: 5,
  voterCount: 5,
  closed: false,
  votedByMe: false,
  ...over,
});

const baseNotification = (over: Partial<Omit<SocialNotification, 'id'>> = {}): Omit<SocialNotification, 'id'> => ({
  kind: 'like',
  actor: { id: 'u-actor', displayName: 'Ona' },
  createdAt: iso(0),
  read: false,
  ...over,
});


export function describeSocialContract(name: string, makeHarness: () => Promise<SocialTransportHarness> | SocialTransportHarness): void {
  describe(`SocialTransport contract — ${name}`, () => {
    let h: SocialTransportHarness;
    beforeEach(async () => {
      h = await makeHarness();
    });

    it('exposes the like/poll core', () => {
      for (const method of ['setLiked', 'fetchPoll', 'vote'] as const) {
        expect(typeof h.transport[method]).toBe('function');
      }
    });

    it('answers the authoritative like pair, and a double toggle returns to the start', async () => {
      const target = { type: 'post', id: 'p-like' } as const;
      const on = await h.transport.setLiked(target, true);
      expect(on.liked).toBe(true);
      expect(typeof on.likeCount).toBe('number');
      const off = await h.transport.setLiked(target, false);
      expect(off.liked).toBe(false);
      expect(off.likeCount).toBe(on.likeCount - 1);
    });

    it('answers null for a poll that does not exist', async () => {
      await expect(h.transport.fetchPoll('poll-that-never-was')).resolves.toBeNull();
    });

    it('replaces the choice on a single-answer poll and keeps the sums honest', async () => {
      const id = await h.seedPoll(basePoll('p-single'));
      const first = await h.transport.vote(id, ['opt-a']);
      expect(first.votedByMe).toBe(true);
      expect(first.options.find((o) => o.id === 'opt-a')?.votedByMe).toBe(true);
      expect(first.options.reduce((sum, o) => sum + o.voteCount, 0)).toBe(first.totalVotes);


      // A second vote MOVES the choice — the first option's count
      // comes back down, the total stays put
      const second = await h.transport.vote(id, ['opt-b']);
      expect(second.votedByMe).toBe(true);
      expect(second.options.find((o) => o.id === 'opt-a')?.votedByMe).toBe(false);
      expect(second.options.find((o) => o.id === 'opt-b')?.votedByMe).toBe(true);
      expect(second.options.find((o) => o.id === 'opt-a')?.voteCount).toBe(first.options.find((o) => o.id === 'opt-a')!.voteCount - 1);
      expect(second.options.reduce((sum, o) => sum + o.voteCount, 0)).toBe(second.totalVotes);
      expect(second.totalVotes).toBe(first.totalVotes);
    });

    it('refuses a vote on a closed poll', async () => {
      const id = await h.seedPoll(basePoll('p-closed', { closed: true }));
      await expect(h.transport.vote(id, ['opt-a'])).rejects.toBeDefined();
    });

    it('walks the relationship machine through its legal transitions', async () => {
      const t = h.transport;
      if (!t.setRelationship) return;


      // connect is the one fork: a request-style backend answers
      // 'outgoing', an instant-connect one answers 'connected'
      await h.setRelationship('u-walk', 'none');
      expect(['outgoing', 'connected']).toContain(await t.setRelationship('u-walk', 'connect'));


      if (h.supportsCancel !== false) {
        await h.setRelationship('u-cancel', 'outgoing');
        expect(await t.setRelationship('u-cancel', 'cancel')).toBe('none');
      }
      await h.setRelationship('u-accept', 'incoming');
      expect(await t.setRelationship('u-accept', 'accept')).toBe('connected');
      await h.setRelationship('u-off', 'connected');
      expect(await t.setRelationship('u-off', 'disconnect')).toBe('none');
    });

    it('pages the activity list without overlap across the cursor', async () => {
      const t = h.transport;
      if (!t.fetchNotifications) return;
      const seeded: string[] = [];
      for (let i = 0; i < 5; i++) seeded.push(await h.seedNotification(baseNotification({ createdAt: iso(i) })));


      // Walk every page; whatever the page size, ids must never
      // repeat and every seeded row must eventually arrive
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let round = 0; round < 10; round++) {
        const page = await t.fetchNotifications(cursor);
        for (const n of page.notifications) seen.push(n.id);
        if (!page.hasMore) break;
        expect(typeof page.cursor).toBe('string');
        cursor = page.cursor;
      }
      expect(new Set(seen).size).toBe(seen.length);
      for (const id of seeded) expect(seen).toContain(id);
    });

    it('marking read zeroes the unread probe', async () => {
      const t = h.transport;
      if (!t.markNotificationsRead || !t.fetchUnreadCount) return;
      await h.seedNotification(baseNotification({ read: false }));
      await h.seedNotification(baseNotification({ read: false, createdAt: iso(1) }));
      expect(await t.fetchUnreadCount()).toBeGreaterThan(0);
      await t.markNotificationsRead();
      expect(await t.fetchUnreadCount()).toBe(0);
    });
  });
}
