// -----------------------------------------------------------
//  [*] notifyengine — the state store
//
//  One tiny observable every machine exposes its snapshot
//  through. Three contracts, all pinned by tests: subscribe
//  fires IMMEDIATELY with the current value (no "wait for the
//  first change" gap); emissions are edge-deduped by shallow
//  equality so a re-poll that read the same state never
//  re-renders a host; a throwing listener is isolated — the
//  next listener still runs, the next emission still delivers.
//
//  Used by:
//    - permission.ts / registration.ts / prefs.ts — snapshots
//    - hosts subscribing from React (or anywhere)
// -----------------------------------------------------------

import type { StateStore, Unsubscribe } from './types';


// Shallow equality over one level of plain records — snapshot
// objects are flat, or flat-plus-one-record (prefs.channels),
// so one nested level is compared too
function shallowishEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    const va = (a as Record<string, unknown>)[key];
    const vb = (b as Record<string, unknown>)[key];
    if (Object.is(va, vb)) continue;
    if (typeof va === 'object' && typeof vb === 'object' && va !== null && vb !== null) {
      const nka = Object.keys(va as Record<string, unknown>);
      const nkb = Object.keys(vb as Record<string, unknown>);
      if (nka.length !== nkb.length) return false;
      for (const nk of nka) {
        if (!Object.is((va as Record<string, unknown>)[nk], (vb as Record<string, unknown>)[nk])) return false;
      }
      continue;
    }
    return false;
  }
  return true;
}


export interface MutableStore<T> extends StateStore<T> {
  // Replaces the snapshot; equal values emit nothing
  set(next: T): void;
}

export function createStore<T>(initial: T): MutableStore<T> {
  let value = initial;
  const listeners = new Set<(v: T) => void>();

  return {
    get: () => value,

    set: (next: T) => {
      if (shallowishEqual(value, next)) return;
      value = next;
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch {
          // A broken subscriber must not starve the others
        }
      }
    },

    subscribe: (listener: (v: T) => void): Unsubscribe => {
      listeners.add(listener);
      try {
        listener(value);
      } catch {
        // The immediate call gets the same isolation
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
