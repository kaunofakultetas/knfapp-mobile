// -----------------------------------------------------------
//  [*] Tests — mention segmentation
//
//  "@Name" runs against the member list: word boundaries on
//  both sides, longest name first, case- and diacritic-
//  insensitive, and never inside an e-mail address. Links and
//  mentions share one claim pass.
// -----------------------------------------------------------

import { linkify } from '../linkify';

const NAMES = ['Ona', 'Onaitė Petraitė', 'Jonas'];

const kinds = (text: string) => linkify(text, { mentionNames: NAMES }).map((s) => s.type);
const mentions = (text: string) =>
  linkify(text, { mentionNames: NAMES }).filter((s) => s.type === 'mention') as { type: 'mention'; value: string; name: string }[];

describe('linkify mentions', () => {
  it('claims an @Name at a word boundary and keeps the surrounding prose', () => {
    const segments = linkify('labas @Ona kaip sekasi?', { mentionNames: NAMES });
    expect(segments).toEqual([
      { type: 'text', value: 'labas ' },
      { type: 'mention', value: '@Ona', name: 'Ona' },
      { type: 'text', value: ' kaip sekasi?' },
    ]);
  });

  it('prefers the longest matching name and matches case- and diacritic-insensitively', () => {
    expect(mentions('@onaite petraite ateik')[0]).toEqual({ type: 'mention', value: '@onaite petraite', name: 'Onaitė Petraitė' });
    // A shorter member never claims the head of a longer name
    expect(mentions('@Onaitė Petraitė!')[0].name).toBe('Onaitė Petraitė');
  });

  it('requires boundaries: no glued @, no partial-name claims, never inside an e-mail', () => {
    expect(kinds('word@Ona')).toEqual(['text']);
    // "Onas" is not "Ona" — the run must END at a boundary
    expect(kinds('@Onas eik')).toEqual(['text']);
    expect(linkify('rašyk ona@knf.vu.lt', { mentionNames: NAMES }).map((s) => s.type)).toEqual(['text', 'link']);
  });

  it('without mentionNames nothing changes', () => {
    expect(linkify('labas @Ona').every((s) => s.type === 'text')).toBe(true);
  });
});
