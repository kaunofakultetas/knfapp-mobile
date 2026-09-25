// -----------------------------------------------------------
//  [*] Tests — the shipping flags
//
//  Pins the flag table's shape (every module key present and
//  boolean — a typo in features.json must fail here, not gate
//  nothing in production), that every tab key has a gate
//  entry, and that ENABLED_TABS really drops a disabled
//  module's tab while keeping the order of the rest.
// -----------------------------------------------------------

import { TABS } from '@/constants/tabs';
import { DEFAULT_PINNED_TABS, ENABLED_TAB_KEYS, FEATURES, TAB_FEATURES, isFeatureEnabled } from '@/services/features';

describe('the shipping flags', () => {
  it('the JSON carries exactly the module keys, all boolean', () => {
    const keys = Object.keys(FEATURES).sort();
    expect(keys).toEqual(['accounts', 'assistant', 'chat', 'map', 'news', 'schedule', 'social', 'studentId']);
    for (const value of Object.values(FEATURES)) {
      expect(typeof value).toBe('boolean');
    }
  });

  it('every tab key has a gate entry — a new tab cannot ship ungated by accident', () => {
    for (const tab of TABS) {
      expect(TAB_FEATURES).toHaveProperty(tab.key);
    }
  });

  it('account-dependent modules never ship without accounts', () => {
    // The invariant a release config must hold: chat, social and
    // the student ID presuppose a signed-in user — this failing
    // means features.json describes an impossible build
    if (!FEATURES.accounts) {
      expect(FEATURES.chat).toBe(false);
      expect(FEATURES.social).toBe(false);
      expect(FEATURES.studentId).toBe(false);
    }
  });

  it('isFeatureEnabled reads the table verbatim', () => {
    expect(isFeatureEnabled('chat')).toBe(FEATURES.chat);
    expect(isFeatureEnabled('studentId')).toBe(FEATURES.studentId);
  });

  it('a disabled module drops its tab from ENABLED_TABS, order preserved', () => {
    jest.isolateModules(() => {
      jest.doMock('../features.json', () => ({
        news: true, chat: false, social: true, schedule: true,
        assistant: false, studentId: true, map: true,
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a fresh graph
      const fresh = require('@/services/features') as typeof import('@/services/features');
      const keys = fresh.ENABLED_TABS.map((tab: { key: string }) => tab.key);
      expect(keys).toEqual(['news', 'schedule', 'id', 'map', 'settings']);
    });
  });

  it('every default pinned tab is a module this build ships (KNF-171)', () => {
    expect(DEFAULT_PINNED_TABS.length).toBeGreaterThan(0);
    for (const key of DEFAULT_PINNED_TABS) {
      expect(ENABLED_TAB_KEYS.has(key)).toBe(true);
    }
  });

  it('the default pins follow the flags: a module switched on joins them, one switched off leaves', () => {
    jest.isolateModules(() => {
      jest.doMock('../features.json', () => ({
        accounts: true, news: true, chat: true, social: true, schedule: false,
        assistant: true, studentId: true, map: false,
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a fresh graph
      const fresh = require('@/services/features') as typeof import('@/services/features');
      expect(fresh.DEFAULT_PINNED_TABS).toEqual(['news', 'messages', 'id']);
    });
  });
});
