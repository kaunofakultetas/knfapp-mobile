// -----------------------------------------------------------
//  [*] API — push notifications
//
//  Expo push token registration and the per-channel opt-out
//  switches. Token registration is tied to the session, so
//  services/notifications.ts registers after login and
//  unregisters (best-effort) during logout.
//
//  Split into:
//
//    NotificationChannel          — the four channel names
//    NotificationChannelsResponse — channel → enabled map
//    registerPushToken            — register a device token
//    unregisterPushToken          — remove it, never throws
//    fetchNotificationChannels    — current channel switches
//    updateNotificationChannels   — save switch changes
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';

// Active language — the register payload's default
import i18n from '@/i18n';







// -----------------------------------------------------------
// NotificationChannel
// -----------------------------------------------------------
//
// Used by:
//   - NotificationChannelsResponse, updateNotificationChannels (below)
//   - app/(main)/tabs/settings.tsx — the switch list
// -----------------------------------------------------------

export type NotificationChannel = 'news' | 'chat' | 'schedule' | 'admin';







// -----------------------------------------------------------
// NotificationChannelsResponse
// -----------------------------------------------------------
//
// Used by:
//   - fetchNotificationChannels, updateNotificationChannels (below)
//   - app/(main)/tabs/settings.tsx — switch state
// -----------------------------------------------------------

export interface NotificationChannelsResponse {
  channels: Record<NotificationChannel, boolean>;
}







// -----------------------------------------------------------
// registerPushToken
// -----------------------------------------------------------
//
// The payload carries the app language so the backend sends
// push copy the user actually reads — defaulted from the live
// i18n instance, so re-registering after a language switch in
// Settings refreshes the stored value.
//
// Used by:
//   - services/notifications.ts — after login / permission
//     grant / language switch
// -----------------------------------------------------------

export const registerPushToken = (
  token: string,
  platform: 'ios' | 'android' | 'web' | 'unknown' = 'unknown',
  language?: 'lt' | 'en',
) =>
  request(
    api.post<{ registered: boolean; tokenId: string }>('/notifications/register', {
      token,
      platform,
      language: language ?? (i18n.language === 'en' ? 'en' : 'lt'),
    }),
  );







// -----------------------------------------------------------
// unregisterPushToken
// -----------------------------------------------------------
//
// Never throws — logout must complete even when the server
// refuses or is unreachable (the short 5 s timeout keeps an
// offline logout from hanging); a stale token on the server
// is harmless and expires on its own. Logout calls this
// DETACHED after local teardown with the auth token it
// captured first — the stored session is already gone by
// then, so the explicit header is what authenticates.
//
// Used by:
//   - services/notifications.ts — during logout
// -----------------------------------------------------------

export async function unregisterPushToken(
  token: string,
  authToken?: string | null,
): Promise<void> {
  try {
    await api.delete('/notifications/register', {
      data: { token },
      timeout: 5_000,
      ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    });
  } catch {
    // Best-effort — see the banner
  }
}







// -----------------------------------------------------------
// fetchNotificationChannels
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/settings.tsx — switch list load
// -----------------------------------------------------------

export const fetchNotificationChannels = () =>
  request(api.get<NotificationChannelsResponse>('/notifications/channels'));







// -----------------------------------------------------------
// updateNotificationChannels
// -----------------------------------------------------------
//
// Partial updates are fine — only the switches present in the
// map change; the response returns the full resulting state.
//
// Used by:
//   - app/(main)/tabs/settings.tsx — on switch toggle
// -----------------------------------------------------------

export const updateNotificationChannels = (
  channels: Partial<Record<NotificationChannel, boolean>>,
) => request(api.put<NotificationChannelsResponse>('/notifications/channels', { channels }));




// -----------------------------------------------------------
// fetchChatPreview / updateChatPreview
// -----------------------------------------------------------
//
// The "show message text in notifications" switch. Enabled
// (the default) ships a chat message's first 100 characters
// to the push service as the notification body; disabled
// sends a content-free "Nauja žinutė" instead, so private
// text never leaves the backend for offline delivery.
// Deliberately not part of the channels dict — it is a
// privacy preference, not a topic subscription.
//
// Used by:
//   - app/(main)/tabs/settings.tsx — the preview toggle
// -----------------------------------------------------------

export const fetchChatPreview = () =>
  request(api.get<{ enabled: boolean }>('/notifications/chat-preview'));

export const updateChatPreview = (enabled: boolean) =>
  request(api.put<{ enabled: boolean }>('/notifications/chat-preview', { enabled }));
