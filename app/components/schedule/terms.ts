// -----------------------------------------------------------
//  [*] Schedule — semester labels, said like a person would
//
//  The backend names a term 'YYYY-R' / 'YYYY-P' with the
//  ACADEMIC year's first calendar year: '2026-P' is the
//  spring of 2027. Printed raw, that reads as "spring 2026"
//  to every student who sees it — so wherever the app shows
//  a term it says "2027 m. pavasaris" / "Spring 2027"
//  instead, with the calendar year the term actually runs in.
//  A label in any other shape is printed as it came.
//
//  Used by:
//    - app/(main)/tabs/schedule.tsx — the filter sheet's
//      semester rows
//    - components/schedule/LessonSheet.tsx — the cohort row
// -----------------------------------------------------------

import type { TFunction } from 'i18next';







// -----------------------------------------------------------
// termName
// -----------------------------------------------------------
//
// '2026-R' → "2026 m. ruduo" / "Autumn 2026"; '2026-P' →
// "2027 m. pavasaris" / "Spring 2027" (the spring half runs
// in the label year + 1); anything else unchanged.
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — the semester rows
//   - components/schedule/LessonSheet.tsx — the cohort row
// -----------------------------------------------------------

export function termName(t: TFunction, label: string): string {
  const match = /^(\d{4})-([RP])$/.exec(label.trim());
  if (!match) return label;
  const year = Number(match[1]);
  return match[2] === 'R'
    ? t('schedule.termAutumn', { year })
    : t('schedule.termSpring', { year: year + 1 });
}
