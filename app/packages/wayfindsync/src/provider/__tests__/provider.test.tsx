// -----------------------------------------------------------
//  [*] Tests — WayfindSyncProvider
//
//  Loads both queues, drains on mount, on enqueue and on the
//  host's restore signal, reports applied entities and finished
//  uploads once, exposes the counts — re-derived even while a
//  drain is in flight — and merges a stored queue under an
//  enqueue that lands before load resolves (the seed bootstrap).
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import { useEffect, useRef, type ReactNode } from 'react';

import type { OpsAnswer, SyncStorage, SyncTransport } from '../../core/types';
import { WayfindSyncProvider, useWayfindSync } from '../index';


const memory = (): SyncStorage & { dump: Record<string, string> } => {
  const dump: Record<string, string> = {};
  return {
    dump,
    async getItem(key) { return key in dump ? dump[key] : null; },
    async setItem(key, value) { dump[key] = value; },
    async removeItem(key) { delete dump[key]; },
  };
};


describe('WayfindSyncProvider', () => {
  it('drains on mount, on enqueue and on restore; reports applied ops and finished uploads once', async () => {
    const posted: number[] = [];
    const transport: SyncTransport = {
      postOps: async (_b, ops) => {
        posted.push(ops.length);
        return { revision: 3, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) };
      },
      publish: async () => ({ ok: false, reason: 'unchanged' }),
      uploadPanorama: async () => ({ id: 'p', url: '/p.jpg', width: 1, height: 1, bytes: 1, hfovDeg: 360, vfovDeg: 180 }),
      uploadPlan: async () => ({ id: 'l', url: '/l.svg', bytes: 1 }),
      uploadFrame: async () => ({ stored: 1, expected: 44 }),
    };
    let restore: (() => void) | null = null;
    const onRestore = (listener: () => void) => {
      restore = listener;
      return () => {
        restore = null;
      };
    };
    const drained: number[] = [];
    const uploaded: string[] = [];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WayfindSyncProvider buildingId="knf" storage={memory()} transport={transport} onRestore={onRestore} onDrained={(r) => drained.push(r.applied.length)} onUploaded={(item) => uploaded.push(item.id)}>
        {children}
      </WayfindSyncProvider>
    );
    const { result } = await renderHook(() => useWayfindSync(), { wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.status.loaded).toBe(true);
    expect(posted).toEqual([]);

    await act(async () => {
      result.current.enqueueOps([{ id: 'o1', type: 'building', data: { northDeg: 1 } }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(posted).toEqual([1]);
    expect(result.current.status.pendingOps).toBe(0);
    expect(drained[drained.length - 1]).toBe(1);

    await act(async () => {
      result.current.enqueueUpload({ id: 'u1', kind: 'panorama', file: { uri: 'file:///a', name: 'a.jpg', type: 'image/jpeg' }, fields: {}, target: 'n1' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(uploaded).toEqual(['u1']);
    expect(result.current.status.uploads[0]).toMatchObject({ status: 'done' });

    await act(async () => {
      restore?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(uploaded).toEqual(['u1']);
    expect(await result.current.publish()).toEqual({ ok: false, reason: 'unchanged' });
  });

  it('re-derives the counts when an enqueue lands during an in-flight drain', async () => {
    const posted: string[][] = [];
    const releases: ((answer: OpsAnswer) => void)[] = [];
    const transport: SyncTransport = {
      postOps: (_b, ops) => {
        posted.push(ops.map((op) => op.id));
        return new Promise((resolve) => { releases.push(resolve); });
      },
      publish: async () => ({ ok: false, reason: 'unchanged' }),
      uploadPanorama: async () => ({ id: 'p', url: '/p.jpg', width: 1, height: 1, bytes: 1, hfovDeg: 360, vfovDeg: 180 }),
      uploadPlan: async () => ({ id: 'l', url: '/l.svg', bytes: 1 }),
      uploadFrame: async () => ({ stored: 1, expected: 44 }),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WayfindSyncProvider buildingId="knf" storage={memory()} transport={transport}>
        {children}
      </WayfindSyncProvider>
    );
    const { result } = await renderHook(() => useWayfindSync(), { wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      result.current.enqueueOps([{ id: 'o1', type: 'upsert', kind: 'node', entityId: 'n1', data: { x: 1 } }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // o1 is on the wire; the second enqueue must show up in the
    // counts although nothing else about the drain has changed
    await act(async () => {
      result.current.enqueueOps([{ id: 'o2', type: 'upsert', kind: 'node', entityId: 'n2', data: { x: 2 } }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.status.sendingOps).toBe(1);
    expect(result.current.status.pendingOps).toBe(1);
    await act(async () => {
      releases[0]({ revision: 1, results: [{ id: 'o1', status: 'applied' }] });
      await new Promise((resolve) => setTimeout(resolve, 0));
      releases[1]({ revision: 2, results: [{ id: 'o2', status: 'applied' }] });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(posted).toEqual([['o1'], ['o2']]);
    expect(result.current.status.pendingOps).toBe(0);
    expect(result.current.status.sendingOps).toBe(0);
  });

  it('keeps a stored queue when a child effect enqueues before load resolves, and posts both once', async () => {
    const storage = memory();
    storage.dump['wayfind:ops:knf'] = JSON.stringify([{ op: { id: 'P', type: 'upsert', kind: 'node', entityId: 'n-old', data: { x: 1 } }, status: 'queued', queuedAt: 1 }]);
    const posted: string[][] = [];
    const transport: SyncTransport = {
      postOps: async (_b, ops) => {
        posted.push(ops.map((op) => op.id));
        return { revision: 3, results: ops.map((op) => ({ id: op.id, status: 'applied' as const })) };
      },
      publish: async () => ({ ok: false, reason: 'unchanged' }),
      uploadPanorama: async () => ({ id: 'p', url: '/p.jpg', width: 1, height: 1, bytes: 1, hfovDeg: 360, vfovDeg: 180 }),
      uploadPlan: async () => ({ id: 'l', url: '/l.svg', bytes: 1 }),
      uploadFrame: async () => ({ stored: 1, expected: 44 }),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WayfindSyncProvider buildingId="knf" storage={storage} transport={transport}>
        {children}
      </WayfindSyncProvider>
    );
    // A child's effect runs before the provider's own — the screen's
    // seed bootstrap enqueues exactly like this
    const { result } = await renderHook(() => {
      const sync = useWayfindSync();
      const seeded = useRef(false);
      useEffect(() => {
        if (seeded.current) return;
        seeded.current = true;
        sync.enqueueOps([{ id: 'S', type: 'upsert', kind: 'node', entityId: 'n-seed', data: { x: 2 } }]);
      }, [sync]);
      return sync;
    }, { wrapper });
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const flat = posted.flat();
    expect(flat.filter((id) => id === 'S')).toHaveLength(1);
    expect(flat.filter((id) => id === 'P')).toHaveLength(1);
    expect(result.current.status.pendingOps).toBe(0);
  });
});
