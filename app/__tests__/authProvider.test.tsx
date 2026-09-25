// -----------------------------------------------------------
//  [*] Tests — AuthProvider hydration and logout ordering
//
//  Provider-level pins on top of authSession.test.ts's pure
//  rules: the stored session is restored optimistically and
//  verified against /me (dropped only on a real auth
//  rejection), a malformed record never reaches the signed-in
//  state, logout tears down locally BEFORE the server calls
//  fire with the captured token, and a mid-run session-invalid
//  event drops the app to guest state. Plus the push handoff
//  to the notify engine: register('login') after a login,
//  register('restore') only once /me has verified a restored
//  session, nothing when /me fails, and on logout the server
//  call carrying this device's push token (read off the engine
//  BEFORE the wipe) ahead of the engine's detach with the
//  captured bearer. The two register answers the
//  provider acts on are pinned both ways — a 'permission'
//  refusal raises the OS prompt exactly once while the OS can
//  still be asked and never otherwise, a 'disabled' restore
//  retries the detach — and every session drop (logout and
//  expiry alike) clears the displayed notifications. Then the
//  session-lifecycle fences: a /me answer that outlives its
//  session (a logout + login while it was in flight, on a cold
//  start or a foreground) never overwrites the current user in
//  state or on disk; a stored-token read that THROWS keeps the
//  stored session and hydrates as a guest, while a genuine
//  missing token beside a profile still clears the record;
//  every session drop wipes the departing account's chat
//  namespace and nothing else; and a persist that fails during
//  login leaves the device genuinely signed out.
// -----------------------------------------------------------

import type { PermissionSnapshot, RegisterResult } from '@knf/notifyengine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { dismissAllNotificationsAsync } from 'expo-notifications';
import { AppState } from 'react-native';

import { showToast } from '@/context/NetworkContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ApiError, fetchMe, loginApi, logoutApi } from '@/services/api';
import { notifyEngine } from '@/services/notifyEngine';
import {
  clearStoredSession,
  getStoredToken,
  getStoredUser,
  readStoredToken,
  setStoredSession,
} from '@/services/session';
import { connectSocket } from '@/services/socket';
import type { User } from '@/types';


// Every call with an ordering consequence lands here
const mockLog: string[] = [];
const mockSessionInvalid: { fire: () => void } = { fire: () => {} };


// jest.mock is hoisted above the imports at transform time, so
// the factories below still intercept AuthContext's module graph
// — they follow the imports here only so the imports read first
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach the shipped mock
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'en', t: (key: string) => key },
}));
jest.mock('@/services/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    ApiError,
    fetchMe: jest.fn(async () => ({})),
    loginApi: jest.fn(),
    registerApi: jest.fn(),
    logoutApi: jest.fn(async (token: string, pushToken?: string | null) => {
      mockLog.push(`logoutApi:${token}:${pushToken ?? 'none'}`);
    }),
  };
});
jest.mock('@/services/api/session-events', () => ({
  onSessionInvalid: (callback: () => void) => {
    mockSessionInvalid.fire = callback;
    return () => {};
  },
}));
jest.mock('@/services/session', () => ({
  getStoredToken: jest.fn(async () => null),
  readStoredToken: jest.fn(async () => ({ ok: true, token: null })),
  getStoredUser: jest.fn(async () => null),
  setStoredSession: jest.fn(async () => {}),
  clearStoredSession: jest.fn(async () => { mockLog.push('clearStoredSession'); }),
}));
jest.mock('@knf/dataengine', () => ({
  useDataEngine: () => ({
    cache: { clearAll: jest.fn(async () => { mockLog.push('cacheClearAll'); return true; }) },
  }),
}));
jest.mock('@/services/socket', () => ({
  connectSocket: jest.fn(async () => {}),
  disconnectSocket: jest.fn(() => { mockLog.push('disconnectSocket'); }),
}));
// A hand stub of the engine: register and detach log their
// calls, the permission store answers whatever a test seeds
// (granted by default) — the provider's contract with the
// engine is the WHEN, not what the engine does with it
jest.mock('@/services/notifyEngine', () => {
  const stub = {
    permission: {
      get: jest.fn(() => ({ status: 'granted', canAskAgain: false, canDeliver: true })),
    },
    requestPermission: jest.fn(async () => ({ status: 'granted', canAskAgain: false, canDeliver: true })),
    register: jest.fn(async (reason: string) => {
      mockLog.push(`register:${reason}`);
      return { ok: true, tokenId: 'stub' };
    }),
    detach: jest.fn(async () => { mockLog.push('detach'); }),
    getRegisteredToken: jest.fn(async () => {
      mockLog.push('getRegisteredToken');
      return 'ExponentPushToken[this-device]';
    }),
  };
  return { notifyEngine: stub, readyNotifyEngine: async () => stub };
});
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));
jest.mock('expo-notifications', () => ({ dismissAllNotificationsAsync: jest.fn(async () => {}) }));
// The assistant thread hand-overs: login OFFERS the guest
// registry to the account, every session drop CLEARS it (the
// shared-phone hygiene) — the provider owns the WHEN
jest.mock('@/services/assistantThreads', () => ({
  claimGuestThreads: jest.fn(async () => { mockLog.push('claimGuestThreads'); return 0; }),
  clearGuestThreadRegistry: jest.fn(async () => { mockLog.push('clearGuestRegistry'); }),
}));
jest.mock('@/services/features', () => ({ isFeatureEnabled: () => true }));


const user: User = {
  id: 'u1',
  username: 'jonas',
  email: 'jonas@knf.vu.lt',
  displayName: 'Jonas',
  role: 'student',
};

const renderAuth = () => renderHook(() => useAuth(), { wrapper: AuthProvider });

const seedStoredSession = () => {
  (getStoredToken as jest.Mock).mockResolvedValue('tok');
  (readStoredToken as jest.Mock).mockResolvedValue({ ok: true, token: 'tok' });
  (getStoredUser as jest.Mock).mockResolvedValue(user);
};

// A second account for the session-switch scenarios
const other: User = {
  id: 'u2',
  username: 'ona',
  email: 'ona@knf.vu.lt',
  displayName: 'Ona',
  role: 'student',
};

// A /me the test answers by hand — the in-flight window every
// generation fence is about
const heldFetchMe = (): ((fresh: User) => void) => {
  let deliver: (fresh: User) => void = () => undefined;
  (fetchMe as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<User>((resolve) => {
        deliver = resolve;
      }),
  );
  return (fresh) => deliver(fresh);
};

// logout's detached server calls carry 5 s timeout guards —
// fake timers keep them from holding the process open
const logoutUnderFakeTimers = async (logout: () => Promise<void>) => {
  jest.useFakeTimers();
  try {
    await act(async () => {
      await logout();
    });
  } finally {
    jest.useRealTimers();
  }
};

// The switch every fence is tested against: sign the first
// account out, sign the second in, and forget the persists so
// far so only what lands AFTER the switch is asserted
const switchToOther = async (auth: { logout: () => Promise<void>; login: (u: string, p: string) => Promise<void> }) => {
  await logoutUnderFakeTimers(auth.logout);
  (loginApi as jest.Mock).mockResolvedValue({ user: other, token: 'tok-2' });
  (getStoredToken as jest.Mock).mockResolvedValue('tok-2');
  await act(async () => {
    await auth.login('ona', 'slaptazodis');
  });
  (setStoredSession as jest.Mock).mockClear();
};

const seedLogin = () => {
  (loginApi as jest.Mock).mockResolvedValue({ user, token: 'tok' });
};

// The three permission states the provider tells apart
const granted: PermissionSnapshot = { status: 'granted', canAskAgain: false, canDeliver: true };
const undetermined: PermissionSnapshot = { status: 'undetermined', canAskAgain: true, canDeliver: false };
const deniedForever: PermissionSnapshot = { status: 'denied', canAskAgain: false, canDeliver: false };

const seedPermission = (snapshot: PermissionSnapshot) => {
  (notifyEngine.permission.get as jest.Mock).mockReturnValue(snapshot);
};

// One register answer for the NEXT call only — every scenario
// here registers exactly once, so nothing leaks between tests
const answerNextRegister = (result: RegisterResult) => {
  (notifyEngine.register as jest.Mock).mockResolvedValueOnce(result);
};


describe('AuthProvider', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockLog.length = 0;
    await AsyncStorage.clear();
    (getStoredToken as jest.Mock).mockResolvedValue(null);
    (readStoredToken as jest.Mock).mockResolvedValue({ ok: true, token: null });
    (getStoredUser as jest.Mock).mockResolvedValue(null);
    (fetchMe as jest.Mock).mockResolvedValue(user);
    seedPermission(granted);
  });


  it('hydrates to guest state when nothing is stored', async () => {
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isAuthenticated).toBe(false);
    expect(fetchMe).not.toHaveBeenCalled();
  });


  it('restores a stored session optimistically and refreshes the user from /me', async () => {
    seedStoredSession();
    (fetchMe as jest.Mock).mockResolvedValue({ ...user, displayName: 'Fresh' });
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('tok');
    await waitFor(() => expect(result.current.user?.displayName).toBe('Fresh'));
  });


  it('keeps the restored session when /me is unreachable', async () => {
    seedStoredSession();
    (fetchMe as jest.Mock).mockRejectedValue(new ApiError('offline', 0, 'network'));
    const { result } = await renderAuth();

    await waitFor(() => expect(fetchMe).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.isAuthenticated).toBe(true);
    expect(clearStoredSession).not.toHaveBeenCalled();
  });


  it('drops the restored session on a real auth rejection from /me', async () => {
    seedStoredSession();
    (fetchMe as jest.Mock).mockRejectedValue(new ApiError('dead', 401, 'http'));
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(clearStoredSession).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('info', 'auth.sessionExpired');
    // An expired session takes its displayed notifications with it
    expect(dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
  });


  it('never lets a malformed stored record reach the signed-in state', async () => {
    (getStoredToken as jest.Mock).mockResolvedValue('tok');
    (getStoredUser as jest.Mock).mockResolvedValue({ id: 42, username: 'jonas' });
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isAuthenticated).toBe(false);
    expect(fetchMe).not.toHaveBeenCalled();
    expect(clearStoredSession).toHaveBeenCalled();
  });


  it('logs out locally first, then fires the server calls with the captured token', async () => {
    seedStoredSession();
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    mockLog.length = 0;

    // Fake timers so the detached calls' 5s timeout guards never
    // hold the process open
    jest.useFakeTimers();
    try {
      await act(async () => {
        await result.current.logout();
      });
      expect(result.current.isAuthenticated).toBe(false);

      // Local teardown (cache purge, then the session record) runs
      // before any server-side call, and the server call still holds
      // the token the local wipe just destroyed
      await act(async () => {});
      const logoutCall = 'logoutApi:tok:ExponentPushToken[this-device]';
      expect(mockLog).toContain(logoutCall);
      expect(mockLog.indexOf('cacheClearAll')).toBeLessThan(mockLog.indexOf('clearStoredSession'));
      expect(mockLog.indexOf('clearStoredSession')).toBeLessThan(mockLog.indexOf(logoutCall));
      expect(mockLog.indexOf('disconnectSocket')).toBeLessThan(mockLog.indexOf('clearStoredSession'));
      expect(dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);

      // This device's push token is read off the engine BEFORE the
      // wipe and rides in the logout body — one authenticated
      // request drops the session and the push row together
      expect(mockLog.indexOf('getRegisteredToken')).toBeLessThan(mockLog.indexOf('clearStoredSession'));
      expect(logoutApi).toHaveBeenCalledWith('tok', 'ExponentPushToken[this-device]');

      // The logout call goes FIRST; the engine's detach follows
      // for the local side. The reverse order let the detach's
      // DELETE go out after the bearer had been revoked
      expect(mockLog.indexOf(logoutCall)).toBeLessThan(mockLog.indexOf('detach'));

      // The local wipe already emptied the api layer's token, so
      // the detach must carry the captured bearer itself
      expect(notifyEngine.detach).toHaveBeenCalledWith({ authToken: 'tok' });

      // The guest thread registry goes with the LOCAL teardown —
      // the phone's next user must not inherit the map to the
      // previous one's assistant chats
      expect(mockLog.indexOf('clearGuestRegistry')).toBeGreaterThanOrEqual(0);
      expect(mockLog.indexOf('clearGuestRegistry')).toBeLessThan(mockLog.indexOf(logoutCall));
    } finally {
      jest.useRealTimers();
    }
  });


  it('a logout with no known push token still drops the session', async () => {
    seedStoredSession();
    (notifyEngine.getRegisteredToken as jest.Mock).mockResolvedValueOnce(null);
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    jest.useFakeTimers();
    try {
      await act(async () => {
        await result.current.logout();
      });
      await act(async () => {});
      expect(result.current.isAuthenticated).toBe(false);
      expect(logoutApi).toHaveBeenCalledWith('tok', null);
      expect(notifyEngine.detach).toHaveBeenCalledWith({ authToken: 'tok' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('a login offers the device\'s guest threads to the account once', async () => {
    seedLogin();
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.login('jonas', 'slaptazodis');
    });
    await waitFor(() => expect(mockLog).toContain('claimGuestThreads'));
  });


  it('hands the push token to the engine after a login', async () => {
    seedLogin();
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.login('jonas', 'slaptazodis');
    });
    expect(result.current.isAuthenticated).toBe(true);
    await waitFor(() => expect(notifyEngine.register).toHaveBeenCalledWith('login'));
  });


  it('re-registers the push token once /me verifies a restored session', async () => {
    seedStoredSession();
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    await waitFor(() => expect(notifyEngine.register).toHaveBeenCalledWith('restore'));
    expect(notifyEngine.register).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(notifyEngine.detach).not.toHaveBeenCalled();
    expect(notifyEngine.requestPermission).not.toHaveBeenCalled();
  });


  it('registers nothing when a restored session fails /me', async () => {
    seedStoredSession();
    (fetchMe as jest.Mock).mockRejectedValue(new ApiError('offline', 0, 'network'));
    const { result } = await renderAuth();

    await waitFor(() => expect(fetchMe).toHaveBeenCalled());
    await act(async () => {});
    // The session survives an unreachable /me, but an unverified
    // token never reaches the server as a push registration
    expect(result.current.isAuthenticated).toBe(true);
    expect(notifyEngine.register).not.toHaveBeenCalled();
  });


  it('drops to guest state when a mid-run request reports the session invalid', async () => {
    seedStoredSession();
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      mockSessionInvalid.fire();
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(clearStoredSession).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('info', 'auth.sessionExpired');
  });


  it('raises the OS permission prompt once when a login is refused for a still-askable permission', async () => {
    seedLogin();
    seedPermission(undetermined);
    answerNextRegister({ ok: false, reason: 'permission' });
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.login('jonas', 'slaptazodis');
    });
    await waitFor(() => expect(notifyEngine.register).toHaveBeenCalledWith('login'));
    await waitFor(() => expect(notifyEngine.requestPermission).toHaveBeenCalledTimes(1));
    // A permission refusal is not an opt-out — nothing to detach
    expect(notifyEngine.detach).not.toHaveBeenCalled();
  });


  it('never prompts after a login the engine registered', async () => {
    seedLogin();
    seedPermission(granted);
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.login('jonas', 'slaptazodis');
    });
    await waitFor(() => expect(notifyEngine.register).toHaveBeenCalledWith('login'));
    await act(async () => {});
    expect(notifyEngine.requestPermission).not.toHaveBeenCalled();
  });


  it('never prompts when the OS will not ask again', async () => {
    seedLogin();
    seedPermission(deniedForever);
    answerNextRegister({ ok: false, reason: 'permission' });
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.login('jonas', 'slaptazodis');
    });
    await waitFor(() => expect(notifyEngine.register).toHaveBeenCalledWith('login'));
    await act(async () => {});
    // Denied-forever is the settings tab's deep-link, not a prompt
    expect(notifyEngine.requestPermission).not.toHaveBeenCalled();
  });


  it('raises the OS permission prompt when a verified restore is refused for a still-askable permission', async () => {
    seedStoredSession();
    seedPermission(undetermined);
    answerNextRegister({ ok: false, reason: 'permission' });
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    await waitFor(() => expect(notifyEngine.register).toHaveBeenCalledWith('restore'));
    await waitFor(() => expect(notifyEngine.requestPermission).toHaveBeenCalledTimes(1));
    expect(notifyEngine.detach).not.toHaveBeenCalled();
  });


  it('retries the detach when a verified restore finds push switched off', async () => {
    seedStoredSession();
    answerNextRegister({ ok: false, reason: 'disabled' });
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    await waitFor(() => expect(notifyEngine.register).toHaveBeenCalledWith('restore'));
    // The session is live, so the api layer still holds the
    // bearer — no captured token rides along, unlike logout
    await waitFor(() => expect(notifyEngine.detach).toHaveBeenCalledTimes(1));
    expect(notifyEngine.detach).toHaveBeenCalledWith();
    // Push off is a choice, not a missing permission — no prompt
    expect(notifyEngine.requestPermission).not.toHaveBeenCalled();
  });


  it('drops a cold-start /me that lands after a logout and a login as another account', async () => {
    seedStoredSession();
    const deliver = heldFetchMe();
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(1));

    await switchToOther(result.current);
    expect(result.current.user?.id).toBe('u2');

    // The first account's /me answers now — it describes a
    // session that is gone, whatever profile it carries
    await act(async () => {
      deliver({ ...user, displayName: 'Stale Jonas' });
    });
    await act(async () => {});
    expect(result.current.user).toEqual(other);
    // ...and nothing paired the NEW token with the OLD profile
    expect(setStoredSession).not.toHaveBeenCalled();
    // The stale verification also registers nothing as a restore
    expect(notifyEngine.register).not.toHaveBeenCalledWith('restore');
  });


  it('drops a foreground /me that lands after a logout and a login as another account', async () => {
    seedStoredSession();
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(1));

    // The provider's foreground listener, off the preset's
    // AppState mock (calls are cleared per test, so the last
    // registration is this provider's)
    const appStateCb = (AppState.addEventListener as jest.Mock).mock.calls.at(-1)?.[1] as
      | ((status: string) => void)
      | undefined;
    expect(appStateCb).toBeDefined();

    // The foreground check goes out and hangs
    const deliver = heldFetchMe();
    await act(async () => {
      appStateCb?.('active');
    });
    await waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(2));

    await switchToOther(result.current);
    expect(result.current.user?.id).toBe('u2');

    await act(async () => {
      deliver({ ...user, displayName: 'Stale Jonas' });
    });
    await act(async () => {});
    expect(result.current.user).toEqual(other);
    expect(setStoredSession).not.toHaveBeenCalled();
  });


  it('keeps the stored session when the token read throws, and restores it on the next start', async () => {
    // The keychain threw beside a valid stored profile — a blip,
    // not a partial record
    (readStoredToken as jest.Mock).mockResolvedValue({ ok: false, token: null });
    (getStoredUser as jest.Mock).mockResolvedValue(user);
    const first = await renderAuth();
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    expect(first.result.current.isAuthenticated).toBe(false);
    expect(fetchMe).not.toHaveBeenCalled();
    expect(clearStoredSession).not.toHaveBeenCalled();
    await first.unmount();

    // Next start, the keychain answers — the session is back
    seedStoredSession();
    const second = await renderAuth();
    await waitFor(() => expect(second.result.current.isAuthenticated).toBe(true));
    expect(clearStoredSession).not.toHaveBeenCalled();
  });


  it('still clears a stored profile whose token is genuinely missing', async () => {
    (readStoredToken as jest.Mock).mockResolvedValue({ ok: true, token: null });
    (getStoredUser as jest.Mock).mockResolvedValue(user);
    const { result } = await renderAuth();

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isAuthenticated).toBe(false);
    expect(fetchMe).not.toHaveBeenCalled();
    expect(clearStoredSession).toHaveBeenCalled();
  });


  it('a logout wipes the departing account\'s chat namespace and nothing else', async () => {
    seedStoredSession();
    // The chat engine's scoped keys for this account, another
    // account's, and an app-level key
    await AsyncStorage.multiSet([
      ['u:u1:draft:c1', 'half-typed'],
      ['u:u1:draftreply:c1', 'm9'],
      ['u:u1:outbox:c1', '[{"id":"m10"}]'],
      ['u:u1:tasks:c1', '[{"kind":"send"}]'],
      ['u:u2:draft:c1', 'other account'],
      ['onboarded', '1'],
    ]);
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await logoutUnderFakeTimers(result.current.logout);
    expect(result.current.isAuthenticated).toBe(false);

    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((key) => key.startsWith('u:u1:'))).toEqual([]);
    expect(await AsyncStorage.getItem('u:u2:draft:c1')).toBe('other account');
    expect(await AsyncStorage.getItem('onboarded')).toBe('1');
  });


  it('a session expiry wipes the departing account\'s chat namespace too', async () => {
    seedStoredSession();
    await AsyncStorage.multiSet([
      ['u:u1:draft:c1', 'half-typed'],
      ['u:u2:draft:c1', 'other account'],
    ]);
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      mockSessionInvalid.fire();
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    await waitFor(async () => expect(await AsyncStorage.getItem('u:u1:draft:c1')).toBeNull());
    expect(await AsyncStorage.getItem('u:u2:draft:c1')).toBe('other account');
  });


  it('a failed session persist during login leaves the device signed out', async () => {
    seedLogin();
    (setStoredSession as jest.Mock).mockRejectedValueOnce(new Error('keychain write failed'));
    const { result } = await renderAuth();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    mockLog.length = 0;

    let failure: unknown = null;
    await act(async () => {
      try {
        await result.current.login('jonas', 'slaptazodis');
      } catch (err) {
        failure = err;
      }
    });
    expect(failure).toEqual(new Error('keychain write failed'));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.loading).toBe(false);

    // The half-written record is gone and the socket never came
    // up as this account — a genuinely signed-out device
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
    expect(mockLog).toContain('disconnectSocket');
    expect(connectSocket).not.toHaveBeenCalled();
    expect(notifyEngine.register).not.toHaveBeenCalled();
  });

});
