// -----------------------------------------------------------
//  [*] dataengine — network
//
//  The connectivity signal the engine listens to, as an
//  interface so the package carries no native dependency: a
//  React Native host wraps @react-native-community/netinfo
//  (see the example), a web host wraps navigator.onLine, and
//  tests drive manualNetwork() by hand. The engine only ever
//  asks two things: "online right now?" and "tell me when
//  that changes".
//
//  Restore semantics live in the provider, not here: a source
//  reports raw online/offline transitions; the provider turns
//  offline→online into a restore event and lets the host add
//  its own restore reasons (a realtime socket reconnecting)
//  through signalRestore().
//
//  Used by:
//    - provider/index.tsx — subscribes, derives restore events
//    - hooks/useNetworkRestore.ts — via the provider
// -----------------------------------------------------------

export interface NetworkSource {
  // Best knowledge right now; must never throw
  isOnline(): boolean;
  // Fires on every change with the new state; returns the
  // unsubscribe
  subscribe(listener: (online: boolean) => void): () => void;
}







// -----------------------------------------------------------
// alwaysOnline
// -----------------------------------------------------------
//
// The zero-dependency default: permanently online, never
// fires. Hosts that want restore-on-reconnect pass a real
// source; everything still works without one — refetches
// simply only happen on the usual triggers.
//
// Used by:
//   - provider/index.tsx — the default network
// -----------------------------------------------------------

export function alwaysOnline(): NetworkSource {
  return {
    isOnline: () => true,
    subscribe: () => () => {},
  };
}







// -----------------------------------------------------------
// manualNetwork
// -----------------------------------------------------------
//
// A hand-driven source for tests and stories: set(false) then
// set(true) walks the engine through an outage and the
// restore that follows. Repeating the current state does not
// fire — real sources are expected to behave the same way.
//
// Used by:
//   - tests everywhere — the outage lever
// -----------------------------------------------------------

export function manualNetwork(initial = true): NetworkSource & { set(online: boolean): void } {
  let online = initial;
  const listeners = new Set<(online: boolean) => void>();
  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (next === online) return;
      online = next;
      listeners.forEach((fn) => fn(next));
    },
  };
}
