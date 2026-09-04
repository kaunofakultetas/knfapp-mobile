// -----------------------------------------------------------
//  [*] chatengine — useRealtimeStatus
//
//  The realtime door's state as React state, for the host's
//  connection banner: 'connecting' and 'reconnecting' are the
//  moments worth a strip above the list, 'connected' hides it,
//  'unauthorized' is the guest's steady state. One subscription
//  per mount; the initial value is read, not assumed.
//
//  Used by:
//    - the host's chat room (chatuikit's ConnectionBanner)
// -----------------------------------------------------------

import { useCallback, useSyncExternalStore } from 'react';

import type { RealtimeStatus } from '../core/transport';
import { useChatEngine } from '../provider';


export function useRealtimeStatus(): RealtimeStatus {

  const { transport } = useChatEngine();

  // useSyncExternalStore re-reads the snapshot after
  // subscribing, so a transition in the render-to-subscribe gap
  // can never leave a stale status on screen
  const subscribe = useCallback((onChange: () => void) => transport.realtime.onStatus(onChange), [transport]);
  const getStatus = useCallback(() => transport.realtime.status(), [transport]);
  return useSyncExternalStore(subscribe, getStatus);
}
