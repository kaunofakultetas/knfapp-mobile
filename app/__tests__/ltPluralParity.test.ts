// -----------------------------------------------------------
//  [*] Tests — the four kits' ltPlural copies stay one rule
//
//  chatuikit, socialuikit, timetableuikit and wayfinduikit
//  each carry a private ltPlural (the kits import nothing from
//  the app, and a shared package was not worth four new build
//  aliases for seven lines). The copies had drifted once — one
//  lost the 11–19 clause and printed "12 paskaitos" (KNF-187).
//  This pins them: all four must be byte-identical, and the
//  shared body must agree with the platform's own CLDR rules
//  (Intl.PluralRules 'lt') across the boundary numbers where
//  Lithuanian plurals turn.
// -----------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';


// The four kits' label modules, relative to the app root
const KIT_LABELS = [
  'packages/chatuikit/src/provider/labels.ts',
  'packages/socialuikit/src/provider/labels.ts',
  'packages/timetableuikit/src/provider/labels.ts',
  'packages/wayfinduikit/src/provider/labels.ts',
];

// Where the forms turn: 1/21/101 one, 2–9/22 few, 10–20 and
// 111–119 other, plus a fraction (other in the kits)
const BOUNDARIES = [0, 1, 2, 5, 9, 10, 11, 12, 15, 19, 20, 21, 22, 29, 30, 100, 101, 102, 110, 111, 112, 119, 121, 122];







// -----------------------------------------------------------
// ltPluralSource
// -----------------------------------------------------------
//
// One kit's ltPlural arrow function, exactly as written — the
// text from its declaration to the closing "};".
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function ltPluralSource(file: string): string {
  const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const match = text.match(/const ltPlural = [\s\S]*?\n};/);
  if (!match) throw new Error(`${file} has no ltPlural`);
  return match[0];
}







describe('ltPlural across the kits', () => {
  it('is byte-identical in all four kits', () => {
    const [first, ...rest] = KIT_LABELS.map(ltPluralSource);
    rest.forEach((copy, index) => expect({ file: KIT_LABELS[index + 1], copy }).toEqual({ file: KIT_LABELS[index + 1], copy: first }));
  });

  it('agrees with the CLDR Lithuanian rules at every boundary', () => {
    // The shared body, stripped of its TypeScript annotations
    // and evaluated as plain JavaScript
    const source = ltPluralSource(KIT_LABELS[0])
      .replace('const ltPlural = ', '')
      .replace(/\(count: number, one: string, few: string, other: string\): string =>/, '(count, one, few, other) =>')
      .replace(/;\s*$/, '');
    // eslint-disable-next-line no-new-func -- evaluating the kits' own source is the point
    const ltPlural = new Function(`return (${source});`)() as (n: number, one: string, few: string, other: string) => string;
    const cldr = new Intl.PluralRules('lt');

    for (const n of BOUNDARIES) {
      const kit = ltPlural(n, 'one', 'few', 'other');
      expect({ n, kit }).toEqual({ n, kit: cldr.select(n) === 'many' ? 'other' : cldr.select(n) });
    }
    // A fraction is CLDR "many"; the kits have no such form and
    // fall back to "other"
    expect(ltPlural(9.5, 'one', 'few', 'other')).toBe('other');
  });
});
