// -----------------------------------------------------------
//  [*] Tests — per-message ordering of live and replayed calls
//
//  serializeByTarget runs one message's calls strictly one
//  after another (a failure does not break the chain) while
//  other messages run freely; the epoch helpers mark a stale
//  answer; removeIfCurrent leaves an entry a later add()
//  replaced.
// -----------------------------------------------------------

import { TaskQueue, bumpTargetEpoch, serializeByTarget, targetEpoch, targetKey } from '../tasks';
import { memoryStorage } from '../../provider/storage';







// -----------------------------------------------------------
// deferred
// -----------------------------------------------------------
//
// A promise with its resolve/reject in hand, so a test can
// hold a call in flight and settle it at the moment it picks.
//
// Used by:
//   - the serializeByTarget test (below)
// -----------------------------------------------------------

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}


describe('serializeByTarget', () => {
  it('runs one message\'s calls in order, a failure included, and leaves other messages alone', async () => {
    const order: string[] = [];
    const first = deferred<string>();
    const key = targetKey('c1', 'm1');

    const a = serializeByTarget(key, () => {
      order.push('a:start');
      return first.promise;
    });
    const b = serializeByTarget(key, async () => {
      order.push('b:start');
      return 'b';
    });
    const other = serializeByTarget(targetKey('c1', 'm2'), async () => {
      order.push('other');
      return 'o';
    });

    await other;
    expect(order).toEqual(['a:start', 'other']);   // b waits for a; m2 does not
    first.reject(new Error('offline'));
    await expect(a).rejects.toThrow('offline');
    await expect(b).resolves.toBe('b');
    expect(order).toEqual(['a:start', 'other', 'b:start']);
  });
});


describe('target epochs', () => {
  it('bumps per message and reads the current value', () => {
    const key = targetKey('c9', 'm1');
    const start = targetEpoch(key);
    const next = bumpTargetEpoch(key);
    expect(next).toBe(start + 1);
    expect(targetEpoch(key)).toBe(next);
    expect(targetEpoch(targetKey('c9', 'm2'))).toBe(0);
  });
});


describe('TaskQueue.removeIfCurrent', () => {
  it('removes the entry that ran but never one a later add() replaced', () => {
    const queue = new TaskQueue('c1', memoryStorage());
    const older = { type: 'reaction' as const, messageId: 'm1', emoji: '❤️', at: '2026-09-25T10:00:00Z' };
    queue.add(older);
    expect(queue.isCurrent(older)).toBe(true);

    const newer = { type: 'reaction' as const, messageId: 'm1', emoji: '👍', at: '2026-09-25T10:00:05Z' };
    queue.add(newer);
    queue.removeIfCurrent(older);
    expect(queue.list()).toEqual([newer]);

    queue.removeIfCurrent(newer);
    expect(queue.size).toBe(0);
  });
});
