// -----------------------------------------------------------
//  [*] Tests — @knf/chatengine public surface
//
//  The package's exports and the transport contract's method
//  list, pinned. Adding is deliberate; removing or renaming is
//  a breaking change for every host and adapter.
// -----------------------------------------------------------

import * as engine from '@knf/chatengine';
import * as knf from '@knf/chatengine/adapters/knf';


describe('@knf/chatengine surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(engine).sort()).toEqual(
      [
        'ChatEngineProvider',
        'DEFAULT_REACTION_OPTIONS',
        'TEMP_ID_PREFIX',
        'TransportError',
        'adoptTemp',
        'appendOlderPage',
        'applyReceipt',
        'clearActiveConversation',
        'defaultLimits',
        'describeTransportContract',
        'draftKey',
        'fakeTransport',
        'findTempFor',
        'getActiveConversation',
        'isRetryable',
        'isTempId',
        'markDeleted',
        'markEdited',
        'memoryStorage',
        'mergeFirstPage',
        'mergeResyncPage',
        'normalizeForViewer',
        'olderCursor',
        'outboxKey',
        'parseStamp',
        'reactionsForViewer',
        'readOutbox',
        'readOutboxTemps',
        'restoreDeleted',
        'sendFailureCode',
        'setActiveConversation',
        'stampMs',
        'toTransportError',
        'useChatEngine',
        'useChatRoom',
        'useComposer',
        'useConversation',
        'useReactions',
        'useTyping',
        'withSelfReaction',
        'writeOutbox',
      ].sort(),
    );
  });

  it('the KNF adapter exports its factories and mappers', () => {
    expect(Object.keys(knf).sort()).toEqual(
      ['createKnfRealtime', 'createKnfRest', 'createKnfSocket', 'createKnfTransport', 'mapContent', 'mapReply', 'toChatMessage', 'toConversationMeta', 'toMessagesPage', 'toParticipant', 'toReactionGroups'].sort(),
    );
  });

  it('a ChatTransport carries these methods and nothing is optional', () => {
    const t = engine.fakeTransport();
    expect(Object.keys(t.realtime).sort()).toEqual(['connect', 'join', 'markRead', 'onStatus', 'status', 'subscribe', 'typing']);
    for (const m of ['fetchMessages', 'sendMessage', 'editMessage', 'deleteMessage', 'setReaction', 'removeReaction', 'markRead', 'upload'] as const) {
      expect(typeof t[m]).toBe('function');
    }
  });

  it('notice codes and limits are the documented set', () => {
    expect(engine.defaultLimits).toEqual({ maxMessageLength: 5000, maxUploadBytes: 5 * 1024 * 1024, maxVideoBytes: 50 * 1024 * 1024, maxVideoSeconds: 180 });
    expect(engine.sendFailureCode(new engine.TransportError('x', 'http', 413))).toBe('send_too_long');
    expect(engine.sendFailureCode(new engine.TransportError('x', 'http', 401))).toBe('session_expired');
    expect(engine.sendFailureCode(new engine.TransportError('x', 'http', 403))).toBe('send_forbidden');
    expect(engine.sendFailureCode(new engine.TransportError('x', 'timeout'))).toBe('timeout');
    expect(engine.sendFailureCode(new Error('boom'))).toBe('send_failed');
  });

  it('the retry policy: transport failures, 5xx and 429 heal; a 4xx does not', () => {
    const { isRetryable, TransportError, toTransportError } = engine;
    expect(isRetryable(new TransportError('x', 'network'))).toBe(true);
    expect(isRetryable(new TransportError('x', 'timeout'))).toBe(true);
    expect(isRetryable(new TransportError('x', 'http', 503))).toBe(true);
    expect(isRetryable(new TransportError('x', 'http', 429))).toBe(true);
    expect(isRetryable(new TransportError('x', 'http', 400))).toBe(false);
    expect(isRetryable(new Error('plain'))).toBe(true);
    // Duck-typed: the app's ApiError shape reads straight through
    const e = toTransportError({ message: 'Too large', status: 413, code: 'http', serverCode: 'file_too_large' });
    expect(e).toMatchObject({ kind: 'http', status: 413, serverCode: 'file_too_large' });
    expect(toTransportError({ code: 'timeout' }).kind).toBe('timeout');
  });
});
