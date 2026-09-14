// -----------------------------------------------------------
//  [*] Tests — the app's cache key vocabulary
//
//  Per-account scoping and the '*' placeholders that keep
//  filtered and unfiltered schedule variants apart. Storage
//  behaviour itself is @knf/dataengine's, tested there.
// -----------------------------------------------------------

import {
  cacheKeyConversations,
  cacheKeyInfo,
  cacheKeyNews,
  cacheKeyScheduleEvents,
  CONVERSATIONS_CACHE_MAX_AGE,
  INFO_CACHE_MAX_AGE,
  NEWS_CACHE_MAX_AGE,
  SCHEDULE_CACHE_MAX_AGE,
} from '@/services/cacheKeys';


describe('cache keys', () => {
  it('scopes private feeds per account, guests included', () => {
    expect(cacheKeyNews('u1')).toBe('news:feed:u1');
    expect(cacheKeyNews('guest')).toBe('news:feed:guest');
    expect(cacheKeyConversations('u1')).toBe('conversations:list:u1');
    expect(cacheKeyNews('u1')).not.toBe(cacheKeyNews('u2'));
  });

  it('keeps the all-groups schedule variants apart from filtered ones', () => {
    expect(cacheKeyScheduleEvents('2026-09-14')).toBe('schedule:events:2026-09-14:*');
    expect(cacheKeyScheduleEvents('2026-09-14', 'G1')).toBe('schedule:events:2026-09-14:G1');
    expect(cacheKeyScheduleEvents('2026-09-14', '')).toBe('schedule:events:2026-09-14:*');
  });

  it("prefixes the teacher scope with 't:' so a teacher's rows never collide with a group's", () => {
    expect(cacheKeyScheduleEvents('2026-09-14', null, 'Eimantas Rebždys, Lekt.')).toBe(
      'schedule:events:2026-09-14:t:Eimantas Rebždys, Lekt.',
    );
    // The teacher scope wins whatever the group argument holds
    // — the loader never sets both
    expect(cacheKeyScheduleEvents('2026-09-14', 'G1', 'A. Petraitis')).toBe(
      'schedule:events:2026-09-14:t:A. Petraitis',
    );
  });

  it('separates info pages per language and keeps the TTLs sane', () => {
    expect(cacheKeyInfo('lt')).not.toBe(cacheKeyInfo('en'));
    expect(CONVERSATIONS_CACHE_MAX_AGE).toBeLessThan(NEWS_CACHE_MAX_AGE);
    expect(NEWS_CACHE_MAX_AGE).toBeLessThan(SCHEDULE_CACHE_MAX_AGE);
    expect(INFO_CACHE_MAX_AGE).toBe(SCHEDULE_CACHE_MAX_AGE);
  });
});
