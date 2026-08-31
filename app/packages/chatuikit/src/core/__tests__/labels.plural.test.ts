// -----------------------------------------------------------
//  [*] Tests — Lithuanian plural boundaries, pinned
//
//  The teens rule is the one every i18n layer gets wrong at
//  least once: 11–19 take the "other" form even when the last
//  digit says "one" or "few". Pinned across the shipped
//  count labels so a refactor of ltPlural cannot regress it.
// -----------------------------------------------------------

import { defaultLabels } from '../../provider/labels';

const lt = defaultLabels.lt;

describe('Lithuanian plurals', () => {
  it('walks the classic boundaries for the badge label', () => {
    expect(lt.newMessages(1)).toBe('1 nauja žinutė');
    expect(lt.newMessages(2)).toBe('2 naujos žinutės');
    expect(lt.newMessages(10)).toBe('10 naujų žinučių');
    expect(lt.newMessages(11)).toBe('11 naujų žinučių');
    expect(lt.newMessages(19)).toBe('19 naujų žinučių');
    expect(lt.newMessages(21)).toBe('21 nauja žinutė');
    expect(lt.newMessages(22)).toBe('22 naujos žinutės');
    expect(lt.newMessages(101)).toBe('101 nauja žinutė');
    expect(lt.newMessages(111)).toBe('111 naujų žinučių');
  });

  it('and for the album label', () => {
    expect(lt.gallery(2)).toBe('Albumas, 2 nuotraukos');
    expect(lt.gallery(11)).toBe('Albumas, 11 nuotraukų');
    expect(lt.gallery(21)).toBe('Albumas, 21 nuotrauka');
  });
});
