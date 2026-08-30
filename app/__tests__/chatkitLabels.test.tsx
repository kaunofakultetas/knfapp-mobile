// -----------------------------------------------------------
//  [*] Tests — chatkit labels (both halves of the contract)
//
//  The app's useChatKitLabels must resolve every KitLabels
//  field from BOTH catalogs to a real string (never a raw key),
//  and the kit's own defaultLabels must be complete in both
//  shipped languages — the guarantee that the kit renders with
//  no host catalog at all.
// -----------------------------------------------------------

import { renderHook } from '@testing-library/react-native';
import i18next from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { defaultLabels, type KitLabels } from '@knf/chatkit';

import useChatKitLabels from '@/hooks/chat/useChatKitLabels';
import en from '@/i18n/en.json';
import lt from '@/i18n/lt.json';


const RAW_KEY_RE = /^(chat|common)\./;


function walk(labels: KitLabels): [string, string][] {
  return Object.entries(labels).map(([name, label]) => [
    name,
    name === 'replyingTo'
      ? (label as (name: string) => string)('Vardenis')
      : name === 'newMessages'
        ? (label as (count: number) => string)(5)
        : (label as string),
  ]);
}


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
  const { result } = await renderHook(() => useChatKitLabels(), { wrapper });
  return result.current;
}


describe.each(['lt', 'en'] as const)('useChatKitLabels — %s catalog', (lng) => {
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
