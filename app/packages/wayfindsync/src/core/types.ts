// -----------------------------------------------------------
//  [*] wayfindsync — types
//
//  The wire the package speaks, structurally: ops in the
//  server's vocabulary (the editor package produces the same
//  shape without either importing the other), the server's
//  per-op answers, the files an upload queue carries, and the
//  transport a host implements over its own HTTP client. The
//  storage is the small key-value surface every persisted
//  queue in this family uses.
//
//  Used by:
//    - everything in the package
// -----------------------------------------------------------







// -----------------------------------------------------------
// EntityKind
// -----------------------------------------------------------
//
// The four entity families an op may address — the same
// union the editor speaks, met structurally.
//
// Used by:
//   - ServerOp (below)
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type EntityKind = 'level' | 'node' | 'edge' | 'room';







// -----------------------------------------------------------
// ServerOp
// -----------------------------------------------------------
//
// One wire operation in the server's vocabulary — the
// editor package produces the same shape without either
// importing the other; the fresh contract rides on its
// field comment.
//
// Used by:
//   - OpsAnswer / SyncTransport (below), core/outbox.ts
//   - provider/index.tsx — enqueueOps' rows
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface ServerOp {
  id: string;
  type: 'upsert' | 'delete' | 'building';
  kind?: EntityKind;
  entityId?: string;
  data?: Record<string, unknown>;
  baseRevision?: number;
  // True only on an upsert that CREATES an entity the server has
  // never heard of — the editor sets it, the outbox reads it for
  // the delete-cancel, the server ignores it
  fresh?: boolean;
}







// -----------------------------------------------------------
// OpResult
// -----------------------------------------------------------
//
// The server's per-op answer; field comments carry the
// conflict and duplicate contracts.
//
// Used by:
//   - OpsAnswer (below), core/outbox.ts — the drain's verdicts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface OpResult {
  id: string | null;
  status: 'applied' | 'rejected' | 'duplicate';
  reason?: string | null;
  // On a conflict: the entity as the server holds it
  current?: { data: Record<string, unknown> | null; revision: number; deleted: boolean } | null;
  // On a duplicate: what the logged op's answer had been, and the
  // revision its row holds (null when it had been rejected) — a
  // replay after a lost answer must not bury a rejection
  of?: 'applied' | 'rejected';
  revision?: number | null;
}







// -----------------------------------------------------------
// OpsAnswer
// -----------------------------------------------------------
//
// One batch's answer — the revision it landed as and one
// result per op, in order.
//
// Used by:
//   - SyncTransport (below) — postOps' answer
//   - core/outbox.ts — read on every drain
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface OpsAnswer {
  revision: number;
  results: OpResult[];
}







// -----------------------------------------------------------
// UploadFile
// -----------------------------------------------------------
//
// What a host hands an upload — the local uri and the
// multipart name/type.
//
// Used by:
//   - SyncTransport (below), core/uploads.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}







// -----------------------------------------------------------
// PanoramaUploadResult
// -----------------------------------------------------------
//
// The stored panorama as the server answers it — the url
// the editor writes into the node, plus the measured facts.
//
// Used by:
//   - SyncTransport (below), core/uploads.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface PanoramaUploadResult {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  hfovDeg: number;
  vfovDeg: number;
}







// -----------------------------------------------------------
// PlanUploadResult
// -----------------------------------------------------------
//
// The stored plan drawing — the url the editor writes into
// the level.
//
// Used by:
//   - SyncTransport (below), core/uploads.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface PlanUploadResult {
  id: string;
  url: string;
  bytes: number;
}







// -----------------------------------------------------------
// FrameUploadResult
// -----------------------------------------------------------
//
// The server's answer to one capture frame: how many frames
// the capture holds now and how many the target plan
// expects.
//
// Used by:
//   - SyncTransport (below), core/uploads.ts
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface FrameUploadResult {
  stored: number;
  expected: number;
}







// -----------------------------------------------------------
// PublishIssue
// -----------------------------------------------------------
//
// One reason a publish was refused, in the validator's
// shape.
//
// Used by:
//   - PublishAnswer (below)
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface PublishIssue {
  severity: 'error' | 'warning';
  code: string;
  ref: string;
  message: string;
}







// -----------------------------------------------------------
// PublishAnswer
// -----------------------------------------------------------
//
// A publish either lands with its revision and etag, is
// refused with the validator's issues, or changes nothing.
//
// Used by:
//   - SyncTransport (below), provider/index.tsx — publish()
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export type PublishAnswer = { ok: true; revision: number; etag: string; publishedAt: string } | { ok: false; reason: 'invalid'; issues: PublishIssue[] } | { ok: false; reason: 'unchanged' };







// -----------------------------------------------------------
// SyncTransport
// -----------------------------------------------------------
//
// What a host implements over its own HTTP client — the
// whole wire in five calls; field comments carry the frame
// fields.
//
// Used by:
//   - core/outbox.ts, core/uploads.ts, provider/index.tsx
//   - services/wayfindTransport.ts (the host app)
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface SyncTransport {
  postOps(buildingId: string, ops: ServerOp[]): Promise<OpsAnswer>;
  publish(buildingId: string, note?: string | null): Promise<PublishAnswer>;
  uploadPanorama(buildingId: string, file: UploadFile, fields: Record<string, string>): Promise<PanoramaUploadResult>;
  uploadPlan(buildingId: string, file: UploadFile, fields: Record<string, string>): Promise<PlanUploadResult>;
  // fields carry captureId, targetId, yawDeg, pitchDeg, rollDeg —
  // all strings; the transport addresses the capture's frame slot
  uploadFrame(buildingId: string, file: UploadFile, fields: Record<string, string>): Promise<FrameUploadResult>;
}







// -----------------------------------------------------------
// SyncStorage
// -----------------------------------------------------------
//
// The small key-value surface every persisted queue in this
// family uses — AsyncStorage satisfies it as-is.
//
// Used by:
//   - core/outbox.ts, core/uploads.ts, provider/index.tsx
//   - src/index.ts — the public surface
// -----------------------------------------------------------

export interface SyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}







// -----------------------------------------------------------
// SyncRejected
// -----------------------------------------------------------
//
// Thrown by a transport for an answer that is not worth
// retrying (a 4xx that is not a rate limit): the queue parks
// the item as failed instead of trying again.
//
// Used by:
//   - core/uploads.ts — the final-versus-retry test on a drain
//   - services/wayfindTransport.ts (the host) — thrown for
//     final server answers
// -----------------------------------------------------------

export class SyncRejected extends Error {
  readonly code: string;
  constructor(message: string, code = 'rejected') {
    super(message);
    this.name = 'SyncRejected';
    this.code = code;
  }
}
