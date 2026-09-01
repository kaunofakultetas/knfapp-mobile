// -----------------------------------------------------------
//  [*] wayfindeditor — history
//
//  Checkpoint undo. A gesture opens a checkpoint (begin), the
//  edits it produces are recorded into it, and lifting the
//  finger closes it (end) — so a drag of forty moves is ONE
//  undo step, from the first position straight back, because
//  a change recorded for an entity the open checkpoint already
//  holds keeps that first `before` and takes the new `after`.
//  An edit outside any gesture is its own checkpoint. Undo
//  inverts the newest closed checkpoint and moves it to the
//  future; a new checkpoint empties the future; the past is
//  capped so a long session never grows without bound.
//
//  Pure: every function answers a new History — the closing
//  variants beside it the Checkpoint they closed (so a caller
//  committing closed checkpoints never infers closure from
//  the history's shape), undo / redo the changes the document
//  must apply.
//
//  Used by:
//    - hooks/useEditor.ts
// -----------------------------------------------------------

import { invert } from './document';
import type { Change } from './types';


export interface Checkpoint {
  label: string;
  changes: Change[];
}

export interface History {
  past: Checkpoint[];
  future: Checkpoint[];
  // The gesture in progress, if any
  open: Checkpoint | null;
}

export const HISTORY_CAP = 200;

export const emptyHistory = (): History => ({ past: [], future: [], open: null });







// -----------------------------------------------------------
// beginClosing / recordClosing / endClosing
// -----------------------------------------------------------
//
// The explicit-answer variants: each names the checkpoint it
// closed (or null), so a caller committing closed checkpoints
// never has to infer closure from the shape of the history —
// at the cap the past's length stops growing, which is exactly
// when inference silently fails. recordClosing without an open
// checkpoint opens and closes one around the changes and
// answers it; beginClosing while one is open closes the
// earlier one first (a missed end never swallows the next
// gesture) and answers what it closed; endClosing answers the
// checkpoint it pushed into the past. Empty checkpoints never
// reach the past and are never answered as closed.
//
// Used by:
//   - hooks/useEditor.ts — commits every non-null answer
// -----------------------------------------------------------

export function beginClosing(history: History, label: string): { history: History; closed: Checkpoint | null } {
  const { history: settled, closed } = history.open ? endClosing(history) : { history, closed: null };
  return { history: { ...settled, open: { label, changes: [] } }, closed };
}


export function recordClosing(history: History, changes: readonly Change[], label = 'edit'): { history: History; closed: Checkpoint | null } {
  if (changes.length === 0) return { history, closed: null };
  if (!history.open) return endClosing(recordClosing(beginClosing(history, label).history, changes, label).history);
  return { history: { ...history, open: { label: history.open.label, changes: coalesce(history.open.changes, changes) } }, closed: null };
}


export function endClosing(history: History): { history: History; closed: Checkpoint | null } {
  const open = history.open;
  if (!open) return { history, closed: null };
  if (open.changes.length === 0) return { history: { ...history, open: null }, closed: null };
  const past = [...history.past, open].slice(-HISTORY_CAP);
  return { history: { past, future: [], open: null }, closed: open };
}







// -----------------------------------------------------------
// begin / record / end
// -----------------------------------------------------------
//
// The history-only wrappers, for callers that do not commit
// (nothing here differs from the closing variants beyond the
// dropped answer).
//
// Used by:
//   - undo / redo (below)
//   - hosts driving a history without the hook
// -----------------------------------------------------------

export function begin(history: History, label: string): History {
  return beginClosing(history, label).history;
}


export function record(history: History, changes: readonly Change[], label = 'edit'): History {
  return recordClosing(history, changes, label).history;
}


export function end(history: History): History {
  return endClosing(history).history;
}







// -----------------------------------------------------------
// undo / redo
// -----------------------------------------------------------
//
// Answers the changes to apply beside the new history; nothing
// to undo answers the history unchanged and no changes. An
// open checkpoint is closed first, so an undo mid-gesture
// undoes the gesture so far.
//
// Used by:
//   - hooks/useEditor.ts
// -----------------------------------------------------------

export function undo(history: History): { history: History; changes: Change[] } {
  const closed = end(history);
  const last = closed.past[closed.past.length - 1];
  if (!last) return { history: closed, changes: [] };
  return { history: { past: closed.past.slice(0, -1), future: [last, ...closed.future], open: null }, changes: invert(last.changes) };
}


export function redo(history: History): { history: History; changes: Change[] } {
  const closed = end(history);
  const [next, ...rest] = closed.future;
  if (!next) return { history: closed, changes: [] };
  return { history: { past: [...closed.past, next].slice(-HISTORY_CAP), future: rest, open: null }, changes: next.changes };
}







// -----------------------------------------------------------
// coalesce
// -----------------------------------------------------------
//
// Merges new changes into a checkpoint's list: a change for an
// entity already in the list keeps the list entry's `before`
// and takes the new `after` (an entity added then deleted in
// one gesture cancels out to nothing); a change for a new
// entity is appended, so cascade order survives.
//
// Used by:
//   - record (above)
// -----------------------------------------------------------

export function coalesce(existing: readonly Change[], incoming: readonly Change[]): Change[] {
  const out: Change[] = [...existing];
  for (const change of incoming) {
    const key = change.kind === 'building' ? 'building' : `${change.kind}:${change.id}`;
    const at = out.findIndex((c) => (c.kind === 'building' ? 'building' : `${c.kind}:${c.id}`) === key);
    if (at < 0) {
      out.push(change);
      continue;
    }
    const held = out[at];
    if (held.kind === 'building' && change.kind === 'building') {
      out[at] = { kind: 'building', before: held.before, after: change.after };
    } else if (held.kind !== 'building' && change.kind !== 'building') {
      if (held.before === null && change.after === null) out.splice(at, 1);
      else out[at] = { ...held, after: change.after };
    }
  }
  return out;
}
