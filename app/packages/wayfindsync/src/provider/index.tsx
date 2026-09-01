// -----------------------------------------------------------
//  [*] wayfindsync — provider
//
//  One outbox and one upload queue per building, loaded from
//  the injected storage on mount and drained on mount, on
//  every enqueue, on every network-restore signal the host
//  fans in, and on demand. The hook hands the screen the
//  counts it shows (pending, sending, rejected, uploads done
//  and failed), the enqueue calls, the conflict resolutions,
//  the publish action and the drain results as they arrive —
//  the applied entities with the server's revision, so the
//  editor can re-stamp; the finished uploads, so the editor
//  can write the stored urls into the document.
//
//  Used by:
//    - the host's editing screen
// -----------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { createOutbox, type DrainReport, type Outbox, type OutboxEntry } from '../core/outbox';
import { createUploadQueue, type UploadItem, type UploadQueue } from '../core/uploads';
import type { PublishAnswer, ServerOp, SyncStorage, SyncTransport } from '../core/types';


export interface SyncStatus {
  loaded: boolean;
  pendingOps: number;
  sendingOps: number;
  rejectedOps: readonly OutboxEntry[];
  uploads: readonly UploadItem[];
  // The last drain's answer, for the screen's "synced" line
  lastDrain: DrainReport | null;
  draining: boolean;
}

export interface SyncEnv {
  buildingId: string;
  status: SyncStatus;
  enqueueOps: (ops: readonly ServerOp[]) => void;
  enqueueUpload: (item: Parameters<UploadQueue['enqueue']>[0]) => void;
  acknowledgeUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  removeUpload: (id: string) => void;
  resolveConflict: (opId: string, how: 'keep-mine' | 'drop') => void;
  drain: () => Promise<DrainReport | null>;
  publish: (note?: string | null) => Promise<PublishAnswer>;
  clearAll: () => void;
}

const SyncContext = createContext<SyncEnv | null>(null);







// -----------------------------------------------------------
// WayfindSyncProvider
// -----------------------------------------------------------
//
//   <WayfindSyncProvider buildingId="knf" storage={AsyncStorage} transport={transport} onRestore={onRestore} onDrained={…}>
//
// onDrained receives every drain report (applied entities and
// their revision, rejections) and onUploaded every finished
// upload — the host's editor reads them and acknowledges.
//
// Used by:
//   - the host's editing screen
// -----------------------------------------------------------

export function WayfindSyncProvider({
  buildingId,
  storage,
  transport,
  onRestore,
  onDrained,
  onUploaded,
  keyPrefix = 'wayfind',
  children,
}: {
  buildingId: string;
  storage: SyncStorage;
  transport: SyncTransport;
  // Subscribe to the host's network-restore bus; answers the unsubscribe
  onRestore?: (listener: () => void) => () => void;
  onDrained?: (report: DrainReport) => void;
  onUploaded?: (item: UploadItem) => void;
  keyPrefix?: string;
  children: ReactNode;
}) {

  const outbox = useMemo<Outbox>(() => createOutbox(storage, `${keyPrefix}:ops:${buildingId}`), [storage, keyPrefix, buildingId]);
  const uploads = useMemo<UploadQueue>(() => createUploadQueue(storage, `${keyPrefix}:uploads:${buildingId}`), [storage, keyPrefix, buildingId]);
  const [loaded, setLoaded] = useState(false);
  const [draining, setDraining] = useState(false);
  const [lastDrain, setLastDrain] = useState<DrainReport | null>(null);
  const [tick, setTick] = useState(0);

  const transportRef = useRef(transport);
  transportRef.current = transport;
  const onDrainedRef = useRef(onDrained);
  onDrainedRef.current = onDrained;
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;
  const reported = useRef(new Set<string>());


  // Both queues drained together; the upload results are
  // handed over once each, the ops report every time
  const drain = useCallback(async (): Promise<DrainReport | null> => {
    setDraining(true);
    try {
      const report = await outbox.drain(transportRef.current, buildingId);
      await uploads.drain(transportRef.current, buildingId);
      for (const item of uploads.items()) {
        if (item.status === 'done' && !reported.current.has(item.id)) {
          reported.current.add(item.id);
          onUploadedRef.current?.(item);
        }
      }
      setLastDrain(report);
      onDrainedRef.current?.(report);
      return report;
    } catch {
      return null;
    } finally {
      setDraining(false);
    }
  }, [outbox, uploads, buildingId]);


  useEffect(() => {
    let alive = true;
    const rerender = () => setTick((n) => n + 1);
    const stopOutbox = outbox.subscribe(rerender);
    const stopUploads = uploads.subscribe(rerender);
    void (async () => {
      await Promise.all([outbox.load(), uploads.load()]);
      if (!alive) return;
      setLoaded(true);
      void drain();
    })();
    const stopRestore = onRestore?.(() => {
      void drain();
    });
    return () => {
      alive = false;
      stopOutbox();
      stopUploads();
      stopRestore?.();
    };
  }, [outbox, uploads, onRestore, drain]);


  const env = useMemo<SyncEnv>(() => {
    const entries = outbox.entries();
    return {
      buildingId,
      status: {
        loaded,
        pendingOps: entries.filter((entry) => entry.status === 'queued').length,
        sendingOps: entries.filter((entry) => entry.status === 'sending').length,
        rejectedOps: outbox.rejected(),
        uploads: uploads.items(),
        lastDrain,
        draining,
      },
      enqueueOps: (ops) => {
        outbox.enqueue(ops);
        void drain();
      },
      enqueueUpload: (item) => {
        uploads.enqueue(item);
        void drain();
      },
      acknowledgeUpload: (id) => uploads.acknowledge(id),
      retryUpload: (id) => {
        uploads.retry(id);
        void drain();
      },
      removeUpload: (id) => uploads.remove(id),
      resolveConflict: (opId, how) => {
        outbox.resolve(opId, how);
        void drain();
      },
      drain,
      publish: (note) => transportRef.current.publish(buildingId, note ?? null),
      clearAll: () => {
        outbox.clear();
        uploads.clear();
        reported.current.clear();
      },
    };
    // The tick — bumped by the queues' subscriptions — is the dep
    // that re-derives the counts: the queues mutate their arrays in
    // place, so an enqueue during an in-flight drain moves nothing
    // else in this list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox, uploads, buildingId, loaded, lastDrain, draining, drain, tick]);


  return <SyncContext.Provider value={env}>{children}</SyncContext.Provider>;
}







// -----------------------------------------------------------
// useWayfindSync
// -----------------------------------------------------------
//
// Used by:
//   - the host's editing screen
// -----------------------------------------------------------

export function useWayfindSync(): SyncEnv {
  const env = useContext(SyncContext);
  if (!env) throw new Error('useWayfindSync must be used inside <WayfindSyncProvider>');
  return env;
}
