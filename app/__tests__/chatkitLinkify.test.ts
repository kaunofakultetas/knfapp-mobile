// -----------------------------------------------------------
//  [*] Tests — chatkit linkify
// -----------------------------------------------------------

import { linkify } from '@knf/chatkit/core/linkify';


describe('linkify', () => {

  it('returns plain text untouched', () => {
    expect(linkify('Labas rytas')).toEqual([{ type: 'text', value: 'Labas rytas' }]);
  });


  it('links http URLs and keeps trailing punctuation outside', () => {
    expect(linkify('Žiūrėk https://knf.vu.lt/naujienos. Gerai?')).toEqual([
      { type: 'text', value: 'Žiūrėk ' },
      { type: 'link', value: 'https://knf.vu.lt/naujienos', href: 'https://knf.vu.lt/naujienos', kind: 'url' },
      { type: 'text', value: '. Gerai?' },
    ]);
  });


  it('links bare hosts with an https href', () => {
    expect(linkify('www.vu.lt ir knf.vu.lt/apie')).toEqual([
      { type: 'link', value: 'www.vu.lt', href: 'https://www.vu.lt', kind: 'url' },
      { type: 'text', value: ' ir ' },
      { type: 'link', value: 'knf.vu.lt/apie', href: 'https://knf.vu.lt/apie', kind: 'url' },
    ]);
  });


  it('handles an empty string', () => {
    expect(linkify('')).toEqual([]);
  });


  it('links email addresses as mailto — and never their domains as URLs', () => {
    expect(linkify('Rašyk vardenis.pavardenis@knf.vu.lt arba admin@vu.lt')).toEqual([
      { type: 'text', value: 'Rašyk ' },
      { type: 'link', value: 'vardenis.pavardenis@knf.vu.lt', href: 'mailto:vardenis.pavardenis@knf.vu.lt', kind: 'email' },
      { type: 'text', value: ' arba ' },
      { type: 'link', value: 'admin@vu.lt', href: 'mailto:admin@vu.lt', kind: 'email' },
    ]);
  });


  it('keeps wrapping punctuation outside a bracketed link', () => {
    expect(linkify('Nuoroda (www.vu.lt), ačiū')).toEqual([
      { type: 'text', value: 'Nuoroda (' },
      { type: 'link', value: 'www.vu.lt', href: 'https://www.vu.lt', kind: 'url' },
      { type: 'text', value: '), ačiū' },
    ]);
  });


  it('strips mixed trailing punctuation from paths and queries', () => {
    expect(linkify('https://knf.vu.lt/kelias?x=1! ir knf.vu.lt/apie...')).toEqual([
      { type: 'link', value: 'https://knf.vu.lt/kelias?x=1', href: 'https://knf.vu.lt/kelias?x=1', kind: 'url' },
      { type: 'text', value: '! ir ' },
      { type: 'link', value: 'knf.vu.lt/apie', href: 'https://knf.vu.lt/apie', kind: 'url' },
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
