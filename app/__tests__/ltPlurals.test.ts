// -----------------------------------------------------------
//  [*] Tests — Lithuanian plural resolution
//
//  The catalogs carry _one/_few/_other forms and i18next picks
//  them through Intl.PluralRules: Lithuanian needs one (1, 21,
//  31…), few (2–9, 22–29…) and other (10–20, 30, 110–119…) —
//  the collapse to English one/other was a register major.
//  Runs against the REAL shipped catalogs.
// -----------------------------------------------------------

import { createInstance } from 'i18next';

import en from '@/i18n/en.json';
import lt from '@/i18n/lt.json';


const makeT = async (lng: 'lt' | 'en') => {
  const instance = createInstance();
  await instance.init({
    lng,
    fallbackLng: 'lt',
    resources: { lt: { translation: lt }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return instance.t.bind(instance);
};


describe('Lithuanian plurals', () => {
  it('selects one / few / other by CLDR rules', async () => {
    const t = await makeT('lt');
    const at = (count: number) => t('tabs.messagesUnread', { count });

    expect(at(1)).toBe('1 neskaityta žinutė');
    expect(at(21)).toBe('21 neskaityta žinutė');

    expect(at(2)).toBe('2 neskaitytos žinutės');
    expect(at(9)).toBe('9 neskaitytos žinutės');
    expect(at(22)).toBe('22 neskaitytos žinutės');

    expect(at(10)).toBe('10 neskaitytų žinučių');
    expect(at(11)).toBe('11 neskaitytų žinučių');
    expect(at(17)).toBe('17 neskaitytų žinučių');
    expect(at(20)).toBe('20 neskaitytų žinučių');
    expect(at(111)).toBe('111 neskaitytų žinučių');
  });

  it('keeps every _few key paired with _one and _other in both catalogs', () => {
    const flat = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) =>
        typeof value === 'object' && value !== null
          ? flat(value as Record<string, unknown>, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );
    for (const [name, catalog] of [
      ['lt', lt],
      ['en', en],
    ] as const) {
      const keys = new Set(flat(catalog));
      for (const key of keys) {
        if (!key.endsWith('_few')) continue;
        const base = key.slice(0, -'_few'.length);
        expect(`${name}:${keys.has(`${base}_one`)}`).toBe(`${name}:true`);
        expect(`${name}:${keys.has(`${base}_other`)}`).toBe(`${name}:true`);
      }
    }
  });

  it('English keeps its own one/other pair', async () => {
    const t = await makeT('en');
    expect(t('tabs.messagesUnread', { count: 1 })).toBe('1 unread message');
    expect(t('tabs.messagesUnread', { count: 5 })).toBe('5 unread messages');
  });
});
