// -----------------------------------------------------------
//  [*] Tests — linkify pathological inputs
//
//  The register major: the bare-host regex used to backtrack
//  quadratically on a long unbroken dotted run, letting one
//  hostile message freeze every recipient's UI thread. These
//  inputs must come back fast and correct.
// -----------------------------------------------------------

import { linkify } from '@/chatkit/linkify';


const flatten = (segments: { value: string }[]) => segments.map((s) => s.value).join('');


describe('linkify under hostile input', () => {
  it('survives a long unbroken dotted run without catastrophic backtracking', () => {
    const hostile = 'a.'.repeat(20_000) + 'a';
    const started = Date.now();
    const segments = linkify(hostile);
    const elapsed = Date.now() - started;

    // Quadratic backtracking took effectively forever here —
    // generous bound, but orders of magnitude under the bug
    expect(elapsed).toBeLessThan(2_000);
    expect(flatten(segments)).toBe(hostile);
  });

  it('survives a wall of dots and hyphens', () => {
    const hostile = ('x-.'.repeat(10_000) + '.') + '-'.repeat(5_000);
    const segments = linkify(hostile);
    expect(flatten(segments)).toBe(hostile);
  });

  it('still links a long genuine URL under the guard bound', () => {
    const url = 'https://knf.vu.lt/' + 'segment/'.repeat(200) + 'galas';
    const segments = linkify(`pradžia ${url} pabaiga`);
    const link = segments.find((s) => 'href' in s && s.href);
    expect(link?.value).toBe(url);
    expect(flatten(segments)).toBe(`pradžia ${url} pabaiga`);
  });

  it('returns one plain segment past the 2000-char guard bound', () => {
    const long = 'žinutė '.repeat(400); // ~2800 chars
    expect(linkify(long)).toEqual([{ type: 'text', value: long }]);
  });

  it('never links a dotted run that is not a plausible host', () => {
    const segments = linkify('1.2.3.4.5.6.7.8.9.10.11.12');
    expect(flatten(segments)).toBe('1.2.3.4.5.6.7.8.9.10.11.12');
  });
});
