// -----------------------------------------------------------
//  [*] Tests — chatkit linkify
// -----------------------------------------------------------

import { linkify } from '@/chatkit/linkify';


describe('linkify', () => {

  it('returns plain text untouched', () => {
    expect(linkify('Labas rytas')).toEqual([{ type: 'text', value: 'Labas rytas' }]);
  });


  it('links http URLs and keeps trailing punctuation outside', () => {
    expect(linkify('Žiūrėk https://knf.vu.lt/naujienos. Gerai?')).toEqual([
      { type: 'text', value: 'Žiūrėk ' },
      { type: 'link', value: 'https://knf.vu.lt/naujienos', href: 'https://knf.vu.lt/naujienos' },
      { type: 'text', value: '. Gerai?' },
    ]);
  });


  it('links bare hosts with an https href', () => {
    expect(linkify('www.vu.lt ir knf.vu.lt/apie')).toEqual([
      { type: 'link', value: 'www.vu.lt', href: 'https://www.vu.lt' },
      { type: 'text', value: ' ir ' },
      { type: 'link', value: 'knf.vu.lt/apie', href: 'https://knf.vu.lt/apie' },
    ]);
  });


  it('handles an empty string', () => {
    expect(linkify('')).toEqual([]);
  });


  it('leaves email addresses as plain text', () => {
    expect(linkify('Rašyk vardenis.pavardenis@knf.vu.lt arba admin@vu.lt')).toEqual([
      { type: 'text', value: 'Rašyk vardenis.pavardenis@knf.vu.lt arba admin@vu.lt' },
    ]);
  });


  it('keeps wrapping punctuation outside a bracketed link', () => {
    expect(linkify('Nuoroda (www.vu.lt), ačiū')).toEqual([
      { type: 'text', value: 'Nuoroda (' },
      { type: 'link', value: 'www.vu.lt', href: 'https://www.vu.lt' },
      { type: 'text', value: '), ačiū' },
    ]);
  });


  it('strips mixed trailing punctuation from paths and queries', () => {
    expect(linkify('https://knf.vu.lt/kelias?x=1! ir knf.vu.lt/apie...')).toEqual([
      { type: 'link', value: 'https://knf.vu.lt/kelias?x=1', href: 'https://knf.vu.lt/kelias?x=1' },
      { type: 'text', value: '! ir ' },
      { type: 'link', value: 'knf.vu.lt/apie', href: 'https://knf.vu.lt/apie' },
      { type: 'text', value: '...' },
    ]);
  });


  it('never links inside a pathological dotted run', () => {
    // Every candidate host in here is glued to a preceding dot,
    // so the bounded matcher must reject the lot as one text run
    const dotted = 'x.'.repeat(10) + 'lt';
    expect(linkify(dotted)).toEqual([{ type: 'text', value: dotted }]);
  });


  it('returns a wall of text unscanned past the length cap', () => {
    const wall = 'a.'.repeat(1500);
    expect(linkify(wall)).toEqual([{ type: 'text', value: wall }]);
  });

});
