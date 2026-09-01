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

export type EntityKind = 'level' | 'node' | 'edge' | 'room';

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

export interface OpsAnswer {
  revision: number;
  results: OpResult[];
}

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

export interface PanoramaUploadResult {
  id: string;
  url: string;
  width: number;
  height: number;
  bytes: number;
  hfovDeg: number;
  vfovDeg: number;
}

export interface PlanUploadResult {
  id: string;
  url: string;
  bytes: number;
}

// The server's answer to one capture frame: how many frames the
// capture holds now and how many the target plan expects
export interface FrameUploadResult {
  stored: number;
  expected: number;
}

export interface PublishIssue {
  severity: 'error' | 'warning';
  code: string;
  ref: string;
  message: string;
}

export type PublishAnswer = { ok: true; revision: number; etag: string; publishedAt: string } | { ok: false; reason: 'invalid'; issues: PublishIssue[] } | { ok: false; reason: 'unchanged' };

export interface SyncTransport {
  postOps(buildingId: string, ops: ServerOp[]): Promise<OpsAnswer>;
  publish(buildingId: string, note?: string | null): Promise<PublishAnswer>;
  uploadPanorama(buildingId: string, file: UploadFile, fields: Record<string, string>): Promise<PanoramaUploadResult>;
  uploadPlan(buildingId: string, file: UploadFile, fields: Record<string, string>): Promise<PlanUploadResult>;
  // fields carry captureId, targetId, yawDeg, pitchDeg, rollDeg —
  // all strings; the transport addresses the capture's frame slot
  uploadFrame(buildingId: string, file: UploadFile, fields: Record<string, string>): Promise<FrameUploadResult>;
}

export interface SyncStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Thrown by a transport for an answer that is not worth
// retrying (a 4xx that is not a rate limit): the queue parks
// the item as failed instead of trying again
export class SyncRejected extends Error {
  readonly code: string;
  constructor(message: string, code = 'rejected') {
    super(message);
    this.name = 'SyncRejected';
    this.code = code;
  }
}
