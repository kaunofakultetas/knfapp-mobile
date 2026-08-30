// -----------------------------------------------------------
//  [*] useSocketStatus — live socket connection state
//
//  Mirrors the socket service's status ('disconnected' |
//  'connecting' | 'connected' | 'reconnecting' |
//  'unauthorized' — a rejected handshake the messages tab
//  turns into a "sign in again" prompt) into React state.
//  Subscriptions go through the service's module-level
//  listener registry, so they survive the socket instance
//  being torn down and recreated across reconnects.
//
//  The effect re-reads the status right after subscribing: a
//  transition can land in the gap between the initial render
//  and the subscription, and would otherwise stay wrong until
//  the next change.
// -----------------------------------------------------------

// Status source of truth lives in the socket service
import {
  getSocketStatus,
  onSocketStatusChange,
  type SocketStatus,
} from '@/services/socket';

// Local mirror state
import { useEffect, useState } from 'react';







// -----------------------------------------------------------
// useSocketStatus
// -----------------------------------------------------------
//
//   const status = useSocketStatus()   — re-renders on every
//                                        transition
//
// Used by:
//   - app/(main)/tabs/messages.tsx — connection banner
// -----------------------------------------------------------

export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(getSocketStatus);


  useEffect(() => {
    const unsubscribe = onSocketStatusChange(setStatus);

    // Close the render → subscribe gap (see file header)
    setStatus(getSocketStatus());

    return unsubscribe;
  }, []);


  return status;
}
