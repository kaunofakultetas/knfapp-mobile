// -----------------------------------------------------------
//  [*] NetworkContext — connectivity state and restore events
//
//  Watches NetInfo and tells the rest of the app two things:
//  whether the device is online (`isConnected`) and WHEN the
//  connection comes back (`onNetworkRestore`) so screens
//  showing cached data can refetch. A restore also reconnects
//  the chat socket; both transitions surface a toast.
//
//  The NetInfo subscription is created exactly once — the
//  previous online state and the translator live in refs, so
//  the listener never tears down and resubscribes on every
//  connectivity flip or language change (the old resubscribe
//  churn could miss a transition that fired in the gap
//  between unsubscribe and resubscribe).
//
//  showToast lives here as the app-wide toast helper — a
//  plain function, not a hook, so services and event
//  callbacks can use it too.
//
//  Split into:
//
//    showToast       — app-wide toast helper
//    NetworkProvider — the once-only NetInfo watcher
//    useNetwork      — the consumer hook
// -----------------------------------------------------------

// Connectivity source and realtime reconnect on restore
import { connectSocket } from '@/services/socket';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// Context plumbing and the toast surface
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';


interface NetworkContextType {
  isConnected: boolean;
  onNetworkRestore: (listener: () => void) => () => void;
}

// Sensible defaults so useNetwork never explodes outside the
// provider (tests, storybook-style isolation)
const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  onNetworkRestore: () => () => {},
});







// -----------------------------------------------------------
// showToast
// -----------------------------------------------------------
//
// One call site for the toast options so timing and position
// stay consistent app-wide; errors linger a second longer.
// Callers pass ALREADY-TRANSLATED text.
//
// Used by:
//   - NetworkProvider (below) — offline/online transitions
//   - login/register, chat, admin, profile screens and hooks —
//     non-blocking success/error feedback
// -----------------------------------------------------------

export function showToast(
  type: 'success' | 'error' | 'info',
  text1: string,
  text2?: string,
): void {
  Toast.show({
    type,
    text1,
    text2,
    position: 'top',
    visibilityTime: type === 'error' ? 4000 : 3000,
    topOffset: 60,
  });
}







// -----------------------------------------------------------
// NetworkProvider
// -----------------------------------------------------------
//
// Subscribes to NetInfo once on mount and turns raw
// connectivity events into offline/restore transitions.
//
// Used by:
//   - app/_layout.tsx — wraps the app inside AuthProvider
// -----------------------------------------------------------

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Assume online until NetInfo's first event says otherwise —
  // avoids a false offline toast on startup
  const [isConnected, setIsConnected] = useState(true);
  const prevOnline = useRef(true);
  const restoreListeners = useRef(new Set<() => void>());


  // The subscription reads the translator through a ref so it
  // survives language changes without resubscribing
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;


  // Stable identity — safe to list in consumer effect deps
  // (hooks/useNetworkRestore.ts does exactly that)
  const onNetworkRestore = useCallback((listener: () => void) => {
    restoreListeners.current.add(listener);
    return () => {
      restoreListeners.current.delete(listener);
    };
  }, []);


  // Subscribe once; transitions are detected against the ref,
  // not React state, so this effect never re-runs
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // isInternetReachable starts as null (unknown) — only an
      // explicit false counts as offline
      const online =
        state.isConnected !== false && state.isInternetReachable !== false;


      if (!online && prevOnline.current) {
        showToast('error', tRef.current('network.offline'), tRef.current('network.offlineHint'));
      } else if (online && !prevOnline.current) {
        showToast('success', tRef.current('network.online'));

        // The socket rarely survives an offline blip — reconnect
        // (single-flight inside the socket service)
        connectSocket().catch(() => {});

        // Screens showing cached data refetch now
        restoreListeners.current.forEach((listener) => {
          try {
            listener();
          } catch {
            // One bad listener must not block the rest
          }
        });
      }


      prevOnline.current = online;
      setIsConnected(online);
    });

    return () => unsubscribe();
  }, []);


  return (
    <NetworkContext.Provider value={{ isConnected, onNetworkRestore }}>
      {children}
    </NetworkContext.Provider>
  );
}







// -----------------------------------------------------------
// useNetwork
// -----------------------------------------------------------
//
// Used by:
//   - hooks/useNetworkRestore.ts — the per-screen wrapper
//   - hooks/useLoad.ts / useFeed.ts — offline fallback paths
//   - screens checking isConnected before optimistic actions
// -----------------------------------------------------------

export function useNetwork(): NetworkContextType {
  return useContext(NetworkContext);
}
