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

import { useEffect, useState } from 'react';

import type { RealtimeStatus } from '../core/transport';
import { useChatEngine } from '../provider';


export function useRealtimeStatus(): RealtimeStatus {

  const { transport } = useChatEngine();
  const [status, setStatus] = useState<RealtimeStatus>(() => transport.realtime.status());


  useEffect(() => {
    setStatus(transport.realtime.status());
    return transport.realtime.onStatus(setStatus);
  }, [transport]);


  return status;
}
