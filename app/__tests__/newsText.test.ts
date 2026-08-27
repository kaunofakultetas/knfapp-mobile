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

  it('tolerates empty content', () => {
    expect(stripScrapedPreamble('', post)).toBe('');
  });
});
