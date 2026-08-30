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
//  Split into:
//
//    PendingTask      — the entry shapes
//    TaskQueue        — one room's queue, persisted
//    getTaskQueue     — the per-room registry
// -----------------------------------------------------------

import type { KeyValueStorage } from '../provider/storage';


export type PendingTask =
  | { type: 'edit'; messageId: string; text: string; previousText: string; at: string }
  | { type: 'delete'; messageId: string; at: string }
  | { type: 'reaction'; messageId: string; emoji: string | null; at: string };

export const taskKey = (task: Pick<PendingTask, 'type' | 'messageId'>) => `${task.type}:${task.messageId}`;
export const tasksStorageKey = (conversationId: string) => `tasks:${conversationId}`;


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


// One queue per (storage, room): the hooks of a room share it
// through the provider's storage instance
const registry = new WeakMap<KeyValueStorage, Map<string, TaskQueue>>();

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
