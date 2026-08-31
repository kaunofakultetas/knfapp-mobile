// -----------------------------------------------------------
//  [*] Tests — linkify against the classic breakage
//
//  The URL shapes production chat clients learned the hard
//  way, adopted as scenarios: encyclopedia links whose path
//  ENDS in a closing paren, links wrapped in prose parens,
//  trailing sentence punctuation, plus-tagged e-mails, phone
//  numbers before a full stop, and the very-long-text bail.
// -----------------------------------------------------------

import { linkify } from '../linkify';

const links = (text: string) => linkify(text).filter((s) => s.type === 'link') as { type: 'link'; value: string; href: string }[];

describe('linkify hardening', () => {
  it('keeps the closing paren of a path that opened one (encyclopedia links)', () => {
    const [link] = links('see https://lt.wikipedia.org/wiki/Kaunas_(miestas) today');
    expect(link.value).toBe('https://lt.wikipedia.org/wiki/Kaunas_(miestas)');
  });

  it('returns the paren to prose when the link is only WRAPPED in one', () => {
    const segments = linkify('(see www.knf.vu.lt)');
    const link = segments.find((s) => s.type === 'link') as { value: string };
    expect(link.value).toBe('www.knf.vu.lt');
    expect(segments[segments.length - 1]).toEqual({ type: 'text', value: ')' });
  });

  it('gives trailing sentence punctuation back', () => {
    expect(links('skaityk knf.vu.lt.')[0].value).toBe('knf.vu.lt');
    expect(links('čia: https://knf.vu.lt/naujienos, gerai?')[0].value).toBe('https://knf.vu.lt/naujienos');
  });

  it('takes a plus-tagged e-mail whole and a phone before a full stop', () => {
    expect(links('rašyk vardas+kursas@knf.vu.lt')[0].href).toBe('mailto:vardas+kursas@knf.vu.lt');
    const [phone] = links('skambink +37061234567.');
    expect(phone.href).toBe('tel:+37061234567');
  });

  it('bails whole on a very long text instead of scanning it', () => {
    const long = `https://knf.vu.lt ${'x'.repeat(2100)}`;
    expect(linkify(long)).toEqual([{ type: 'text', value: long }]);
  });

  it('survives an emoji-and-diacritics soup around a link', () => {
    const [link] = links('🎓📚 ąčęėįšųūž www.knf.vu.lt/studijos 🎉');
    expect(link.value).toBe('www.knf.vu.lt/studijos');
  });

  it('takes unicode paths, emoji queries, ports and fragments whole', () => {
    expect(links('žr. https://lt.wikipedia.org/wiki/Šiauliai dabar')[0].value).toBe('https://lt.wikipedia.org/wiki/Šiauliai');
    expect(links('https://knf.vu.lt/p.php?q=1🇱🇹&r=2#sk')[0].value).toBe('https://knf.vu.lt/p.php?q=1🇱🇹&r=2#sk');
    expect(links('https://knf.vu.lt:8443/vidus')[0].value).toBe('https://knf.vu.lt:8443/vidus');
  });

  it('leaves custom schemes and bare IPs to the prose', () => {
    expect(links('open scrn://team-chat now')).toHaveLength(0);
    expect(links('slack:some-channel')).toHaveLength(0);
    expect(links('serveris 127.0.0.1/vidus veikia')).toHaveLength(0);
  });

  it('a typed mailto: joins its address as ONE link, prefix never doubled', () => {
    const segments = linkify('rašyk mailto:pagalba@knf.vu.lt šiandien');
    const link = segments.find((s) => s.type === 'link') as { value: string; href: string };
    expect(link.value).toBe('mailto:pagalba@knf.vu.lt');
    expect(link.href).toBe('mailto:pagalba@knf.vu.lt');
    expect(segments.some((s) => s.type === 'text' && s.value.includes('mailto'))).toBe(false);
  });
});
