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
//  a forced login screen. Every /me answer is fenced by a
//  session generation — a counter bumped on each establish
//  and teardown, captured before the await and compared after
//  — so a slow /me from the previous account can never
//  overwrite the current one, in state or on disk. And a
//  stored-token read that THROWS hydrates as a guest for this
//  run without touching storage: only a read that succeeded
//  may declare the record partial and clear it (a keychain
//  blip keeps the session, exactly like a /me transport
//  failure does).
//
//  Both success paths (login AND register) persist first,
//  then connect the chat socket and ask the notify engine to
//  register the push token — the api and socket layers read
//  the token per request, so persistence must land before
//  either side-effect starts. A persist that FAILS is torn
//  down (stored record, socket) before the failure surfaces:
//  session.ts primes its token cache ahead of the keychain
//  write, and a device that shows a failed sign-in must not
//  keep requesting as that account. Push is the engine's business
//  (services/notifyEngine): this provider only says WHEN
//  (login, restore, logout) and never WHETHER — the engine
//  owns the master switch and answers {ok:false, reason:
//  'disabled'} on its own when the user has push off. Two
//  answers get a follow-up here, both fire-and-forget: a
//  'permission' refusal while the OS can still be asked raises
//  the system prompt (the engine never prompts by itself, and a
//  fresh install must still get the dialog on sign-in — the
//  NotifyEngineHost grant-edge effect registers on the grant),
//  and 'disabled' on a restore retries the detach a toggle-time
//  DELETE may have left unfinished.
//
//  Login/register failures THROW the normalized ApiError —
//  the thrown error is the whole failure interface; screens
//  translate it themselves. The reducer only resets the
//  loading flag on failure.
//
//  logout() reads this device's push token off the engine,
//  tears down locally (socket, session record, schedule
//  prefs, caches, the departing account's chat drafts and
//  outbox, state) so the UI drops to guest immediately,
//  then fires the server-side steps detached with the captured
//  token and a short timeout: POST /logout carrying that push
//  token — one request that drops the session and this
//  device's push row together — and only then the engine's
//  detach for the local side. It can never throw, block, or
//  leave the user stuck signed in. The cache purge matters:
//  the conversations cache holds the user's private chat list
//  and must not survive into the next session.
//
//  Split into:
//
//    AuthAction / initialState — reducer plumbing
//    sameProfile               — unchanged-profile check
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
  readStoredToken,
  setStoredSession,
  type StoredTokenRead,
} from '@/services/session';

// Session side-effects — realtime socket, push token, offline
// cache, session-expired toast
import { claimGuestThreads, clearGuestThreadRegistry } from '@/services/assistantThreads';
import { isFeatureEnabled } from '@/services/features';

import { showToast } from '@/context/NetworkContext';
import { useDataEngine } from '@knf/dataengine';
import type { NotifyEngine, RegisterResult } from '@knf/notifyengine';
import { notifyEngine, readyNotifyEngine } from '@/services/notifyEngine';
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

// A fresh signed-out session — the reducer's start and the
// LOGOUT target
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

// undefined until AuthProvider mounts — useAuth throws on it
const AuthContext = createContext<AuthContextType | undefined>(undefined);







// -----------------------------------------------------------
// isAuthRejection
// -----------------------------------------------------------
//
// A 401/403 from /me means the stored token is dead — anything
// else (offline, timeout, 5xx) says nothing about the session.
// Exported for __tests__/authSession.test.ts.
//
// Used by:
//   - AuthProvider (below) — the session restore probe
//   - __tests__/authSession.test.ts
// -----------------------------------------------------------

export const isAuthRejection = (err: unknown): boolean =>
  err instanceof ApiError &&
  err.code === 'http' &&
  (err.status === 401 || err.status === 403);







// -----------------------------------------------------------
// isValidStoredUser
// -----------------------------------------------------------
//
// The persisted record is untrusted input — anything that is
// not a real User shape must never reach LOGIN_SUCCESS.
//
// Used by:
//   - AuthProvider (below) — session hydration
// -----------------------------------------------------------

const isValidStoredUser = (user: User | null): user is User =>
  user !== null &&
  typeof user.id === 'string' &&
  typeof user.username === 'string' &&
  typeof user.displayName === 'string' &&
  typeof user.role === 'string';







// -----------------------------------------------------------
// withTimeout
// -----------------------------------------------------------
//
// Cap for the detached logout-time server calls — they run
// after the local teardown and must never linger.
//
// Used by:
//   - AuthProvider's logout (below)
// -----------------------------------------------------------

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);







// -----------------------------------------------------------
// promptForPermission
// -----------------------------------------------------------
//
// The engine's register() never prompts: on a fresh install (or
// for a user who never answered the OS dialog) it hands back a
// pure typed {ok:false, reason:'permission'} and stops. The
// legacy flow raised the OS permission dialog on every sign-in
// and restore, so those same moments still have to ask — here,
// fire-and-forget, and without a second register(): the
// NotifyEngineHost grant-edge effect registers the moment the
// snapshot turns deliverable. Only an askable state prompts; a
// denied-forever device belongs to the settings tab's deep-link
// into system settings, never to a nag on every login.
//
// Used by:
//   - AuthProvider (below) — after login, register and restore
// -----------------------------------------------------------

const promptForPermission = (engine: NotifyEngine, result: RegisterResult): void => {
  if (result.ok || result.reason !== 'permission') return;
  const { status, canAskAgain } = engine.permission.get();
  if (status === 'undetermined' || (status === 'denied' && canAskAgain)) {
    void engine.requestPermission();
  }
};







// -----------------------------------------------------------
// sameProfile
// -----------------------------------------------------------
//
// Field-by-field equality of two user records (the backend's
// serializer emits one fixed key order, and the stored record
// is written from that same shape) — what lets SET_USER keep
// the current object for an unchanged profile.
//
// Used by:
//   - authReducer (below) — SET_USER
// -----------------------------------------------------------

const sameProfile = (a: User | null, b: User): boolean => {
  if (a === b) return true;
  if (!a) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (JSON.stringify(a[key as keyof User]) !== JSON.stringify(b[key as keyof User])) return false;
  }
  return true;
};







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
      // landing after logout must not resurrect the user. An
      // IDENTICAL profile keeps the current object: every
      // foreground runs /me, and a fresh-but-equal user used to
      // rebuild everything memoized on it (the engine hosts'
      // envs) on each app switch
      if (!state.isAuthenticated) return state;
      return sameProfile(state.user, action.payload) ? state : { ...state, user: action.payload };
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
  // values through these refs; the user id feeds clearSession's
  // chat-storage wipe, which closes over nothing from state
  const loggingOutRef = useRef(false);
  const authenticatedRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  // One number per session: bumped by every establish and
  // teardown, captured by each /me caller before its await and
  // compared after — an answer that outlives its session is
  // dropped, in state AND in the persist, whatever it says
  const sessionGenRef = useRef(0);


  useEffect(() => {
    authenticatedRef.current = state.isAuthenticated;
    currentUserIdRef.current = state.user?.id ?? null;
  });


  // Silent LOCAL teardown for a dead or departing session — no
  // server calls here (logout fires those separately while the
  // captured token is still valid). The cache purge runs first:
  // the conversations cache is the record with a privacy
  // consequence, so it gets one retry too.
  const clearSession = useCallback(async (): Promise<void> => {
    // The departing account's id goes FIRST: the LOGOUT dispatch
    // below re-points the chat engine's scoped storage, and the
    // wipe further down needs this namespace, not the guest's
    const departingId = currentUserIdRef.current;
    sessionGenRef.current += 1;
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
    // Guest assistant-thread ids a failed claim left behind
    // must not pass to the phone's next user — they would
    // absorb them into their own account on login
    try {
      await clearGuestThreadRegistry();
    } catch {
      // The registry only maps to unguessable server threads
    }
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch {
      // Displayed notifications linger — cosmetic only
    }
    // The chat engine keeps drafts, outbox and task queue under
    // `u:<id>:` (its scoped storage adapter) and never deletes
    // that namespace itself — a half-typed message or an unsent
    // picked asset must not wait for a shared phone's next user
    if (departingId) {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const mine = keys.filter((key) => key.startsWith(`u:${departingId}:`));
        if (mine.length) await AsyncStorage.multiRemove(mine);
      } catch {
        // Best-effort — the sign-out never waits on this wipe
      }
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
    sessionGenRef.current += 1;
    // Cache keys are user-scoped — a failed wipe leaves stale
    // entries unread, never cross-account
    await cache.clearAll();
    try {
      await setStoredSession(token, user);
    } catch (err) {
      // session.ts primes its token cache before the keychain
      // write, so a failed persist would otherwise leave the
      // api/socket layers answering as this account while the
      // UI reports a failed sign-in — wipe the record and drop
      // the socket first, so the device is genuinely signed
      // out, then let the failure reach the screen
      await clearStoredSession();
      disconnectSocket();
      throw err;
    }
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user, token } });
    // Drop any in-flight guest attempt first — the single-flight
    // connect would otherwise hand this session the OLD attempt's
    // null instead of building a socket for the fresh token
    disconnectSocket();
    connectSocket().catch(() => {});
    // Fire-and-forget: the session is live regardless of whether
    // the token ever reaches the server, and the engine settles
    // every register() itself (watchdog, coalescing); the only
    // answer acted on is a still-askable permission refusal
    void readyNotifyEngine()
      .then(async (engine) => promptForPermission(engine, await engine.register('login')))
      .catch(() => {});
    // Same spirit for the assistant: offer the device's guest
    // chat threads to the account once — a failed claim keeps
    // the registry, so the next login simply tries again
    if (isFeatureEnabled('assistant')) {
      void claimGuestThreads().catch(() => {});
    }
  }, [cache]);


  // Persist the fresh user into the stored session so student
  // fields survive restarts (best-effort — state is already
  // updated synchronously; the reducer drops the update when no
  // session is live, so a late /me cannot resurrect a logout).
  // The token read may straddle a session switch, so the persist
  // is fenced by the generation too: the NEW session's token
  // must never land on disk paired with this profile
  const setUser = useCallback((user: User): void => {
    dispatch({ type: 'SET_USER', payload: user });
    (async () => {
      const gen = sessionGenRef.current;
      try {
        const token = await getStoredToken();
        if (!token || gen !== sessionGenRef.current) return;
        await setStoredSession(token, user);
      } catch {
        // State already holds the fresh user — persistence is a bonus
      }
    })();
  }, []);


  // Restore optimistically, flip `hydrated` after the LOCAL
  // read, then verify in the background — rejection policy in
  // the file header. A partial or malformed record is dropped
  // instead of reaching LOGIN_SUCCESS — but only when the token
  // read SUCCEEDED: a keychain that threw says nothing about
  // what it holds, and deleteItemAsync would take a still-valid
  // token with it, so that run hydrates as a guest and leaves
  // storage alone for the next start.
  useEffect(() => {
    (async () => {
      let tokenRead: StoredTokenRead = { ok: false, token: null };
      let user: User | null = null;

      try {
        [tokenRead, user] = await Promise.all([readStoredToken(), getStoredUser()]);
      } catch {
        // Unreadable record — signed out for this run
      }

      let token: string | null = tokenRead.token;
      if (!(typeof token === 'string' && token && isValidStoredUser(user))) {
        if (tokenRead.ok && (token || user)) clearStoredSession().catch(() => {});
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

      const gen = sessionGenRef.current;
      try {
        const freshUser = await fetchMe();
        // A logout or a fresh login while /me was in flight owns
        // the session now — this answer describes the old one
        if (gen !== sessionGenRef.current) return;
        setUser(freshUser);
        connectSocket().catch(() => {});

        // No master-switch check here: the engine answers
        // {ok:false, reason:'disabled'} by itself when push is
        // off. That answer still gets a detach: switching push
        // off while offline leaves the DELETE unsent, and the
        // engine keeps the stored token precisely so a later
        // detach can retry it — without this retry the server
        // would keep pushing to an opted-out device for as long
        // as the token lives. A no-op when nothing is stored.
        void readyNotifyEngine()
          .then(async (engine) => {
            const result = await engine.register('restore');
            promptForPermission(engine, result);
            if (!result.ok && result.reason === 'disabled') void engine.detach();
          })
          .catch(() => {});
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
        // down, never one signed in while it was in flight — and
        // only the session that asked may take the answer
        const gen = sessionGenRef.current;
        const token = await getStoredToken();
        if (!token) return;
        try {
          const freshUser = await fetchMe();
          if (gen !== sessionGenRef.current) return;
          setUser(freshUser);
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

    // This device's push token, read BEFORE the wipe (memory,
    // then the engine's stored copy — never the OS prompt): it
    // rides in the logout body so ONE authenticated request
    // drops the session and this device's push row together
    let pushToken: string | null = null;
    try {
      pushToken = await notifyEngine.getRegisteredToken();
    } catch {
      // Unknown token — the logout still drops the session
    }

    try {
      await clearSession();
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }

    // Detached: nothing below blocks the signed-out UI. The
    // logout call goes FIRST, with the captured bearer (the
    // local wipe already emptied the api layer's token) and the
    // push token: the backend deletes the session and that push
    // row in one transaction, so the device stops receiving this
    // account's previews the moment the session dies. The
    // engine's detach follows for the LOCAL side — its phase,
    // the stored copy, the in-flight register it supersedes.
    // Its own DELETE reaches the server after the bearer is
    // dead and answers 401 (an unconfirmed delete, so the
    // engine keeps the stored copy): harmless, the row is
    // already gone, the interceptor ignores a 401 on a
    // non-current bearer, and the next login's register('login')
    // re-asserts the tuple unconditionally. The reverse order
    // was the bug — detach resolves on its own timebox, and its
    // DELETE could go out after logout had revoked the bearer.
    (async () => {
      try {
        if (token) await withTimeout(logoutApi(token, pushToken), 5000);
      } catch {
        // Server session lingers until token expiry — acceptable
      }
      try {
        await withTimeout(notifyEngine.detach({ authToken: token ?? undefined }), 5000);
      } catch {
        // The engine settles its own phase on its own timebox
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
// The session state plus stable-identity actions — login /
// logout / setUser are safe in effect dependency arrays.
// Gate on `hydrated` before trusting user: it is null during
// restore exactly as it is for a guest. Throws outside an
// AuthProvider.
//
// Used by:
//   - app/index.tsx — waits for `hydrated` before routing
//   - app/login.tsx / app/register.tsx — credential flows
//   - app/(main)/tabs/* and (main)/* screens — user + role gates
//   - components/notify/NotifyEngineHost.tsx,
//     components/chat/ChatEngineHost.tsx,
//     components/social/SocialEngineHost.tsx — the engine
//     hosts' auth gates
//   - components/LoginRequiredOverlay.tsx — auth prompt
//   - components/Sidebar.tsx — signed-in header + menu gates
//   - components/chat/ConversationRow.tsx — the "me" side of
//     a conversation
//   - components/news/PollWidget.tsx — vote gate
//   - hooks/useUnreadCount.ts — resets on user change
// -----------------------------------------------------------

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
