// -----------------------------------------------------------
//  [*] Tests — services/newsText
// -----------------------------------------------------------

import { stripScrapedPreamble, titleRepeatsBody } from '@/services/newsText';


// A scraped VU article: the title and byline its preamble repeats
const post = { title: 'Vicky Reiter: Visi indoeuropeistai – šiek tiek keistoki', author: 'Vilniaus universitetas' };


describe('stripScrapedPreamble', () => {
  it('drops the scraped date, byline, title and category chrome', () => {
    const body = [
      '2026 m. rugpjūčio 27 d.',
      'Dr. Veslava Sidaravičienė',
      'Vicky Reiter: Visi indoeuropeistai – šiek tiek keistoki',
      'Mokslas',
      'VU naujienos',
      'Priežastys, kodėl žmonės iš kitų šalių mokosi lietuvių kalbos, yra skirtingos.',
      'Antra pastraipa.',
    ].join('\n');
    expect(stripScrapedPreamble(body, post)).toBe(
      'Priežastys, kodėl žmonės iš kitų šalių mokosi lietuvių kalbos, yra skirtingos.\nAntra pastraipa.',
    );
  });

  it('leaves community posts alone', () => {
    const body = 'Šiandien šašlykai liepų kiemelyje! Ateikite visi, bus smagu.';
    expect(stripScrapedPreamble(body, { title: 'Šašlykai', author: 'Jonas' })).toBe(body);
  });

  it('keeps a post that is nothing but short lines', () => {
    expect(stripScrapedPreamble('Labas\nVisiems', post)).toBe('Labas\nVisiems');
  });

  it('keeps short opening lines when no chrome precedes them', () => {
    // Short-then-long is how people write event posts — without
    // positive chrome evidence nothing may be stripped, even
    // from a scraped source
    const body = [
      'Rytoj 18:00',
      'Auditorija 302',
      'Kviečiame visus studentus dalyvauti, bus paskaita ir vaišės.',
    ].join('\n');
    expect(stripScrapedPreamble(body, { ...post, source: 'knf.vu.lt' })).toBe(body);
  });

  it('never strips a user post, even one opening with its own title', () => {
    const body = 'Šašlykai\nLiepų kiemelyje, nuo 18 val.';
    expect(stripScrapedPreamble(body, { title: 'Šašlykai', author: 'Jonas', source: 'user' })).toBe(body);
  });

  it('never eats more than five leading lines', () => {
    // Title (chrome) + four labels hit the bound; the fifth
    // label survives together with the body
    const labels = ['Mokslas', 'VU naujienos', 'Studijos', 'Kultūra', 'Bendruomenė'];
    const body = [post.title, ...labels, 'Pirmoji tikroji pastraipa.'].join('\n');
    expect(stripScrapedPreamble(body, post)).toBe('Bendruomenė\nPirmoji tikroji pastraipa.');
  });

  it('tolerates empty content', () => {
    expect(stripScrapedPreamble('', post)).toBe('');
  });
});


describe('stripScrapedPreamble on markdown bodies', () => {
  it('drops markdown-shaped chrome: a "- " date, a "## " title repeat, a category link', () => {
    const body = [
      '- 2026 m. rugsėjo 7 d.',
      '',
      '## Vicky Reiter: Visi indoeuropeistai – šiek tiek keistoki',
      '',
      '[VU naujienos](https://www.vu.lt/lt/visos-naujienos?categories=vu-naujienos)',
      '',
      'Priežastys, kodėl žmonės mokosi lietuvių kalbos, yra skirtingos.',
    ].join('\n');
    expect(stripScrapedPreamble(body, post)).toBe(
      'Priežastys, kodėl žmonės mokosi lietuvių kalbos, yra skirtingos.',
    );
  });
});



describe('titleRepeatsBody', () => {
  it('knows a derived title — whole, word-cut with an ellipsis, or an old 80-char prefix', () => {
    const body = 'Gal kas žinote, iki kada šiandien dirba biblioteka? 📚🙏';
    expect(titleRepeatsBody(body, body)).toBe(true);
    const long = 'Pirmoji semestro savaitė praėjo labai greitai, o bendrabutyje jau visi geria kavą';
    expect(titleRepeatsBody('Pirmoji semestro savaitė praėjo labai greitai, o bendrabutyje jau visi…', long)).toBe(true);
    expect(titleRepeatsBody(long.slice(0, 80), long)).toBe(true);
  });

  it('a real title, and blanks on either side, are not a repeat', () => {
    expect(titleRepeatsBody('Rastas USB raktas', 'Radau 305 auditorijoje...')).toBe(false);
    expect(titleRepeatsBody('', 'tekstas')).toBe(false);
    expect(titleRepeatsBody('…', 'tekstas')).toBe(false);
    expect(titleRepeatsBody('Pavadinimas', '')).toBe(false);
  });
});
