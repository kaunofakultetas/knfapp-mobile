// -----------------------------------------------------------
//  [*] Tests — the error banner's sentence, as a table
//
//  One failure in, one sentence out (the translator is faked
//  to echo its key and params, so the choice is observable):
//  network, timeout and auth by code; the turn limit with and
//  without its wait, and the busy gateway apart from it; the
//  switched-off assistant apart from an outage; a vanished
//  thread and an oversized send apart from the generic server
//  fault — which is also what a mid-stream failure and a
//  missing failure read as. Waits round UP, seconds under a
//  minute, minutes from there.
// -----------------------------------------------------------

import type { TFunction } from 'i18next';

import type { AssistantFailure } from '@knf/assistantengine';

import { assistantErrorBody, formatWait } from '../errorCopy';


const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${Object.values(params).join(',')})` : key) as unknown as TFunction;


describe('assistantErrorBody', () => {
  it.each<[string, AssistantFailure | null, string]>([
    ['no failure in hand', null, 'assistant.errorServer'],
    ['the network', { code: 'network', message: 'Network request failed' }, 'assistant.errorNetwork'],
    ['the first-byte deadline', { code: 'timeout', message: 'x' }, 'assistant.errorTimeout'],
    ['an expired session', { code: 'auth', status: 401, serverCode: 'SESSION_INVALID', message: 'x' }, 'assistant.errorAuth'],
    ['the turn limit, no wait sent', { code: 'quota', status: 429, message: 'x' }, 'assistant.errorQuota'],
    ['the turn limit with its wait', { code: 'quota', status: 429, retryAfterMs: 12_000, serverCode: 'RATE_LIMITED', message: 'x' }, 'assistant.errorQuotaWait(assistant.waitSeconds(12))'],
    ['the busy gateway', { code: 'quota', status: 429, serverCode: 'GATEWAY_RATE_LIMITED', message: 'x' }, 'assistant.errorBusy'],
    ['the busy gateway with a wait', { code: 'quota', status: 429, retryAfterMs: 600_000, serverCode: 'GATEWAY_RATE_LIMITED', message: 'x' }, 'assistant.errorBusyWait(assistant.waitMinutes(10))'],
    ['an outage', { code: 'unavailable', status: 502, serverCode: 'GATEWAY_ERROR', message: 'x' }, 'assistant.errorUnavailable'],
    ['no active prompt', { code: 'unavailable', status: 503, serverCode: 'PROMPT_NOT_CONFIGURED', message: 'x' }, 'assistant.errorNotConfigured'],
    ['no gateway key', { code: 'unavailable', status: 503, serverCode: 'NOT_CONFIGURED', message: 'x' }, 'assistant.errorNotConfigured'],
    ['a vanished thread', { code: 'server', status: 404, serverCode: 'THREAD_NOT_FOUND', message: 'x' }, 'assistant.errorThreadGone'],
    ['a question too long', { code: 'server', status: 400, serverCode: 'INPUT_TOO_LARGE', message: 'x' }, 'assistant.errorTooLong'],
    ['a history too long', { code: 'server', status: 400, serverCode: 'TOO_MANY_MESSAGES', message: 'x' }, 'assistant.errorTooLong'],
    ['a body over the parser limit', { code: 'server', status: 413, serverCode: 'PAYLOAD_TOO_LARGE', message: 'x' }, 'assistant.errorTooLong'],
    ['any other 400', { code: 'server', status: 400, serverCode: 'INVALID_PART', message: 'x' }, 'assistant.errorServer'],
    ['a 500', { code: 'server', status: 500, message: 'x' }, 'assistant.errorServer'],
    ['a fault streamed mid-answer', { code: 'server', message: 'Atsiprašau…' }, 'assistant.errorServer'],
  ])('%s', (_label, failure, expected) => {
    expect(assistantErrorBody(failure, t)).toBe(expected);
  });
});


describe('formatWait', () => {
  it('rounds UP — seconds under a minute, minutes from there, never zero', () => {
    expect(formatWait(0, t)).toBe('assistant.waitSeconds(1)');
    expect(formatWait(1_200, t)).toBe('assistant.waitSeconds(2)');
    expect(formatWait(59_000, t)).toBe('assistant.waitSeconds(59)');
    expect(formatWait(60_000, t)).toBe('assistant.waitMinutes(1)');
    expect(formatWait(61_000, t)).toBe('assistant.waitMinutes(2)');
  });
});
