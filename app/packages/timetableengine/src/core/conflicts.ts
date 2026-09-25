// -----------------------------------------------------------
//  [*] timetableengine — conflicts
//
//  Two lessons conflict when their times truly overlap
//  (exclusive endpoints — back-to-back never conflicts) inside
//  ONE scope:
//    'group'  — same groupKey AND same termKey; the student's
//               question ("my group is double-booked"). With
//               no group filter active a table of parallel
//               groups legitimately shares slots, so detection
//               is DISABLED unless the caller says one group
//               is in view.
//    'person' — same person appearing in both entries of ONE
//               term; the teacher's question ("I am
//               double-booked"), and it crosses groups on
//               purpose — never semesters.
//  Identical rows (same title, times, day, people, location)
//  are duplicate data, not a conflict. In the group scope two
//  rows naming DISJOINT subgroups ("Pogrupiai: 1" beside
//  "Pogrupiai: 2" — the two halves of one group in two rooms)
//  are never a clash either: no student sits in both halves.
//  A row naming no subgroup is the whole group, so it still
//  clashes with any subgroup's row. The person scope ignores
//  subgroups — one teacher in two rooms is double-booked
//  whichever half each room holds.
//
//  An honest limit the group scope inherits from the data: the
//  backend's group label can bundle parallel subgroups and
//  elective baskets into ONE key, and those legitimately share
//  slots. A group-scope hit is therefore an ADVISORY wash for
//  the student to judge — the same semantics the faculty's
//  shipped schedule screen has always had — not a proven error.
//
//  Used by:
//    - hosts flagging entries, then annotateConflicts to put
//      the verdict onto placed layouts
// -----------------------------------------------------------

import type { PlacedEntry, TimetableEntry } from './types';







// -----------------------------------------------------------
// ConflictOptions
// -----------------------------------------------------------
//
// Which question is being asked — and, for the group scope,
// whether ONE group is actually in view (a mixed many-group
// table legitimately shares slots).
//
// Used by:
//   - conflictIds (below) — the scope switch
//   - components/schedule/TimetableView.tsx — the scope prop
//   - app/(main)/tabs/schedule.tsx — builds the scope per
//     perspective
// -----------------------------------------------------------

export interface ConflictOptions {
  scope: 'group' | 'person';
  // 'group' scope only: false = a mixed many-group view, where
  // detection stays off by design
  groupFilterActive?: boolean;
}







// -----------------------------------------------------------
// overlap
// -----------------------------------------------------------
//
// Same day and the half-open time ranges cross — touching
// ends (10:30/10:30) never overlap.
//
// Used by:
//   - conflictIds (below)
// -----------------------------------------------------------

const overlap = (a: TimetableEntry, b: TimetableEntry) =>
  a.day === b.day && a.startMin < b.endMin && b.startMin < a.endMin;







// -----------------------------------------------------------
// identity
// -----------------------------------------------------------
//
// Two rows that agree on all of this are ONE lesson listed
// twice (a shared slot), never a conflict pair.
//
// Used by:
//   - conflictIds (below)
// -----------------------------------------------------------

const identity = (entry: TimetableEntry) =>
  [entry.title, entry.day, entry.startMin, entry.endMin, (entry.people ?? []).join('|'), (entry.location ?? []).join('|')].join('~');







// -----------------------------------------------------------
// disjointSubgroups
// -----------------------------------------------------------
//
// True only when BOTH rows name subgroups and no subgroup is
// in both — two halves of one group, never one student's
// double-booking. An empty or absent list is the whole group
// and overlaps everything.
//
// Used by:
//   - shareGroupScope (below)
// -----------------------------------------------------------

const disjointSubgroups = (a: TimetableEntry, b: TimetableEntry) => {
  const mine = a.subgroupKeys ?? [];
  const theirs = b.subgroupKeys ?? [];
  if (mine.length === 0 || theirs.length === 0) return false;
  return !mine.some((key) => theirs.includes(key));
};







// -----------------------------------------------------------
// shareGroupScope
// -----------------------------------------------------------
//
// Group scope compares within one group AND one term — only
// when both rows carry a groupKey at all, and never across
// disjoint subgroups of that group.
//
// Used by:
//   - conflictIds (below)
// -----------------------------------------------------------

const shareGroupScope = (a: TimetableEntry, b: TimetableEntry) =>
  !!a.groupKey &&
  a.groupKey === b.groupKey &&
  (a.termKey ?? '') === (b.termKey ?? '') &&
  !disjointSubgroups(a, b);







// -----------------------------------------------------------
// sharePerson
// -----------------------------------------------------------
//
// Person scope: any teacher in common puts two rows in the
// same diary.
//
// Used by:
//   - conflictIds (below)
// -----------------------------------------------------------

const sharePerson = (a: TimetableEntry, b: TimetableEntry) => {
  // Conflicts never cross terms — a slot shared by two
  // SEMESTERS is not a double-booking in either of them
  if ((a.termKey ?? '') !== (b.termKey ?? '')) return false;
  const people = new Set(a.people ?? []);
  return (b.people ?? []).some((name) => people.has(name));
};







// -----------------------------------------------------------
// conflictIds
// -----------------------------------------------------------
//
// The ids of every entry standing in at least one conflict
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — flagging the list's cards
//   - components/schedule/TimetableView.tsx — the annotate stage
// -----------------------------------------------------------

export function conflictIds(entries: readonly TimetableEntry[], options: ConflictOptions): Set<string> {
  const ids = new Set<string>();
  if (options.scope === 'group' && !options.groupFilterActive) return ids;

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.isBlock || b.isBlock) continue;
      if (!overlap(a, b)) continue;
      if (identity(a) === identity(b)) continue; // duplicate data, not a clash
      const inScope = options.scope === 'group' ? shareGroupScope(a, b) : sharePerson(a, b);
      if (!inScope) continue;
      ids.add(a.id);
      ids.add(b.id);
    }
  }
  return ids;
}







// -----------------------------------------------------------
// annotateConflicts
// -----------------------------------------------------------
//
// The annotate stage of normalize → place → annotate: the
// verdict of conflictIds stamped onto placed layouts. Fresh
// objects for the flipped entries only — everything unchanged
// keeps its identity, so memoized cells stay put
//
// Used by:
//   - components/schedule/TimetableView.tsx — after placeDay
// -----------------------------------------------------------

export function annotateConflicts<T = object>(placed: readonly PlacedEntry<T>[], ids: ReadonlySet<string>): PlacedEntry<T>[] {
  return placed.map((p) => {
    const flagged = ids.has(p.entry.id) && !p.entry.isBlock;
    if (flagged === p.layout.isConflict) return p;
    return { entry: p.entry, layout: { ...p.layout, isConflict: flagged } };
  });
}
