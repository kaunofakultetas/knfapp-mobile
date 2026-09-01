// -----------------------------------------------------------
//  [*] wayfindsync — outbox
//
//  The persisted op log between the editor and the server.
//  Ops are appended in the order they were made and leave in
//  that order, in batches, through a single-flight drain — a
//  second drain while one runs is a no-op that the running
//  drain's next round covers. Consecutive queued ops on one
//  entity coalesce (the earlier upsert's data is replaced, its
//  baseRevision — or its deliberate absence, an overwrite —
//  kept; that is the revision the phone's copy came from), so
//  a long offline session sends one op per entity, not one per
//  finger move. A delete cancels a queued upsert only when that
//  upsert is marked `fresh` (a create the server never heard
//  of); any other queued op becomes the delete itself.
//
//  The server answers per op: applied ops are dropped from the
//  log with their batch's revision reported per entity, so the
//  editor can stamp the next ops; a duplicate is read by what
//  the logged op had been — `of: 'applied'` joins the applied
//  report with the logged revision, `of: 'rejected'` marks the
//  entry rejected; rejected ops stay, marked, until the host
//  resolves them — retry without the base revision ("keep
//  mine", the server's copy is overwritten) or drop ("take
//  theirs", the host applies `current`). A transport failure
//  leaves every op queued for the next drain. The revisions the
//  answers teach are remembered per entity for the session and
//  lift any stale stamp just before an op goes on the wire, so
//  the phone cannot conflict with its own applied edits.
//
//  Persistence is fire-and-forget after every change, but only
//  once load() has read the stored queue — an enqueue that
//  lands earlier (the seed bootstrap) must not clobber the
//  previous session's ops, which load() merges in front of it.
//  The in-memory list is the truth of the session and the
//  storage is what survives a kill.
//
//  Used by:
//    - provider/index.tsx — one outbox per building
// -----------------------------------------------------------

import type { OpResult, ServerOp, SyncStorage, SyncTransport } from './types';


export interface OutboxEntry {
  op: ServerOp;
  status: 'queued' | 'sending' | 'rejected';
  reason?: string | null;
  current?: OpResult['current'];
  queuedAt: number;
}

export interface DrainReport {
  // revision is the answering batch's — not the drain's last —
  // so the editor can stamp every entity with its true number
  applied: { kind?: ServerOp['kind']; entityId?: string; opId: string; revision: number }[];
  // The last batch's revision, kept for the screen's "synced" line
  revision: number | null;
  rejected: OutboxEntry[];
  // The drain could not reach the server; nothing changed
  offline: boolean;
}

export interface Outbox {
  load(): Promise<void>;
  entries(): readonly OutboxEntry[];
  pending(): number;
  rejected(): readonly OutboxEntry[];
  enqueue(ops: readonly ServerOp[]): void;
  drain(transport: SyncTransport, buildingId: string): Promise<DrainReport>;
  resolve(opId: string, how: 'keep-mine' | 'drop'): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const BATCH = 500;

const entityKey = (op: ServerOp): string | null => (op.type === 'building' ? 'building' : op.kind && op.entityId ? `${op.kind}:${op.entityId}` : null);


export function createOutbox(storage: SyncStorage, key: string, now: () => number = () => Date.now()): Outbox {

  let entries: OutboxEntry[] = [];
  let draining: Promise<DrainReport> | null = null;
  // The stored queue has not been read yet — a write now would
  // clobber the previous session's ops before load() merges them
  let ready = false;
  // Per entity, the latest revision the server's answers taught this
  // session; a queued op stamped below it is lifted just before the
  // wire. In-memory only — after a restart the first answer re-teaches
  const learned = new Map<string, number>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const persist = () => {
    if (!ready) return;
    void storage.setItem(key, JSON.stringify(entries)).catch(() => undefined);
  };
  const commit = () => {
    persist();
    notify();
  };
  const teach = (op: ServerOp, revision: number) => {
    const target = entityKey(op);
    if (target !== null) learned.set(target, Math.max(learned.get(target) ?? 0, revision));
  };


  return {
    async load() {
      try {
        const raw = await storage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
        // A kill mid-drain leaves 'sending' ops; they are queued again
        const stored = parsed.map((entry) => (entry.status === 'sending' ? { ...entry, status: 'queued' as const } : entry));
        // Ops enqueued before this read (the seed bootstrap) survive:
        // the stored queue goes first — it is older — and the session's
        // entries keep their objects, so an in-flight drain still
        // recognises the ones it is sending
        const held = new Set(entries.map((entry) => entry.op.id));
        entries = [...stored.filter((entry) => !held.has(entry.op.id)), ...entries];
      } catch {
        // Unreadable storage contributes nothing; the session's entries stay
      }
      ready = true;
      commit();
    },

    entries: () => entries,
    pending: () => entries.filter((entry) => entry.status === 'queued').length,
    rejected: () => entries.filter((entry) => entry.status === 'rejected'),

    enqueue(ops) {
      for (const op of ops) {
        const target = entityKey(op);
        // Only a 'queued' entry coalesces — a 'sending' one is on the
        // wire and a 'rejected' one is the host's to resolve
        const at = target ? entries.findIndex((entry) => entry.status === 'queued' && entityKey(entry.op) === target) : -1;
        if (at >= 0 && target !== 'building') {
          const held = entries[at].op;
          if (op.type === 'delete' && held.type === 'upsert') {
            // Only a delete of a FRESH create (an entity the server
            // never heard of) cancels both; anything else — an edit
            // of an existing entity, a keep-mine retry, an edit made
            // while the create is on the wire — becomes the delete
            // itself, keeping the held op's baseRevision (or its
            // absence: an overwrite delete the server takes as is)
            if (held.fresh === true) {
              entries.splice(at, 1);
              continue;
            }
            const { baseRevision: _dropped, fresh: _never, ...deleteOp } = op;
            void _dropped;
            void _never;
            entries[at] = { ...entries[at], op: held.baseRevision === undefined ? deleteOp : { ...deleteOp, baseRevision: held.baseRevision } };
            continue;
          }
          // The earlier op's base revision — or its deliberate
          // absence, a keep-mine overwrite — and its fresh mark are
          // the ones that matter; the later op brings the data
          const { baseRevision: _stale, fresh: _later, ...next } = op;
          void _stale;
          void _later;
          entries[at] = { ...entries[at], op: { ...next, ...(held.baseRevision === undefined ? {} : { baseRevision: held.baseRevision }), ...(held.fresh === undefined ? {} : { fresh: held.fresh }) } };
          continue;
        }
        if (at >= 0) {
          entries[at] = { ...entries[at], op: { ...op, data: { ...(entries[at].op.data ?? {}), ...(op.data ?? {}) } } };
          continue;
        }
        entries.push({ op, status: 'queued', queuedAt: now() });
      }
      commit();
    },

    drain(transport, buildingId) {
      if (draining) return draining;
      const run = async (): Promise<DrainReport> => {
        const report: DrainReport = { applied: [], revision: null, rejected: [], offline: false };
        {
          while (entries.some((entry) => entry.status === 'queued')) {
            const batch = entries.filter((entry) => entry.status === 'queued').slice(0, BATCH);
            for (const entry of batch) {
              entry.status = 'sending';
              // Lift a stale stamp just before the wire: an earlier
              // batch (or drain) may have raised this entity's
              // revision, and sending the old number would conflict
              // with the phone's own applied edit
              const target = entityKey(entry.op);
              const risen = target === null ? undefined : learned.get(target);
              if (risen !== undefined && typeof entry.op.baseRevision === 'number' && entry.op.baseRevision < risen) {
                entry.op = { ...entry.op, baseRevision: risen };
              }
            }
            notify();
            let answer;
            try {
              answer = await transport.postOps(buildingId, batch.map((entry) => entry.op));
            } catch {
              for (const entry of batch) entry.status = 'queued';
              report.offline = true;
              commit();
              return report;
            }
            report.revision = answer.revision;
            const byId = new Map(answer.results.map((result) => [result.id, result]));
            for (const entry of batch) {
              const result = byId.get(entry.op.id);
              // A duplicate is read by what the logged op HAD been:
              // an earlier post's rejection whose answer was lost
              // must still surface as one, not vanish as a success
              if (result?.status === 'rejected' || (result?.status === 'duplicate' && result.of === 'rejected')) {
                entry.status = 'rejected';
                entry.reason = result.reason ?? null;
                entry.current = result.current ?? null;
                report.rejected.push(entry);
                continue;
              }
              if (result?.status === 'applied') {
                teach(entry.op, answer.revision);
                report.applied.push({ kind: entry.op.kind, entityId: entry.op.entityId, opId: entry.op.id, revision: answer.revision });
              } else if (result?.status === 'duplicate' && result.of === 'applied' && typeof result.revision === 'number') {
                // The op went through on a post whose answer was
                // lost; the logged revision stands in for a batch's
                teach(entry.op, result.revision);
                report.applied.push({ kind: entry.op.kind, entityId: entry.op.entityId, opId: entry.op.id, revision: result.revision });
              }
              // An op the answer does not name, or a duplicate with
              // nothing knowable, just leaves the log
              entries = entries.filter((held) => held !== entry);
            }
            commit();
          }
        }
        return report;
      };
      // The latch clears only after the promise settles — a body
      // that never awaits would otherwise clear it before it is set
      const flight = run().finally(() => {
        draining = null;
      });
      draining = flight;
      return flight;
    },

    resolve(opId, how) {
      const at = entries.findIndex((entry) => entry.op.id === opId && entry.status === 'rejected');
      if (at < 0) return;
      if (how === 'drop') entries.splice(at, 1);
      else {
        // A deliberate overwrite: no base for the server to check,
        // and no fresh mark — the entity exists there now
        const { baseRevision: _stale, fresh: _fresh, ...op } = entries[at].op;
        void _stale;
        void _fresh;
        entries[at] = { op: { ...op, id: `${op.id}-again` }, status: 'queued', queuedAt: now() };
      }
      commit();
    },

    clear() {
      entries = [];
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
