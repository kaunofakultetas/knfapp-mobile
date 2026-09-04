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
//  useSyncExternalStore owns the subscribe timing: React
//  re-reads the snapshot after subscribing, so a transition
//  landing between the initial render and the subscription can
//  never leave a stale status on screen.
// -----------------------------------------------------------

// Status source of truth lives in the socket service
import {
  getSocketStatus,
  onSocketStatusChange,
  type SocketStatus,
} from '@/services/socket';

import { useSyncExternalStore } from 'react';







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
  return useSyncExternalStore(onSocketStatusChange, getSocketStatus);
}
