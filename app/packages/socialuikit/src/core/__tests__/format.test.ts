// -----------------------------------------------------------
//  [*] Tests — socialuikit formatters
//
//  The boundary tables: every rung of formatCount's compaction
//  (exact → floored 'k' → floored 'M') and every face of
//  clampSnippet's word-boundary cut.
// -----------------------------------------------------------

import { clampSnippet, formatCount } from '../format';


describe('formatCount', () => {

  it.each<[number, string]>([
    [0, '0'],
    [1, '1'],
    [42, '42'],
    [999, '999'],
    // The 'k' rung: one floored decimal, trailing .0 dropped
    [1000, '1k'],
    [1049, '1k'],
    [1050, '1k'],
    [1100, '1.1k'],
    [1199, '1.1k'],
    [1999, '1.9k'],
    [9999, '9.9k'],
    [10000, '10k'],
    [10499, '10.4k'],
    [100000, '100k'],
    [999999, '999.9k'],
    // The 'M' rung
    [1000000, '1M'],
    [1049999, '1M'],
    [1200000, '1.2M'],
    [1999999, '1.9M'],
    [25000000, '25M'],
  ])('formats %i as %s', (n, expected) => {
    expect(formatCount(n)).toBe(expected);
  });


  it('never shows a negative, fractional or non-finite tally', () => {
    expect(formatCount(-5)).toBe('0');
    expect(formatCount(3.7)).toBe('3');
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('0');
  });
});




describe('clampSnippet', () => {

  it('returns text within the limit untouched, ellipsis-free', () => {
    expect(clampSnippet('labas', 10)).toBe('labas');
    expect(clampSnippet('a'.repeat(150))).toBe('a'.repeat(150));
    expect(clampSnippet('lygiai tiek', 11)).toBe('lygiai tiek');
  });


  it('cuts at the last word boundary, never mid-word', () => {
    expect(clampSnippet('one two three', 9)).toBe('one two…');
    expect(clampSnippet('one two three', 12)).toBe('one two…');
    expect(clampSnippet('vienas du trys keturi', 15)).toBe('vienas du trys…');
  });


  it('keeps a word that ends exactly at the limit', () => {
    // charAt(max) is the space after 'two': nothing is split
    expect(clampSnippet('one two three', 7)).toBe('one two…');
  });


  it('shaves trailing whitespace and punctuation before the ellipsis', () => {
    expect(clampSnippet('hello, world', 6)).toBe('hello…');
    expect(clampSnippet('sakinys baigiasi. o tada dar tęsiasi', 17)).toBe('sakinys baigiasi…');
  });


  it('hard-cuts a single unbroken run longer than the limit', () => {
    expect(clampSnippet('x'.repeat(200), 150)).toBe(`${'x'.repeat(150)}…`);
  });


  it('uses the single ellipsis character, not three dots', () => {
    const out = clampSnippet('one two three four five', 10);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toContain('...');
  });


  it('applies the default limit of 150 without splitting a word', () => {
    const text = 'žodis '.repeat(40).trim();
    const out = clampSnippet(text);

    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(151);
    // Every surviving token is intact
    const tokens = out.slice(0, -1).split(' ');
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) expect(token).toBe('žodis');
  });
});
