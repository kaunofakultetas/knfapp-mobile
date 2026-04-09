/**
 * Network connectivity context.
 *
 * Tracks whether the device is online/offline using @react-native-community/netinfo
 * and exposes a `showToast` helper for non-blocking user feedback.
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';

interface NetworkContextType {
  isConnected: boolean;
}

const NetworkContext = createContext<NetworkContextType>({ isConnected: true });

export function useNetwork() {
  return useContext(NetworkContext);
}

/** Show a toast notification (convenience wrapper). */
export function showToast(
  type: 'success' | 'error' | 'info',
  text1: string,
  text2?: string,
) {
  Toast.show({
    type,
    text1,
    text2,
    position: 'top',
    visibilityTime: type === 'error' ? 4000 : 3000,
    topOffset: 60,
  });
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const wasDisconnected = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;

      if (!online && isConnected) {
        wasDisconnected.current = true;
        showToast('error', t('network.offline'), t('network.offlineHint'));
      } else if (online && wasDisconnected.current) {
        wasDisconnected.current = false;
        showToast('success', t('network.online'));
      }

      setIsConnected(online);
    });

    return () => unsubscribe();
  }, [isConnected, t]);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {children}
    </NetworkContext.Provider>
  );
}
