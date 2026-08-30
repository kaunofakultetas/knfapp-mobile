// -----------------------------------------------------------
//  [*] Tests — chatkit labels
//
//  useKitLabels is the kit's single i18n touchpoint: every
//  string the kit shows resolves through it. Both catalogs
//  are loaded WITHOUT cross-language fallback, so a renamed
//  or missing chat.* / common.* key fails here instead of
//  putting a literal key on screen.
// -----------------------------------------------------------

import { renderHook } from '@testing-library/react-native';
import i18next from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { useKitLabels, type KitLabels } from '@/chatkit/labels';
import en from '@/i18n/en.json';
import lt from '@/i18n/lt.json';


// A missing key comes back as the key itself — that is the
// failure shape every assertion below is hunting
const RAW_KEY_RE = /^(chat|common)\./;

async function labelsFor(lng: 'lt' | 'en'): Promise<KitLabels> {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: { lt: { translation: lt }, en: { translation: en } },
    lng,
    // No borrowing across catalogs — a key missing in THIS
    // language must surface here, not fall back to the other
    fallbackLng: false,
    interpolation: { escapeValue: false },
    initImmediate: false,
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={instance}>{children}</I18nextProvider>
  );
  const { result } = await renderHook(() => useKitLabels(), { wrapper });
  return result.current;
}


describe.each(['lt', 'en'] as const)('useKitLabels — %s catalog', (lng) => {

  it('resolves every label', async () => {
    const labels = await labelsFor(lng);
    for (const [name, label] of Object.entries(labels)) {
      const value =
        name === 'replyingTo' ? (label as (name: string) => string)('Vardenis')
        : name === 'newMessages' ? (label as (count: number) => string)(5)
        : (label as string);
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toMatch(RAW_KEY_RE);
    }
  });


  it('interpolates the reply-target name', async () => {
    expect((await labelsFor(lng)).replyingTo('Vardenis')).toContain('Vardenis');
  });


  it('resolves every plural form of the missed-message badge', async () => {
    const { newMessages } = await labelsFor(lng);
    // 1 → one, 2/5 → few (lt), 10 → other, 21 → one again (lt)
    for (const count of [1, 2, 5, 10, 21]) {
      const label = newMessages(count);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(RAW_KEY_RE);
    }
  });

});
