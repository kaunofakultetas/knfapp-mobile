// -----------------------------------------------------------
//  [*] Tests — the foreground presentation decision
//
//  The handler answers "show it?" from a policy map, and every
//  guarantee is pinned exactly: rule lookup with the default
//  fallback, suppression that silences surfaces but never the
//  badge, a throwing suppress predicate applying the rule
//  unchanged, SHOW-EVERYTHING when the decision itself blows
//  up, single settlement, and per-type isolation.
// -----------------------------------------------------------

import { createForegroundHandler } from '../presentation';
import type { PresentationPolicy, PresentationRule } from '../types';

const CHAT_RULE: PresentationRule = { banner: false, list: true, sound: false, badge: true };
const NEWS_RULE: PresentationRule = { banner: true, list: true, sound: true, badge: false };
const DEFAULT_RULE: PresentationRule = { banner: true, list: false, sound: false, badge: true };

const policyOf = (extra: Partial<PresentationPolicy> = {}): PresentationPolicy => ({
  rules: { chat_message: CHAT_RULE, news: NEWS_RULE },
  default: DEFAULT_RULE,
  ...extra,
});

const CHAT_PAYLOAD = { type: 'chat_message', data: { conversationId: 'c1' } };
const NEWS_PAYLOAD = { type: 'news', data: { postId: 'n1' } };

afterEach(() => {
  jest.useRealTimers();
});

describe('rule lookup', () => {
  it('resolves the rule keyed by the payload type, exactly', async () => {
    const handler = createForegroundHandler(policyOf());
    await expect(handler(CHAT_PAYLOAD)).resolves.toEqual({
      banner: false, list: true, sound: false, badge: true,
    });
  });

  it('an unknown type falls to the default rule, exactly', async () => {
    const handler = createForegroundHandler(policyOf());
    await expect(handler({ type: 'never_configured', data: {} })).resolves.toEqual({
      banner: true, list: false, sound: false, badge: true,
    });
  });
});

describe('suppression', () => {
  it('suppress=true silences banner/list/sound but the badge follows the rule', async () => {
    const suppressCalls: [string, Record<string, string>][] = [];
    const handler = createForegroundHandler(policyOf({
      suppress: (type, data) => {
        suppressCalls.push([type, data]);
        return true;
      },
    }));
    // CHAT_RULE carries badge:true → the badge survives suppression
    await expect(handler(CHAT_PAYLOAD)).resolves.toEqual({
      banner: false, list: false, sound: false, badge: true,
    });
    // NEWS_RULE carries badge:false → suppression yields all-false
    await expect(handler(NEWS_PAYLOAD)).resolves.toEqual({
      banner: false, list: false, sound: false, badge: false,
    });
    expect(suppressCalls).toEqual([
      ['chat_message', { conversationId: 'c1' }],
      ['news', { postId: 'n1' }],
    ]);
  });

  it('a THROWING suppress predicate applies the rule unchanged', async () => {
    const suppressCalls: [string, Record<string, string>][] = [];
    const handler = createForegroundHandler(policyOf({
      suppress: (type, data) => {
        suppressCalls.push([type, data]);
        throw new Error('is-this-room-open check crashed');
      },
    }));
    await expect(handler(CHAT_PAYLOAD)).resolves.toEqual({
      banner: false, list: true, sound: false, badge: true,
    });
    expect(suppressCalls).toEqual([['chat_message', { conversationId: 'c1' }]]);
  });
});

describe('the deadline rail', () => {
  it('a normal decision resolves promptly — no deadline needed', async () => {
    jest.useFakeTimers();
    const handler = createForegroundHandler(policyOf());
    let resolved: PresentationRule | null = null;
    handler(CHAT_PAYLOAD).then((rule) => {
      resolved = rule;
    });
    // Zero-advance only flushes microtasks; the answer must not
    // be waiting on the internal deadline
    await jest.advanceTimersByTimeAsync(0);
    expect(resolved).toEqual({ banner: false, list: true, sound: false, badge: true });
  });

  it('decide() blowing up at the top level resolves SHOW-EVERYTHING', async () => {
    jest.useFakeTimers();
    // An OWN rule whose read throws — the lookup passes the
    // own-property gate and detonates inside decide()
    const poisonedRules = {} as Record<string, PresentationRule>;
    Object.defineProperty(poisonedRules, CHAT_PAYLOAD.type, {
      enumerable: true,
      get: () => {
        throw new Error('rules table poisoned');
      },
    });
    const handler = createForegroundHandler({ rules: poisonedRules, default: DEFAULT_RULE });
    let resolved: PresentationRule | null = null;
    handler(CHAT_PAYLOAD).then((rule) => {
      resolved = rule;
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(resolved).toEqual({ banner: true, list: true, sound: true, badge: true });
  });
});

describe('single settlement', () => {
  it('settles exactly once — the deadline never fires a second answer', async () => {
    jest.useFakeTimers();
    const handler = createForegroundHandler(policyOf());
    const resolutions: PresentationRule[] = [];
    handler(CHAT_PAYLOAD).then((rule) => {
      resolutions.push(rule);
    });
    // Flush the prompt answer, then push time far past the
    // internal deadline so a live timer would get its chance
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(resolutions).toEqual([{ banner: false, list: true, sound: false, badge: true }]);
  });
});

describe('per-type isolation', () => {
  it('one handler resolves each type its OWN rule — no cross-contamination', async () => {
    const handler = createForegroundHandler(policyOf());
    await expect(handler(CHAT_PAYLOAD)).resolves.toEqual({
      banner: false, list: true, sound: false, badge: true,
    });
    await expect(handler(NEWS_PAYLOAD)).resolves.toEqual({
      banner: true, list: true, sound: true, badge: false,
    });
    // And the earlier decision left the later one untouched
    await expect(handler(CHAT_PAYLOAD)).resolves.toEqual({
      banner: false, list: true, sound: false, badge: true,
    });
  });
});
