import { getSocketStatus, onSocketStatusChange, type SocketStatus } from '@/services/socket';
import { useEffect, useState } from 'react';

/**
 * React hook that tracks the current socket.io connection status.
 * Returns 'disconnected' | 'connecting' | 'connected' | 'reconnecting'.
 */
export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(getSocketStatus);

  useEffect(() => {
    return onSocketStatusChange(setStatus);
  }, []);

  return status;
}
