// -----------------------------------------------------------
//  [*] Tests — the subject palette
//
//  Same title, same color, every render — and the pastel is a
//  SOLID composite over whatever surface the theme brings.
// -----------------------------------------------------------

import { DEFAULT_SUBJECT_COLORS, subjectTint } from '../palette';

describe('subjectTint', () => {
  it('is deterministic per title', () => {
    expect(subjectTint('Matematinė analizė', '#FFFFFF')).toEqual(subjectTint('Matematinė analizė', '#FFFFFF'));
  });

  it('draws the accent from the palette and composites exactly', () => {
    const tint = subjectTint('Bet kas', '#FFFFFF', ['#3A7BD5']);
    expect(tint.accent).toBe('#3A7BD5');
    // 16% of the accent over white, channel by channel
    expect(tint.bg).toBe('#dfeaf8');
  });

  it('the same accent lands differently on a dark surface', () => {
    const light = subjectTint('Fizika', '#FFFFFF');
    const dark = subjectTint('Fizika', '#1F2937');
    expect(light.accent).toBe(dark.accent);
    expect(light.bg).not.toBe(dark.bg);
  });

  it('defaults to the shipped hues and survives an empty palette', () => {
    expect(DEFAULT_SUBJECT_COLORS).toContain(subjectTint('Istorija', '#FFFFFF').accent);
    expect(subjectTint('Istorija', '#FFFFFF', []).accent).toBe('#3A7BD5');
  });

  it('always emits a #rrggbb ground', () => {
    for (const title of ['A', 'Programavimas', 'Ąžuolų šokiai', '']) {
      expect(subjectTint(title, '#F3F4F6').bg).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('subjectTint color parsing', () => {
  it('understands #rgb shorthand exactly like its long form', () => {
    expect(subjectTint('Fizika', '#fff')).toEqual(subjectTint('Fizika', '#ffffff'));
  });

  it('an unparseable surface falls back to that surface unchanged — never a garbled hue', () => {
    expect(subjectTint('Fizika', 'white').bg).toBe('white');
    expect(subjectTint('Fizika', 'rgb(255, 255, 255)').bg).toBe('rgb(255, 255, 255)');
  });

  it('an unparseable accent keeps the surface as the ground', () => {
    const tint = subjectTint('Fizika', '#FFFFFF', ['skyblue']);
    expect(tint.accent).toBe('skyblue');
    expect(tint.bg).toBe('#FFFFFF');
  });
});
