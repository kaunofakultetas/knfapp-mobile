// -----------------------------------------------------------
//  [*] wayfind — editorHandoff
//
//  How the guided-capture and alignment screens hand a node
//  edit to the map editor underneath them. Both are separate
//  routes pushed over the editor, so they cannot reach its
//  useEditor actions; while the editor is mounted it registers
//  a sink here, and a screen delivers its edit as a FUNCTION of
//  the editor's live copy of the node — so "a new photo clears
//  the facing" is judged against what the editor holds now, not
//  against the route-param copy minted when the screen opened.
//  The editor applies the answer as an ordinary edit: one undo
//  step, the document updated at once (no stale copy left for a
//  later keep-mine to write back over the new photo), the op on
//  the editor's own outbox — sent now, or on the next network
//  restore while the editor stays mounted — stamped with the
//  editor's own base revision, a conflict shown in its own row.
//
//  A delivery answers what happened: 'applied'; 'declined' when
//  the editor's node made the edit refuse (it answered null —
//  the node is gone, or its panorama is not the one the
//  alignment measured on), which the screen reports and does
//  NOT retry elsewhere (writing it anyway would put a facing on
//  the wrong photo); or 'absent' when no editor is mounted (a
//  deep link straight into the screen) — only then does the
//  screen fall back to its own outbox.
//
//  Split into:
//
//    NodeEdit             — the patch-from-the-live-node function
//    registerNodeEditSink — the editor takes the channel
//    deliverNodeEdit      — a screen hands its edit over
//
//  Used by:
//    - app/(main)/map-editor/index.tsx — registers the sink
//    - app/(main)/map-editor/capture.tsx — the panorama assign
//    - app/(main)/map-editor/align.tsx — the facing confirm
// -----------------------------------------------------------

import type { GraphNode } from '@knf/wayfindengine';


// The patch shape the editor's updateNode takes — fields of a
// node, never its id
type NodePatch = Record<string, unknown>;

// The one sink, or null while no editor is mounted
let sink: ((nodeId: string, edit: NodeEdit) => 'applied' | 'declined') | null = null;







// -----------------------------------------------------------
// NodeEdit
// -----------------------------------------------------------
//
// The edit a screen hands over: given the editor's live node,
// the patch to apply — or null to decline (the node is not the
// one the screen worked on any more).
//
// Used by:
//   - registerNodeEditSink / deliverNodeEdit (below)
//   - app/(main)/map-editor/capture.tsx, align.tsx — build one
// -----------------------------------------------------------

export type NodeEdit = (node: GraphNode) => NodePatch | null;







// -----------------------------------------------------------
// registerNodeEditSink
// -----------------------------------------------------------
//
// The editor takes the channel for as long as it is mounted;
// the answer releases it — and only releases what it set, so a
// remounted editor's newer sink survives an older cleanup.
//
// Used by:
//   - app/(main)/map-editor/index.tsx — EditorBody's effect
// -----------------------------------------------------------

export function registerNodeEditSink(next: (nodeId: string, edit: NodeEdit) => 'applied' | 'declined'): () => void {

  sink = next;
  return () => {
    if (sink === next) sink = null;
  };
}







// -----------------------------------------------------------
// deliverNodeEdit
// -----------------------------------------------------------
//
// 'applied' by a mounted editor, 'declined' by it (its node
// made the edit refuse), or 'absent' — no editor to take it.
//
// Used by:
//   - app/(main)/map-editor/capture.tsx — the panorama assign
//   - app/(main)/map-editor/align.tsx — the facing confirm
// -----------------------------------------------------------

export function deliverNodeEdit(nodeId: string, edit: NodeEdit): 'applied' | 'declined' | 'absent' {

  return sink ? sink(nodeId, edit) : 'absent';
}
