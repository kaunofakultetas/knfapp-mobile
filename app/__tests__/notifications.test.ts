// -----------------------------------------------------------
//  [*] Tests — services/notifications push flows
//
//  The register-wave rules: the persisted master switch gates
//  the POST (a token resolved in flight must never resurrect a
//  switch the user turned off), failures come back as a
//  discriminated reason instead of a thrown error, the app
//  language rides along, concurrent callers share one attempt,
//  and unregister never throws and never prompts.
// -----------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockI18n = { language: 'lt' };
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: mockI18n,
  deviceLanguage: 'lt',
}));

const mockRegisterApi = jest.fn(async (..._args: unknown[]) => {});
const mockUnregisterApi = jest.fn(async (..._args: unknown[]) => {});
jest.mock('@/services/api', () => ({
  registerPushToken: (token: string, platform: string, language: string) =>
    mockRegisterApi(token, platform, language),
  unregisterPushToken: (token: string, authToken?: string | null) =>
    mockUnregisterApi(token, authToken),
}));

const mockDevice = { isDevice: true };
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
}));

const mockPerms = {
  existing: 'granted' as string,
  requested: 'granted' as string,
  tokenValue: 'ExponentPushToken[abc]' as string | null,
};
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: mockPerms.existing })),
  requestPermissionsAsync: jest.fn(async () => ({ status: mockPerms.requested })),
  getExpoPushTokenAsync: jest.fn(async () => {
    if (!mockPerms.tokenValue) throw new Error('no credentials');
    return { data: mockPerms.tokenValue };
  }),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
}));

import type AsyncStorageType from '@react-native-async-storage/async-storage';


// The module memoizes the token and the in-flight attempt at
// module level — every test gets a fresh instance. AsyncStorage
// must be re-required after the reset too, or the test would
// read a DIFFERENT store than the service writes.
type NotificationsModule = typeof import('@/services/notifications');
let notifications: NotificationsModule;
let storage: typeof AsyncStorageType;

beforeEach(async () => {
  jest.resetModules();
  const storageModule = require('@react-native-async-storage/async-storage');
  storage = storageModule.default ?? storageModule;
  await storage.clear();
  mockRegisterApi.mockClear();
  mockUnregisterApi.mockClear();
  mockDevice.isDevice = true;
  mockI18n.language = 'lt';
  mockPerms.existing = 'granted';
  mockPerms.requested = 'granted';
  mockPerms.tokenValue = 'ExponentPushToken[abc]';
  notifications = require('@/services/notifications');
});


describe('registerForPushNotifications', () => {
  it('posts the token with platform and app language', async () => {
    const result = await notifications.registerForPushNotifications();
    expect(result).toEqual({ ok: true });
    expect(mockRegisterApi).toHaveBeenCalledWith('ExponentPushToken[abc]', 'ios', 'lt');
    expect(await storage.getItem('push_last_token')).toBe('ExponentPushToken[abc]');
  });

  it('sends en when the app runs in English', async () => {
    mockI18n.language = 'en';
    await notifications.registerForPushNotifications();
    expect(mockRegisterApi).toHaveBeenCalledWith('ExponentPushToken[abc]', 'ios', 'en');
  });

  it('never re-creates the row while the master switch is off', async () => {
    await storage.setItem('app_settings', JSON.stringify({ notifications: false }));
    const result = await notifications.registerForPushNotifications();
    expect(result).toEqual({ ok: false, reason: 'disabled' });
    expect(mockRegisterApi).not.toHaveBeenCalled();
  });

  it('treats a corrupt settings blob as enabled (the hydration default)', async () => {
    await storage.setItem('app_settings', '{not json');
    const result = await notifications.registerForPushNotifications();
    expect(result).toEqual({ ok: true });
  });

  it('reports a permission denial without posting', async () => {
    mockPerms.existing = 'undetermined';
    mockPerms.requested = 'denied';
    const result = await notifications.registerForPushNotifications();
    expect(result).toEqual({ ok: false, reason: 'permission' });
    expect(mockRegisterApi).not.toHaveBeenCalled();
  });

  it('reports simulators and web as unsupported', async () => {
    mockDevice.isDevice = false;
    const result = await notifications.registerForPushNotifications();
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('reports a token-service failure as transient network', async () => {
    mockPerms.tokenValue = null;
    const result = await notifications.registerForPushNotifications();
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('reports a failed backend POST as network, not a throw', async () => {
    mockRegisterApi.mockRejectedValueOnce(new Error('500'));
    const result = await notifications.registerForPushNotifications();
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('shares one in-flight attempt between concurrent callers', async () => {
    const [a, b] = await Promise.all([
      notifications.registerForPushNotifications(),
      notifications.registerForPushNotifications(),
    ]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(mockRegisterApi).toHaveBeenCalledTimes(1);
  });
});


describe('unregisterPushNotifications', () => {
  it('deletes the memoized token and never throws on a failed DELETE', async () => {
    await notifications.registerForPushNotifications();
    mockUnregisterApi.mockRejectedValueOnce(new Error('offline'));

    await expect(notifications.unregisterPushNotifications()).resolves.toBeUndefined();
    expect(mockUnregisterApi).toHaveBeenCalledWith('ExponentPushToken[abc]', undefined);
  });

  it('falls back to the persisted last-registered token', async () => {
    await storage.setItem('push_last_token', 'ExponentPushToken[old]');
    await notifications.unregisterPushNotifications();
    expect(mockUnregisterApi).toHaveBeenCalledWith('ExponentPushToken[old]', undefined);
  });

  it('forwards the captured auth token for the detached logout call', async () => {
    await storage.setItem('push_last_token', 'ExponentPushToken[old]');
    await notifications.unregisterPushNotifications('captured-bearer');
    expect(mockUnregisterApi).toHaveBeenCalledWith('ExponentPushToken[old]', 'captured-bearer');
  });

  it('never fires a permission prompt while resolving a device token', async () => {
    // No memo, no persisted token, permission NOT granted — the
    // device probe must be skipped entirely
    mockPerms.existing = 'denied';
    const expo = require('expo-notifications');
    await notifications.unregisterPushNotifications();
    expect(expo.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockUnregisterApi).not.toHaveBeenCalled();
  });

  it('reads the device token when permission is already granted', async () => {
    await notifications.unregisterPushNotifications();
    expect(mockUnregisterApi).toHaveBeenCalledWith('ExponentPushToken[abc]', undefined);
  });
});


describe('getNotificationData', () => {
  const wrap = (data: unknown) =>
    ({ request: { content: { data } } }) as never;

  it('keeps only the string entries of a payload', () => {
    expect(
      notifications.getNotificationData(
        wrap({ type: 'chat', conversationId: 'c1', badge: 3, nested: { x: 1 } }),
      ),
    ).toEqual({ type: 'chat', conversationId: 'c1' });
  });

  it('returns null when nothing string-shaped remains', () => {
    expect(notifications.getNotificationData(wrap({ badge: 3, flag: true }))).toBeNull();
    expect(notifications.getNotificationData(wrap({}))).toBeNull();
  });

  it('returns null for a payload with no data at all', () => {
    expect(notifications.getNotificationData(wrap(undefined))).toBeNull();
  });
});
