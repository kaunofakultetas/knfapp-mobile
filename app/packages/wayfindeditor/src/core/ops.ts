// -----------------------------------------------------------
//  [*] wayfindeditor — ops
//
//  What a server sync sends: one op per entity a checkpoint
//  touched, in the server's own vocabulary — upsert with the
//  entity's data (its id stripped: the id is the address, not
//  the payload), delete, or a building patch — each stamped
//  with the revision the phone's copy of that entity came from
//  (baseRevision), which is what the server's conflict check
//  reads. An entity the phone did not create ALWAYS carries
//  one: when no revision is known its copy is the bundled
//  seed, revision 0, and saying so makes the server answer a
//  conflict for the host to settle instead of taking the seed
//  over whatever it holds. A brand-new entity (created here,
//  no revision known) carries no baseRevision and is marked
//  fresh — the outbox reads fresh to know a later delete
//  cancels the pair outright, the server reads it as the one
//  licence to write without a base. Op ids come from the
//  caller so a replayed batch applies once.
//
//  Used by:
//    - hooks/useEditor.ts — onCommit hands these to the host
// -----------------------------------------------------------

import type { Change, EntityKind } from './types';







// -----------------------------------------------------------
// ServerOp
// -----------------------------------------------------------
//
// One wire operation the server applies — id from the caller
// so a replayed batch applies once; field comments carry the
// fresh contract.
//
// Used by:
//   - changesToOps (below) — the output row
//   - hooks/useEditor.ts — onCommit hands these to the host
//   - src/index.ts — the public surface
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// revisionKey
// -----------------------------------------------------------
//
// The key an entity's known revision is stored under in the
// revisions map — "kind:id".
//
// Used by:
//   - changesToOps (below)
//   - hooks/useEditor.ts — acknowledge files revisions under it
// -----------------------------------------------------------

export const revisionKey = (kind: EntityKind, id: string): string => `${kind}:${id}`;







// -----------------------------------------------------------
// changesToOps
// -----------------------------------------------------------
//
// One op per change, in order: upsert with the entity's data
// (id stripped), delete, or a building patch — each stamped
// with the baseRevision found under revisionKey (0 when none
// is known and the entity was not created here), and marked
// fresh when created here with no revision known.
//
// Used by:
//   - hooks/useEditor.ts — building each commit's ops
//   - app/(main)/map-editor — seeding ops for a new building
// -----------------------------------------------------------

export function changesToOps(changes: readonly Change[], revisions: Readonly<Record<string, number>>, nextId: () => string): ServerOp[] {

  const ops: ServerOp[] = [];
  for (const change of changes) {
    if (change.kind === 'building') {
      ops.push({ id: nextId(), type: 'building', data: { entranceNodeId: change.after.entranceNodeId, northDeg: change.after.northDeg } });
      continue;
    }
    const base = revisions[revisionKey(change.kind, change.id)];
    // No revision known for an entity the phone did not create:
    // the copy is the bundled seed's, base 0 — never bare, which
    // the server would take as a licence to overwrite
    const stamp = typeof base === 'number' ? { baseRevision: base } : change.before === null ? {} : { baseRevision: 0 };
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
