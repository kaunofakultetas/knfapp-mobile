// -----------------------------------------------------------
//  [*] notifyengine — tap routing
//
//  A tapped notification becomes ONE event shape — RouteIntent
//  — whether the app was warm (response listener) or cold
//  (the stored last response). The engine knows no routes: the
//  app registers a resolver and owns the single type→screen
//  map. The traps this module exists to close, each pinned:
//
//    - a cold-start response is consumed EXACTLY once: the
//      device copy is cleared after reading (the primitive
//      happily re-returns it), and the response identifier is
//      persisted so a remount or fast-refresh can never replay
//      yesterday's navigation;
//    - intents that arrive before the resolver exists (router
//      not mounted yet) are BUFFERED, capped, and flushed in
//      order the moment setResolver lands — never dropped;
//    - a launch tap can reach the warm listener before the
//      launch consumer asks for it, so while NO resolver is
//      installed consumeInitial() adopts the OLDEST buffered
//      intent as the cold start instead of reading the device
//      — the buffer keeps each identifier so the later device
//      read of that same response still dedupes to null;
//    - the same identifier delivered twice by the OS emits one
//      intent; a throwing resolver is caught and the next
//      intent still delivers;
//    - only the default tap routes implicitly — a custom
//      actionId rides on the intent for the resolver to judge.
//
//  Used by:
//    - engine.ts — wires the device listeners in
// -----------------------------------------------------------

import type { DeviceNotificationResponse, KeyValueStorage, RouteIntent, RouteResolver, Unsubscribe } from './types';


const CONSUMED_KEY = 'notify.lastConsumedResponse';
const BUFFER_CAP = 20;
// How many consumed identifiers the persisted guard remembers —
// one warm tap must not evict a sticky cold response's marker
const CONSUMED_CAP = 10;

// The platform's name for the plain tap; anything else is a
// custom action button
const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';


// Whatever the wire carried, the resolver receives a plain
// string→string map: objects stringified, null dropped, JSON
// text parsed one level when it looks like an envelope
export function normalizeData(raw: unknown): { type: string; data: Record<string, string> } {
  let source: Record<string, unknown> = {};
  try {
    if (typeof raw === 'string') {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') source = parsed as Record<string, unknown>;
    } else if (raw && typeof raw === 'object') {
      source = raw as Record<string, unknown>;
      // The legacy envelope: {dataString: '{"type":...}'}
      if (typeof source.dataString === 'string') {
        try {
          const inner: unknown = JSON.parse(source.dataString);
          if (inner && typeof inner === 'object') source = inner as Record<string, unknown>;
        } catch {
          // A broken envelope keeps the outer fields
        }
      }
    }
  } catch {
    source = {};
  }

  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined) continue;
    data[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return { type: data.type ?? '', data };
}


export interface RoutingHub {
  setResolver(resolver: RouteResolver): void;
  onIntent(listener: (intent: RouteIntent) => void): Unsubscribe;
  // Warm-path entry — engine.ts feeds device responses here
  ingest(response: DeviceNotificationResponse, coldStart: boolean): Promise<void>;
  consumeInitial(): Promise<RouteIntent | null>;
}

export function createRoutingHub(deps: {
  storage: KeyValueStorage;
  readLastResponse: () => Promise<DeviceNotificationResponse | null>;
  clearLastResponse: () => void;
}): RoutingHub {
  const { storage, readLastResponse, clearLastResponse } = deps;

  let resolver: RouteResolver | null = null;
  const listeners = new Set<(intent: RouteIntent) => void>();
  // Identifier kept beside each parked intent: adopting one as
  // the cold start must leave the device's copy deduplicable
  const buffer: { identifier: string; intent: RouteIntent }[] = [];
  // Session-scope dedupe — the persisted ring guards restarts,
  // this set guards double delivery within one session
  const seen = new Set<string>();
  // consumeInitial serialized — two concurrent callers must
  // not both slip past the check-then-act marker read
  let consumeLock: Promise<unknown> = Promise.resolve();

  const readConsumed = async (): Promise<string[]> => {
    try {
      const raw = await storage.get(CONSUMED_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
      // The pre-ring format was one bare identifier
      return typeof parsed === 'string' ? [parsed] : [];
    } catch {
      return [];
    }
  };

  const markConsumed = async (identifier: string): Promise<void> => {
    try {
      const ring = (await readConsumed()).filter((id) => id !== identifier);
      ring.push(identifier);
      await storage.set(CONSUMED_KEY, JSON.stringify(ring.slice(-CONSUMED_CAP)));
    } catch {
      // Persistence loss only risks one replay after a restart
    }
  };

  const deliver = (identifier: string, intent: RouteIntent) => {
    for (const listener of [...listeners]) {
      try {
        listener(intent);
      } catch {
        // A broken listener never blocks the rest
      }
    }
    if (resolver) {
      try {
        resolver(intent);
      } catch {
        // A throwing resolver must not kill the listener path
      }
      return;
    }
    buffer.push({ identifier, intent });
    if (buffer.length > BUFFER_CAP) buffer.shift();
  };

  const toIntent = (response: DeviceNotificationResponse, coldStart: boolean): RouteIntent => {
    const { type, data } = normalizeData(response.data);
    const action = response.actionIdentifier;
    return {
      type,
      data,
      coldStart,
      actionId: action === null || action === DEFAULT_ACTION ? null : action,
    };
  };

  const ingest = async (response: DeviceNotificationResponse, coldStart: boolean): Promise<void> => {
    if (seen.has(response.identifier)) return;
    seen.add(response.identifier);
    await markConsumed(response.identifier);
    deliver(response.identifier, toIntent(response, coldStart));
  };

  const consumeInitial = (): Promise<RouteIntent | null> => {
    // Serialized: the second concurrent caller runs after the
    // first finished marking, and so sees the dedupe
    const run = consumeLock.then(async (): Promise<RouteIntent | null> => {
      // The launch tap already came through the warm listener
      // and is parked: it IS the cold start. Its identifier is
      // in `seen` and the ring, so the device read that would
      // have found the same response answers null later
      if (!resolver && buffer.length > 0) {
        const parked = buffer.shift() as { identifier: string; intent: RouteIntent };
        return { ...parked.intent, coldStart: true };
      }

      const response = await readLastResponse().catch(() => null);
      if (!response) return null;

      // Cleared FIRST — the primitive re-returns the response
      // on every later read otherwise; a throwing clear must
      // not strand the consumption (the marker still lands)
      try {
        clearLastResponse();
      } catch {
        // The identifier ring below covers a sticky response
      }

      if (seen.has(response.identifier)) return null;
      if ((await readConsumed()).includes(response.identifier)) return null;

      seen.add(response.identifier);
      await markConsumed(response.identifier);
      return toIntent(response, true);
    });
    consumeLock = run.catch(() => null);
    return run;
  };

  return {
    setResolver: (next: RouteResolver) => {
      resolver = next;
      while (buffer.length > 0) {
        const { intent } = buffer.shift() as { identifier: string; intent: RouteIntent };
        try {
          next(intent);
        } catch {
          // Flush continues past a throwing resolver
        }
      }
    },
    onIntent: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ingest,
    consumeInitial,
  };
}
