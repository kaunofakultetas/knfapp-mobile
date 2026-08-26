// -----------------------------------------------------------
//  [*] AuthContext — session state and auth actions
//
//  Holds the signed-in user + token and exposes login /
//  register / logout / setUser. The stored session
//  (AsyncStorage 'auth') is restored optimistically on
//  startup and verified against /me in the background:
//  `hydrated` flips true right after the LOCAL read, so
//  app/index.tsx can pick the initial route without racing
//  the storage read. Verification only drops the session on
//  a real auth rejection (HTTP 401/403) — offline or timeout
//  keeps the restored session so the app still works without
//  a connection.
//
//  Both success paths (login AND register) persist first,
//  then connect the chat socket and register the push token —
//  the api and socket layers read the token from storage per
//  request, so persistence must land before either side-
//  effect starts.
//
//  `error` stores the backend's message text for HTTP
//  failures and null otherwise — the context stays language-
//  free; screens translate the null case themselves
//  (t('login.errorMessage') etc).
//
//  logout() is best-effort on every step (push unregister,
//  POST /logout, storage wipe, cache purge) — it can never
//  throw or leave the user stuck signed in. The cache purge
//  matters: the conversations cache holds the user's private
//  chat list and must not survive into the next session.
//
//  Split into:
//
//    AuthAction / initialState — reducer plumbing
//    authReducer               — pure session transitions
//    AuthProvider              — hydration, actions, teardown
//    useAuth                   — the consumer hook
// -----------------------------------------------------------

// Backend calls and the normalized error shape
import { ApiError, fetchMe, loginApi, logoutApi, registerApi } from '@/services/api';

// Session side-effects — realtime socket, push token, offline cache
import { cacheClearAll } from '@/services/cache';
import { registerForPushNotifications, unregisterPushNotifications } from '@/services/notifications';
import { connectSocket, disconnectSocket } from '@/services/socket';

// State shapes and persistence
import { AuthState, User } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useReducer,
  useState,
} from 'react';


// Storage key for { user, token } — services/api and
// services/socket read the token from the same record
const AUTH_STORAGE_KEY = 'auth';

// What the session record looks like in AsyncStorage
interface StoredSession {
  user: User;
  token: string;
}

// Registration payload — snake_case matches the backend contract
interface RegisterParams {
  invitation_code?: string;
  username: string;
  password: string;
  display_name: string;
  email: string;
}

// One action per transition; LOGIN_FAILURE carries the backend
// message, or null when the failure has no server text
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE'; payload: { message: string | null } }
  | { type: 'LOGOUT' }
  | { type: 'SET_USER'; payload: User };

type SessionState = AuthState & { error: string | null };

const initialState: SessionState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: false,
  error: null,
};

interface AuthContextType extends AuthState {
  hydrated: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (params: RegisterParams) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Only HTTP failures carry backend text worth storing; timeout
// and network errors resolve to null so screens translate them
const failureMessage = (err: unknown): string | null =>
  err instanceof ApiError && err.code === 'http' ? err.message : null;

// A 401/403 from /me means the stored token is dead — anything
// else (offline, timeout, 5xx) says nothing about the session
const isAuthRejection = (err: unknown): boolean =>
  err instanceof ApiError &&
  err.code === 'http' &&
  (err.status === 401 || err.status === 403);







// -----------------------------------------------------------
// authReducer
// -----------------------------------------------------------
//
// Pure transitions; side-effects (storage, socket, push,
// cache) live in the provider.
//
// Used by:
//   - AuthProvider (below)
// -----------------------------------------------------------

function authReducer(state: SessionState, action: AuthAction): SessionState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true, error: null };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        loading: false,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        error: null,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        loading: false,
        isAuthenticated: false,
        user: null,
        token: null,
        error: action.payload.message,
      };
    case 'LOGOUT':
      return { ...initialState };
    case 'SET_USER':
      return { ...state, user: action.payload };
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
  const [state, dispatch] = useReducer(authReducer, initialState);
  const [hydrated, setHydrated] = useState(false);


  // Silent local teardown for an invalidated stored session —
  // no server calls: the token is already dead
  const clearSession = async (): Promise<void> => {
    disconnectSocket();
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Nothing to do — the record will be overwritten next login
    }
    try {
      await cacheClearAll();
    } catch {
      // Best-effort — see logout
    }
    dispatch({ type: 'LOGOUT' });
  };


  // Shared success path for login/register: persist FIRST so
  // the api/socket layers can read the token, then flip state
  // and kick off the realtime side-effects (both best-effort)
  const establishSession = async (user: User, token: string): Promise<void> => {
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, token }));
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token } });
    connectSocket().catch(() => {});
    registerForPushNotifications().catch(() => {});
  };


  // Restore optimistically, flip `hydrated` after the LOCAL
  // read, then verify in the background — rejection policy in
  // the file header
  useEffect(() => {
    (async () => {
      let stored: StoredSession | null = null;

      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (raw) stored = JSON.parse(raw) as StoredSession;
      } catch {
        // Unreadable record — treat as signed out
      }

      if (stored?.user && stored?.token) {
        dispatch({ type: 'LOGIN_SUCCESS', payload: stored });
      }
      setHydrated(true);
      if (!stored?.user || !stored?.token) return;

      try {
        const freshUser = await fetchMe();
        dispatch({ type: 'SET_USER', payload: freshUser });
        connectSocket().catch(() => {});
        registerForPushNotifications().catch(() => {});
      } catch (err) {
        if (isAuthRejection(err)) await clearSession();
      }
    })();
  }, []);


  const login = async (username: string, password: string): Promise<void> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const { user, token } = await loginApi(username, password);
      await establishSession(user, token);
    } catch (err) {
      dispatch({ type: 'LOGIN_FAILURE', payload: { message: failureMessage(err) } });
      throw err;
    }
  };


  const register = async (params: RegisterParams): Promise<void> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const { user, token } = await registerApi(params);
      await establishSession(user, token);
    } catch (err) {
      dispatch({ type: 'LOGIN_FAILURE', payload: { message: failureMessage(err) } });
      throw err;
    }
  };


  // Teardown in dependency order: realtime first, then the two
  // server calls WHILE the token is still in storage (the api
  // layer reads it per request), then the local wipe. Every
  // step is fire-safe — logout can never throw or block.
  const logout = async (): Promise<void> => {
    disconnectSocket();
    try {
      await unregisterPushNotifications();
    } catch {
      // Token stays registered server-side — harmless, expires
    }
    try {
      await logoutApi();
    } catch {
      // Server session lingers until token expiry — acceptable
    }
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Overwritten on next login
    }
    try {
      await cacheClearAll();
    } catch {
      // Worst case stale public caches; private data risk noted
      // in the file header is about the happy path
    }
    dispatch({ type: 'LOGOUT' });
  };


  // Persist the fresh user into the stored session so student
  // fields survive restarts (best-effort — state is already
  // updated synchronously)
  const setUser = (user: User): void => {
    dispatch({ type: 'SET_USER', payload: user });
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as StoredSession;
        await AsyncStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ ...stored, user }),
        );
      } catch {
        // State already holds the fresh user — persistence is a bonus
      }
    })();
  };


  const value: AuthContextType = {
    ...state,
    hydrated,
    login,
    register,
    logout,
    setUser,
  };


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
