// -----------------------------------------------------------
//  [*] chatengine — tasks
//
//  The offline queue for everything that is not a send: an
//  edit, an unsend or a reaction made while the transport was
//  down keeps its optimistic state and is replayed when
//  connectivity returns (the send outbox in core/outbox.ts is
//  the same idea for new messages). One entry per message per
//  kind — a later edit of the same message replaces the
//  earlier one, a later reaction pick replaces the earlier
//  one — persisted under tasks:<conversationId>.
//
//  The queue is shared by the hooks of one room through a
//  module registry, so the hook that owns the list
//  (useConversation) replays what the others enqueued.
//
//  The replay and the live paths act on the SAME messages, so
//  they are ordered per message (KNF-121's chat twin): every
//  call for one message runs after the previous one settled
//  (serializeByTarget — the newest intent reaches the server
//  last), a live action bumps the message's epoch so a late
//  replay answer never overwrites a newer optimistic state
//  (bumpTargetEpoch / targetEpoch), and a replayed entry
//  leaves the queue only if it is still the entry that ran
//  (removeIfCurrent — an intent queued during the call stays).
//
//  Split into:
//
//    PendingTask      — the entry shapes
//    targetKey        — one message's ordering key
//    serializeByTarget — per-message call ordering
//    bumpTargetEpoch / targetEpoch — per-message staleness
//    TaskQueue        — one room's queue, persisted
//    getTaskQueue     — the per-room registry
// -----------------------------------------------------------

import type { KeyValueStorage } from '../provider/storage';


// One queue per (storage, room): the hooks of a room share it
// through the provider's storage instance. TaskQueue appears
// here only as an erased type argument, so the class hoisting
// below costs nothing at init
const registry = new WeakMap<KeyValueStorage, Map<string, TaskQueue>>();

// The in-flight call chain per message — a settled chain is
// dropped, so the map holds only messages with work pending
const chains = new Map<string, Promise<unknown>>();

// The newest action's number per message — bumped by every
// live action, read by the replay before it applies an answer
const epochs = new Map<string, number>();







// -----------------------------------------------------------
// PendingTask
// -----------------------------------------------------------
//
// The entry shapes — one per replayable action kind.
//
// Used by:
//   - taskKey / TaskQueue (below)
//   - hooks/useConversation.ts — the replay switch
// -----------------------------------------------------------

export type PendingTask =
  | { type: 'edit'; messageId: string; text: string; previousText: string; at: string }
  | { type: 'delete'; messageId: string; at: string }
  | { type: 'reaction'; messageId: string; emoji: string | null; at: string };







// -----------------------------------------------------------
// targetKey
// -----------------------------------------------------------
//
// One message's ordering key — room-qualified, since message
// ids are only unique inside their room.
//
// Used by:
//   - hooks/useConversation.ts (replay, unsend),
//     hooks/useReactions.ts, hooks/useComposer.ts (edit)
// -----------------------------------------------------------

export const targetKey = (conversationId: string, messageId: string) => `${conversationId}:${messageId}`;







// -----------------------------------------------------------
// serializeByTarget
// -----------------------------------------------------------
//
//   serializeByTarget(key, () => transport.setReaction(…))
//
// Runs `run` after every earlier call for the same message has
// settled (success or failure) and answers its own promise.
// The live path and the replay both go through it, so a
// replayed old intent can never reach the server AFTER the
// newer live one and win.
//
// Used by:
//   - the same hooks as targetKey
// -----------------------------------------------------------

export function serializeByTarget<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  chains.set(key, next);
  const settle = () => {
    if (chains.get(key) === next) chains.delete(key);
  };
  next.then(settle, settle);
  return next;
}







// -----------------------------------------------------------
// bumpTargetEpoch
// -----------------------------------------------------------
//
// A new live action on a message: answers its epoch, which
// makes every answer started under an older epoch stale.
//
// Used by:
//   - hooks/useReactions.ts, hooks/useComposer.ts,
//     hooks/useConversation.ts (unsend)
// -----------------------------------------------------------

export function bumpTargetEpoch(key: string): number {
  const next = (epochs.get(key) ?? 0) + 1;
  epochs.set(key, next);
  return next;
}







// -----------------------------------------------------------
// targetEpoch
// -----------------------------------------------------------
//
// The message's current epoch — the replay reads it before a
// call and applies the answer only if it has not moved.
//
// Used by:
//   - hooks/useConversation.ts — replayTasks
//   - hooks/useReactions.ts — its own answers' staleness
// -----------------------------------------------------------

export function targetEpoch(key: string): number {
  return epochs.get(key) ?? 0;
}







// -----------------------------------------------------------
// taskKey
// -----------------------------------------------------------
//
// The one-entry-per-message-per-kind rule lives here: a later
// task with the same key replaces the earlier one.
//
// Used by:
//   - TaskQueue (below); exported for the tests' assertions
// -----------------------------------------------------------

export const taskKey = (task: Pick<PendingTask, 'type' | 'messageId'>) => `${task.type}:${task.messageId}`;







// -----------------------------------------------------------
// tasksStorageKey
// -----------------------------------------------------------
//
// Names a room's persisted queue.
//
// Used by:
//   - TaskQueue (below) — load / persist; exported for the
//     tests' assertions
// -----------------------------------------------------------

export const tasksStorageKey = (conversationId: string) => `tasks:${conversationId}`;







// -----------------------------------------------------------
// TaskQueue
// -----------------------------------------------------------
//
// One room's queue, persisted on every change and rehydrated
// once via load(). add() replaces an entry of the same
// message + kind; removeIfCurrent() leaves such a replacement
// alone; subscribe() feeds the hooks' re-renders.
//
// Used by:
//   - getTaskQueue (below) — the only constructor call site
//   - hooks/useConversation.ts — replays it on reconnect
// -----------------------------------------------------------

export class TaskQueue {
  private tasks = new Map<string, PendingTask>();
  private listeners = new Set<() => void>();
  private loaded: Promise<void> | null = null;

  constructor(
    private readonly conversationId: string,
    private readonly storage: KeyValueStorage,
  ) {}

  // Rehydrate once; later calls answer the same promise
  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        try {
          const raw = await this.storage.getItem(tasksStorageKey(this.conversationId));
          if (!raw) return;
          const parsed = JSON.parse(raw) as unknown;
          if (!Array.isArray(parsed)) return;
          for (const entry of parsed as PendingTask[]) {
            if (entry && typeof entry === 'object' && typeof entry.messageId === 'string' && ['edit', 'delete', 'reaction'].includes(entry.type)) {
              this.tasks.set(taskKey(entry), entry);
            }
          }
          this.emit();
        } catch {
          // Unreadable storage never blocks the room
        }
      })();
    }
    return this.loaded;
  }

  list(): PendingTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }

  get size(): number {
    return this.tasks.size;
  }

  add(task: PendingTask): void {
    // A second edit of a message still waiting to be sent replaces
    // the text but keeps the ORIGINAL previousText — a refusal on
    // replay must put the server's text back, not the first draft
    const existing = this.tasks.get(taskKey(task));
    const entry: PendingTask = task.type === 'edit' && existing?.type === 'edit' ? { ...task, previousText: existing.previousText } : task;
    this.tasks.set(taskKey(entry), entry);
    this.persist();
    this.emit();
  }

  remove(task: Pick<PendingTask, 'type' | 'messageId'>): void {
    if (!this.tasks.delete(taskKey(task))) return;
    this.persist();
    this.emit();
  }

  // Whether `task` is still the queued entry for its key — a
  // later add() for the same message replaced it otherwise
  isCurrent(task: PendingTask): boolean {
    return this.tasks.get(taskKey(task)) === task;
  }

  // The replay's removal: only the entry that actually ran
  // leaves; an intent queued while it was in flight stays
  removeIfCurrent(task: PendingTask): void {
    if (this.isCurrent(task)) this.remove(task);
  }

  clear(): void {
    this.tasks.clear();
    this.persist();
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // A broken subscriber is its own problem
      }
    });
  }

  private persist(): void {
    const key = tasksStorageKey(this.conversationId);
    (this.tasks.size === 0 ? this.storage.removeItem(key) : this.storage.setItem(key, JSON.stringify(this.list()))).catch(() => {});
  }
}







// -----------------------------------------------------------
// getTaskQueue
// -----------------------------------------------------------
//
// The per-room registry, keyed by the provider's storage
// instance (a WeakMap, so a torn-down provider's queues can be
// collected).
//
// Used by:
//   - hooks/useConversation.ts — replay + the pending badge
//   - hooks/useComposer.ts — queues offline edits / unsends
//   - hooks/useReactions.ts — queues offline reaction picks
// -----------------------------------------------------------

export function getTaskQueue(storage: KeyValueStorage, conversationId: string): TaskQueue {
  let rooms = registry.get(storage);
  if (!rooms) {
    rooms = new Map();
    registry.set(storage, rooms);
  }
  let queue = rooms.get(conversationId);
  if (!queue) {
    queue = new TaskQueue(conversationId, storage);
    rooms.set(conversationId, queue);
  }
  return queue;
}
