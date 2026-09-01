// -----------------------------------------------------------
//  [*] Tests — AuthProvider hydration and logout ordering
//
//  Provider-level pins on top of authSession.test.ts's pure
//  rules: the stored session is restored optimistically and
//  verified against /me (dropped only on a real auth
//  rejection), a malformed record never reaches the signed-in
//  state, logout tears down locally BEFORE the server calls
//  fire with the captured token, and a mid-run session-invalid
//  event drops the app to guest state.
// -----------------------------------------------------------

// Every call with an ordering consequence lands here
const mockLog: string[] = [];
const mockSessionInvalid: { fire: () => void } = { fire: () => {} };

jest.mock('@react-native-async-storage/async-storage', () =>
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
jest.mock('@/services/notifications', () => ({
  registerForPushNotifications: jest.fn(async () => true),
  unregisterPushNotifications: jest.fn(async () => { mockLog.push('unregisterPush'); }),
}));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));
jest.mock('expo-notifications', () => ({ dismissAllNotificationsAsync: jest.fn(async () => {}) }));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { showToast } from '@/context/NetworkContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ApiError, fetchMe } from '@/services/api';
import { clearStoredSession, getStoredToken, getStoredUser } from '@/services/session';
import type { User } from '@/types';


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


describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLog.length = 0;
    (getStoredToken as jest.Mock).mockResolvedValue(null);
    (getStoredUser as jest.Mock).mockResolvedValue(null);
    (fetchMe as jest.Mock).mockResolvedValue(user);
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
      expect(mockLog.indexOf('clearStoredSession')).toBeLessThan(mockLog.indexOf('unregisterPush'));
      expect(mockLog.indexOf('unregisterPush')).toBeLessThan(mockLog.indexOf('logoutApi:tok'));
      expect(mockLog.indexOf('disconnectSocket')).toBeLessThan(mockLog.indexOf('clearStoredSession'));
    } finally {
      jest.useRealTimers();
    }
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

});
