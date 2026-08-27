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

});
