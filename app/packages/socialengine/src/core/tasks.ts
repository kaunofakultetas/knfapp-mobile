// -----------------------------------------------------------
//  [*] socialengine — tasks
//
//  The offline queue: a like or a relationship action taken
//  while the transport was down keeps its optimistic shadow
//  and is replayed when connectivity returns. One entry per
//  TARGET — a later intent on the same target replaces the
//  earlier one, so the replay fires the viewer's FINAL word
//  once, never the tap history (a toggle backend would flip on
//  every replayed step otherwise).
//
//  Persisted under one key ('social:tasks') through whatever
//  storage the provider was given; without real storage the
//  queue still works for the session. The provider clears it
//  whenever the signed-in account changes — a departing
//  viewer's intents must never fire as the next account.
//
//  Split into:
//
//    PendingSocialTask     — the entry shapes
//    socialTaskKey         — one-per-target identity
//    createSocialTaskQueue — the persisted queue
// -----------------------------------------------------------

import type { LikeTarget, RelationshipAction } from './transport';
import type { SocialStorage } from './storage';


// The one SocialStorage slot the whole queue persists under
const STORAGE_KEY = 'social:tasks';







// -----------------------------------------------------------
// PendingSocialTask
// -----------------------------------------------------------
//
// One queued intent — the viewer's FINAL word on a target,
// stamped with when it was made.
//
// Used by:
//   - socialTaskKey, createSocialTaskQueue (below)
//   - provider/index.tsx — replayTasks walks these rows
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export type PendingSocialTask =
  | { type: 'like'; target: LikeTarget; desired: boolean; at: string }
  | { type: 'relationship'; userId: string; action: RelationshipAction; at: string };







// -----------------------------------------------------------
// socialTaskKey
// -----------------------------------------------------------
//
// The one-per-target identity — a later intent on the same
// key replaces the earlier one in the queue.
//
// Used by:
//   - createSocialTaskQueue (below) — add, remove and the
//     rehydrate all key by it
// -----------------------------------------------------------

export const socialTaskKey = (task: PendingSocialTask): string =>
  task.type === 'like' ? `like:${task.target.type}:${task.target.id}` : `rel:${task.userId}`;







// -----------------------------------------------------------
// SocialTaskQueue
// -----------------------------------------------------------
//
// The queue's surface — load once, mutate, subscribe.
//
// Used by:
//   - createSocialTaskQueue (below) — the implementation
//   - provider/index.tsx — the env's `taskQueue`, which the
//     like and relationship hooks reach through the env
//   - src/index.ts — the public surface hosts import from
// -----------------------------------------------------------

export interface SocialTaskQueue {
  // Rehydrate once; later calls answer the same promise
  load(): Promise<void>;
  // Insertion order, replacements keeping their original slot
  list(): PendingSocialTask[];
  // Adds or REPLACES by target key, then persists
  add(task: PendingSocialTask): void;
  remove(task: PendingSocialTask): void;
  clear(): void;
  // Fires after every mutation; returns the unsubscribe
  subscribe(listener: () => void): () => void;
}







// -----------------------------------------------------------
// createSocialTaskQueue
// -----------------------------------------------------------
//
// Used by:
//   - provider/index.tsx — one queue per provider, wired to
//     the hooks and to replayTasks()
// -----------------------------------------------------------

export function createSocialTaskQueue(storage: SocialStorage): SocialTaskQueue {

  const tasks = new Map<string, PendingSocialTask>();
  const listeners = new Set<() => void>();
  let loaded: Promise<void> | null = null;


  const emit = () => listeners.forEach((fn) => fn());

  // Fire-and-forget like every storage write in the engine — a
  // full disk loses persistence, never the in-session queue
  const persist = () => {
    void storage.setItem(STORAGE_KEY, JSON.stringify([...tasks.values()])).catch(() => {});
  };


  return {
    load() {
      if (!loaded) {
        loaded = (async () => {
          try {
            const raw = await storage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) return;
            for (const entry of parsed as PendingSocialTask[]) {
              if (!entry || typeof entry !== 'object') continue;
              if (entry.type === 'like' && entry.target && typeof entry.target.id === 'string' && typeof entry.desired === 'boolean') {
                tasks.set(socialTaskKey(entry), entry);
              } else if (entry.type === 'relationship' && typeof entry.userId === 'string' && typeof entry.action === 'string') {
                tasks.set(socialTaskKey(entry), entry);
              }
            }
            if (tasks.size > 0) emit();
          } catch {
            // Corrupt persistence reads as an empty queue
          }
        })();
      }
      return loaded;
    },

    list: () => [...tasks.values()],

    add(task) {
      tasks.set(socialTaskKey(task), task);
      persist();
      emit();
    },

    remove(task) {
      if (!tasks.delete(socialTaskKey(task))) return;
      persist();
      emit();
    },

    clear() {
      if (tasks.size === 0) return;
      tasks.clear();
      void storage.removeItem(STORAGE_KEY).catch(() => {});
      emit();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
