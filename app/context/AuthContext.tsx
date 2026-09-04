// -----------------------------------------------------------
//  [*] AuthContext — session state and auth actions
//
//  Holds the signed-in user + token and exposes login /
//  register / logout / setUser. The stored session lives
//  behind services/session (secure token storage) and is
//  restored optimistically on startup, then verified against
//  /me in the background: `hydrated` flips true right after
//  the LOCAL read, so app/index.tsx can pick the initial
//  route without racing the storage read. Verification only
//  drops the session on a real auth rejection (HTTP 401/403)
//  — offline or timeout keeps the restored session so the app
//  still works without a connection. Mid-run 401s reach this
//  provider through services/api/session-events, and every
//  foreground transition re-runs the /me check — every path
//  funnels into ONE guarded expiry (a /me 401 fires BOTH the
//  interceptor's emit and the local catch, so the first
//  reporter wins and the rest no-op) and the app falls back
//  to GUEST state with a single session-expired toast, never
//  a forced login screen.
//
//  Both success paths (login AND register) persist first,
//  then connect the chat socket and register the push token —
//  the api and socket layers read the token per request, so
//  persistence must land before either side-effect starts.
//
//  Login/register failures THROW the normalized ApiError —
//  the thrown error is the whole failure interface; screens
//  translate it themselves. The reducer only resets the
//  loading flag on failure.
//
//  logout() tears down locally FIRST (socket, session record,
//  schedule prefs, caches, state) so the UI drops to guest
//  immediately, then fires the server-side steps (push
//  unregister, POST /logout) detached with the captured token
//  and a short timeout — it can never throw, block, or leave
//  the user stuck signed in. The cache purge matters: the
//  conversations cache holds the user's private chat list and
//  must not survive into the next session.
//
//  Split into:
//
//    AuthAction / initialState — reducer plumbing
//    authReducer               — pure session transitions
//    AuthProvider              — hydration, actions, teardown
//    useAuth                   — the consumer hook
// -----------------------------------------------------------

// Backend calls and the normalized error shape (the request
// interceptor reads the token via services/session itself)
import {
  ApiError,
  fetchMe,
  loginApi,
  logoutApi,
  registerApi,
} from '@/services/api';

// Mid-run 401s from any authenticated request land here
import { onSessionInvalid } from '@/services/api/session-events';

// The ONLY reader/writer of the persisted session record
// (secure token storage on native, AsyncStorage on web)
import {
  clearStoredSession,
  getStoredToken,
  getStoredUser,
  setStoredSession,
} from '@/services/session';

// Session side-effects — realtime socket, push token, offline
// cache, session-expired toast
import { showToast } from '@/context/NetworkContext';
import { useDataEngine } from '@knf/dataengine';
import { registerForPushNotifications, unregisterPushNotifications } from '@/services/notifications';
import { connectSocket, disconnectSocket } from '@/services/socket';

// State shapes, toast text and guest-scoped storage
import i18n from '@/i18n';
import { AuthState, User } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';


// Guest-usable schedule preference blob (owned by
// app/(main)/tabs/schedule.tsx) — wiped on every session
// change so one account's choice never leaks onto the next
const SCHEDULE_PREFS_KEY = 'schedule_prefs';

// Registration payload — snake_case matches the backend contract
interface RegisterParams {
  invitation_code?: string;
  username: string;
  password: string;
  display_name: string;
  email: string;
}

// One action per transition; failures reach screens as the
// THROWN ApiError, so LOGIN_FAILURE carries no payload
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE' }
  | { type: 'LOGOUT' }
  | { type: 'SET_USER'; payload: User };

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: false,
};

interface AuthContextType extends AuthState {
  hydrated: boolean;
  loggingOut: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (params: RegisterParams) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// A 401/403 from /me means the stored token is dead — anything
// else (offline, timeout, 5xx) says nothing about the session.
// Exported for __tests__/authSession.test.ts.
export const isAuthRejection = (err: unknown): boolean =>
  err instanceof ApiError &&
  err.code === 'http' &&
  (err.status === 401 || err.status === 403);

// The persisted record is untrusted input — anything that is
// not a real User shape must never reach LOGIN_SUCCESS
const isValidStoredUser = (user: User | null): user is User =>
  user !== null &&
  typeof user.id === 'string' &&
  typeof user.username === 'string' &&
  typeof user.displayName === 'string' &&
  typeof user.role === 'string';

// The notifications master switch, read straight from the
// persisted settings blob — session restore must never
// re-register a push token the user has switched off
const readNotificationsEnabled = async (): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem('app_settings');
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { notifications?: unknown };
    return parsed.notifications !== false;
  } catch {
    return true;
  }
};

// Cap for the detached logout-time server calls — they run
// after the local teardown and must never linger
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);







// -----------------------------------------------------------
// authReducer
// -----------------------------------------------------------
//
// Pure transitions; side-effects (storage, socket, push,
// cache) live in the provider.
//
// Used by:
//   - AuthProvider (below)
//   - __tests__/authSession.test.ts — transition assertions
// -----------------------------------------------------------

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        loading: false,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
      };
    case 'LOGIN_FAILURE':
      // Only the spinner resets — a failed attempt must not tear
      // down a session that is already live
      return { ...state, loading: false };
    case 'LOGOUT':
      return { ...initialState };
    case 'SET_USER':
      // Meaningful only on a live session — a late /me response
      // landing after logout must not resurrect the user
      return state.isAuthenticated ? { ...state, user: action.payload } : state;
    default:
      return state;
  }
}







// -----------------------------------------------------------
// AuthProvider
// -----------------------------------------------------------
//
// Restores the stored session on mount (optimistic restore,
// background /me verification), and owns every auth action.
//
// Used by:
//   - app/_layout.tsx — wraps the app inside AppProvider
// -----------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  // The engine cache — wiped on logout and login so no account
  // inherits another's offline copies
  const { cache } = useDataEngine();
  const [state, dispatch] = useReducer(authReducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);


  // Mount-only listeners (session-invalid, AppState) read live
  // values through these refs; the push-registration promise is
  // held so logout can await it before unregistering
  const loggingOutRef = useRef(false);
  const authenticatedRef = useRef(false);
  const pushRegistration = useRef<Promise<unknown> | null>(null);


  useEffect(() => {
    authenticatedRef.current = state.isAuthenticated;
  });


  // Silent LOCAL teardown for a dead or departing session — no
  // server calls here (logout fires those separately while the
  // captured token is still valid). The cache purge runs first:
  // the conversations cache is the record with a privacy
  // consequence, so it gets one retry too.
  const clearSession = useCallback(async (): Promise<void> => {
    disconnectSocket();
    // clearAll reports failure instead of throwing — one retry
    // for the wipe with a privacy consequence
    if (!(await cache.clearAll())) {
      await cache.clearAll();
      // Keys are user-scoped, so residue cannot cross accounts
    }
    try {
      await clearStoredSession();
    } catch {
      // Nothing to do — the record will be overwritten next login
    }
    try {
      await AsyncStorage.removeItem(SCHEDULE_PREFS_KEY);
    } catch {
      // Guest default applies on the next schedule visit
    }
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch {
      // Displayed notifications linger — cosmetic only
    }
    dispatch({ type: 'LOGOUT' });
    // Once more AFTER the wipe — an in-flight connect that raced
    // the teardown must not leave an authenticated socket behind
    disconnectSocket();
  }, [cache]);


  // ONE expiry teardown per dead session: a /me 401 is reported
  // TWICE — the client.ts interceptor emits sessionInvalid AND
  // the local catch sees the same rejection (the emit's burst
  // window dedupes emits only, not the catches) — so the flag
  // is taken synchronously and the second reporter no-ops
  // instead of doubling the toast, the accessibility
  // announcement and the teardown. Released once the teardown
  // settles, so a LATER session's death still reports.
  const expiringRef = useRef(false);

  const expireSession = useCallback((): void => {
    if (expiringRef.current) return;
    expiringRef.current = true;
    showToast('info', i18n.t('auth.sessionExpired'));
    clearSession()
      .catch(() => {})
      .finally(() => {
        expiringRef.current = false;
      });
  }, [clearSession]);


  // Shared success path for login/register: purge the previous
  // session's caches, persist FIRST so the api/socket layers
  // can read the token, then flip state and kick off the
  // realtime side-effects (both best-effort)
  const establishSession = useCallback(async (user: User, token: string): Promise<void> => {
    // Cache keys are user-scoped — a failed wipe leaves stale
    // entries unread, never cross-account
    await cache.clearAll();
    await setStoredSession(token, user);
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token } });
    // Drop any in-flight guest attempt first — the single-flight
    // connect would otherwise hand this session the OLD attempt's
    // null instead of building a socket for the fresh token
    disconnectSocket();
    connectSocket().catch(() => {});
    pushRegistration.current = registerForPushNotifications().catch(() => false);
  }, [cache]);


  // Persist the fresh user into the stored session so student
  // fields survive restarts (best-effort — state is already
  // updated synchronously; the reducer drops the update when no
  // session is live, so a late /me cannot resurrect a logout)
  const setUser = useCallback((user: User): void => {
    dispatch({ type: 'SET_USER', payload: user });
    (async () => {
      try {
        const token = await getStoredToken();
        if (!token) return;
        await setStoredSession(token, user);
      } catch {
        // State already holds the fresh user — persistence is a bonus
      }
    })();
  }, []);


  // Restore optimistically, flip `hydrated` after the LOCAL
  // read, then verify in the background — rejection policy in
  // the file header. A partial or malformed record is dropped
  // instead of reaching LOGIN_SUCCESS.
  useEffect(() => {
    (async () => {
      let token: string | null = null;
      let user: User | null = null;

      try {
        [token, user] = await Promise.all([getStoredToken(), getStoredUser()]);
      } catch {
        // Unreadable record — treat as signed out
      }

      if (!(typeof token === 'string' && token && isValidStoredUser(user))) {
        if (token || user) clearStoredSession().catch(() => {});
        token = null;
        user = null;
      }

      // getStoredToken already primed session.ts's in-memory
      // cache, so the api/socket layers can authenticate now
      if (token && user) {
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token } });
      }
      setHydrated(true);
      if (!token || !user) return;

      try {
        const freshUser = await fetchMe();
        setUser(freshUser);
        connectSocket().catch(() => {});

        // Push honors the master switch: register when it is on,
        // clean up any leftover token when it is off
        if (await readNotificationsEnabled()) {
          pushRegistration.current = registerForPushNotifications().catch(() => false);
        } else {
          unregisterPushNotifications().catch(() => {});
        }
      } catch (err) {
        // The rejection proves THIS token dead, not whichever
        // session is current — a login completed while /me was
        // in flight must not be torn down by the old token's 401
        if (isAuthRejection(err) && (await getStoredToken()) === token) {
          expireSession();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydration runs exactly once per app start; a later expireSession/setUser identity must never replay it
  }, []);


  // Mid-run session death: any authenticated request that comes
  // back 401 emits once per burst — drop to guest state with an
  // explanation, and never re-enter during logout's own teardown
  useEffect(() => {
    const unsubscribe = onSessionInvalid(() => {
      if (loggingOutRef.current || !authenticatedRef.current) return;
      expireSession();
    });

    return unsubscribe;
  }, [expireSession]);


  // A session revoked while the app was backgrounded is caught
  // on the next foreground instead of the next cold start
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active' || !authenticatedRef.current) return;
      void (async () => {
        // Captured for the same correlation as hydration: only
        // the session that made the failing request may be torn
        // down, never one signed in while it was in flight
        const token = await getStoredToken();
        if (!token) return;
        try {
          setUser(await fetchMe());
        } catch (err) {
          if (isAuthRejection(err) && (await getStoredToken()) === token) {
            expireSession();
          }
        }
      })();
    });

    return () => subscription.remove();
  }, [expireSession, setUser]);


  const login = useCallback(async (username: string, password: string): Promise<void> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const { user, token } = await loginApi(username, password);
      await establishSession(user, token);
    } catch (err) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw err;
    }
  }, [establishSession]);


  const register = useCallback(async (params: RegisterParams): Promise<void> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const { user, token } = await registerApi(params);
      await establishSession(user, token);
    } catch (err) {
      dispatch({ type: 'LOGIN_FAILURE' });
      throw err;
    }
  }, [establishSession]);


  // Local teardown FIRST so the UI drops to guest state without
  // waiting on the network, then the server-side steps fire
  // DETACHED with the token captured up front (local wipe means
  // the api layer no longer has one) and a short timeout. A
  // second tap while one logout runs is a no-op.
  const logout = useCallback(async (): Promise<void> => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);

    const token = state.token;
    const pendingRegistration = pushRegistration.current;
    pushRegistration.current = null;

    try {
      await clearSession();
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }

    // Detached: nothing below blocks the signed-out UI. The
    // in-flight push registration is awaited first so it cannot
    // re-register the token after the unregister below.
    (async () => {
      try {
        if (pendingRegistration) await withTimeout(pendingRegistration, 5000);
      } catch {
        // Registration never finished — nothing extra to remove
      }
      try {
        await withTimeout(unregisterPushNotifications(token ?? undefined), 5000);
      } catch {
        // Token stays registered server-side — harmless, expires
      }
      try {
        if (token) await withTimeout(logoutApi(token), 5000);
      } catch {
        // Server session lingers until token expiry — acceptable
      }
    })();
  }, [clearSession, state.token]);


  // Memoized with stable action identities — consumers can list
  // login/logout/setUser in effect dependency arrays without
  // re-fires (DrawerContext set the precedent)
  const value = useMemo<AuthContextType>(
    () => ({
      ...state,
      hydrated,
      loggingOut,
      login,
      register,
      logout,
      setUser,
    }),
    [state, hydrated, loggingOut, login, register, logout, setUser],
  );


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}







// -----------------------------------------------------------
// useAuth
// -----------------------------------------------------------
//
// Used by:
//   - app/index.tsx — waits for `hydrated` before routing
//   - app/login.tsx / app/register.tsx — credential flows
//   - app/(main)/tabs/* and (main)/* screens — user + role gates
//   - components/LoginRequiredOverlay.tsx — auth prompt
//   - hooks/useUnreadCount.ts — resets on user change
// -----------------------------------------------------------

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
