// -----------------------------------------------------------
//  [*] socialengine — useUnreadBadge
//
//  The number on the activity tab. Polls the transport's cheap
//  fetchUnreadCount every intervalMs (default 30 s) — but only
//  while the app is ACTIVE: a backgrounded app stops asking,
//  and returning to the foreground probes immediately and
//  resumes the cadence. A transport without fetchUnreadCount
//  yields '' forever.
//
//  The badge is a STRING because the cap is display logic:
//  0 → '' (render nothing), 1..cap-1 → the number, cap and
//  beyond → 'cap+' (default cap 30, so '30+').
//
//  A failed probe keeps the last shown value — the badge never
//  flickers to empty over one dropped request. Overlapping
//  probes (a poll tick during a slow answer, a manual refresh)
//  share the request already on the wire.
//
//  Used by:
//    - the host's tab bar / activity entry point
// -----------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useSocialEngine } from '../provider';


export interface UseUnreadBadgeResult {
  // '' when there is nothing to show — render no pill at all
  badge: string;
  // Manual probe (a screen focus, a pull-to-refresh); joins the
  // in-flight request when one is already on the wire
  refresh: () => Promise<void>;
}







// -----------------------------------------------------------
// useUnreadBadge
// -----------------------------------------------------------
//
//   const { badge } = useUnreadBadge()
//   useUnreadBadge({ intervalMs: 10000, cap: 99 })
//
// Used by:
//   - the host's tab bar / activity entry point
// -----------------------------------------------------------

export function useUnreadBadge(options?: { intervalMs?: number; cap?: number }): UseUnreadBadgeResult {
  const { transport, currentUser } = useSocialEngine();
  // Guests carry no badge and never probe the wire
  const signedIn = currentUser !== null;
  const intervalMs = options?.intervalMs ?? 30000;
  const cap = options?.cap ?? 30;

  const [count, setCount] = useState(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);


  const refresh = useCallback((): Promise<void> => {
    const probe = signedIn ? transport.fetchUnreadCount?.bind(transport) : undefined;
    if (!probe) return Promise.resolve();

    // Every overlapping caller rides the request on the wire
    if (inFlightRef.current) return inFlightRef.current;
    const flight = (async () => {
      try {
        const n = await probe();
        if (mountedRef.current) setCount(n);
      } catch {
        // Keep the last shown value — see the file banner
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = flight;
    return flight;
  }, [transport, signedIn]);


  useEffect(() => {
    mountedRef.current = true;
    if (!transport.fetchUnreadCount || !signedIn) {
      setCount(0);
      return;
    }

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void refresh(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };


    // Only a REPORTED background holds the first probe — a
    // non-string value counts as active (React Native's jest
    // mock answers a function; iOS cold-starts say 'unknown')
    const current: unknown = AppState.currentState;
    const active = typeof current !== 'string' || current === 'active' || current === 'unknown';
    if (active) {
      void refresh();
      start();
    }


    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // The user may have been away past several intervals —
        // answer immediately, then fall back into the cadence
        void refresh();
        start();
      } else {
        stop();
      }
    });


    return () => {
      mountedRef.current = false;
      stop();
      sub.remove();
    };
  }, [transport, intervalMs, refresh, signedIn]);


  // 0 stays invisible; the cap turns into 'N+' so a runaway
  // count never widens the tab bar
  const badge = count <= 0 ? '' : count >= cap ? `${cap}+` : String(count);

  return { badge, refresh };
}
