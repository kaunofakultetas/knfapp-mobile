// -----------------------------------------------------------
//  [*] Tests — services/htmlDecode
//
//  Mirrors Python's html.escape(quote=True) output, which the
//  backend applies to EVERY string it returns.
// -----------------------------------------------------------

import { decodeHtmlEntities } from '@/services/htmlDecode';


describe('decodeHtmlEntities', () => {
  it('decodes the five html.escape entities plus the numeric forms', () => {
    expect(decodeHtmlEntities('R&amp;D &lt;b&gt; &quot;q&quot; &#x27;x&#x27; &#34;y&#34;'))
      .toBe('R&D <b> "q" \'x\' "y"');
  });

  it('repairs escaped URLs', () => {
    expect(decodeHtmlEntities('https://h/a?b=1&amp;c=2')).toBe('https://h/a?b=1&c=2');
  });

  it('leaves plain text alone', () => {
    expect(decodeHtmlEntities('Sveiki, pasaulis')).toBe('Sveiki, pasaulis');
  });
});
