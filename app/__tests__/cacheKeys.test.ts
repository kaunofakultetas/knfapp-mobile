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
  cacheKeySchedule,
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

  it('keeps the unfiltered schedule variant apart from filtered ones', () => {
    expect(cacheKeySchedule(1)).toBe('schedule:1:*:*');
    expect(cacheKeySchedule(1, 'G1')).toBe('schedule:1:G1:*');
    expect(cacheKeySchedule(1, null, 'S2')).toBe('schedule:1:*:S2');
    expect(cacheKeySchedule(1, '', '')).toBe('schedule:1:*:*');
  });

  it('separates info pages per language and keeps the TTLs sane', () => {
    expect(cacheKeyInfo('lt')).not.toBe(cacheKeyInfo('en'));
    expect(CONVERSATIONS_CACHE_MAX_AGE).toBeLessThan(NEWS_CACHE_MAX_AGE);
    expect(NEWS_CACHE_MAX_AGE).toBeLessThan(SCHEDULE_CACHE_MAX_AGE);
    expect(INFO_CACHE_MAX_AGE).toBe(SCHEDULE_CACHE_MAX_AGE);
  });
});
