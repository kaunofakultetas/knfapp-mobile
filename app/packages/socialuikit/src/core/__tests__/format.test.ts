// -----------------------------------------------------------
//  [*] Tests — socialuikit formatters
//
//  The boundary tables: every rung of formatCount's compaction
//  (exact → floored 'k' → floored 'M') and every face of
//  clampSnippet's word-boundary cut.
// -----------------------------------------------------------

import { clampSnippet, formatCount, parseServerStamp } from '../format';


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

  it('formatCount has a rung for every magnitude — a viral count never prints a 4-digit mantissa', () => {
    expect(formatCount(1_500_000_000)).toBe('1.5B');
    expect(formatCount(999_999_999)).toBe('999.9M');
    expect(formatCount(12_000_000_000)).toBe('12B');
  });

  it('clampSnippet never leaves a lone surrogate before the ellipsis', () => {
    const hearts = '\u{1F49A}'.repeat(100); // 200 UTF-16 units, no whitespace
    const out = clampSnippet(hearts, 149);
    const body = out.slice(0, -1);
    expect(out.endsWith('\u2026')).toBe(true);
    expect(/[\uD800-\uDBFF]$/.test(body)).toBe(false);
    // Only whole hearts survive
    expect(body.length % 2).toBe(0);
    expect([...body].every((ch) => ch === '\u{1F49A}')).toBe(true);
  });

  it('clampSnippet keeps flags whole — regional indicators travel in pairs', () => {
    const flags = '\u{1F1F1}\u{1F1F9}'.repeat(50); // 🇱🇹 ×50 = 200 units
    const out = clampSnippet(flags, 150);
    const body = out.slice(0, -1);
    const indicators = body.match(/[\uD83C][\uDDE6-\uDDFF]/g) ?? [];
    expect(indicators.length % 2).toBe(0);
    expect(indicators.length).toBeGreaterThan(0);
  });

  it('clampSnippet drops a severed joiner family wholly, never half of one', () => {
    const family = '\u{1F469}\u200D\u{1F4BB}'; // 5 units per family
    const out = clampSnippet(family.repeat(40), 152); // cuts mid-family
    const body = out.slice(0, -1);
    // Whatever survives is a whole number of complete families
    expect(body.length % 5).toBe(0);
    expect(body.split(family).join('')).toBe('');
  });

  it('parseServerStamp reads zone-less stamps as UTC and space-form as datetimes', () => {
    const aware = Date.parse('2026-08-31T10:00:00Z');
    expect(parseServerStamp('2026-08-31T10:00:00')).toBe(aware);
    expect(parseServerStamp('2026-08-31 10:00:00')).toBe(aware);
    expect(parseServerStamp('2026-08-31T10:00:00+00:00')).toBe(aware);
    expect(parseServerStamp('2026-08-31T13:00:00+03:00')).toBe(aware);
    expect(parseServerStamp('2026-08-31T10:00:00.123Z')).toBe(aware + 123);
  });

  it('parseServerStamp answers NaN for junk — callers show their calm default', () => {
    expect(Number.isNaN(parseServerStamp(''))).toBe(true);
    expect(Number.isNaN(parseServerStamp('not a date'))).toBe(true);
    expect(Number.isNaN(parseServerStamp(undefined as unknown as string))).toBe(true);
  });
});
