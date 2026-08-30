// -----------------------------------------------------------
//  [*] NetworkContext — connectivity state and restore events
//
//  Watches NetInfo and tells the rest of the app two things:
//  whether the device is online (`isConnected`) and WHEN the
//  connection comes back (`onNetworkRestore`) so screens
//  showing cached data can refetch. A restore also reconnects
//  the chat socket; both transitions surface a toast. The
//  offline toast is immediate, but the restore fan-out is
//  debounced — it fires only after the connection has held for
//  a moment, and a flapping link cannot re-trigger it inside
//  the cooldown. A restore spent while NetInfo's reachability
//  probe was still pending re-fires once when the probe
//  confirms, so a captive portal cannot eat the only attempt.
//  The provider also gates the socket on app
//  state: backgrounding disconnects it (so chat push arrives),
//  foregrounding reconnects and refires the restore fan-out so
//  stale screens catch up; going offline suspends the socket's
//  retry loop, which would otherwise poll a dead network.
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
import { connectSocket, disconnectSocket, suspendSocket } from '@/services/socket';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

// Context plumbing and the toast surface
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, AppState } from 'react-native';
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
// Callers pass ALREADY-TRANSLATED text. Every toast is also
// announced through the accessibility API — the toast overlay
// alone is invisible to screen readers — and toasts linger
// twice as long while a screen reader is on.
//
// Used by:
//   - NetworkProvider (below) — offline/online transitions
//   - login/register, chat, admin, profile screens and hooks —
//     non-blocking success/error feedback
// -----------------------------------------------------------

// Tracked module-level so showToast can size its timing
// synchronously; the listener lives for the app session
let screenReaderEnabled = false;
AccessibilityInfo.isScreenReaderEnabled()
  .then((enabled) => {
    screenReaderEnabled = enabled;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
  screenReaderEnabled = enabled;
});


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
    visibilityTime:
      (type === 'error' ? 4000 : 3000) * (screenReaderEnabled ? 2 : 1),
    topOffset: 60,
  });

  AccessibilityInfo.announceForAccessibility(
    [text1, text2].filter(Boolean).join('. '),
  );
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

// A restore only fires after the connection has held this long,
// and repeats inside the cooldown are skipped — a flapping
// connection must not trigger app-wide refetch storms
const RESTORE_STABLE_MS = 1500;
const RESTORE_COOLDOWN_MS = 5000;


export function NetworkProvider({ children }: { children: ReactNode }) {
  // Assume online until NetInfo's first event says otherwise —
  // avoids a false offline toast on startup
  const [isConnected, setIsConnected] = useState(true);
  const prevOnline = useRef(true);
  const restoreListeners = useRef(new Set<() => void>());


  // Pending debounced restore + when the last one fired
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRestoreAt = useRef(0);


  // Reachability bookkeeping: the latest CONFIRMED reading
  // (isInternetReachable === true) and whether the last restore
  // was spent before the probe confirmed — the confirming event
  // then re-fires the fan-out once (see the listener below)
  const confirmedRef = useRef(false);
  const restoreUnconfirmed = useRef(false);


  // The subscription reads the translator through a ref so it
  // survives language changes without resubscribing; the ref is
  // written in an effect, never during render
  const { t } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });


  // Stable identity — safe to list in consumer effect deps
  // (hooks/useNetworkRestore.ts does exactly that)
  const onNetworkRestore = useCallback((listener: () => void) => {
    restoreListeners.current.add(listener);
    return () => {
      restoreListeners.current.delete(listener);
    };
  }, []);


  // One fan-out for both resync triggers — a connectivity
  // restore and a return to the foreground. The socket
  // reconnect sits BEFORE the cooldown gate on purpose: it is
  // single-flight and cheap, and a blip that tore the socket
  // down must not leave it down just because a refetch ran
  // moments earlier. `announce` keeps the "back online" toast
  // off the resume path.
  const fireResync = useCallback((announce: boolean) => {
    connectSocket().catch(() => {});

    const now = Date.now();
    if (now - lastRestoreAt.current < RESTORE_COOLDOWN_MS) return;
    lastRestoreAt.current = now;

    if (announce) showToast('success', tRef.current('network.online'));

    // Screens showing cached data refetch now
    restoreListeners.current.forEach((listener) => {
      try {
        listener();
      } catch {
        // One bad listener must not block the rest
      }
    });
  }, []);


  // Subscribe once; transitions are detected against the ref,
  // not React state, so this effect never re-runs
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // isInternetReachable starts as null (unknown) — only an
      // explicit false counts as offline, and only an explicit
      // true counts as CONFIRMED (the re-fire branch below)
      const online =
        state.isConnected !== false && state.isInternetReachable !== false;
      confirmedRef.current =
        state.isConnected === true && state.isInternetReachable === true;


      if (!online && prevOnline.current) {
        // Offline feedback stays immediate; a pending restore is
        // void — the connection did not hold — and so is an
        // unconfirmed spend: the next transition restores anew
        if (restoreTimer.current) {
          clearTimeout(restoreTimer.current);
          restoreTimer.current = null;
        }
        restoreUnconfirmed.current = false;
        showToast('error', tRef.current('network.offline'), tRef.current('network.offlineHint'));

        // With the network known gone, the socket's retry loop is
        // only doomed polls keeping the radio awake — suspend it;
        // fireResync reconnects on restore or foreground
        suspendSocket();
      } else if (online && !prevOnline.current) {
        // Debounced restore — see RESTORE_STABLE_MS above
        if (!restoreTimer.current) {
          restoreTimer.current = setTimeout(() => {
            restoreTimer.current = null;
            // NetInfo reports the link before the probe result —
            // a restore spent while reachability is still unknown
            // is remembered so the confirming event can re-fire
            // once (captive portal, slow probe)
            restoreUnconfirmed.current = !confirmedRef.current;
            fireResync(true);
          }, RESTORE_STABLE_MS);
        }
      } else if (confirmedRef.current && restoreUnconfirmed.current) {
        // The probe just confirmed a connection whose restore was
        // spent while reachability was unknown — those refetches
        // may have died on a dead link, so fan out once more (no
        // second toast; the cooldown is reset because this is the
        // deliberate second half of ONE reconnection, not a flap)
        restoreUnconfirmed.current = false;
        lastRestoreAt.current = 0;
        fireResync(false);
      }


      prevOnline.current = online;
      setIsConnected(online);
    });

    return () => {
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      unsubscribe();
    };
  }, [fireResync]);


  // Foreground gating for the realtime socket: presence on the
  // backend should mean "app in the foreground", and tearing the
  // socket down while backgrounded lets chat push notifications
  // come through instead of being suppressed as "delivered".
  // Foregrounding also refires the restore fan-out — backgrounding
  // never fires a NetInfo transition, so screens showing cached
  // data would otherwise sit stale until the next connectivity
  // event
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'background') {
        disconnectSocket();
      } else if (status === 'active') {
        fireResync(false);
      }
    });

    return () => subscription.remove();
  }, [fireResync]);


  // Memoized so the context value changes identity only when
  // isConnected actually flips — consumers can list it (or its
  // fields) in effect dependencies safely
  const value = useMemo(
    () => ({ isConnected, onNetworkRestore }),
    [isConnected, onNetworkRestore],
  );


  return (
    <NetworkContext.Provider value={value}>
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
