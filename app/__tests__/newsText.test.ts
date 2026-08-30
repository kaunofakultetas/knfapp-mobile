// -----------------------------------------------------------
//  [*] Tests — services/newsText
// -----------------------------------------------------------

import { stripScrapedPreamble } from '@/services/newsText';


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
