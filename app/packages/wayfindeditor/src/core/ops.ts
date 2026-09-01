// -----------------------------------------------------------
//  [*] wayfindeditor — ops
//
//  What a server sync sends: one op per entity a checkpoint
//  touched, in the server's own vocabulary — upsert with the
//  entity's data (its id stripped: the id is the address, not
//  the payload), delete, or a building patch — each stamped
//  with the revision the phone's copy of that entity came from
//  (baseRevision), which is what the server's conflict check
//  reads. A brand-new entity (created here, no revision known)
//  carries no baseRevision and is marked fresh — the outbox
//  reads fresh to know a later delete cancels the pair
//  outright. The server ignores fields it does not know, so
//  fresh costs nothing on the wire. Op ids come from the
//  caller so a replayed batch applies once.
//
//  Used by:
//    - hooks/useEditor.ts — onCommit hands these to the host
// -----------------------------------------------------------

import type { Change, EntityKind } from './types';


export interface ServerOp {
  id: string;
  type: 'upsert' | 'delete' | 'building';
  kind?: EntityKind;
  entityId?: string;
  data?: Record<string, unknown>;
  baseRevision?: number;
  // The upsert creates the entity (no revision known) — set
  // true then, omitted otherwise
  fresh?: boolean;
}

export const revisionKey = (kind: EntityKind, id: string): string => `${kind}:${id}`;


export function changesToOps(changes: readonly Change[], revisions: Readonly<Record<string, number>>, nextId: () => string): ServerOp[] {

  const ops: ServerOp[] = [];
  for (const change of changes) {
    if (change.kind === 'building') {
      ops.push({ id: nextId(), type: 'building', data: { entranceNodeId: change.after.entranceNodeId, northDeg: change.after.northDeg } });
      continue;
    }
    const base = revisions[revisionKey(change.kind, change.id)];
    const stamp = typeof base === 'number' ? { baseRevision: base } : {};
    if (change.after === null) {
      ops.push({ id: nextId(), type: 'delete', kind: change.kind, entityId: change.id, ...stamp });
      continue;
    }
    const { id: _dropped, ...data } = change.after as unknown as { id?: string } & Record<string, unknown>;
    void _dropped;
    // Created here and never seen by the server: fresh tells
    // the outbox a later delete cancels the pair outright
    const mark = change.before === null && typeof base !== 'number' ? { fresh: true } : {};
    ops.push({ id: nextId(), type: 'upsert', kind: change.kind, entityId: change.id, data, ...stamp, ...mark });
  }
  return ops;
}
