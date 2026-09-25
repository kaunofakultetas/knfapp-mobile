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
//      persisted so a remount, a fast-refresh or a task the
//      OS relaunched with the original notification Intent
//      can never replay yesterday's navigation — the persisted
//      ring is consulted on BOTH entry paths, the device read
//      and the warm listener;
//    - intents that arrive before the resolver exists (router
//      not mounted yet) are BUFFERED, capped, and flushed in
//      order the moment setResolver lands — never dropped;
//    - a launch tap can reach the warm listener before the
//      launch consumer asks for it, so while NO resolver is
//      installed consumeInitial() adopts the OLDEST buffered
//      intent as the cold start instead of reading the device
//      — the buffer keeps each identifier so the later device
//      read of that same response still dedupes to null;
//    - an ingest is two storage round-trips long, and a launch
//      tap claimed by one that has not PARKED yet is still the
//      cold start: consumeInitial() first lets every ingest
//      already under way finish, and a device read naming an
//      identifier an ingest claimed waits for that ingest and
//      adopts what it parked — never answering null while the
//      intent is on its way into the buffer, where the warm
//      resolver would later replay it over the landing screen;
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


// Where the consumed-response guard persists its ring — a cold
// start replaying the same sticky tap must not route twice
const CONSUMED_KEY = 'notify.lastConsumedResponse';
// Intents that land before a resolver subscribes wait in the
// buffer — capped so a resolver-less app never grows it forever
const BUFFER_CAP = 20;
// How many consumed identifiers the persisted guard remembers —
// one warm tap must not evict a sticky cold response's marker
const CONSUMED_CAP = 10;
// How long (ms) consumeInitial() waits for ingests already under
// way to park their intent — two storage round-trips normally
// take milliseconds; a storage layer that never answers must
// not hold the launch screen on its splash forever
const INGEST_WAIT_MS = 1_000;

// The platform's name for the plain tap; anything else is a
// custom action button
const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';







// -----------------------------------------------------------
// normalizeData
// -----------------------------------------------------------
//
// Whatever the wire carried, the resolver receives a plain
// string→string map: objects stringified, null dropped, JSON
// text parsed one level when it looks like an envelope.
//
// Used by:
//   - createRoutingHub (below) — every ingested response
//   - adapters/expo/index.ts — the foreground handler's payload
// -----------------------------------------------------------

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







// -----------------------------------------------------------
// RoutingHub
// -----------------------------------------------------------
//
// The hub's surface — resolver wiring, the intent listeners,
// and the two entry paths (warm ingest, cold-start consume).
//
// Used by:
//   - createRoutingHub (below) — the return shape
//   - engine.ts — holds one, feeds device responses in
// -----------------------------------------------------------

export interface RoutingHub {
  setResolver(resolver: RouteResolver): void;
  onIntent(listener: (intent: RouteIntent) => void): Unsubscribe;
  // Warm-path entry — engine.ts feeds device responses here
  ingest(response: DeviceNotificationResponse, coldStart: boolean): Promise<void>;
  consumeInitial(): Promise<RouteIntent | null>;
}







// -----------------------------------------------------------
// createRoutingHub
// -----------------------------------------------------------
//
// Taps are deduped twice — a session set, plus the persisted
// ring that guards restarts; with no resolver yet, intents
// park in a capped buffer, and the serialized consumeInitial()
// adopts the parked launch tap as the cold start — including
// one an ingest has claimed but is still parking.
//
// Used by:
//   - engine.ts — wires the device listeners in
// -----------------------------------------------------------

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
  // The ingests between claiming an identifier (`seen`) and
  // parking or delivering its intent — consumeInitial() waits
  // on them, so a claimed-but-unparked launch tap is adopted
  // as the cold start instead of flushed warm later
  const ingesting = new Map<string, Promise<void>>();
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

  const ingest = (response: DeviceNotificationResponse, coldStart: boolean): Promise<void> => {
    const { identifier } = response;
    // A repeat delivery shares the first one's flight — the
    // caller still learns when that intent has landed
    if (seen.has(identifier)) return ingesting.get(identifier) ?? Promise.resolve();
    // Claimed for the session BEFORE the storage read, so two
    // deliveries racing through here still emit one intent
    seen.add(identifier);

    const run = (async () => {
      // The persisted ring is the guard that outlives the JS
      // context: a launch tap replayed into a fresh process (an
      // Android task relaunched from Recents re-fires the
      // original Intent) arrives with an empty `seen` — the ring
      // still remembers it, and it parks nothing for
      // consumeInitial() to adopt a second time
      if ((await readConsumed()).includes(identifier)) return;
      await markConsumed(identifier);
      deliver(identifier, toIntent(response, coldStart));
    })();

    // In flight until parked or delivered — both helpers above
    // swallow their own failures, but the bookkeeping must end
    // whichever way the flight does
    ingesting.set(identifier, run);
    const landed = () => {
      if (ingesting.get(identifier) === run) ingesting.delete(identifier);
    };
    run.then(landed, landed);
    return run;
  };

  // Waits for ingests still parking their intent, bounded by
  // INGEST_WAIT_MS — a flight that never lands is left behind
  // rather than holding the launch decision hostage
  const settleIngests = async (flights: Promise<void>[]): Promise<void> => {
    if (flights.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bound = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, INGEST_WAIT_MS);
    });
    await Promise.race([Promise.all(flights.map((flight) => flight.catch(() => undefined))), bound]);
    clearTimeout(timer);
  };

  // The cold start taken out of the buffer: the oldest parked
  // intent, or — given an identifier — exactly that tap's. Only
  // while NO resolver is installed; with one, nothing parks
  const adopt = (identifier?: string): RouteIntent | null => {
    if (resolver) return null;
    const at = identifier === undefined ? 0 : buffer.findIndex((entry) => entry.identifier === identifier);
    if (at < 0 || at >= buffer.length) return null;
    const [parked] = buffer.splice(at, 1);
    return { ...parked.intent, coldStart: true };
  };

  const consumeInitial = (): Promise<RouteIntent | null> => {
    // Serialized: the second concurrent caller runs after the
    // first finished marking, and so sees the dedupe
    const run = consumeLock.then(async (): Promise<RouteIntent | null> => {
      // A tap an ingest is still parking counts as parked — let
      // every flight already under way land first
      await settleIngests([...ingesting.values()]);

      // The launch tap already came through the warm listener
      // and is parked: it IS the cold start. Its identifier is
      // in `seen` and the ring, so the device read that would
      // have found the same response answers null later
      const parked = adopt();
      if (parked) return parked;

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

      // Claimed by an ingest already: whatever that ingest
      // parks for this identifier is the cold start (a flight
      // that started during the device read is waited for) —
      // and nothing parked means it was consumed before
      if (seen.has(response.identifier)) {
        const flight = ingesting.get(response.identifier);
        if (flight) await settleIngests([flight]);
        return adopt(response.identifier);
      }
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
