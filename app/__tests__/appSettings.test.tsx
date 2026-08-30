// -----------------------------------------------------------
//  [*] Tests — AppProvider hydration and persistence
//
//  Device-local settings rules: a stored blob hydrates (and a
//  corrupt one is sanitized), a fresh install falls back to
//  the device language, i18n follows the hydrated language,
//  and the persist effect is gated until hydration finishes so
//  mount-time defaults can never clobber the stored record.
// -----------------------------------------------------------

const mockChangeLanguage = jest.fn(async (_language: string) => {});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    language: 'lt',
    changeLanguage: (language: string) => mockChangeLanguage(language),
    t: (key: string) => key,
  },
  deviceLanguage: 'en',
}));
jest.mock('@/services/notifications', () => ({ setupNotificationChannel: jest.fn(async () => {}) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { AppProvider, useApp } from '@/context/AppContext';


const renderApp = () => renderHook(() => useApp(), { wrapper: AppProvider });

const storedBlobs = () =>
  (AsyncStorage.setItem as jest.Mock).mock.calls
    .filter(([key]) => key === 'app_settings')
    .map(([, raw]) => JSON.parse(raw as string));


describe('AppProvider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });


  it('hydrates the stored settings, sanitizing what it finds', async () => {
    await AsyncStorage.setItem(
      'app_settings',
      JSON.stringify({ language: 'en', theme: 'dark', notifications: false, pinnedTabs: ['schedule', 7] }),
    );
    (AsyncStorage.setItem as jest.Mock).mockClear();

    const { result } = await renderApp();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.language).toBe('en');
    expect(result.current.theme).toBe('dark');
    expect(result.current.scheme).toBe('dark');
    expect(result.current.notifications).toBe(false);
    // The junk entry is dropped and the hard pins re-imposed
    expect(result.current.pinnedTabs).toEqual(['news', 'messages', 'schedule']);

    // i18n follows the hydrated language, not the reducer default
    await waitFor(() => expect(mockChangeLanguage).toHaveBeenCalledWith('en'));
  });


  it('falls back to the device language on a fresh install', async () => {
    const { result } = await renderApp();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.language).toBe('en');
  });


  it('never persists the pre-hydration defaults over the stored record', async () => {
    await AsyncStorage.setItem('app_settings', JSON.stringify({ language: 'en' }));
    (AsyncStorage.setItem as jest.Mock).mockClear();

    const { result } = await renderApp();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {});

    // Every write that happened carries the HYDRATED language —
    // the reducer's 'lt' placeholder must never reach storage
    for (const blob of storedBlobs()) {
      expect(blob.language).toBe('en');
    }
  });


  it('persists a change and keeps the hard-pinned tabs', async () => {
    const { result } = await renderApp();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      result.current.setPinnedTabs(['id']);
      result.current.setTheme('dark');
    });
    expect(result.current.pinnedTabs).toEqual(['news', 'messages', 'id']);
    expect(result.current.scheme).toBe('dark');

    await waitFor(() => {
      const blobs = storedBlobs();
      const last = blobs[blobs.length - 1];
      expect(last).toMatchObject({ theme: 'dark', pinnedTabs: ['news', 'messages', 'id'] });
    });
  });

});


describe('language change side effects', () => {
  it('switches i18n and re-creates the Android channel under the new name', async () => {
    const { setupNotificationChannel } = require('@/services/notifications');
    // Stored 'lt' matches the i18n mock's language, so hydration
    // itself changes nothing — only the later setLanguage does
    await AsyncStorage.setItem(
      'app_settings',
      JSON.stringify({
        language: 'lt',
        theme: 'system',
        notifications: true,
        pinnedTabs: ['news', 'messages', 'id'],
      }),
    );
    const { result } = await renderApp();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    mockChangeLanguage.mockClear();
    (setupNotificationChannel as jest.Mock).mockClear();

    await act(async () => {
      result.current.setLanguage('en');
    });

    await waitFor(() => expect(mockChangeLanguage).toHaveBeenCalledWith('en'));
    // Same channel id, new user-visible name — Android renames in place
    await waitFor(() => expect(setupNotificationChannel).toHaveBeenCalled());
    const last = storedBlobs().at(-1);
    expect(last?.language).toBe('en');
  });

  it('persists the notifications master switch', async () => {
    const { result } = await renderApp();
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      result.current.setNotifications(false);
    });
    expect(storedBlobs().at(-1)?.notifications).toBe(false);
  });
});
