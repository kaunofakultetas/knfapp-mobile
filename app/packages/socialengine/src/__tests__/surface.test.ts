// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine public surface
//
//  The package's exports, the transport's method roster and
//  the two error judgements, pinned. Adding is deliberate;
//  removing or renaming is a breaking change for every host
//  and adapter.
// -----------------------------------------------------------

import * as engine from '../index';


describe('@knf/socialengine surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(engine).sort()).toEqual(
      [
        'SocialEngineProvider',
        'createKnfSocialTransport',
        'createShadowStore', 'createSocialTaskQueue', 'memorySocialStorage', 'socialTaskKey',
        'createToggleQueue',
        'describeSocialContract',
        'fakeSocialTransport',
        'getToggleQueue',
        'groupNotifications',
        'isAuthError',
        'isPollExpired',
        'isRetryableError',
        'knfToPoll',
        'knfToSocialNotification',
        'mergePostShadow',
        'mergeRelationship',
        'pollLeaders',
        'pollPercent',
        'showPollResults',
        'useLikeToggle',
        'useNotifications',
        'usePoll',
        'useRelationship',
        'useSocialEngine',
        'useUnreadBadge',
      ].sort(),
    );
  });

  it('the like/poll core is mandatory; the fake carries the full optional half', () => {
    const t = engine.fakeSocialTransport();
    for (const m of ['setLiked', 'fetchPoll', 'vote'] as const) {
      expect(typeof t[m]).toBe('function');
    }
    for (const m of ['setRelationship', 'setBlocked', 'report', 'fetchNotifications', 'markNotificationsRead', 'fetchUnreadCount'] as const) {
      expect(typeof t[m]).toBe('function');
    }
  });

  it('the retry judgement: network shapes, 5xx, 429 and status 0 heal; a definitive 4xx does not', () => {
    const { isRetryableError } = engine;
    expect(isRetryableError(new TypeError('Network request failed'))).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ httpStatus: 500 })).toBe(true);
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 0 })).toBe(true);
    expect(isRetryableError({ code: 'network' })).toBe(true);
    expect(isRetryableError({ code: 'timeout' })).toBe(true);
    expect(isRetryableError({ status: 400 })).toBe(false);
    // A plain Error carries no transport shape — definitive
    expect(isRetryableError(new Error('boom'))).toBe(false);
  });

  it('the auth judgement: 401/403 in either status field, nothing else', () => {
    const { isAuthError } = engine;
    expect(isAuthError({ status: 401 })).toBe(true);
    expect(isAuthError({ httpStatus: 403 })).toBe(true);
    expect(isAuthError({ status: 400 })).toBe(false);
    expect(isAuthError({ status: 500 })).toBe(false);
    expect(isAuthError(new Error('boom'))).toBe(false);
  });
});
