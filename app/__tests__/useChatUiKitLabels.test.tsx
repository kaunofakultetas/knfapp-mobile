// -----------------------------------------------------------
//  [*] Tests — chatuikit labels (both halves of the contract)
//
//  The app's useChatUiKitLabels must resolve every KitLabels
//  field from BOTH catalogs to a real string (never a raw key),
//  and the kit's own defaultLabels must be complete in both
//  shipped languages — the guarantee that the kit renders with
//  no host catalog at all.
// -----------------------------------------------------------

import { renderHook } from '@testing-library/react-native';
import i18next from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { defaultLabels, type KitLabels } from '@knf/chatuikit';

import useChatUiKitLabels from '@/hooks/chat/useChatUiKitLabels';
import en from '@/i18n/en.json';
import lt from '@/i18n/lt.json';


// A label that came back as its own catalog key — a miss
const RAW_KEY_RE = /^(chat|common)\./;







// -----------------------------------------------------------
// walk
// -----------------------------------------------------------
//
// Every label as the string it renders — the counted and
// named ones called with sample arguments.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function walk(labels: KitLabels): [string, string][] {
  return Object.entries(labels).map(([name, label]) => [
    name,
    name === 'replyingTo' || name === 'mentionUser'
      ? (label as (name: string) => string)('Vardenis')
      : name === 'newMessages' || name === 'gallery'
        ? (label as (count: number) => string)(5)
        : name === 'systemMessage'
          ? ((label as KitLabels['systemMessage'])({ event: 'left' }, 'Vardenis') ?? '')
          : (label as string),
  ]);
}







// -----------------------------------------------------------
// labelsFor
// -----------------------------------------------------------
//
// The app's labels hook resolved against one language of the
// real catalogs.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function labelsFor(lng: 'lt' | 'en'): Promise<KitLabels> {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: { lt: { translation: lt }, en: { translation: en } },
    lng,
    fallbackLng: false,
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={instance}>{children}</I18nextProvider>
  );
  const { result } = await renderHook(() => useChatUiKitLabels(), { wrapper });
  return result.current;
}


describe.each(['lt', 'en'] as const)('useChatUiKitLabels — %s catalog', (lng) => {
  it('resolves every label to a real string', async () => {
    for (const [, value] of walk(await labelsFor(lng))) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toMatch(RAW_KEY_RE);
    }
  });

  it('interpolates the reply-target name', async () => {
    expect((await labelsFor(lng)).replyingTo('Vardenis')).toContain('Vardenis');
  });

  it('resolves every plural form of the missed-message badge', async () => {
    const labels = await labelsFor(lng);
    for (const count of [1, 2, 5, 11, 21, 100]) {
      const text = labels.newMessages(count);
      expect(text).toContain(String(count));
      expect(text).not.toMatch(RAW_KEY_RE);
    }
  });
});


describe.each(['lt', 'en'] as const)('kit defaultLabels — %s', (lng) => {
  it('covers every field the app mapping covers', async () => {
    const appKeys = Object.keys(await labelsFor(lng)).sort();
    expect(Object.keys(defaultLabels[lng]).sort()).toEqual(appKeys);
  });

  it('is complete and pluralises the badge', () => {
    for (const [, value] of walk(defaultLabels[lng])) {
      expect(value.length).toBeGreaterThan(0);
    }
    expect(defaultLabels[lng].newMessages(1)).toContain('1');
    expect(defaultLabels[lng].newMessages(21)).toContain('21');
  });
});


// KNF-126: every room event the backend narrates reads in the
// catalog's language, with counted window units — never the
// stored Lithuanian prose on an English screen
describe.each(['lt', 'en'] as const)('system events — %s catalog', (lng) => {
  it('words every event the backend emits', async () => {
    const labels = await labelsFor(lng);
    const lines = [
      labels.systemMessage({ event: 'group_created', title: 'KNF' }, 'Ona'),
      labels.systemMessage({ event: 'left' }, 'Ona'),
      labels.systemMessage({ event: 'ttl_on', seconds: 3600 }, 'Ona'),
      labels.systemMessage({ event: 'ttl_off' }, 'Ona'),
    ];
    for (const line of lines) {
      expect(line).toContain('Ona');
      expect(line).not.toMatch(RAW_KEY_RE);
    }
    expect(lines[0]).toContain('KNF');
  });

  it('counts the window in the largest exact unit, in every plural form', async () => {
    const labels = await labelsFor(lng);
    const window = (seconds: number) => labels.systemMessage({ event: 'ttl_on', seconds }, 'Ona') ?? '';
    const expected = lng === 'lt'
      ? { 604800: '7 dienos', 86400: '1 diena', 3600: '1 valanda', 7200: '2 valandos', 43200: '12 valandų', 5400: '90 minučių', 60: '1 minutė' }
      : { 604800: '7 days', 86400: '1 day', 3600: '1 hour', 7200: '2 hours', 43200: '12 hours', 5400: '90 minutes', 60: '1 minute' };
    for (const [seconds, words] of Object.entries(expected)) expect(window(Number(seconds))).toContain(words);
  });

  it('an unknown event answers null, so the stored text shows', async () => {
    const labels = await labelsFor(lng);
    expect(labels.systemMessage({ event: 'renamed' }, 'Ona')).toBeNull();
    expect(labels.systemMessage({ event: 'group_created' }, 'Ona')).toBeNull();
  });
});
