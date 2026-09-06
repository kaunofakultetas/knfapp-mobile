// -----------------------------------------------------------
//  [*] Tests — the failure mapping, pinned as a table
//
//  Every way the wire can break, folded into one typed value:
//  the status table (401/403 auth, 429 quota, 502-504
//  unavailable, the rest server), Retry-After in both grammars
//  with a pinned clock, the server's own words winning over
//  the status text and the status text over the fixed
//  fallback, the one body read that never throws, and the
//  thrown side — a cancel by NAME or by signal, our deadline
//  by name, everything else the network. Presence of `status`
//  and `retryAfterMs` is asserted by exact shape: a screen
//  keys on them, an extra undefined key would still be a key.
// -----------------------------------------------------------

import { isAssistantTransportError, parseRetryAfter, readFailureBody, toAssistantFailure } from '../errors';
import { AssistantTransportError, type AssistantFailure } from '../types';


// A hand-made response: the three fields the mapping reads
const response = (status: number, options: { statusText?: string; headers?: Record<string, string> } = {}) => ({
  status,
  ...(options.statusText !== undefined ? { statusText: options.statusText } : {}),
  headers: new Headers(options.headers),
});

// A fixed clock for the HTTP-date grammar: 2026-09-05 12:00:00 UTC
const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);


describe('AssistantTransportError', () => {
  it('carries the failure, takes its message from it, names itself and keeps the cause', () => {
    const failure: AssistantFailure = { code: 'auth', status: 401, message: 'expired' };
    const cause = new Error('wire');
    const error = new AssistantTransportError(failure, { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AssistantTransportError');
    expect(error.message).toBe('expired');
    expect(error.failure).toBe(failure);
    expect(error.cause).toBe(cause);
  });
});


describe('isAssistantTransportError', () => {
  it('recognises an instance', () => {
    expect(isAssistantTransportError(new AssistantTransportError({ code: 'server', message: 'x' }))).toBe(true);
  });

  it('recognises the duck-typed shape from a second copy of the class', () => {
    const foreign = Object.assign(new Error('x'), { name: 'AssistantTransportError', failure: { code: 'quota', message: 'x' } });
    expect(isAssistantTransportError(foreign)).toBe(true);
  });

  it.each([
    ['a plain Error', new Error('x')],
    ['the name without a failure', Object.assign(new Error('x'), { name: 'AssistantTransportError' })],
    ['a failure whose code is not a string', Object.assign(new Error('x'), { name: 'AssistantTransportError', failure: { code: 7 } })],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'AssistantTransportError'],
  ])('rejects %s', (_label, value) => {
    expect(isAssistantTransportError(value)).toBe(false);
  });
});


describe('parseRetryAfter', () => {
  it.each([
    ['30', 30_000],
    ['0', 0],
    ['2.5', 2_500],
    [' 7 ', 7_000],
    ['Sat, 05 Sep 2026 12:00:30 GMT', 30_000],
    ['Sat, 05 Sep 2026 11:59:00 GMT', 0],
  ])('%s → %s ms', (value, expected) => {
    expect(parseRetryAfter(value, NOW)).toBe(expected);
  });

  it.each([
    ['soon', 'soon'],
    ['an empty string', ''],
    ['blank', '   '],
    ['null', null],
    ['undefined', undefined],
  ])('%s → undefined', (_label, value) => {
    expect(parseRetryAfter(value, NOW)).toBeUndefined();
  });

  it('defaults its clock to now — a date a minute out answers about a minute', () => {
    const inAMinute = new Date(Date.now() + 60_000).toUTCString();
    const ms = parseRetryAfter(inAMinute);
    expect(ms).toBeGreaterThan(55_000);
    expect(ms).toBeLessThanOrEqual(60_000);
  });
});


describe('readFailureBody', () => {
  it('parses a JSON body', async () => {
    await expect(readFailureBody(new Response('{"error":"expired"}', { status: 401 }))).resolves.toEqual({ error: 'expired' });
  });

  it('hands back plain text when the body is not JSON', async () => {
    await expect(readFailureBody(new Response('Bad Gateway', { status: 502 }))).resolves.toBe('Bad Gateway');
  });

  it('answers an empty string for an empty body', async () => {
    await expect(readFailureBody(new Response(null, { status: 500 }))).resolves.toBe('');
  });

  it('answers an empty string when the body cannot be read — never throws', async () => {
    const broken = { text: () => Promise.reject(new Error('already consumed')) } as unknown as Response;
    await expect(readFailureBody(broken)).resolves.toBe('');
  });

  it('reads the body exactly once', async () => {
    let reads = 0;
    const counting = {
      text: async () => {
        reads += 1;
        return '{"message":"x"}';
      },
    } as unknown as Response;
    await readFailureBody(counting);
    expect(reads).toBe(1);
  });
});


describe('toAssistantFailure — the status table', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'quota'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [504, 'unavailable'],
    [400, 'server'],
    [404, 'server'],
    [413, 'server'],
    [500, 'server'],
    [501, 'server'],
  ])('%s → %s, status carried', (status, code) => {
    expect(toAssistantFailure(response(status, { statusText: 'Status Text' }))).toEqual({ code, status, message: 'Status Text' });
  });

  it('429 carries retryAfterMs from delay-seconds', () => {
    expect(toAssistantFailure(response(429, { statusText: 'Too Many Requests', headers: { 'retry-after': '30' } })))
      .toEqual({ code: 'quota', status: 429, retryAfterMs: 30_000, message: 'Too Many Requests' });
  });

  it('429 without Retry-After has NO retryAfterMs key at all', () => {
    const failure = toAssistantFailure(response(429, { statusText: 'Too Many Requests' }));
    expect(failure).toEqual({ code: 'quota', status: 429, message: 'Too Many Requests' });
    expect(Object.keys(failure)).not.toContain('retryAfterMs');
  });

  it('503 carries retryAfterMs from an HTTP-date', () => {
    const inTenSeconds = new Date(Date.now() + 10_000).toUTCString();
    const failure = toAssistantFailure(response(503, { statusText: 'Service Unavailable', headers: { 'retry-after': inTenSeconds } }));
    expect(failure.code).toBe('unavailable');
    expect(failure.retryAfterMs).toBeGreaterThan(5_000);
    expect(failure.retryAfterMs).toBeLessThanOrEqual(10_000);
  });

  it('a Retry-After on a server status is ignored — only quota and unavailable retry', () => {
    expect(toAssistantFailure(response(500, { statusText: 'Internal', headers: { 'retry-after': '5' } })))
      .toEqual({ code: 'server', status: 500, message: 'Internal' });
  });

  it('an unparseable Retry-After leaves the key out', () => {
    expect(toAssistantFailure(response(429, { statusText: 'Too Many Requests', headers: { 'retry-after': 'later' } })))
      .toEqual({ code: 'quota', status: 429, message: 'Too Many Requests' });
  });
});


describe('toAssistantFailure — the message', () => {
  it.each([
    ['`error` string', { error: 'expired' }, 'expired'],
    ['`message` string', { message: 'too long' }, 'too long'],
    ['`error.message`', { error: { message: 'nested' } }, 'nested'],
    ['`error` over `message`', { error: 'first', message: 'second' }, 'first'],
  ])('the server\'s %s wins over the status text', (_label, body, expected) => {
    expect(toAssistantFailure(response(400, { statusText: 'Bad Request' }), body).message).toBe(expected);
  });

  it.each([
    ['an empty `error`', { error: '' }],
    ['a numeric `error`', { error: 42 }],
    ['a text body', 'plain text'],
    ['an empty body', ''],
    ['no body', undefined],
    ['a null body', null],
    ['an array body', ['x']],
  ])('%s falls back to the status text', (_label, body) => {
    expect(toAssistantFailure(response(500, { statusText: 'Internal Server Error' }), body).message).toBe('Internal Server Error');
  });

  it('with neither body words nor status text the message is HTTP <status>', () => {
    expect(toAssistantFailure(response(500), '').message).toBe('HTTP 500');
    expect(toAssistantFailure(response(502, { statusText: '' })).message).toBe('HTTP 502');
  });

  it('a real Response maps the same way as the hand-made shape', () => {
    const real = new Response('{"error":"quota"}', { status: 429, headers: { 'retry-after': '2' } });
    expect(toAssistantFailure(real, { error: 'quota' })).toEqual({ code: 'quota', status: 429, retryAfterMs: 2_000, message: 'quota' });
  });
});


describe('toAssistantFailure — the thrown side', () => {
  it('an AbortError by name is a cancel, with its own words', () => {
    expect(toAssistantFailure(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })))
      .toEqual({ code: 'aborted', message: 'The user aborted a request.' });
  });

  it('an aborted-signal shape is a cancel with the fixed words', () => {
    expect(toAssistantFailure({ aborted: true })).toEqual({ code: 'aborted', message: 'Request aborted' });
  });

  it('a TimeoutError by name is our deadline', () => {
    expect(toAssistantFailure(Object.assign(new Error('No response headers within 30000 ms'), { name: 'TimeoutError' })))
      .toEqual({ code: 'timeout', message: 'No response headers within 30000 ms' });
    expect(toAssistantFailure(Object.assign(new Error(''), { name: 'TimeoutError' })))
      .toEqual({ code: 'timeout', message: 'No response headers in time' });
  });

  it('a TypeError is the network, with its message', () => {
    expect(toAssistantFailure(new TypeError('Network request failed'))).toEqual({ code: 'network', message: 'Network request failed' });
  });

  it.each([
    ['a bare Error with no message', new Error('')],
    ['a string', 'boom'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 7],
  ])('%s is the network with the fixed words', (_label, thrown) => {
    expect(toAssistantFailure(thrown)).toEqual({ code: 'network', message: 'Network request failed' });
  });

  it('an object carrying a message but no name is the network with that message', () => {
    expect(toAssistantFailure({ message: 'socket hang up' })).toEqual({ code: 'network', message: 'socket hang up' });
  });

  it('an AssistantTransportError passes its own failure through, the same object', () => {
    const failure: AssistantFailure = { code: 'quota', status: 429, retryAfterMs: 1_000, message: 'slow down' };
    expect(toAssistantFailure(new AssistantTransportError(failure))).toBe(failure);
  });

  it('the thrown side never carries a status key', () => {
    expect(Object.keys(toAssistantFailure(new TypeError('x')))).toEqual(['code', 'message']);
  });
});
