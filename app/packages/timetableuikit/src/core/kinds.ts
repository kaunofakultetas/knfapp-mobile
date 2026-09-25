// -----------------------------------------------------------
//  [*] timetableuikit — event kinds
//
//  How a lesson's KIND (the engine's canonical code —
//  'lecture', 'practice', 'exam', …) reads on screen. Every
//  known kind is NAMED quietly — a list card's footer, a grid
//  cell's time line, a detail row — so a lecture and a
//  practical are told apart at a glance; the kinds a student
//  must not mistake for an ordinary class — an exam, a
//  retake, an assessment, a consultation — also wear a BADGE
//  on the list card and the grid cell. The names come from
//  the labels catalog, so a host overrides them like any
//  other string.
//
//  Used by:
//    - grid/LessonCell.tsx, chrome/LessonCard.tsx — the badge
//      and the quiet kind name
//    - components/schedule/LessonSheet.tsx — the type row
// -----------------------------------------------------------

import type { TimetableLabels } from '../provider/labels';


// The kinds that are NOT an ordinary class — each one badged
// wherever the lesson is drawn
const BADGE_KINDS: ReadonlySet<string> = new Set(['exam', 'retake', 'assessment', 'consultation']);







// -----------------------------------------------------------
// kindName
// -----------------------------------------------------------
//
// The printable name of a kind: the catalog's name for a
// known code, else the source's own word (`raw` — the KNF
// wire's lectureType, first letter raised), else null. A
// kind the vocabulary does not know is still worth printing
// in the source's language; it is never guessed into a
// neighbour.
//
// Used by:
//   - kindBadge (below)
//   - components/schedule/LessonSheet.tsx — the type row
// -----------------------------------------------------------

export function kindName(labels: TimetableLabels, kind?: string, raw?: string): string | null {
  if (kind && labels.kinds[kind]) return labels.kinds[kind];
  const word = (raw ?? '').trim();
  return word ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : null;
}







// -----------------------------------------------------------
// kindBadge
// -----------------------------------------------------------
//
// The badge text for a lesson, or null when its kind is an
// everyday one (or none at all) — only BADGE_KINDS earn a
// badge.
//
// Used by:
//   - grid/LessonCell.tsx — the cell's badge line
//   - chrome/LessonCard.tsx — the card's badge chip
// -----------------------------------------------------------

export function kindBadge(labels: TimetableLabels, kind?: string): string | null {
  return kind && BADGE_KINDS.has(kind) ? kindName(labels, kind) : null;
}







// -----------------------------------------------------------
// isBadgeKind
// -----------------------------------------------------------
//
// Whether a kind wears a badge — the quiet kind name is for
// the OTHER kinds only; a badge already names its own.
//
// Used by:
//   - grid/LessonCell.tsx, chrome/LessonCard.tsx — the quiet
//     name's gate
// -----------------------------------------------------------

export function isBadgeKind(kind?: string): boolean {
  return !!kind && BADGE_KINDS.has(kind);
}
