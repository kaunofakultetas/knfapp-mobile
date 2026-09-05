// -----------------------------------------------------------
//  [*] Tests — the Expo device adapter, seam by seam
//
//  createExpoDevice over a hand-mocked primitive — no native
//  module boots, no dev-shell warning fires on import, every
//  call is a spy. Under test is ONLY the translation layer the
//  engine's machines stand on (they are proven over the fake
//  elsewhere): the honest supportsRemotePush answer per
//  runtime, the projectId passthrough and .data unwrap, the
//  permission normalisation with the iOS provisional tier as
//  its own status, the fetch-echo swallow on the token
//  listener (and its silence where remote push cannot exist),
//  the foreground handler bridged onto the
//  primitive's behaviour flags, responses reduced to one
//  shape, and the Android-only channel calls that never leave
//  the adapter anywhere else.
// -----------------------------------------------------------

import * as ExpoNotifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { createExpoDevice } from '../index';
import type { ChannelSpec, DeviceAdapter, PresentationRule } from '../../../core/types';


// The whole primitive as spies: the real module auto-registers
// a token listener at import time, which is exactly the side
// effect this seam exists to keep out of the engine
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
  getNotificationChannelsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  deleteNotificationChannelAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

// The runtime flag the adapter reads at construction. Read
// lazily so the factory never touches the knob before this
// module's own statements have run
const mockRuntime = { executionEnvironment: 'standalone' };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get executionEnvironment() {
      return mockRuntime.executionEnvironment;
    },
  },
}));


const native = jest.mocked(ExpoNotifications);

const TOKEN_1 = 'ExponentPushToken[device-token-0001]';
const TOKEN_2 = 'ExponentPushToken[device-token-0002]';
const PROJECT_ID = 'proj-under-test';
const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

// One channel spec carrying every optional field the mapper reads
const SPEC: ChannelSpec & { name: string } = {
  id: 'default.v1',
  nameKey: 'default',
  importance: 7,
  vibration: true,
  lightColor: '#7B003F',
  name: 'Pranešimai',
};


// -----------------------------------------------------------
// Fixtures
// -----------------------------------------------------------
//
// The primitive's records, built with only the fields the
// adapter reads — everything else in those types is noise to
// this seam, hence the casts.
//
// Used by:
//   - the permission, response, handler and channel suites
// -----------------------------------------------------------

const rawPermission = (
  status: string,
  extra: { canAskAgain?: boolean; iosStatus?: number } = {},
): ExpoNotifications.NotificationPermissionsStatus =>
  ({
    status,
    granted: status === 'granted',
    canAskAgain: extra.canAskAgain ?? true,
    expires: 'never',
    ...(extra.iosStatus === undefined ? {} : { ios: { status: extra.iosStatus } }),
  }) as unknown as ExpoNotifications.NotificationPermissionsStatus;

const rawResponse = (
  identifier: string,
  data: unknown,
  actionIdentifier?: string,
): ExpoNotifications.NotificationResponse =>
  ({
    actionIdentifier,
    notification: { date: 0, request: { identifier, content: { data }, trigger: null } },
  }) as unknown as ExpoNotifications.NotificationResponse;

const rawChannel = (id: string, name: string | null, importance: number): ExpoNotifications.NotificationChannel =>
  ({ id, name, importance }) as unknown as ExpoNotifications.NotificationChannel;

// A native subscription handle whose remove() the test counts
const subscription = () => ({ remove: jest.fn() });

// createExpoDevice reads Platform.OS ONCE, at construction —
// flip it for exactly that moment and put it back
const deviceOn = (os: typeof Platform.OS, options?: { projectId?: string }): DeviceAdapter => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    return createExpoDevice(options);
  } finally {
    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  }
};

// Whatever the adapter handed the primitive — the test fires
// it the way the OS would
const pushTokenListener = () => native.addPushTokenListener.mock.calls[0][0];
const responseListener = () => native.addNotificationResponseReceivedListener.mock.calls[0][0];
const installedHandler = (): ExpoNotifications.NotificationHandler => {
  const handler = native.setNotificationHandler.mock.calls[0]?.[0];
  if (!handler) throw new Error('no native handler installed');
  return handler;
};


beforeEach(() => {
  jest.resetAllMocks();
  mockRuntime.executionEnvironment = 'standalone';
  native.addPushTokenListener.mockReturnValue(subscription());
  native.addNotificationResponseReceivedListener.mockReturnValue(subscription());
  native.clearLastNotificationResponseAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});


describe('supportsRemotePush — the honest runtime answer', () => {
  it('web has no push transport here — false', () => {
    expect(deviceOn('web').supportsRemotePush()).toBe(false);
  });

  it('Android inside the shared dev shell lost remote push — false', () => {
    mockRuntime.executionEnvironment = 'storeClient';
    expect(deviceOn('android').supportsRemotePush()).toBe(false);
  });

  it('Android in a real build — true', () => {
    expect(deviceOn('android').supportsRemotePush()).toBe(true);
  });

  it('iOS — true, the dev shell included', () => {
    expect(deviceOn('ios').supportsRemotePush()).toBe(true);
    mockRuntime.executionEnvironment = 'storeClient';
    expect(deviceOn('ios').supportsRemotePush()).toBe(true);
  });

  it('platform rides through for the three known values and reads unknown otherwise', () => {
    expect(deviceOn('ios').platform).toBe('ios');
    expect(deviceOn('android').platform).toBe('android');
    expect(deviceOn('web').platform).toBe('web');

    const desktop = deviceOn('macos');
    expect(desktop.platform).toBe('unknown');
    expect(desktop.supportsRemotePush()).toBe(false);
  });
});


describe('getPushToken', () => {
  it('passes {projectId} through and unwraps .data', async () => {
    native.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN_1 });

    await expect(deviceOn('ios', { projectId: PROJECT_ID }).getPushToken()).resolves.toBe(TOKEN_1);
    expect(native.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(native.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: PROJECT_ID });
  });

  it('without a projectId the primitive is asked with no options at all', async () => {
    native.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN_1 });

    await deviceOn('ios').getPushToken();
    expect(native.getExpoPushTokenAsync).toHaveBeenCalledWith(undefined);
  });
});


describe('permissions — normalisation', () => {
  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['undetermined', 'undetermined'],
    ['some-future-status', 'undetermined'],
  ])('a raw %s status reads %s', async (raw, expected) => {
    native.getPermissionsAsync.mockResolvedValue(rawPermission(raw));

    await expect(deviceOn('ios').getPermissions()).resolves.toEqual({ status: expected, canAskAgain: true });
  });

  it('the iOS provisional tier (3) surfaces as its own status, whatever the top-level says', async () => {
    native.getPermissionsAsync.mockResolvedValue(rawPermission('undetermined', { iosStatus: 3 }));

    await expect(deviceOn('ios').getPermissions()).resolves.toEqual({ status: 'provisional', canAskAgain: true });
  });

  it('any other iOS tier leaves the top-level status in charge', async () => {
    native.getPermissionsAsync.mockResolvedValue(rawPermission('granted', { iosStatus: 2 }));

    await expect(deviceOn('ios').getPermissions()).resolves.toEqual({ status: 'granted', canAskAgain: true });
  });

  it('canAskAgain rides through untouched — false is what sends the UI to system settings', async () => {
    native.getPermissionsAsync.mockResolvedValue(rawPermission('denied', { canAskAgain: false }));

    await expect(deviceOn('ios').getPermissions()).resolves.toEqual({ status: 'denied', canAskAgain: false });
    // A read is side-effect free — it never prompts
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requestPermissions prompts the primitive and normalises the same way', async () => {
    native.requestPermissionsAsync.mockResolvedValue(rawPermission('granted'));

    await expect(deviceOn('ios').requestPermissions()).resolves.toEqual({ status: 'granted', canAskAgain: true });
    expect(native.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(native.getPermissionsAsync).not.toHaveBeenCalled();
  });
});


describe('onPushToken — the fetch-echo swallow', () => {
  it('an echo of the token just fetched is swallowed; a changed token is forwarded once', async () => {
    native.getExpoPushTokenAsync.mockResolvedValue({ type: 'expo', data: TOKEN_1 });
    const device = deviceOn('ios');
    const listener = jest.fn();
    device.onPushToken(listener);
    await device.getPushToken();

    // The primitive re-emits on every fetch — not a rotation
    pushTokenListener()({ type: 'ios', data: TOKEN_1 });
    expect(listener).not.toHaveBeenCalled();

    pushTokenListener()({ type: 'ios', data: TOKEN_2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(TOKEN_2);

    // The forwarded token is the new baseline — ITS echo is
    // swallowed too
    pushTokenListener()({ type: 'ios', data: TOKEN_2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a token whose data is not a string never reaches the engine', () => {
    const listener = jest.fn();
    deviceOn('ios').onPushToken(listener);

    pushTokenListener()({ type: 'web', data: { endpoint: 'https://push.example/e', keys: { p256dh: 'k', auth: 'a' } } });
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribing removes the native subscription', () => {
    const handle = subscription();
    native.addPushTokenListener.mockReturnValue(handle);
    const off = deviceOn('ios').onPushToken(() => undefined);

    off();
    expect(handle.remove).toHaveBeenCalledTimes(1);
  });

  it('on web and unknown runtimes the primitive is never subscribed — a no-op unsubscribe comes back', () => {
    for (const os of ['web', 'macos'] as const) {
      const off = deviceOn(os).onPushToken(() => undefined);
      expect(native.addPushTokenListener).not.toHaveBeenCalled();
      expect(() => off()).not.toThrow();
    }
  });
});


describe('setForegroundHandler — the bridge', () => {
  const RULE: PresentationRule = { banner: true, list: false, sound: true, badge: false };

  it('one call installs exactly one native handler, and a rule maps onto the four behaviour flags', async () => {
    const device = deviceOn('ios');
    const handler = jest.fn(async () => RULE);

    device.setForegroundHandler(handler);
    expect(native.setNotificationHandler).toHaveBeenCalledTimes(1);

    const behaviour = await installedHandler().handleNotification(
      rawResponse('n-1', { type: 'chat_message', conversationId: 'c1' }).notification,
    );

    // The payload reaches the engine already normalised
    expect(handler).toHaveBeenCalledWith({
      type: 'chat_message',
      data: { type: 'chat_message', conversationId: 'c1' },
    });
    expect(behaviour).toEqual({
      shouldShowBanner: true,
      shouldShowList: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('handleError fans out to every onHandleError subscriber until it unsubscribes — a throwing one starves nobody', () => {
    const device = deviceOn('ios');
    device.setForegroundHandler(async () => RULE);
    const boom = new Error('native handler failed');
    const throwing = jest.fn(() => {
      throw new Error('listener bug');
    });
    const quiet = jest.fn();
    const offThrowing = device.onHandleError(throwing);
    const offQuiet = device.onHandleError(quiet);

    installedHandler().handleError?.('n-1', boom);
    expect(throwing).toHaveBeenCalledWith(boom);
    expect(quiet).toHaveBeenCalledWith(boom);

    offThrowing();
    offQuiet();
    installedHandler().handleError?.('n-2', boom);
    expect(quiet).toHaveBeenCalledTimes(1);
  });
});


describe('responses — reduced to one shape', () => {
  it('getLastResponse maps identifier, actionIdentifier and data; an absent action reads null', async () => {
    native.getLastNotificationResponseAsync.mockResolvedValue(rawResponse('cold-1', { type: 'news', postId: 'n1' }));

    await expect(deviceOn('ios').getLastResponse()).resolves.toEqual({
      identifier: 'cold-1',
      actionIdentifier: null,
      data: { type: 'news', postId: 'n1' },
    });
  });

  it('a custom action identifier rides through verbatim — the routing hub judges it', async () => {
    native.getLastNotificationResponseAsync.mockResolvedValue(rawResponse('cold-2', { type: 'chat_message' }, 'reply'));

    await expect(deviceOn('ios').getLastResponse()).resolves.toMatchObject({ actionIdentifier: 'reply' });
  });

  it('data is passed through RAW — the routing hub normalises, so nothing is parsed twice', async () => {
    native.getLastNotificationResponseAsync.mockResolvedValue(rawResponse('cold-3', '{"type":"news"}'));

    await expect(deviceOn('ios').getLastResponse()).resolves.toMatchObject({ data: '{"type":"news"}' });
  });

  it('no stored response reads null', async () => {
    native.getLastNotificationResponseAsync.mockResolvedValue(null);

    await expect(deviceOn('ios').getLastResponse()).resolves.toBeNull();
  });

  it('onResponse forwards the same reduced shape and unsubscribes cleanly', () => {
    const handle = subscription();
    native.addNotificationResponseReceivedListener.mockReturnValue(handle);
    const listener = jest.fn();
    const off = deviceOn('ios').onResponse(listener);

    responseListener()(rawResponse('warm-1', { type: 'schedule_update' }, DEFAULT_ACTION));
    expect(listener).toHaveBeenCalledWith({
      identifier: 'warm-1',
      actionIdentifier: DEFAULT_ACTION,
      data: { type: 'schedule_update' },
    });

    off();
    expect(handle.remove).toHaveBeenCalledTimes(1);
  });

  it('clearLastResponse asks the primitive once, fire-and-forget', () => {
    deviceOn('ios').clearLastResponse();
    expect(native.clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  });
});


describe('channels — Android only', () => {
  it('off Android every channel call is a typed no-op that never reaches the primitive', async () => {
    const device = deviceOn('ios');

    await expect(device.getChannels()).resolves.toEqual([]);
    await expect(device.setChannel(SPEC)).resolves.toBeUndefined();
    await expect(device.deleteChannel(SPEC.id)).resolves.toBeUndefined();

    expect(native.getNotificationChannelsAsync).not.toHaveBeenCalled();
    expect(native.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(native.deleteNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('setChannel maps the spec onto the native input; sound stays the platform default unless the spec turns it off', async () => {
    native.setNotificationChannelAsync.mockResolvedValue(null);
    const device = deviceOn('android');

    await device.setChannel(SPEC);
    await device.setChannel({ ...SPEC, id: 'quiet.v1', sound: false });

    expect(native.setNotificationChannelAsync.mock.calls).toEqual([
      ['default.v1', { name: 'Pranešimai', importance: 7, enableVibrate: true, lightColor: '#7B003F' }],
      ['quiet.v1', { name: 'Pranešimai', importance: 7, enableVibrate: true, lightColor: '#7B003F', sound: null }],
    ]);
    // toEqual reads an undefined field as absent — the two
    // sound values are told apart explicitly: undefined keeps
    // the platform default, null silences the channel
    expect(native.setNotificationChannelAsync.mock.calls[0][1].sound).toBeUndefined();
    expect(native.setNotificationChannelAsync.mock.calls[1][1].sound).toBeNull();
    // No pattern declared, none invented
    expect(native.setNotificationChannelAsync.mock.calls[0][1].vibrationPattern).toBeUndefined();
  });

  it('a vibrationPattern rides through to the primitive next to enableVibrate', async () => {
    native.setNotificationChannelAsync.mockResolvedValue(null);

    await deviceOn('android').setChannel({ ...SPEC, id: 'chat.v2', vibrationPattern: [0, 250, 250, 250] });

    expect(native.setNotificationChannelAsync).toHaveBeenCalledWith('chat.v2', {
      name: 'Pranešimai',
      importance: 7,
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7B003F',
    });
  });

  it('deleteChannel passes the id straight through', async () => {
    native.deleteNotificationChannelAsync.mockResolvedValue(undefined);

    await deviceOn('android').deleteChannel('default.v0');
    expect(native.deleteNotificationChannelAsync).toHaveBeenCalledWith('default.v0');
  });

  it('getChannels reduces to {id, name, importance}, a nameless channel borrowing its id', async () => {
    native.getNotificationChannelsAsync.mockResolvedValue([
      rawChannel('default.v1', 'Pranešimai', 7),
      rawChannel('legacy', null, 4),
    ]);

    await expect(deviceOn('android').getChannels()).resolves.toEqual([
      { id: 'default.v1', name: 'Pranešimai', importance: 7 },
      { id: 'legacy', name: 'legacy', importance: 4 },
    ]);
  });

  it('a null channel list from the primitive reads empty', async () => {
    native.getNotificationChannelsAsync.mockResolvedValue(null as unknown as ExpoNotifications.NotificationChannel[]);

    await expect(deviceOn('android').getChannels()).resolves.toEqual([]);
  });
});


describe('onAppActive', () => {
  it('fires only on the active edge and removes the native subscription on unsubscribe', () => {
    const handle = subscription();
    const spy = jest.spyOn(AppState, 'addEventListener').mockReturnValue(handle);
    const listener = jest.fn();
    const off = deviceOn('ios').onAppActive(listener);

    expect(spy).toHaveBeenCalledWith('change', expect.any(Function));
    const onChange = spy.mock.calls[0][1];
    onChange('background');
    onChange('inactive');
    expect(listener).not.toHaveBeenCalled();
    onChange('active');
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    expect(handle.remove).toHaveBeenCalledTimes(1);
  });
});
