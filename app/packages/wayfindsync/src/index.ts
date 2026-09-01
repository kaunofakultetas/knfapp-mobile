// -----------------------------------------------------------
//  [*] @knf/wayfindsync — public surface
//
//  Everything a host may import, in one place. The runtime
//  export list is pinned by src/__tests__/surface.test.ts —
//  adding here is deliberate; removing or renaming is a
//  breaking change for every host.
// -----------------------------------------------------------

export type {
  EntityKind,
  ServerOp,
  OpResult,
  OpsAnswer,
  UploadFile,
  PanoramaUploadResult,
  PlanUploadResult,
  FrameUploadResult,
  PublishIssue,
  PublishAnswer,
  SyncTransport,
  SyncStorage,
} from './core/types';
export { SyncRejected } from './core/types';

export { createOutbox, type Outbox, type OutboxEntry, type DrainReport } from './core/outbox';
export { createUploadQueue, RETRY_DELAYS_MS, type UploadQueue, type UploadItem } from './core/uploads';

export { WayfindSyncProvider, useWayfindSync, type SyncEnv, type SyncStatus } from './provider';
