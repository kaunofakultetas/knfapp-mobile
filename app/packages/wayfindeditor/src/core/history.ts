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







// -----------------------------------------------------------
// Checkpoint
// -----------------------------------------------------------
//
// One undoable gesture — its label and every change it made.
//
// Used by:
//   - History (below) — the stacks' rows
//   - hooks/useEditor.ts — committed on close
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface Checkpoint {
  label: string;
  changes: Change[];
}







// -----------------------------------------------------------
// History
// -----------------------------------------------------------
//
// The two stacks and the gesture in progress — plain data,
// every function below answers a new one.
//
// Used by:
//   - every function below, hooks/useEditor.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface History {
  past: Checkpoint[];
  future: Checkpoint[];
  // The gesture in progress, if any
  open: Checkpoint | null;
}







// -----------------------------------------------------------
// HISTORY_CAP
// -----------------------------------------------------------
//
// How many closed checkpoints the past holds — older ones fall
// off, so a long session never grows without bound.
//
// Used by:
//   - endClosing, redo (below)
//   - hooks/useEditor.ts — caps the reported edit count
// -----------------------------------------------------------

export const HISTORY_CAP = 200;







// -----------------------------------------------------------
// emptyHistory
// -----------------------------------------------------------
//
// A factory, not a shared constant — every caller gets fresh
// stacks, so one editor's history is never another's.
//
// Used by:
//   - hooks/useEditor.ts — the initial history, and the reset
//     on replace
// -----------------------------------------------------------

export const emptyHistory = (): History => ({ past: [], future: [], open: null });







// -----------------------------------------------------------
// beginClosing
// -----------------------------------------------------------
//
// The explicit-answer variants (beginClosing, recordClosing,
// endClosing): each names the checkpoint it closed (or null),
// so a caller committing closed checkpoints never has to infer
// closure from the shape of the history — at the cap the
// past's length stops growing, which is exactly when inference
// silently fails.
//
// beginClosing while a checkpoint is open closes the earlier
// one first (a missed end never swallows the next gesture) and
// answers what it closed.
//
// Used by:
//   - recordClosing (below), begin (below)
//   - hooks/useEditor.ts — commits every non-null answer
// -----------------------------------------------------------

export function beginClosing(history: History, label: string): { history: History; closed: Checkpoint | null } {
  const { history: settled, closed } = history.open ? endClosing(history) : { history, closed: null };
  return { history: { ...settled, open: { label, changes: [] } }, closed };
}







// -----------------------------------------------------------
// recordClosing
// -----------------------------------------------------------
//
// Records changes into the open checkpoint (coalesced, so a
// drag stays one undo step). Without an open checkpoint it
// opens and closes one around the changes and answers it.
//
// Used by:
//   - record (below)
//   - hooks/useEditor.ts — every edit action
// -----------------------------------------------------------

export function recordClosing(history: History, changes: readonly Change[], label = 'edit'): { history: History; closed: Checkpoint | null } {
  if (changes.length === 0) return { history, closed: null };
  if (!history.open) return endClosing(recordClosing(beginClosing(history, label).history, changes, label).history);
  return { history: { ...history, open: { label: history.open.label, changes: coalesce(history.open.changes, changes) } }, closed: null };
}







// -----------------------------------------------------------
// endClosing
// -----------------------------------------------------------
//
// Answers the checkpoint it pushed into the past. Empty
// checkpoints never reach the past and are never answered as
// closed.
//
// Used by:
//   - beginClosing, recordClosing (above); end (below)
//   - hooks/useEditor.ts — closing a gesture, and before undo,
//     redo and commit
// -----------------------------------------------------------

export function endClosing(history: History): { history: History; closed: Checkpoint | null } {
  const open = history.open;
  if (!open) return { history, closed: null };
  if (open.changes.length === 0) return { history: { ...history, open: null }, closed: null };
  const past = [...history.past, open].slice(-HISTORY_CAP);
  return { history: { past, future: [], open: null }, closed: open };
}







// -----------------------------------------------------------
// begin
// -----------------------------------------------------------
//
// The history-only wrappers (begin, record, end), for callers
// that do not commit — nothing here differs from the closing
// variants beyond the dropped answer.
//
// Used by:
//   - hosts driving a history without the hook; nothing in the
//     repo calls this at the moment
// -----------------------------------------------------------

export function begin(history: History, label: string): History {
  return beginClosing(history, label).history;
}







// -----------------------------------------------------------
// record
// -----------------------------------------------------------
//
// recordClosing with the closed answer dropped — changes
// still coalesce into the open checkpoint, and outside a
// gesture they still close around themselves.
//
// Used by:
//   - hosts driving a history without the hook; nothing in the
//     repo calls this at the moment
// -----------------------------------------------------------

export function record(history: History, changes: readonly Change[], label = 'edit'): History {
  return recordClosing(history, changes, label).history;
}







// -----------------------------------------------------------
// end
// -----------------------------------------------------------
//
// endClosing with the closed answer dropped — undo and redo
// close the open gesture this way because they have no use
// for the checkpoint it closed.
//
// Used by:
//   - undo / redo (below)
// -----------------------------------------------------------

export function end(history: History): History {
  return endClosing(history).history;
}







// -----------------------------------------------------------
// undo
// -----------------------------------------------------------
//
// Answers the changes to apply beside the new history; nothing
// to undo answers the history unchanged and no changes. An
// open checkpoint is closed first, so an undo mid-gesture
// undoes the gesture so far.
//
// Used by:
//   - hooks/useEditor.ts — actions.undo
// -----------------------------------------------------------

export function undo(history: History): { history: History; changes: Change[] } {
  const closed = end(history);
  const last = closed.past[closed.past.length - 1];
  if (!last) return { history: closed, changes: [] };
  return { history: { past: closed.past.slice(0, -1), future: [last, ...closed.future], open: null }, changes: invert(last.changes) };
}







// -----------------------------------------------------------
// redo
// -----------------------------------------------------------
//
// The mirror of undo: replays the newest checkpoint in the
// future, closing any open checkpoint first.
//
// Used by:
//   - hooks/useEditor.ts — actions.redo
// -----------------------------------------------------------

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
//   - recordClosing (above)
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
