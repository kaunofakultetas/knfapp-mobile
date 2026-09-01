// -----------------------------------------------------------
//  [*] @knf/wayfindeditor — public surface
//
//  Everything a host may import, in one place. The runtime
//  export list is pinned by src/__tests__/surface.test.ts —
//  adding here is deliberate; removing or renaming is a
//  breaking change for every host.
// -----------------------------------------------------------

// The vocabulary
export type {
  EntityKind,
  LevelLike,
  NodeLike,
  EdgeLike,
  RoomLike,
  GraphLike,
  Entity,
  EntityOf,
  BuildingFields,
  Patch,
  Change,
  Selection,
  EditorIssue,
  Validator,
} from './core/types';

// The document and its one way of changing
export { normaliseDocument, getEntity, entityId, buildingFields, applyChanges, invert } from './core/document';

// The editing verbs, for hosts driving a document without the hook
export {
  addLevel,
  updateLevel,
  deleteLevel,
  addNode,
  moveNode,
  updateNode,
  deleteNode,
  addEdge,
  updateEdge,
  deleteEdge,
  addRoom,
  updateRoom,
  deleteRoom,
  setBuilding,
  type Edit,
} from './core/edits';

// Checkpoint undo, pure — the closing variants name the
// checkpoint they closed, for callers that commit
export { emptyHistory, begin, record, end, beginClosing, recordClosing, endClosing, undo, redo, coalesce, HISTORY_CAP, type Checkpoint, type History } from './core/history';

// What a sync sends
export { changesToOps, revisionKey, type ServerOp } from './core/ops';

// The hook
export { useEditor, issueId, type EditorOptions, type EditorState, type EditorActions, type UseEditorResult } from './hooks/useEditor';
