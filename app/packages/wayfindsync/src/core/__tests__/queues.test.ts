// -----------------------------------------------------------
//  [*] Tests — outbox and upload queue
//
//  Coalescing, the fresh-gated delete-cancel, persistence
//  across instances (load merging under pre-load enqueues),
//  single-flight drains, the server's answers per op —
//  duplicates split by what the logged op had been — per-batch
//  revisions in the report, the learned-revision re-stamp,
//  conflict resolution, and the upload ladder with an
//  immediate first retry and a final rejection.
// -----------------------------------------------------------

import { createOutbox } from '../outbox';
import { SyncRejected, type OpsAnswer, type ServerOp, type SyncStorage, type SyncTransport } from '../types';
import { createUploadQueue, RETRY_DELAYS_MS } from '../uploads';


const memory = (): SyncStorage & { dump: Record<string, string> } => {
  const dump: Record<string, string> = {};
  return {
    dump,
    async getItem(key) { return key in dump ? dump[key] : null; },
    async setItem(key, value) { dump[key] = value; },
    async removeItem(key) { delete dump[key]; },
  };
};

const upsert = (id: string, entityId: string, x: number, baseRevision?: number): ServerOp => ({ id, type: 'upsert', kind: 'node', entityId, data: { x }, ...(baseRevision === undefined ? {} : { baseRevision }) });

const transportWith = (postOps: SyncTransport['postOps']): SyncTransport => ({
  postOps,
  publish: async () => ({ ok: true, revision: 1, etag: 'e', publishedAt: 'now' }),
  uploadPanorama: async () => ({ id: 'p', url: '/p.jpg', width: 1, height: 1, bytes: 1, hfovDeg: 360, vfovDeg: 180 }),
  uploadPlan: async () => ({ id: 'l', url: '/l.svg', bytes: 1 }),
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));


describe('outbox', () => {
  it('coalesces queued ops per entity keeping the first base revision, cancels a fresh create deleted again, and persists', async () => {
    const storage = memory();
    const box = createOutbox(storage, 'k');
    await box.load();
    box.enqueue([upsert('o1', 'a', 1, 4), upsert('o2', 'a', 2, 5), { id: 'o3', type: 'upsert', kind: 'node', entityId: 'b', data: { x: 1 }, fresh: true }]);
    box.enqueue([{ id: 'o4', type: 'delete', kind: 'node', entityId: 'b' }]);
    box.enqueue([{ id: 'o5', type: 'building', data: { northDeg: 1 } }, { id: 'o6', type: 'building', data: { entranceNodeId: 'a' } }]);
    expect(box.entries().map((entry) => entry.op)).toEqual([
      { id: 'o2', type: 'upsert', kind: 'node', entityId: 'a', data: { x: 2 }, baseRevision: 4 },
      { id: 'o6', type: 'building', data: { northDeg: 1, entranceNodeId: 'a' } },
    ]);
    await flush();
    const again = createOutbox(storage, 'k');
    await again.load();
    expect(again.pending()).toBe(2);
  });

  it('drains in one flight, drops applied and plain duplicate ops, keeps rejected ones until resolved', async () => {
    const box = createOutbox(memory(), 'k');
    await box.load();
    box.enqueue([upsert('o1', 'a', 1, 4), upsert('o2', 'b', 1), upsert('o3', 'c', 1, 2)]);
    const calls: ServerOp[][] = [];
    const transport = transportWith(async (_b, ops) => {
      calls.push(ops);
      const answer: OpsAnswer = { revision: 9, results: [
        { id: 'o1', status: 'applied' },
        { id: 'o2', status: 'duplicate', reason: null },
        { id: 'o3', status: 'rejected', reason: 'conflict', current: { data: { x: 7 }, revision: 6, deleted: false } },
      ] };
      return answer;
    });
    const [first, second] = await Promise.all([box.drain(transport, 'knf'), box.drain(transport, 'knf')]);
    expect(first).toBe(second);
    expect(calls).toHaveLength(1);
    expect(first.applied).toEqual([{ kind: 'node', entityId: 'a', opId: 'o1', revision: 9 }]);
    expect(first.revision).toBe(9);
    expect(box.rejected().map((entry) => [entry.op.id, entry.reason, entry.current?.revision])).toEqual([['o3', 'conflict', 6]]);
    expect(box.pending()).toBe(0);

    // Keep mine: sent again without the stale base revision and
    // without the fresh mark — a deliberate overwrite
    box.resolve('o3', 'keep-mine');
    expect(box.pending()).toBe(1);
    const retry = box.entries()[0].op;
    expect(retry).toEqual({ id: 'o3-again', type: 'upsert', kind: 'node', entityId: 'c', data: { x: 1 } });
    expect('baseRevision' in retry).toBe(false);
    expect('fresh' in retry).toBe(false);
    box.resolve('nope', 'drop');
    box.enqueue([upsert('o9', 'd', 1)]);
    const answered = await box.drain(transportWith(async (_b, ops) => ({ revision: 10, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) })), 'knf');
    expect(answered.applied.map((a) => a.opId)).toEqual(['o3-again', 'o9']);
    expect(box.entries()).toEqual([]);
  });

  it('leaves everything queued when the server cannot be reached, and re-queues ops caught mid-send by a kill', async () => {
    const storage = memory();
    const box = createOutbox(storage, 'k');
    await box.load();
    box.enqueue([upsert('o1', 'a', 1)]);
    const report = await box.drain(transportWith(async () => { throw new Error('offline'); }), 'knf');
    expect(report.offline).toBe(true);
    expect(box.pending()).toBe(1);
    storage.dump.k = JSON.stringify([{ op: upsert('o2', 'b', 1), status: 'sending', queuedAt: 1 }]);
    const revived = createOutbox(storage, 'k');
    await revived.load();
    expect(revived.entries()[0].status).toBe('queued');
  });

  it('gates the delete-cancel on a fresh create; otherwise the delete replaces the queued op keeping its base revision', async () => {
    const box = createOutbox(memory(), 'k');
    await box.load();
    // A fresh create deleted again: the server never hears of either
    box.enqueue([{ id: 'o1', type: 'upsert', kind: 'node', entityId: 'a', data: { x: 1 }, fresh: true }]);
    box.enqueue([{ id: 'o2', type: 'delete', kind: 'node', entityId: 'a' }]);
    expect(box.entries()).toEqual([]);
    // An unstamped edit of an EXISTING entity (the offline-seed mode
    // stamps nothing): the delete must survive as an overwrite delete
    box.enqueue([upsert('o3', 'b', 1)]);
    box.enqueue([{ id: 'o4', type: 'delete', kind: 'node', entityId: 'b' }]);
    expect(box.entries().map((entry) => entry.op)).toEqual([{ id: 'o4', type: 'delete', kind: 'node', entityId: 'b' }]);
    // A stamped edit: the delete keeps the held base revision, not its own
    box.enqueue([upsert('o5', 'c', 1, 4)]);
    box.enqueue([{ id: 'o6', type: 'delete', kind: 'node', entityId: 'c', baseRevision: 9 }]);
    expect(box.entries().map((entry) => entry.op)).toContainEqual({ id: 'o6', type: 'delete', kind: 'node', entityId: 'c', baseRevision: 4 });
  });

  it('sends a delete queued while the entity\'s creating upsert is on the wire', async () => {
    const box = createOutbox(memory(), 'k');
    await box.load();
    const posted: ServerOp[][] = [];
    let release: ((answer: OpsAnswer) => void) | undefined;
    const transport = transportWith((_b, ops) => {
      posted.push(ops.map((op) => ({ ...op })));
      return new Promise((resolve) => { release = resolve; });
    });
    box.enqueue([{ id: 'o1', type: 'upsert', kind: 'node', entityId: 'n', data: { x: 1 }, fresh: true }]);
    const flight = box.drain(transport, 'knf');
    await flush();
    // The create is on the wire; an edit (unstamped — the editor has
    // not been acknowledged yet) and then a delete land meanwhile
    box.enqueue([upsert('o2', 'n', 2)]);
    box.enqueue([{ id: 'o3', type: 'delete', kind: 'node', entityId: 'n' }]);
    release?.({ revision: 5, results: [{ id: 'o1', status: 'applied' }] });
    await flush();
    release?.({ revision: 6, results: [{ id: 'o3', status: 'applied' }] });
    await flight;
    expect(posted.map((ops) => ops.map((op) => [op.id, op.type]))).toEqual([[['o1', 'upsert']], [['o3', 'delete']]]);
    expect(box.entries()).toEqual([]);
  });

  it('lets a delete after keep-mine reach the server and keeps a later edit\'s stale base out of the retry', async () => {
    const box = createOutbox(memory(), 'k');
    await box.load();
    box.enqueue([upsert('o1', 'c', 1, 2)]);
    await box.drain(transportWith(async () => ({ revision: 6, results: [{ id: 'o1', status: 'rejected', reason: 'conflict', current: { data: { x: 99 }, revision: 6, deleted: false } }] })), 'knf');
    box.resolve('o1', 'keep-mine');
    // A later edit still stamped with the stale base coalesces in
    // WITHOUT re-acquiring it — the retry stays an overwrite
    box.enqueue([upsert('o2', 'c', 3, 2)]);
    expect(box.entries().map((entry) => entry.op)).toEqual([{ id: 'o2', type: 'upsert', kind: 'node', entityId: 'c', data: { x: 3 } }]);
    expect('baseRevision' in box.entries()[0].op).toBe(false);
    // A delete now replaces the retry as an overwrite delete — it is
    // NOT cancelled as an unsent new entity
    box.enqueue([{ id: 'o3', type: 'delete', kind: 'node', entityId: 'c' }]);
    const posted: ServerOp[][] = [];
    await box.drain(transportWith(async (_b, ops) => { posted.push(ops.map((op) => ({ ...op }))); return { revision: 7, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) }; }), 'knf');
    expect(posted).toEqual([[{ id: 'o3', type: 'delete', kind: 'node', entityId: 'c' }]]);
    expect(box.entries()).toEqual([]);
  });

  it('re-stamps a queued op whose entity an earlier round already applied, and reports per-batch revisions', async () => {
    const box = createOutbox(memory(), 'k');
    await box.load();
    const posted: ServerOp[][] = [];
    const transport = transportWith(async (_b, ops) => {
      posted.push(ops.map((op) => ({ ...op })));
      if (posted.length === 1) {
        // A second commit lands while the first is on the wire,
        // stamped from the not-yet-acknowledged editor map
        box.enqueue([upsert('o2', 'c', 2, 4)]);
        return { revision: 5, results: [{ id: 'o1', status: 'applied' as const }] };
      }
      return { revision: 6, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) };
    });
    box.enqueue([upsert('o1', 'c', 1, 4)]);
    const report = await box.drain(transport, 'knf');
    expect(posted).toEqual([
      [{ id: 'o1', type: 'upsert', kind: 'node', entityId: 'c', data: { x: 1 }, baseRevision: 4 }],
      [{ id: 'o2', type: 'upsert', kind: 'node', entityId: 'c', data: { x: 2 }, baseRevision: 5 }],
    ]);
    expect(report.applied).toEqual([
      { kind: 'node', entityId: 'c', opId: 'o1', revision: 5 },
      { kind: 'node', entityId: 'c', opId: 'o2', revision: 6 },
    ]);
  });

  it('surfaces a duplicate of a rejected op as a rejection', async () => {
    const box = createOutbox(memory(), 'k');
    await box.load();
    box.enqueue([upsert('o3', 'c', 1, 2)]);
    const report = await box.drain(transportWith(async () => ({ revision: 2, results: [{ id: 'o3', status: 'duplicate' as const, of: 'rejected' as const, reason: 'conflict', revision: null }] })), 'knf');
    expect(report.applied).toEqual([]);
    expect(report.rejected.map((entry) => [entry.op.id, entry.reason, entry.current])).toEqual([['o3', 'conflict', null]]);
    expect(box.rejected().map((entry) => entry.op.id)).toEqual(['o3']);
  });

  it('folds a duplicate of an applied op into applied with the logged revision, which then re-stamps the next stale op', async () => {
    const box = createOutbox(memory(), 'k');
    await box.load();
    box.enqueue([upsert('o1', 'c', 1, 2)]);
    const first = await box.drain(transportWith(async () => ({ revision: 9, results: [{ id: 'o1', status: 'duplicate' as const, of: 'applied' as const, reason: null, revision: 7 }] })), 'knf');
    expect(first.applied).toEqual([{ kind: 'node', entityId: 'c', opId: 'o1', revision: 7 }]);
    expect(box.entries()).toEqual([]);
    // The learned revision covers the gap before the editor's
    // acknowledge: a stale stamp on the same entity is lifted pre-send
    box.enqueue([upsert('o2', 'c', 2, 2)]);
    const posted: ServerOp[][] = [];
    await box.drain(transportWith(async (_b, ops) => { posted.push(ops.map((op) => ({ ...op }))); return { revision: 10, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) }; }), 'knf');
    expect(posted[0][0].baseRevision).toBe(7);
  });

  it('reports each applied entity with its own batch\'s revision across a multi-batch drain', async () => {
    const box = createOutbox(memory(), 'k');
    await box.load();
    box.enqueue(Array.from({ length: 501 }, (_v, i) => upsert(`o${i}`, `n${i}`, i, 3)));
    const revisions = [4, 6];
    let call = 0;
    const report = await box.drain(transportWith(async (_b, ops) => ({ revision: revisions[call++], results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) })), 'knf');
    expect(report.applied).toHaveLength(501);
    expect(report.applied[0]).toEqual({ kind: 'node', entityId: 'n0', opId: 'o0', revision: 4 });
    expect(report.applied[500]).toEqual({ kind: 'node', entityId: 'n500', opId: 'o500', revision: 6 });
    expect(report.revision).toBe(6);
  });

  it('merges the stored queue in front of ops enqueued before load resolves, without clobbering storage', async () => {
    const storage = memory();
    storage.dump.k = JSON.stringify([{ op: upsert('P', 'old', 1, 3), status: 'queued', queuedAt: 1 }]);
    const box = createOutbox(storage, 'k');
    // The bootstrap seed lands before load() has read the stored
    // queue; the write must not overwrite the previous session's ops
    box.enqueue([upsert('S', 'seed', 2)]);
    expect((JSON.parse(storage.dump.k) as { op: ServerOp }[]).map((entry) => entry.op.id)).toEqual(['P']);
    await box.load();
    expect(box.entries().map((entry) => entry.op.id)).toEqual(['P', 'S']);
    await flush();
    expect((JSON.parse(storage.dump.k) as { op: ServerOp }[]).map((entry) => entry.op.id)).toEqual(['P', 'S']);
  });
});


describe('upload queue', () => {
  it('retries the first failure at once, walks the ladder after, parks a final rejection, hands results over once', async () => {
    let clock = 1000;
    const queue = createUploadQueue(memory(), 'u', () => clock);
    await queue.load();
    queue.enqueue({ id: 'u1', kind: 'panorama', file: { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }, fields: { nodeId: 'n1' }, target: 'n1' });
    queue.enqueue({ id: 'u1', kind: 'panorama', file: { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' }, fields: {} });
    expect(queue.items()).toHaveLength(1);

    let attempts = 0;
    const transport = transportWith(async () => ({ revision: 0, results: [] }));
    transport.uploadPanorama = async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('timeout');
      return { id: 'p1', url: '/api/wayfind/panoramas/p1.jpg', width: 4096, height: 1200, bytes: 10, hfovDeg: 360, vfovDeg: 105 };
    };
    // The first failure retries at once inside the same drain (rung 0
    // is 0 ms); the second backs off by rung 1
    await queue.drain(transport, 'knf');
    expect(attempts).toBe(2);
    expect(queue.items()[0]).toMatchObject({ status: 'queued', attempts: 2, notBefore: 1000 + RETRY_DELAYS_MS[1] });
    // Too early: nothing sent
    await queue.drain(transport, 'knf');
    expect(attempts).toBe(2);
    clock += RETRY_DELAYS_MS[1];
    await queue.drain(transport, 'knf');
    expect(attempts).toBe(3);
    expect(queue.items()[0]).toMatchObject({ status: 'done', result: { url: '/api/wayfind/panoramas/p1.jpg' }, target: 'n1' });
    queue.acknowledge('u1');
    expect(queue.items()).toEqual([]);

    queue.enqueue({ id: 'u2', kind: 'plan', file: { uri: 'file:///b.svg', name: 'b.svg', type: 'image/svg+xml' }, fields: { levelId: 'L1' } });
    transport.uploadPlan = async () => { throw new SyncRejected('not an svg', 'bad_plan'); };
    await queue.drain(transport, 'knf');
    expect(queue.items()[0]).toMatchObject({ status: 'failed', error: 'bad_plan' });
    queue.retry('u2');
    expect(queue.items()[0].status).toBe('queued');
    queue.remove('u2');
    expect(queue.items()).toEqual([]);
  });
});
