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
//  session, nothing when /me fails, and a detach carrying the
//  captured bearer on logout. The two register answers the
//  provider acts on are pinned both ways — a 'permission'
//  refusal raises the OS prompt exactly once while the OS can
//  still be asked and never otherwise, a 'disabled' restore
//  retries the detach — and every session drop (logout and
//  expiry alike) clears the displayed notifications.
// -----------------------------------------------------------

import type { PermissionSnapshot, RegisterResult } from '@knf/notifyengine';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { dismissAllNotificationsAsync } from 'expo-notifications';

import { showToast } from '@/context/NetworkContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ApiError, fetchMe, loginApi } from '@/services/api';
import { notifyEngine } from '@/services/notifyEngine';
import { clearStoredSession, getStoredToken, getStoredUser } from '@/services/session';
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
    logoutApi: jest.fn(async (token: string) => { mockLog.push(`logoutApi:${token}`); }),
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
  };
  return { notifyEngine: stub, readyNotifyEngine: async () => stub };
});
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));
jest.mock('expo-notifications', () => ({ dismissAllNotificationsAsync: jest.fn(async () => {}) }));


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
  (getStoredUser as jest.Mock).mockResolvedValue(user);
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockLog.length = 0;
    (getStoredToken as jest.Mock).mockResolvedValue(null);
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
      expect(mockLog).toContain('logoutApi:tok');
      expect(mockLog.indexOf('cacheClearAll')).toBeLessThan(mockLog.indexOf('clearStoredSession'));
      expect(mockLog.indexOf('clearStoredSession')).toBeLessThan(mockLog.indexOf('detach'));
      expect(mockLog.indexOf('detach')).toBeLessThan(mockLog.indexOf('logoutApi:tok'));
      expect(mockLog.indexOf('disconnectSocket')).toBeLessThan(mockLog.indexOf('clearStoredSession'));
      expect(dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);

      // The local wipe already emptied the api layer's token, so
      // the detach must carry the captured bearer itself
      expect(notifyEngine.detach).toHaveBeenCalledWith({ authToken: 'tok' });
    } finally {
      jest.useRealTimers();
    }
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

});
