// -----------------------------------------------------------
//  [*] wayfindeditor — useEditor
//
//  The editor as one hook: the document, the history, the
//  selection, the shown level and the validator's issues, with
//  actions that record into the open gesture and apply at
//  once. A gesture is begin(label) … end(); an action outside
//  one is its own undo step. Validation runs on the closed
//  document after a short quiet period (never per drag frame)
//  through the validator the host injects — the routing
//  engine's own validateGraph, typically — and issues carry a
//  stable id (code + ref) so an ignored one stays ignored.
//
//  Every closed checkpoint reaches the host through onCommit
//  as server ops stamped with the entities' revisions (the
//  ones the draft was loaded with, or the server's answers
//  since), and as the raw changes for a host that keeps its
//  own draft copy. A remote change (another admin's, the
//  server's conflict answer) enters through applyRemote,
//  bypassing history.
//
//  Used by:
//    - the host's editing screen
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { applyChanges, buildingFields, getEntity, normaliseDocument } from '../core/document';
import * as edits from '../core/edits';
import { HISTORY_CAP, beginClosing, emptyHistory, endClosing, recordClosing, redo as redoHistory, undo as undoHistory, type Checkpoint, type History } from '../core/history';
import { changesToOps, revisionKey, type ServerOp } from '../core/ops';
import type { BuildingFields, Change, EdgeLike, EditorIssue, EntityKind, GraphLike, LevelLike, NodeLike, Patch, RoomLike, Selection, Validator } from '../core/types';


export interface EditorOptions<G extends GraphLike> {
  document: G;
  // The draft revision the document came from, and per entity
  // ("kind:id") the revision it last changed in
  revision?: number;
  revisions?: Readonly<Record<string, number>>;
  validate?: Validator<G> | null;
  validateDelayMs?: number;
  onCommit?: (commit: { label: string; changes: Change[]; ops: ServerOp[] }) => void;
  nextOpId?: () => string;
}

export interface EditorState<G extends GraphLike> {
  document: G;
  revision: number;
  selection: Selection | null;
  shownLevel: string | null;
  issues: EditorIssue[];
  ignoredIssues: string[];
  canUndo: boolean;
  canRedo: boolean;
  // Closed checkpoints not yet undone — the session's edit count
  edits: number;
}

export interface EditorActions {
  begin: (label: string) => void;
  end: () => void;
  undo: () => void;
  redo: () => void;
  select: (selection: Selection | null) => void;
  showLevel: (id: string) => void;
  ignoreIssue: (id: string) => void;
  addLevel: (level: LevelLike) => edits.Edit;
  updateLevel: (id: string, patch: Patch<LevelLike>) => edits.Edit;
  deleteLevel: (id: string) => edits.Edit;
  addNode: (node: NodeLike) => edits.Edit;
  moveNode: (id: string, x: number, y: number) => edits.Edit;
  updateNode: (id: string, patch: Patch<NodeLike>) => edits.Edit;
  deleteNode: (id: string, options?: { force?: boolean }) => edits.Edit;
  addEdge: (a: string, b: string, extra?: Omit<EdgeLike, 'id' | 'a' | 'b'>) => edits.Edit;
  updateEdge: (id: string, patch: Patch<EdgeLike>) => edits.Edit;
  deleteEdge: (id: string) => edits.Edit;
  addRoom: (room: RoomLike) => edits.Edit;
  updateRoom: (id: string, patch: Patch<RoomLike>) => edits.Edit;
  deleteRoom: (id: string) => edits.Edit;
  setBuilding: (patch: Partial<BuildingFields>) => edits.Edit;
  // A change from outside (the server): applied, never recorded
  applyRemote: (changes: Change[], revisions?: Readonly<Record<string, number>>) => void;
  // A whole new document (a reload): history and selection reset
  replace: (document: GraphLike, revision: number, revisions?: Readonly<Record<string, number>>) => void;
  // The server accepted each entity at its own revision
  acknowledge: (entries: { kind: EntityKind; id: string; revision: number }[]) => void;
}

export interface UseEditorResult<G extends GraphLike> {
  state: EditorState<G>;
  actions: EditorActions;
}

const DEFAULT_VALIDATE_DELAY_MS = 300;

let opCounter = 0;
const defaultOpId = (): string => `op-${Date.now().toString(36)}-${(opCounter++).toString(36)}`;

export const issueId = (issue: { code: string; ref: string }): string => `${issue.code}:${issue.ref}`;







// -----------------------------------------------------------
// useEditor
// -----------------------------------------------------------
//
//   const { state, actions } = useEditor({ document, revision, revisions, validate: validateGraph, onCommit })
//   actions.begin('move'); actions.moveNode('n1', 10, 20); … actions.end()
//
// Used by:
//   - the host's editing screen
// -----------------------------------------------------------

export function useEditor<G extends GraphLike>(options: EditorOptions<G>): UseEditorResult<G> {

  const { validate = null, validateDelayMs = DEFAULT_VALIDATE_DELAY_MS, onCommit, nextOpId = defaultOpId } = options;


  // The document, the history and the revisions live in refs
  // (a drag records dozens of moves between renders) and are
  // mirrored into state once per action for the screen
  const docRef = useRef<G>(normaliseDocument(options.document));
  const historyRef = useRef<History>(emptyHistory());
  const revisionsRef = useRef<Record<string, number>>({ ...(options.revisions ?? {}) });
  const [revision, setRevision] = useState(options.revision ?? 0);
  const [document, setDocument] = useState<G>(docRef.current);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [shownLevel, setShownLevel] = useState<string | null>(docRef.current.levels[0]?.id ?? null);
  const [issues, setIssues] = useState<EditorIssue[]>([]);
  const [ignoredIssues, setIgnored] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const validateRef = useRef(validate);
  validateRef.current = validate;


  // Validation after a quiet period, on the document as it
  // stands then — the timer is reset by every change
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleValidation = useCallback(() => {
    if (validateTimer.current) clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(() => {
      validateTimer.current = null;
      const run = validateRef.current;
      if (!run) return;
      setIssues(run(docRef.current).map((issue) => ({ ...issue, id: issueId(issue) })));
    }, validateDelayMs);
  }, [validateDelayMs]);
  useEffect(() => {
    scheduleValidation();
    return () => {
      if (validateTimer.current) clearTimeout(validateTimer.current);
    };
  }, [scheduleValidation]);


  // Apply + record: the one path every edit takes. The history's
  // closing variants NAME the checkpoint they closed, so nothing
  // is inferred from the history's shape (at the cap the past's
  // length stops growing — inference lost edits there once) and
  // every closed checkpoint is committed exactly once
  const commit = useCallback((closed: Checkpoint | null) => {
    if (!closed) return;
    onCommitRef.current?.({ label: closed.label, changes: closed.changes, ops: changesToOps(closed.changes, revisionsRef.current, nextOpId) });
  }, [nextOpId]);

  const apply = useCallback((changes: Change[], label: string) => {
    if (changes.length === 0) return;
    docRef.current = applyChanges(docRef.current, changes);
    const { history, closed } = recordClosing(historyRef.current, changes, label);
    historyRef.current = history;
    commit(closed);
    setDocument(docRef.current);
    scheduleValidation();
  }, [commit, scheduleValidation]);

  const run = useCallback((edit: edits.Edit, label: string): edits.Edit => {
    apply(edit.changes, label);
    return edit;
  }, [apply]);


  const actions = useMemo<EditorActions>(() => ({
    begin: (label) => {
      // A begin while a gesture is open closes the earlier one —
      // its ops must reach the host like any other close
      const { history, closed } = beginClosing(historyRef.current, label);
      historyRef.current = history;
      commit(closed);
      setTick((n) => n + 1);
    },
    end: () => {
      const { history, closed } = endClosing(historyRef.current);
      historyRef.current = history;
      commit(closed);
      setTick((n) => n + 1);
    },
    undo: () => {
      // An open gesture is closed and COMMITTED first, so the
      // server always receives forward then inverse — never the
      // inverse of ops it was never sent
      const { history: settled, closed } = endClosing(historyRef.current);
      commit(closed);
      const { history, changes } = undoHistory(settled);
      historyRef.current = history;
      if (changes.length > 0) {
        docRef.current = applyChanges(docRef.current, changes);
        onCommitRef.current?.({ label: 'undo', changes, ops: changesToOps(changes, revisionsRef.current, nextOpId) });
        setDocument(docRef.current);
        scheduleValidation();
      }
      setTick((n) => n + 1);
    },
    redo: () => {
      // Same close-and-commit first: redoHistory would close an
      // open gesture silently (and empty the future) otherwise
      const { history: settled, closed } = endClosing(historyRef.current);
      commit(closed);
      const { history, changes } = redoHistory(settled);
      historyRef.current = history;
      if (changes.length > 0) {
        docRef.current = applyChanges(docRef.current, changes);
        onCommitRef.current?.({ label: 'redo', changes, ops: changesToOps(changes, revisionsRef.current, nextOpId) });
        setDocument(docRef.current);
        scheduleValidation();
      }
      setTick((n) => n + 1);
    },
    select: (next) => setSelection(next),
    showLevel: (id) => setShownLevel(id),
    ignoreIssue: (id) => setIgnored((held) => (held.includes(id) ? held : [...held, id])),
    addLevel: (level) => run(edits.addLevel(docRef.current, level), 'add level'),
    updateLevel: (id, patch) => run(edits.updateLevel(docRef.current, id, patch), 'edit level'),
    deleteLevel: (id) => run(edits.deleteLevel(docRef.current, id), 'delete level'),
    addNode: (node) => run(edits.addNode(docRef.current, node), 'add node'),
    moveNode: (id, x, y) => run(edits.moveNode(docRef.current, id, x, y), 'move node'),
    updateNode: (id, patch) => run(edits.updateNode(docRef.current, id, patch), 'edit node'),
    deleteNode: (id, opts) => run(edits.deleteNode(docRef.current, id, opts), 'delete node'),
    addEdge: (a, b, extra = { kind: 'hallway' }) => run(edits.addEdge(docRef.current, a, b, extra), 'link'),
    updateEdge: (id, patch) => run(edits.updateEdge(docRef.current, id, patch), 'edit link'),
    deleteEdge: (id) => run(edits.deleteEdge(docRef.current, id), 'delete link'),
    addRoom: (room) => run(edits.addRoom(docRef.current, room), 'add room'),
    updateRoom: (id, patch) => run(edits.updateRoom(docRef.current, id, patch), 'edit room'),
    deleteRoom: (id) => run(edits.deleteRoom(docRef.current, id), 'delete room'),
    setBuilding: (patch) => run(edits.setBuilding(docRef.current, patch), 'edit building'),
    applyRemote: (changes, revisions) => {
      docRef.current = applyChanges(docRef.current, changes);
      if (revisions) Object.assign(revisionsRef.current, revisions);
      setDocument(docRef.current);
      scheduleValidation();
    },
    replace: (next, nextRevision, revisions) => {
      docRef.current = normaliseDocument(next as G);
      historyRef.current = emptyHistory();
      revisionsRef.current = { ...(revisions ?? {}) };
      setRevision(nextRevision);
      setDocument(docRef.current);
      setSelection(null);
      setShownLevel((held) => (held && getEntity(docRef.current, 'level', held) ? held : (docRef.current.levels[0]?.id ?? null)));
      scheduleValidation();
    },
    acknowledge: (entries) => {
      // Per entry: each entity moves to the revision ITS batch
      // answered with, not the drain's last
      let top = 0;
      for (const entry of entries) {
        revisionsRef.current[revisionKey(entry.kind, entry.id)] = entry.revision;
        top = Math.max(top, entry.revision);
      }
      setRevision((held) => Math.max(held, top));
    },
  }), [commit, nextOpId, run, scheduleValidation]);


  // The mirror the screen reads; `tick` re-derives it after a
  // begin / end / undo that changed only the history
  const state = useMemo<EditorState<G>>(() => {
    const history = historyRef.current;
    return {
      document,
      revision,
      selection,
      shownLevel,
      issues,
      ignoredIssues,
      canUndo: history.past.length > 0 || (history.open?.changes.length ?? 0) > 0,
      canRedo: history.future.length > 0,
      edits: Math.min(HISTORY_CAP, history.past.length),
    };
    // tick is the history's change signal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, revision, selection, shownLevel, issues, ignoredIssues, tick]);


  return { state, actions };
}


export { buildingFields };
