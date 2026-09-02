// -----------------------------------------------------------
//  [*] notifyengine — the permission machine
//
//  One normalized snapshot of "may we deliver?", kept honest
//  across platforms and runtimes. The states:
//
//    unknown ──poll──▶ undetermined | granted | provisional
//                      | denied | unsupported
//
//  'unsupported' is a FIRST-CLASS state, not an error: the
//  dev-shell's Android runtime and web-without-service-worker
//  simply cannot do remote push, and pretending otherwise
//  produces retry loops and phantom failures. requestPermission
//  prompts only from 'undetermined' (or a still-askable
//  'denied'); it is single-flight — concurrent callers share
//  one OS prompt. Returning to the foreground re-polls, since
//  the user may have flipped the OS toggle, and the store's
//  edge-dedup keeps the re-poll silent when nothing changed.
//
//  Used by:
//    - engine.ts — init/reconcile, AppState re-poll
//    - registration.ts — the canDeliver gate
// -----------------------------------------------------------

import { createStore, type MutableStore } from './store';
import type { DeviceAdapter, PermissionSnapshot } from './types';


const UNKNOWN: PermissionSnapshot = { status: 'unknown', canAskAgain: false, canDeliver: false };


export interface PermissionMachine {
  store: MutableStore<PermissionSnapshot>;
  poll(): Promise<PermissionSnapshot>;
  request(): Promise<PermissionSnapshot>;
}

export function createPermissionMachine(device: DeviceAdapter): PermissionMachine {
  const store = createStore<PermissionSnapshot>(UNKNOWN);

  const normalize = (raw: { status: string; canAskAgain: boolean }): PermissionSnapshot => {
    const status =
      raw.status === 'granted' || raw.status === 'provisional' || raw.status === 'denied' || raw.status === 'undetermined'
        ? raw.status
        : 'undetermined';
    return {
      status,
      canAskAgain: raw.canAskAgain,
      canDeliver: status === 'granted' || status === 'provisional',
    };
  };

  const poll = async (): Promise<PermissionSnapshot> => {
    if (!device.supportsRemotePush()) {
      const snapshot: PermissionSnapshot = { status: 'unsupported', canAskAgain: false, canDeliver: false };
      store.set(snapshot);
      return snapshot;
    }
    try {
      const snapshot = normalize(await device.getPermissions());
      store.set(snapshot);
      return snapshot;
    } catch {
      // A failed read keeps the previous truth on screen
      return store.get();
    }
  };


  // One OS prompt at a time — concurrent request() calls share
  // the same promise instead of stacking dialogs
  let pending: Promise<PermissionSnapshot> | null = null;

  const request = (): Promise<PermissionSnapshot> => {
    if (pending) return pending;

    const current = store.get();
    if (current.status === 'unsupported' || current.status === 'granted' || current.status === 'provisional') {
      return Promise.resolve(current);
    }
    if (current.status === 'denied' && !current.canAskAgain) {
      // Terminal for the engine — the UI escalates to OS settings
      return Promise.resolve(current);
    }

    pending = (async () => {
      try {
        const snapshot = normalize(await device.requestPermissions());
        store.set(snapshot);
        return snapshot;
      } catch {
        return poll();
      } finally {
        pending = null;
      }
    })();
    return pending;
  };

  return { store, poll, request };
}
