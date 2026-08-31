// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine toggleQueue
//
//  The five coalescing rules, driven with hand-settled
//  promises so every interleaving is explicit: immediate run
//  while idle, same-intent dedupe against the task that will
//  run last, AbortError on a replaced queued task, the queued
//  task running after success AND after failure, and failures
//  that reject only their own caller. Plus busy() truthfulness
//  and the per-scope registry's identity rules.
// -----------------------------------------------------------

import { createToggleQueue, getToggleQueue } from '../toggleQueue';


// A promise the test settles by hand — perform() hands one out
// so the queue's interleaving is under the test's control
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// The queue advances inside .then/.finally microtasks — settle
// them all before asserting busy() or a follow-on perform
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};


describe('createToggleQueue', () => {
  it('rule 1: an idle queue runs perform immediately', async () => {
    const queue = createToggleQueue<boolean>();
    const d1 = deferred<boolean>();
    const perform = jest.fn(() => d1.promise);

    const p1 = queue.run(true, perform);
    // busy flips synchronously; perform itself is lifted onto
    // the microtask queue (rule 5's sync-throw safety)
    expect(queue.busy()).toBe(true);
    await flush();
    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledWith(true, expect.objectContaining({ willContinue: expect.any(Function) }));
    expect(queue.busy()).toBe(true);

    d1.resolve(true);
    await expect(p1).resolves.toBe(true);
    await flush();
    expect(queue.busy()).toBe(false);
  });

  it('rule 2: repeating the active intent answers the same promise when nothing is queued', async () => {
    const queue = createToggleQueue<boolean>();
    const d1 = deferred<boolean>();
    const perform1 = jest.fn(() => d1.promise);
    const perform2 = jest.fn(() => Promise.resolve(true));

    const p1 = queue.run(true, perform1);
    const p2 = queue.run(true, perform2);
    expect(p2).toBe(p1);
    expect(perform2).not.toHaveBeenCalled();

    d1.resolve(true);
    await expect(p1).resolves.toBe(true);
    await flush();
    // Deduped, not queued — one request ever left
    expect(perform1).toHaveBeenCalledTimes(1);
    expect(queue.busy()).toBe(false);
  });

  it('rule 2: repeating the queued intent answers the queued promise', async () => {
    const queue = createToggleQueue<boolean>();
    const d1 = deferred<boolean>();
    const d2 = deferred<boolean>();
    const perform2 = jest.fn(() => d2.promise);
    const perform3 = jest.fn(() => Promise.resolve(false));

    const p1 = queue.run(true, () => d1.promise);
    const p2 = queue.run(false, perform2);
    const p3 = queue.run(false, perform3);
    expect(p3).toBe(p2);
    expect(p3).not.toBe(p1);
    expect(perform3).not.toHaveBeenCalled();

    d1.resolve(true);
    await expect(p1).resolves.toBe(true);
    await flush();
    expect(perform2).toHaveBeenCalledTimes(1);
    expect(perform2).toHaveBeenCalledWith(false, expect.objectContaining({ willContinue: expect.any(Function) }));
    d2.resolve(false);
    await expect(p2).resolves.toBe(false);
  });

  it('rule 3: a replaced queued task rejects with AbortError and never runs', async () => {
    const queue = createToggleQueue<boolean>();
    const d1 = deferred<boolean>();
    const d3 = deferred<boolean>();
    const perform2 = jest.fn(() => Promise.resolve(false));
    const perform3 = jest.fn(() => d3.promise);

    const p1 = queue.run(true, () => d1.promise);
    const p2 = queue.run(false, perform2);
    // Catch before the replacement lands so the rejection is owned
    const p2outcome = p2.then(
      () => 'resolved',
      (err) => err,
    );

    // Dedupe compares against the QUEUED task (false), so a third
    // tap back to true replaces it — even though the ACTIVE task
    // already carries true
    const p3 = queue.run(true, perform3);
    expect(p3).not.toBe(p1);
    expect(p3).not.toBe(p2);

    const abort = await p2outcome;
    expect(abort).toBeInstanceOf(Error);
    expect((abort as Error).name).toBe('AbortError');
    expect(perform2).not.toHaveBeenCalled();

    d1.resolve(true);
    await expect(p1).resolves.toBe(true);
    await flush();
    expect(perform3).toHaveBeenCalledWith(true, expect.objectContaining({ willContinue: expect.any(Function) }));
    d3.resolve(true);
    await expect(p3).resolves.toBe(true);
  });

  it('rule 4: the queued task runs after the active succeeds', async () => {
    const queue = createToggleQueue<boolean>();
    const d1 = deferred<boolean>();
    const d2 = deferred<boolean>();
    const perform2 = jest.fn(() => d2.promise);

    const p1 = queue.run(true, () => d1.promise);
    const p2 = queue.run(false, perform2);
    expect(perform2).not.toHaveBeenCalled();

    d1.resolve(true);
    await expect(p1).resolves.toBe(true);
    await flush();
    expect(perform2).toHaveBeenCalledTimes(1);
    expect(queue.busy()).toBe(true);

    d2.resolve(false);
    await expect(p2).resolves.toBe(false);
    await flush();
    expect(queue.busy()).toBe(false);
  });

  it('rules 4 + 5: the active failure rejects only its own promise; the queued task still runs', async () => {
    const queue = createToggleQueue<boolean>();
    const d1 = deferred<boolean>();
    const d2 = deferred<boolean>();
    const perform2 = jest.fn(() => d2.promise);

    const p1 = queue.run(true, () => d1.promise);
    const p1outcome = p1.then(
      () => 'resolved',
      (err) => err,
    );
    const p2 = queue.run(false, perform2);

    const boom = Object.assign(new Error('server refused'), { status: 500 });
    d1.reject(boom);
    expect(await p1outcome).toBe(boom);


    // The queue kept going — the failure never stalled it
    await flush();
    expect(perform2).toHaveBeenCalledWith(false, expect.objectContaining({ willContinue: expect.any(Function) }));
    d2.resolve(false);
    await expect(p2).resolves.toBe(false);
    await flush();
    expect(queue.busy()).toBe(false);
  });

  it('rule 5: after a failure the queue is idle and runs the next task immediately', async () => {
    const queue = createToggleQueue<boolean>();
    const p1 = queue.run(true, () => Promise.reject(new Error('down')));
    await expect(p1).rejects.toThrow('down');
    await flush();
    expect(queue.busy()).toBe(false);

    const perform = jest.fn(() => Promise.resolve(false));
    const p2 = queue.run(false, perform);
    await flush();
    expect(perform).toHaveBeenCalledTimes(1);
    await expect(p2).resolves.toBe(false);
  });

  it('busy() is truthful through every phase', async () => {
    const queue = createToggleQueue<boolean>();
    expect(queue.busy()).toBe(false);

    const d1 = deferred<boolean>();
    const d2 = deferred<boolean>();
    const p1 = queue.run(true, () => d1.promise);
    expect(queue.busy()).toBe(true);
    const p2 = queue.run(false, () => d2.promise);
    expect(queue.busy()).toBe(true);

    d1.resolve(true);
    await p1;
    await flush();
    // The queued task took over — still busy
    expect(queue.busy()).toBe(true);

    d2.resolve(false);
    await p2;
    await flush();
    expect(queue.busy()).toBe(false);
  });
});


describe('getToggleQueue', () => {
  it('same scope + key answers the same instance; a different scope or key does not', () => {
    const scopeA = { name: 'transport A' };
    const scopeB = { name: 'transport B' };

    const queue = getToggleQueue<boolean>(scopeA, 'like:p1');
    expect(getToggleQueue<boolean>(scopeA, 'like:p1')).toBe(queue);
    expect(getToggleQueue<boolean>(scopeA, 'like:p2')).not.toBe(queue);
    expect(getToggleQueue<boolean>(scopeB, 'like:p1')).not.toBe(queue);
  });

  it('rule 5 extension: a perform that throws SYNCHRONOUSLY rejects its task and the queue keeps going', async () => {
    const queue = createToggleQueue<boolean>();
    const p1 = queue.run(true, () => {
      throw new Error('sync down');
    });
    await expect(p1).rejects.toThrow('sync down');
    await flush();
    expect(queue.busy()).toBe(false);

    const perform = jest.fn(() => Promise.resolve(false));
    await expect(queue.run(false, perform)).resolves.toBe(false);
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('ctx.willContinue tells a task, at settle time, whether a newer intent waits behind it', async () => {
    const queue = createToggleQueue<boolean>();
    const d1 = deferred<boolean>();
    const seen: boolean[] = [];
    const p1 = queue.run(true, async (d, ctx) => {
      await d1.promise;
      seen.push(ctx.willContinue());
      return d;
    });
    await flush();
    const p2 = queue.run(false, async (d, ctx) => {
      seen.push(ctx.willContinue());
      return d;
    });
    d1.resolve(true);
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(false);
    // The first task settled with the second queued behind it;
    // the second settled last
    expect(seen).toEqual([true, false]);
  });
});
