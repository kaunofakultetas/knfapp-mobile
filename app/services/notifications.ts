// -----------------------------------------------------------
//  [*] Notifications — Expo push token plumbing
//
//  Permission flow, Expo push token retrieval, backend
//  registration and the Android notification channel. Every
//  function is best-effort: push is a nice-to-have, so nothing
//  here ever throws into a caller — most importantly
//  unregisterPushNotifications, which logout awaits and which
//  historically could block logout entirely when the server
//  was unreachable.
//
//  Push tokens exist only on physical devices; simulators and
//  web get a quiet null and the app simply runs without push.
//
//  Split into:
//
//    getPushToken                 — permissions + Expo token
//    registerForPushNotifications — send token to backend
//    unregisterPushNotifications  — best-effort removal
//    setupNotificationChannel     — Android channel
//    getNotificationData          — tap payload extraction
// -----------------------------------------------------------

// Channel name shown in Android system settings
import i18n from '@/i18n';

// Backend push token endpoints
import { registerPushToken, unregisterPushToken } from '@/services/api';

// Brand color for the notification light — never raw hex here
import { palettes } from '@/constants/theme';

// Device detection and the Expo notifications API
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';


// Foreground presentation: show notifications even while the
// app is open (chat screens de-duplicate their own messages)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Memoized per app session; cleared on unregister so a fresh
// login re-registers cleanly
let _pushToken: string | null = null;







// -----------------------------------------------------------
// getPushToken
// -----------------------------------------------------------
//
// Requests permission when not yet granted and resolves the
// Expo push token. Null on simulators/web, denied permission,
// or any Expo/FCM failure — callers treat null as "no push".
//
// Used by:
//   - registerForPushNotifications (below)
// -----------------------------------------------------------

export async function getPushToken(): Promise<string | null> {
  if (_pushToken) return _pushToken;


  // Expo push tokens only exist on physical devices
  if (!Device.isDevice) return null;


  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;


    // Project id resolves from app config (extra.eas.projectId)
    const tokenData = await Notifications.getExpoPushTokenAsync();
    _pushToken = tokenData.data;
    return _pushToken;
  } catch {
    // Missing FCM credentials or store services — no push
    return null;
  }
}







// -----------------------------------------------------------
// registerForPushNotifications
// -----------------------------------------------------------
//
// Sends the token to the backend so it can target this device.
// False on any failure — callers never branch on why.
//
// Used by:
//   - context/AuthContext.tsx — after login / session restore
//   - app/(main)/tabs/settings.tsx — push toggle on
// -----------------------------------------------------------

export async function registerForPushNotifications(): Promise<boolean> {
  try {
    const token = await getPushToken();
    if (!token) return false;

    // Device.isDevice held in getPushToken, so OS is ios/android
    await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return true;
  } catch {
    return false;
  }
}







// -----------------------------------------------------------
// unregisterPushNotifications
// -----------------------------------------------------------
//
// NEVER throws: logout awaits this, and a rejected unregister
// (device offline, server down) must not trap the user in a
// logged-in state. The memoized token is cleared even when the
// backend call fails — the server-side row goes stale, which
// is acceptable.
//
// Used by:
//   - context/AuthContext.tsx — logout
//   - app/(main)/tabs/settings.tsx — push toggle off
// -----------------------------------------------------------

export async function unregisterPushNotifications(): Promise<void> {
  if (!_pushToken) return;

  try {
    await unregisterPushToken(_pushToken);
  } catch {
    // Best-effort — see the banner
  } finally {
    _pushToken = null;
  }
}







// -----------------------------------------------------------
// setupNotificationChannel
// -----------------------------------------------------------
//
// Android 8+ requires a channel before any notification shows.
// The name is user-visible in system settings, so it goes
// through i18n — note Android caches the name at first
// creation; a later language switch won't rename it.
//
// Used by:
//   - app/_layout.tsx — once at startup
// -----------------------------------------------------------

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: i18n.t('settings.notifications'),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: palettes.light.brand,
    });
  } catch {
    // Channel setup is cosmetic — never block startup
  }
}







// -----------------------------------------------------------
// getNotificationData
// -----------------------------------------------------------
//
// Extracts the navigation payload from a tapped notification:
// { type, conversationId } for chat, { type, source } for
// news. Null when the payload carries no data.
//
// Used by:
//   - app/_layout.tsx — notification tap listener
// -----------------------------------------------------------

export function getNotificationData(notification: {
  request: { content: { data?: Record<string, unknown> } };
}): Record<string, string> | null {
  const data = notification.request.content.data;
  if (!data || typeof data !== 'object') return null;
  return data as Record<string, string>;
}


// Re-exported so the tap listener can type its callback
export type { Notification } from 'expo-notifications';
