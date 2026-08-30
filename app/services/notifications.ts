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
//  Push tokens exist only on physical devices; simulators are
//  filtered by Device.isDevice and web by an explicit platform
//  guard (Device.isDevice is TRUE in a desktop browser) — both
//  report 'unsupported' and the app simply runs without push.
//
//  The persisted `notifications` master switch (the
//  'app_settings' blob AppContext writes) gates registration
//  right before the POST, so neither a session restore nor an
//  in-flight registration can resurrect a token the user
//  switched off.
//
//  Split into:
//
//    initNotifications            — foreground presentation
//    getPushToken                 — permissions + Expo token
//    isPushEnabled                — persisted master switch
//    registerForPushNotifications — send token to backend
//    unregisterPushNotifications  — best-effort removal
//    setupNotificationChannel     — Android channel
//    getNotificationData          — tap payload extraction
// -----------------------------------------------------------

// Channel name and the register payload's language
import i18n from '@/i18n';

// Backend push token endpoints
import { registerPushToken, unregisterPushToken } from '@/services/api';

// Brand color for the notification light — never raw hex here
import { palettes } from '@/constants/theme';

// Master-switch blob and the last-registered-token fallback
import AsyncStorage from '@react-native-async-storage/async-storage';

// Device detection and the Expo notifications API
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';


// Last token successfully registered with the backend — the
// unregister fallback when the module memo is gone (fresh
// process, toggle-off before this session registered). Kept
// after unregistering on purpose: a failed DELETE leaves it as
// the pending retry for the next call, and a retry after a
// success is an idempotent no-op server-side.
const LAST_PUSH_TOKEN_KEY = 'push_last_token';

// The settings blob AppContext persists — its `notifications`
// boolean is the push master switch
const APP_SETTINGS_KEY = 'app_settings';

// Memoized per app session; cleared on unregister so a fresh
// login re-registers cleanly
let _pushToken: string | null = null;

// The one in-flight registration, shared so concurrent callers
// coalesce and unregister can wait it out instead of racing it
let _registerInFlight: Promise<RegisterPushResult> | null = null;







// -----------------------------------------------------------
// initNotifications
// -----------------------------------------------------------
//
// Foreground presentation: show notifications even while the
// app is open (chat screens de-duplicate their own messages).
// Called from the root layout instead of running at module
// load, so importing this file has no side effects.
//
// Used by:
//   - app/_layout.tsx — once at startup, next to
//     setupNotificationChannel
// -----------------------------------------------------------

export function initNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}







// -----------------------------------------------------------
// getPushToken
// -----------------------------------------------------------
//
// Requests permission when not yet granted and resolves the
// Expo push token. A failure names its cause — 'unsupported'
// (simulator/web), 'permission' (denied), 'network' (Expo/FCM
// unreachable or unconfigured) — so registration can report
// something better than "denied" for every miss.
//
// Used by:
//   - registerForPushNotifications (below)
// -----------------------------------------------------------

type PushTokenResult =
  | { token: string; reason?: undefined }
  | { token: null; reason: 'unsupported' | 'permission' | 'network' };

export async function getPushToken(): Promise<PushTokenResult> {
  if (_pushToken) return { token: _pushToken };


  // Expo push tokens only exist on physical devices — and web
  // needs its own guard: Device.isDevice is true in a desktop
  // browser, where the permission prompt would fire and fail
  if (Platform.OS === 'web' || !Device.isDevice) {
    return { token: null, reason: 'unsupported' };
  }


  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return { token: null, reason: 'permission' };
  } catch {
    // The permissions API itself failed — treat as denied
    return { token: null, reason: 'permission' };
  }


  try {
    // Project id resolves from app config (extra.eas.projectId)
    const tokenData = await Notifications.getExpoPushTokenAsync();
    _pushToken = tokenData.data;
    return { token: _pushToken };
  } catch {
    // Missing FCM credentials, store services or connectivity —
    // transient as far as the caller can tell, so it retries
    return { token: null, reason: 'network' };
  }
}







// -----------------------------------------------------------
// isPushEnabled
// -----------------------------------------------------------
//
// Reads the persisted master switch. Anything but an explicit
// stored false — no blob yet, unreadable storage — counts as
// enabled, matching AppContext's own hydration default.
//
// Used by:
//   - registerForPushNotifications (below)
// -----------------------------------------------------------

async function isPushEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return true;

    const parsed = JSON.parse(raw) as { notifications?: unknown };
    return parsed.notifications !== false;
  } catch {
    return true;
  }
}







// -----------------------------------------------------------
// registerForPushNotifications
// -----------------------------------------------------------
//
// Sends the token to the backend (with the app language, so
// push copy arrives in the user's language) and remembers it
// as the last-registered fallback. The failure reason lets
// settings pick the right message and keep the switch on for
// transient failures.
//
// The master-switch check sits AFTER the slow token resolution
// and right before the POST — that placement is what stops an
// in-flight registration from resurrecting a token the user
// just switched off, and this late it also cannot race the
// settings toggle's asynchronous persist of a fresh `true`.
//
// Concurrent callers share one in-flight attempt, which
// unregisterPushNotifications also awaits before removing.
//
// Used by:
//   - context/AuthContext.tsx — after login / session restore
//   - app/(main)/tabs/settings.tsx — push toggle on
// -----------------------------------------------------------

export type RegisterPushResult =
  | { ok: true }
  | { ok: false; reason: 'permission' | 'unsupported' | 'network' | 'disabled' };

export function registerForPushNotifications(): Promise<RegisterPushResult> {
  if (_registerInFlight) return _registerInFlight;

  _registerInFlight = (async (): Promise<RegisterPushResult> => {
    try {
      const resolved = await getPushToken();
      if (resolved.reason) return { ok: false, reason: resolved.reason };


      // The user switched push off — never re-create the row
      if (!(await isPushEnabled())) return { ok: false, reason: 'disabled' };


      // Device.isDevice held in getPushToken, so OS is ios/android
      await registerPushToken(
        resolved.token,
        Platform.OS === 'ios' ? 'ios' : 'android',
        i18n.language === 'en' ? 'en' : 'lt',
      );


      try {
        await AsyncStorage.setItem(LAST_PUSH_TOKEN_KEY, resolved.token);
      } catch {
        // Best-effort — the memo still covers this session
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'network' };
    } finally {
      _registerInFlight = null;
    }
  })();
  return _registerInFlight;
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
// The token to DELETE is resolved in fallback order: the
// session memo, the persisted last-registered token, and
// finally a fresh device read — the last ONLY when permission
// is already granted, because logout and toggle-off must never
// fire a permission prompt. Only when none resolves is there
// nothing the backend could hold. An in-flight registration is
// awaited first so it cannot re-create the row afterwards.
//
// Logout calls this DETACHED after local teardown with the
// auth token it captured first — the stored session is gone by
// then, so the forwarded header is what authenticates.
//
// Used by:
//   - context/AuthContext.tsx — logout / hydration cleanup
//     when the master switch is off
//   - app/(main)/tabs/settings.tsx — push toggle off
// -----------------------------------------------------------

export async function unregisterPushNotifications(authToken?: string | null): Promise<void> {
  if (_registerInFlight) {
    try {
      await _registerInFlight;
    } catch {
      // A failed registration is this function's head start
    }
  }


  let token = _pushToken;

  if (!token) {
    try {
      token = await AsyncStorage.getItem(LAST_PUSH_TOKEN_KEY);
    } catch {
      // Unreadable storage — the device probe below still runs
    }
  }

  if (!token && Platform.OS !== 'web' && Device.isDevice) {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        token = (await Notifications.getExpoPushTokenAsync()).data;
      }
    } catch {
      // No resolvable token — nothing registered to remove
    }
  }

  if (!token) return;


  try {
    await unregisterPushToken(token, authToken);
  } catch {
    // Best-effort — see the banner
  } finally {
    // LAST_PUSH_TOKEN_KEY stays on purpose: after a failed
    // DELETE it is the pending retry for the next call, and a
    // retry after success is an idempotent server-side no-op
    _pushToken = null;
  }
}







// -----------------------------------------------------------
// setupNotificationChannel
// -----------------------------------------------------------
//
// Android 8+ requires a channel before any notification shows.
// The name is user-visible in system settings, so it goes
// through i18n — re-creating the SAME channel id just updates
// the name in place, which is why AppContext calls this again
// whenever the app language changes.
//
// Used by:
//   - app/_layout.tsx — once at startup
//   - context/AppContext.tsx — language change re-name
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
// news. Only string values survive — the payload crosses the
// push service untyped, and a number or object here would leak
// into code that routes on strings. Null when nothing usable
// remains.
//
// Used by:
//   - app/_layout.tsx — notification tap listener
// -----------------------------------------------------------

export function getNotificationData(notification: {
  request: { content: { data?: Record<string, unknown> } };
}): Record<string, string> | null {
  const data = notification.request.content.data;
  if (!data || typeof data !== 'object') return null;


  const entries = Object.entries(data).filter(
    (pair): pair is [string, string] => typeof pair[1] === 'string',
  );
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}


// Re-exported so the tap listener can type its callback
export type { Notification } from 'expo-notifications';
