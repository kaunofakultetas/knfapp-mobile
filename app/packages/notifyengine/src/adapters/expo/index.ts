// -----------------------------------------------------------
//  [*] notifyengine — the Expo device adapter
//
//  The ONE file in the package that imports the native
//  primitive. Everything the engine needs from the device is
//  flattened into the DeviceAdapter seam here: permissions
//  normalized (the iOS provisional tier surfaces as its own
//  status), the push token unwrapped, channels passed through,
//  responses reduced to {identifier, actionIdentifier, data},
//  and the foreground handler bridged to the primitive's
//  handler contract. supportsRemotePush() answers the honest
//  runtime question: web has no transport here, and the
//  dev-shell Android runtime lost remote push in SDK 53 — the
//  engine turns that into the 'unsupported' state instead of
//  an error loop. The token listener follows the same answer:
//  where remote push cannot exist the primitive is never
//  subscribed, so a web session boots without its warning.
//
//  Used by:
//    - hosts: createExpoDevice({projectId}) into engine config
// -----------------------------------------------------------

import Constants from 'expo-constants';
import * as ExpoNotifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { normalizeData } from '../../core/routing';
import type {
  ChannelSpec,
  DeviceAdapter,
  DeviceNotificationResponse,
  DevicePermission,
  PresentationRule,
  Unsubscribe,
} from '../../core/types';


// The iOS provisional authorization tier — quiet delivery the
// user never explicitly granted; still deliverable
const IOS_PROVISIONAL = 3;


function normalizePermission(raw: ExpoNotifications.NotificationPermissionsStatus): DevicePermission {
  if (raw.ios?.status === IOS_PROVISIONAL) {
    return { status: 'provisional', canAskAgain: raw.canAskAgain };
  }
  const status =
    raw.status === 'granted' || raw.status === 'denied' ? raw.status : 'undetermined';
  return { status, canAskAgain: raw.canAskAgain };
}

function toResponse(response: ExpoNotifications.NotificationResponse): DeviceNotificationResponse {
  return {
    identifier: response.notification.request.identifier,
    actionIdentifier: response.actionIdentifier ?? null,
    data: response.notification.request.content.data,
  };
}


export function createExpoDevice(options: { projectId?: string } = {}): DeviceAdapter {
  const platform =
    Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'unknown';

  // The primitive emits its token event on EVERY fetch, not
  // only on rotation — its own source warns about the loop.
  // Remembering what we last saw keeps onPushToken meaning
  // "the token CHANGED"
  let lastKnownToken: string | null = null;

  // The shared dev shell: remote push was removed from its
  // Android runtime in SDK 53 — real builds never hit this
  const isExpoGo = Constants.executionEnvironment === 'storeClient';

  return {
    platform,

    supportsRemotePush: () => {
      if (platform === 'web' || platform === 'unknown') return false;
      if (platform === 'android' && isExpoGo) return false;
      return true;
    },

    getPermissions: async () => normalizePermission(await ExpoNotifications.getPermissionsAsync()),
    requestPermissions: async () => normalizePermission(await ExpoNotifications.requestPermissionsAsync()),

    getPushToken: async () => {
      const token = await ExpoNotifications.getExpoPushTokenAsync(
        options.projectId ? { projectId: options.projectId } : undefined,
      );
      lastKnownToken = token.data;
      return token.data;
    },
    onPushToken: (listener): Unsubscribe => {
      // No remote push, no rotations to hear — and the web
      // build of the primitive logs a warning per subscription
      if (platform === 'web' || platform === 'unknown') return () => undefined;
      const subscription = ExpoNotifications.addPushTokenListener((token) => {
        if (typeof token.data !== 'string') return;
        // Fetch echoes are not rotations
        if (token.data === lastKnownToken) return;
        lastKnownToken = token.data;
        listener(token.data);
      });
      return () => subscription.remove();
    },

    getChannels: async () => {
      if (platform !== 'android') return [];
      const channels = await ExpoNotifications.getNotificationChannelsAsync();
      return (channels ?? []).map((channel) => ({
        id: channel.id,
        name: channel.name ?? channel.id,
        importance: channel.importance,
      }));
    },
    setChannel: async (spec: ChannelSpec & { name: string }) => {
      if (platform !== 'android') return;
      await ExpoNotifications.setNotificationChannelAsync(spec.id, {
        name: spec.name,
        importance: spec.importance,
        enableVibrate: spec.vibration,
        vibrationPattern: spec.vibrationPattern,
        lightColor: spec.lightColor,
        sound: spec.sound === false ? null : undefined,
      });
    },
    deleteChannel: async (id: string) => {
      if (platform !== 'android') return;
      await ExpoNotifications.deleteNotificationChannelAsync(id);
    },

    onResponse: (listener): Unsubscribe => {
      const subscription = ExpoNotifications.addNotificationResponseReceivedListener((response) => {
        listener(toResponse(response));
      });
      return () => subscription.remove();
    },
    getLastResponse: async () => {
      const response = await ExpoNotifications.getLastNotificationResponseAsync();
      return response ? toResponse(response) : null;
    },
    clearLastResponse: () => {
      void ExpoNotifications.clearLastNotificationResponseAsync();
    },

    setForegroundHandler: (handler) => {
      ExpoNotifications.setNotificationHandler({
        handleNotification: async (notification): Promise<ExpoNotifications.NotificationBehavior> => {
          const payload = normalizeData(notification.request.content.data);
          const rule: PresentationRule = await handler(payload);
          return {
            shouldShowBanner: rule.banner,
            shouldShowList: rule.list,
            shouldPlaySound: rule.sound,
            shouldSetBadge: rule.badge,
          };
        },
        handleError: (_id, error) => {
          for (const listener of [...handleErrorListeners]) {
            try {
              listener(error);
            } catch {
              // Telemetry stays telemetry
            }
          }
        },
      });
    },
    onHandleError: (listener): Unsubscribe => {
      handleErrorListeners.add(listener);
      return () => {
        handleErrorListeners.delete(listener);
      };
    },

    onAppActive: (listener): Unsubscribe => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') listener();
      });
      return () => subscription.remove();
    },
  };
}

// Module-scope so setForegroundHandler (installed once) and
// onHandleError subscribers meet in one place
const handleErrorListeners = new Set<(error: unknown) => void>();
