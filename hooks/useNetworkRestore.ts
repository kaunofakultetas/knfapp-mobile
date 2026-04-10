import { useNetwork } from '@/context/NetworkContext';
import { useEffect } from 'react';

/**
 * React hook that calls the provided callback when network connectivity
 * is restored after being offline. Use this in screens that show cached
 * data to auto-refresh when the device comes back online.
 *
 * @param callback - Function to call on network restore (e.g., reload data)
 */
export function useNetworkRestore(callback: () => void): void {
  const { onNetworkRestore } = useNetwork();

  useEffect(() => {
    return onNetworkRestore(callback);
  }, [onNetworkRestore, callback]);
}
