/**
 * Push notification service for knfapp.
 *
 * Handles Expo push token registration, permission requests,
 * and incoming notification handling (navigation to relevant screens).
 */

import { API_BASE_URL } from '@/constants/Api';
import { registerPushToken, unregisterPushToken } from '@/services/api';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let _pushToken: string | null = null;

/**
 * Request push notification permissions and return the Expo push token.
 * Returns null if permissions denied or on unsupported platform.
 */
export async function getPushToken(): Promise<string | null> {
  if (_pushToken) return _pushToken;

  // Push notifications only work on physical devices (not simulators for iOS)
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    // On web, we can still try
    if (Platform.OS !== 'web') {
      return null;
    }
  }

  // Check/request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  // Get Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Uses Constants.expoConfig.extra.eas.projectId automatically
    });
    _pushToken = tokenData.data;
    return _pushToken;
  } catch (err) {
    console.error('Failed to get push token:', err);
    return null;
  }
}

/**
 * Register push token with the backend.
 * Should be called after user authentication.
 */
export async function registerForPushNotifications(): Promise<boolean> {
  try {
    const token = await getPushToken();
    if (!token) return false;

    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    await registerPushToken(token, platform);
    console.log('Push token registered with backend');
    return true;
  } catch (err) {
    console.error('Failed to register push token:', err);
    return false;
  }
}

/**
 * Unregister push token from the backend.
 * Should be called on logout.
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (_pushToken) {
    await unregisterPushToken(_pushToken);
    _pushToken = null;
  }
}

/**
 * Set up Android notification channel (required for Android 8+).
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'KNF Prane\u0161imai',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7B003F',
    });
  }
}

/**
 * Get the notification data for navigation.
 * Returns { type, conversationId } for chat, { type, source } for news, etc.
 */
export function getNotificationData(notification: { request: { content: { data?: Record<string, unknown> } } }): Record<string, string> | null {
  const data = notification.request.content.data;
  if (!data || typeof data !== 'object') return null;
  return data as Record<string, string>;
}

// Notification type re-export for use in getNotificationData
export type { Notification } from 'expo-notifications';
