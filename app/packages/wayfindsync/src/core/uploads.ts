// -----------------------------------------------------------
//  [*] wayfindsync — uploads
//
//  The persisted upload queue for panoramas and plans. Each
//  item names a local file, what it is and the fields that go
//  with it; the drain sends them one at a time through the
//  transport and remembers each answer (the stored url the
//  editor writes into a node or a level) until the host reads
//  it. A transport failure backs the item off along the retry
//  ladder and the drain moves on; an answer the transport
//  marks as final (SyncRejected — a bad image, a refused id)
//  parks the item as failed for the host to show and drop.
//  Single-flight, like the outbox; persisted after every
//  change. The file itself stays where the host put it — the
//  queue holds a reference, never the bytes.
//
//  Used by:
//    - provider/index.tsx — one queue per building
// -----------------------------------------------------------

import type { PanoramaUploadResult, PlanUploadResult, SyncStorage, SyncTransport, UploadFile } from './types';
import { SyncRejected } from './types';


export interface UploadItem {
  id: string;
  kind: 'panorama' | 'plan';
  file: UploadFile;
  fields: Record<string, string>;
  // What the host will do with the answer — an opaque tag it
  // reads back (a node id, a level id)
  target?: string | null;
  status: 'queued' | 'sending' | 'done' | 'failed';
  attempts: number;
  // Epoch ms before which the item is not retried
  notBefore: number;
  result?: PanoramaUploadResult | PlanUploadResult | null;
  error?: string | null;
  queuedAt: number;
}

export interface UploadQueue {
  load(): Promise<void>;
  items(): readonly UploadItem[];
  enqueue(item: Omit<UploadItem, 'status' | 'attempts' | 'notBefore' | 'queuedAt' | 'result' | 'error'>): void;
  drain(transport: SyncTransport, buildingId: string): Promise<void>;
  // The host has consumed a finished item's answer
  acknowledge(id: string): void;
  retry(id: string): void;
  remove(id: string): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

// Milliseconds before the next attempt, indexed by failures made
// minus one — the first failure retries at once, the last rung repeats
export const RETRY_DELAYS_MS = [0, 1000, 3000, 5000, 15000, 60000];


export function createUploadQueue(storage: SyncStorage, key: string, now: () => number = () => Date.now()): UploadQueue {

  let items: UploadItem[] = [];
  let draining: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const commit = () => {
    void storage.setItem(key, JSON.stringify(items)).catch(() => undefined);
    notify();
  };


  return {
    async load() {
      try {
        const raw = await storage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as UploadItem[]) : [];
        items = parsed.map((item) => (item.status === 'sending' ? { ...item, status: 'queued' } : item));
      } catch {
        items = [];
      }
      notify();
    },

    items: () => items,

    enqueue(item) {
      if (items.some((held) => held.id === item.id)) return;
      items.push({ ...item, status: 'queued', attempts: 0, notBefore: 0, queuedAt: now(), result: null, error: null });
      commit();
    },

    drain(transport, buildingId) {
      if (draining) return draining;
      const run = async () => {
        {
          for (;;) {
            const next = items.find((item) => item.status === 'queued' && item.notBefore <= now());
            if (!next) return;
            next.status = 'sending';
            notify();
            try {
              const result = next.kind === 'panorama' ? await transport.uploadPanorama(buildingId, next.file, next.fields) : await transport.uploadPlan(buildingId, next.file, next.fields);
              next.status = 'done';
              next.result = result;
              next.error = null;
            } catch (error) {
              next.attempts += 1;
              if (error instanceof SyncRejected) {
                next.status = 'failed';
                next.error = error.code;
              } else {
                next.status = 'queued';
                next.error = error instanceof Error ? error.message : String(error);
                next.notBefore = now() + RETRY_DELAYS_MS[Math.min(next.attempts - 1, RETRY_DELAYS_MS.length - 1)];
              }
            }
            commit();
          }
        }
      };
      // The latch clears only after the promise settles — a body
      // that never awaits would otherwise clear it before it is set
      const flight = run().finally(() => {
        draining = null;
      });
      draining = flight;
      return flight;
    },

    acknowledge(id) {
      items = items.filter((item) => !(item.id === id && item.status === 'done'));
      commit();
    },

    retry(id) {
      const item = items.find((held) => held.id === id);
      if (!item || item.status !== 'failed') return;
      item.status = 'queued';
      item.notBefore = 0;
      item.error = null;
      commit();
    },

    remove(id) {
      items = items.filter((item) => item.id !== id);
      commit();
    },

    clear() {
      items = [];
      void storage.removeItem(key).catch(() => undefined);
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
