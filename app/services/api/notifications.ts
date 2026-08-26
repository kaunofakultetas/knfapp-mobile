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
// Used by:
//   - services/notifications.ts — after login / permission grant
// -----------------------------------------------------------

export const registerPushToken = (
  token: string,
  platform: 'ios' | 'android' | 'web' | 'unknown' = 'unknown',
) =>
  request(
    api.post<{ registered: boolean; tokenId: string }>('/notifications/register', {
      token,
      platform,
    }),
  );







// -----------------------------------------------------------
// unregisterPushToken
// -----------------------------------------------------------
//
// Never throws — logout must complete even when the server
// refuses or is unreachable; a stale token on the server is
// harmless and expires on its own.
//
// Used by:
//   - services/notifications.ts — during logout
// -----------------------------------------------------------

export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await api.delete('/notifications/register', { data: { token } });
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
