// -----------------------------------------------------------
//  [*] Tests — short course codes for narrow cells
//
//  The week grid's ~50–70 pt columns broke course words mid-
//  word ("Kompi / uterių"); a cell whose longest word cannot
//  fit shows the course's initials instead. The codes must be
//  the ones a student would guess, and the fit test must
//  never admit a word that then wraps.
// -----------------------------------------------------------

import { shortTitle, wordsFit } from '../titles';

describe('shortTitle', () => {
  it('takes the initials of the significant words', () => {
    expect(shortTitle('Kompiuterių tinklai')).toBe('KT');
    expect(shortTitle('Duomenų bazių valdymo sistemos')).toBe('DBVS');
    expect(shortTitle('Tikimybių teorija ir statistika')).toBe('TTS');
    expect(shortTitle('Objektinis programavimas')).toBe('OP');
  });

  it('drops the asides and joining words, keeps numbers, numerals and acronyms whole', () => {
    expect(shortTitle('Marketingo technologijos (anglų k.)')).toBe('MT');
    expect(shortTitle('Akademinis ir informacinis raštingumas')).toBe('AIR');
    expect(shortTitle('Programavimas II')).toBe('PII');
    expect(shortTitle('IT projektų valdymas')).toBe('ITPV');
    expect(shortTitle('Anglų kalba B2')).toBe('AKB');
    expect(shortTitle('Programavimo įvadas')).toBe('PĮ');
  });

  it('a one-word title has no code worth reading and stays itself', () => {
    expect(shortTitle('Ekonometrija')).toBe('Ekonometrija');
    expect(shortTitle('Fizika (anglų k.)')).toBe('Fizika (anglų k.)');
  });
});

describe('wordsFit', () => {
  it('admits a title only when its LONGEST word fits the width at the size given', () => {
    // "Kompiuterių" is ~70 pt at 12 pt in Raleway SemiBold
    expect(wordsFit('Kompiuterių tinklai', 40, 12)).toBe(false);
    expect(wordsFit('Kompiuterių tinklai', 90, 12)).toBe(true);
    // A larger system font narrows the column for the same words
    expect(wordsFit('Kompiuterių tinklai', 90, 24)).toBe(false);
    expect(wordsFit('IT', 20, 12)).toBe(true);
  });
});
