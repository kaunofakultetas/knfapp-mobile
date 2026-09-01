// -----------------------------------------------------------
//  [*] timetableengine — perspective
//
//  The same entries through two pairs of eyes. A STUDENT sees
//  their group's week (a plain filter). A TEACHER sees their
//  own lessons across every group — and a lecture given to
//  three groups at once is ONE card carrying three group
//  chips, not three stacked copies: rows identical in
//  everything but group collapse, their groupKeys merged.
//  Teachers are display names only in today's data, so the
//  whole perspective is client-side string grouping — it
//  upgrades transparently if teacher ids ever land.
//
//  Used by:
//    - hosts switching the view between group and teacher
// -----------------------------------------------------------

import type { TimetableEntry } from './types';


// Sorted unique teacher names across every entry
export function listTeachers(entries: readonly TimetableEntry[]): string[] {
  const names = new Set<string>();
  for (const entry of entries) for (const name of entry.people ?? []) names.add(name);
  return [...names].sort((a, b) => a.localeCompare(b));
}


// The student view: one group's entries
export function forGroup<T = object>(entries: readonly TimetableEntry<T>[], groupKey: string): TimetableEntry<T>[] {
  return entries.filter((entry) => entry.groupKey === groupKey);
}


// Natural identity minus the group — what collapses across
// parallel groups in the teacher view. The term stays IN the
// key: the same weekly slot in two semesters is two lessons,
// never one card claiming both terms' groups at once
const naturalKey = (entry: TimetableEntry) =>
  [entry.termKey ?? '', entry.title, entry.day, entry.startMin, entry.endMin, (entry.people ?? []).join('|'), (entry.location ?? []).join('|')].join('~');


// The teacher view: their lessons, deduped across groups, each
// merged card listing every group it serves
export function forTeacher<T = object>(entries: readonly TimetableEntry<T>[], name: string): TimetableEntry<T>[] {
  const mine = entries.filter((entry) => (entry.people ?? []).includes(name));
  const byKey = new Map<string, TimetableEntry<T>>();
  for (const entry of mine) {
    const key = naturalKey(entry);
    const held = byKey.get(key);
    if (!held) {
      const groups = entry.groupKeys ?? (entry.groupKey ? [entry.groupKey] : []);
      byKey.set(key, { ...entry, groupKeys: [...groups] });
      continue;
    }
    const incoming = entry.groupKeys ?? (entry.groupKey ? [entry.groupKey] : []);
    const merged = new Set([...(held.groupKeys ?? []), ...incoming]);
    byKey.set(key, { ...held, groupKeys: [...merged].sort((a, b) => a.localeCompare(b)) });
  }
  return [...byKey.values()];
}
