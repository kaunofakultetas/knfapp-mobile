// -----------------------------------------------------------
//  [*] Tests — the social task queue
//
//  One entry per target with later intents replacing earlier
//  ones in place, persistence that survives a reload, corrupt
//  storage read as an empty queue, and clear() wiping the
//  persisted copy too.
// -----------------------------------------------------------

import { memorySocialStorage } from '../storage';
import { createSocialTaskQueue, socialTaskKey, type PendingSocialTask } from '../tasks';


const like = (id: string, desired: boolean): PendingSocialTask => ({ type: 'like', target: { type: 'post', id }, desired, at: '2026-08-31T10:00:00Z' });
const rel = (userId: string, action: 'connect' | 'disconnect'): PendingSocialTask => ({ type: 'relationship', userId, action, at: '2026-08-31T10:00:00Z' });

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};


describe('createSocialTaskQueue', () => {
  it('keeps one entry per target, later intents replacing earlier ones in their slot', async () => {
    const queue = createSocialTaskQueue(memorySocialStorage());
    queue.add(like('p1', true));
    queue.add(rel('u1', 'connect'));
    queue.add(like('p1', false));

    const listed = queue.list();
    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatchObject({ type: 'like', desired: false });
    expect(listed[1]).toMatchObject({ type: 'relationship', action: 'connect' });
    expect(socialTaskKey(listed[0])).toBe('like:post:p1');
  });

  it('persists on every mutation and rehydrates through load()', async () => {
    const storage = memorySocialStorage();
    const first = createSocialTaskQueue(storage);
    first.add(like('p1', true));
    first.add(rel('u1', 'disconnect'));
    await flush();

    const second = createSocialTaskQueue(storage);
    await second.load();
    expect(second.list()).toHaveLength(2);

    second.remove(second.list()[0]);
    await flush();
    expect(JSON.parse(storage.dump()['social:tasks'])).toHaveLength(1);
  });

  it('reads corrupt or foreign persistence as an empty queue', async () => {
    const storage = memorySocialStorage();
    await storage.setItem('social:tasks', '{not json');
    const corrupt = createSocialTaskQueue(storage);
    await corrupt.load();
    expect(corrupt.list()).toEqual([]);

    await storage.setItem('social:tasks', JSON.stringify([{ type: 'like' }, 42, { type: 'relationship', userId: 'u1', action: 'connect' }]));
    const partial = createSocialTaskQueue(storage);
    await partial.load();
    // Only the well-formed entry survives
    expect(partial.list()).toHaveLength(1);
    expect(partial.list()[0]).toMatchObject({ type: 'relationship', userId: 'u1' });
  });

  it('clear() empties the persisted copy and fires subscribers', async () => {
    const storage = memorySocialStorage();
    const queue = createSocialTaskQueue(storage);
    const heard = jest.fn();
    queue.subscribe(heard);
    queue.add(like('p1', true));
    queue.clear();
    await flush();

    expect(queue.list()).toEqual([]);
    expect(storage.dump()['social:tasks']).toBeUndefined();
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
