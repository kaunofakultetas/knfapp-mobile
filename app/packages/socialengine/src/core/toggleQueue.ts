// -----------------------------------------------------------
//  [*] socialengine — toggleQueue
//
//  Rapid toggle taps, coalesced into serial, sane server
//  traffic. A reader hammering the like button five times must
//  produce at most two requests (the one in flight and the
//  final intent) and must always SETTLE on the last intent —
//  never interleave, never fire five racing calls.
//
//  Rules, exactly:
//    1. run() while idle executes perform(desired) immediately.
//    2. run(d) while busy, where d equals the desired value of
//       the task that will run last (the queued one, else the
//       active one): returns that task's promise — a repeat of
//       the same intent is deduped, not queued again.
//    3. Otherwise the new task REPLACES any queued task; the
//       replaced task's promise rejects with an AbortError-
//       shaped error ({ name: 'AbortError' }) so its caller
//       knows it was superseded, not failed.
//    4. When the active task settles — success OR failure —
//       the queued task (if any) runs next.
//    5. A task's failure rejects only its own promise; the
//       queue itself keeps going — a perform that throws
//       SYNCHRONOUSLY is caught the same way (the call is
//       lifted onto the microtask queue).
//
//  perform receives a context beside the desired value:
//  ctx.willContinue() answers whether a NEWER task is already
//  waiting behind this one — the hook that owns the shadow
//  uses it to keep the optimistic view (and the pending flag)
//  standing until the LAST task settles, instead of letting an
//  intermediate settle flicker a superseded state onto the
//  screen. Reconciliation belongs INSIDE perform: it runs
//  exactly once per task, however many deduped taps share the
//  task's promise.
//
//  Queues are per key (one per post, one per user), looked up
//  through a registry scoped by object identity — two
//  providers sharing one transport share queues, two tests
//  with fresh transports never collide.
//
//  Used by:
//    - hooks/useLikeToggle.ts — one queue per like target
//    - hooks/useRelationship.ts — one queue per user
// -----------------------------------------------------------

export interface ToggleContext {
  // A newer task is queued behind the running one — its intent
  // supersedes whatever this task settles to
  willContinue(): boolean;
}

export interface ToggleQueue<T> {
  run(desired: T, perform: (desired: T, ctx: ToggleContext) => Promise<T>): Promise<T>;
  // Whether a task is in flight or waiting (UIs may dim)
  busy(): boolean;
}


// The supersedure signal. Instanceof checks are avoided across
// the codebase — callers test err?.name === 'AbortError'
const abortError = (): Error => {
  const err = new Error('superseded by a newer toggle');
  err.name = 'AbortError';
  return err;
};







// -----------------------------------------------------------
// createToggleQueue
// -----------------------------------------------------------
//
// Used by:
//   - getToggleQueue (below)
//   - tests driving the rules directly
// -----------------------------------------------------------

export function createToggleQueue<T>(): ToggleQueue<T> {

  interface Task {
    desired: T;
    perform: (desired: T, ctx: ToggleContext) => Promise<T>;
    resolve: (value: T) => void;
    reject: (err: unknown) => void;
    promise: Promise<T>;
  }

  let active: Task | null = null;
  let queued: Task | null = null;


  const makeTask = (desired: T, perform: (desired: T, ctx: ToggleContext) => Promise<T>): Task => {
    let resolve: (value: T) => void = () => {};
    let reject: (err: unknown) => void = () => {};
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { desired, perform, resolve, reject, promise };
  };


  const runTask = (task: Task) => {
    active = task;
    // Lifted onto the microtask queue so a perform that throws
    // synchronously rejects THIS task instead of deadlocking the
    // queue for its key (rule 5)
    Promise.resolve()
      .then(() => task.perform(task.desired, { willContinue: () => queued !== null }))
      .then(task.resolve, task.reject)
      .finally(() => {
        active = null;
        if (queued) {
          const next = queued;
          queued = null;
          runTask(next);
        }
      });
  };


  return {
    run(desired, perform) {
      // Rule 2: repeating the intent that will run last anyway
      const last = queued ?? active;
      if (last && Object.is(last.desired, desired)) return last.promise;


      const task = makeTask(desired, perform);
      if (!active) {
        // Rule 1: idle — straight through
        runTask(task);
        return task.promise;
      }


      // Rule 3: replace whatever was waiting
      if (queued) queued.reject(abortError());
      queued = task;
      return task.promise;
    },

    busy: () => active !== null || queued !== null,
  };
}







// -----------------------------------------------------------
// getToggleQueue
// -----------------------------------------------------------
//
// The per-key registry. Scope is any stable object — the hooks
// pass the transport, so queues live exactly as long as the
// backend connection they serialize against.
//
// Used by:
//   - hooks/useLikeToggle.ts — getToggleQueue(transport, `like:${id}`)
//   - hooks/useRelationship.ts — getToggleQueue(transport, `rel:${id}`)
// -----------------------------------------------------------

const registries = new WeakMap<object, Map<string, unknown>>();

export function getToggleQueue<T>(scope: object, key: string): ToggleQueue<T> {
  let map = registries.get(scope);
  if (!map) {
    map = new Map();
    registries.set(scope, map);
  }
  let queue = map.get(key) as ToggleQueue<T> | undefined;
  if (!queue) {
    queue = createToggleQueue<T>();
    map.set(key, queue);
  }
  return queue;
}
