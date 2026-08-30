// -----------------------------------------------------------
//  [*] Tests — foldForSearch
//
//  Diacritics-insensitive search folding: Lithuanian letters
//  fold to their ASCII base, case is flattened, and plain
//  ASCII passes through untouched — so "Ciurlionis" finds
//  "Čiurlionis" in the conversation and room search.
// -----------------------------------------------------------

// services/format.ts imports i18n/index.ts, whose @formatjs
// polyfill imports only Metro can resolve
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'lt', t: (key: string) => key, changeLanguage: async () => {} },
  deviceLanguage: 'lt',
}));

import { foldForSearch } from '@/services/format';


describe('foldForSearch', () => {
  it('folds every Lithuanian diacritic to its ASCII base', () => {
    expect(foldForSearch('ąčęėįšųūž')).toBe('aceeisuuz');
    expect(foldForSearch('ĄČĘĖĮŠŲŪŽ')).toBe('aceeisuuz');
  });

  it('flattens case', () => {
    expect(foldForSearch('VeGa Auditorija')).toBe('vega auditorija');
  });

  it('makes folded queries match folded names', () => {
    expect(foldForSearch('Čiurlionis')).toBe(foldForSearch('ciurlionis'));
    expect(foldForSearch('Žinutė')).toBe(foldForSearch('zinute'));
  });

  it('passes plain ASCII through untouched', () => {
    expect(foldForSearch('hello world 123')).toBe('hello world 123');
  });

  it('handles the empty string', () => {
    expect(foldForSearch('')).toBe('');
  });
});
