// -----------------------------------------------------------
//  [*] Tests — AppProvider hydration and persistence
//
//  Device-local settings rules: a stored blob hydrates (and a
//  corrupt one is sanitized; an old blob's `notifications`
//  key is simply ignored), a fresh install falls back to the
//  device language, i18n follows the hydrated language, and
//  the persist effect is gated until hydration finishes so
//  mount-time defaults can never clobber the stored record.
//  Hydration itself writes nothing back — the legacy blob
//  survives verbatim, `notifications` key included, until the
//  first real change rewrites it sanitized; that ordering is
//  what lets services/notifyEngine.ts bridge the old master
//  switch on startup.
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { AppProvider, useApp } from '@/context/AppContext';


const mockChangeLanguage = jest.fn(async (_language: string) => {});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
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
    // The junk entry is dropped and the hard pins re-imposed
    expect(result.current.pinnedTabs).toEqual(['news', 'messages', 'schedule']);

    // i18n follows the hydrated language, not the reducer default
    await waitFor(() => expect(mockChangeLanguage).toHaveBeenCalledWith('en'));

    // Hydration writes NOTHING back: the stored blob keeps its
    // legacy `notifications` key for the notify bridge to read
    await act(async () => {});
    expect(storedBlobs()).toEqual([]);
    const raw = await AsyncStorage.getItem('app_settings');
    expect(JSON.parse(raw as string).notifications).toBe(false);
  });


  it('the first real change writes exactly once, sanitized — the legacy key goes with it', async () => {
    await AsyncStorage.setItem(
      'app_settings',
      JSON.stringify({ language: 'en', theme: 'system', notifications: false, pinnedTabs: ['news', 'messages'] }),
    );
    (AsyncStorage.setItem as jest.Mock).mockClear();

    const { result } = await renderApp();
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {});
    expect(storedBlobs()).toEqual([]);

    await act(async () => {
      result.current.setTheme('dark');
    });

    await waitFor(() => expect(storedBlobs()).toHaveLength(1));
    expect(storedBlobs()[0]).toEqual({ language: 'en', theme: 'dark', pinnedTabs: ['news', 'messages'] });
    expect(storedBlobs()[0]).not.toHaveProperty('notifications');
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
  it('switches i18n to the new language', async () => {
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

    await act(async () => {
      result.current.setLanguage('en');
    });

    await waitFor(() => expect(mockChangeLanguage).toHaveBeenCalledWith('en'));
    const last = storedBlobs().at(-1);
    expect(last?.language).toBe('en');
  });
});
