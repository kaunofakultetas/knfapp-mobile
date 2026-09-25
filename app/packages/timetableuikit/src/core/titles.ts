// -----------------------------------------------------------
//  [*] timetableuikit — titles for narrow cells
//
//  A week-grid column on a phone is ~50–70 pt wide, and a
//  Lithuanian course word is not: "Kompiuterių" alone needs
//  ~70 pt at the cell's 12 pt. Text that cannot fit a WORD on
//  a line breaks INSIDE it ("Kompi / uterių"), which reads as
//  garbage. So a cell whose longest word does not fit shows
//  the course's short code instead — the initials of its
//  significant words, "Kompiuterių tinklai" → "KT", "Duomenų
//  bazių valdymo sistemos" → "DBVS" — and the full name stays
//  in the accessibility label and the detail sheet. The fit
//  test is an estimate on purpose (no synchronous text
//  measurement exists in React Native): a Raleway-calibrated
//  per-character width, generous enough that a word it
//  admits never wraps.
//
//  Used by:
//    - grid/LessonCell.tsx — the title of a narrow cell
// -----------------------------------------------------------

// Advance width per character, as a fraction of the font size
// — measured over course words in the app's Raleway SemiBold
// (mean 0.54, widest word 0.67); 0.62 errs toward the code
const CHAR_WIDTH = 0.62;

// Words that never earn a letter in a short code — the
// joining words of Lithuanian and English course names
const JOINING_WORDS: ReadonlySet<string> = new Set([
  'ir', 'bei', 'su', 'per', 'į', 'iš', 'ar', 'apie', 'prie',
  'and', 'of', 'the', 'in', 'to', 'for', 'a', 'an', 'on', 'with',
]);







// -----------------------------------------------------------
// wordsFit
// -----------------------------------------------------------
//
// Whether every word of the title fits on one line of the
// given width at the given (already font-scaled) size — the
// test that decides between the title and its short code.
//
// Used by:
//   - grid/LessonCell.tsx — per cell, from its frame
// -----------------------------------------------------------

export function wordsFit(title: string, width: number, fontSize: number): boolean {
  const longest = title.split(/\s+/).reduce((max, word) => Math.max(max, [...word].length), 0);
  return longest * CHAR_WIDTH * fontSize <= width;
}







// -----------------------------------------------------------
// shortTitle
// -----------------------------------------------------------
//
// The course's short code: parenthesised asides dropped ("(anglų
// k.)"), joining words skipped, then the first letter of every
// remaining word, upper-cased — while numbers, Roman numerals
// and acronyms stay whole ("Programavimas II" → "PII", "IT
// projektų valdymas" → "ITPV"). A title of fewer than two
// significant words has no code worth reading and comes back
// unchanged — its cell ellipsizes it on one line instead.
//
// Used by:
//   - grid/LessonCell.tsx — the title of a narrow cell
// -----------------------------------------------------------

export function shortTitle(title: string): string {
  const words = title
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s\-–—/,.:;]+/)
    .filter((word) => word && /[\p{L}\p{N}]/u.test(word) && !JOINING_WORDS.has(word.toLocaleLowerCase()));
  if (words.length < 2) return title;
  return words
    .map((word) => (/^(\p{N}+|[IVX]+|\p{Lu}{2,})$/u.test(word) ? word : word.charAt(0).toLocaleUpperCase()))
    .join('');
}
