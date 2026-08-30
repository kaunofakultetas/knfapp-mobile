// -----------------------------------------------------------
//  [*] Tests — the fake transport against the conformance suite
//
//  The reference run: fakeSocialTransport must pass every check
//  an adapter author's backend is held to. The page size is
//  kept small so the activity-list walk really crosses the
//  cursor instead of fitting one page.
// -----------------------------------------------------------

import { fakeSocialTransport } from '../testing/fakeSocialTransport';
import { describeSocialContract } from '../testing/socialContract';


describeSocialContract('fakeSocialTransport', () => {
  const fake = fakeSocialTransport({ pageSize: 2 });
  return {
    transport: fake,
    seedPoll: async (poll) => {
      fake.polls[poll.id] = { ...poll, options: poll.options.map((o) => ({ ...o })) };
      return poll.id;
    },
    seedNotification: async (n) => fake.seedNotification(n).id,
    setRelationship: async (userId, state) => {
      fake.setRelationshipState(userId, state);
    },
  };
});
