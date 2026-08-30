// -----------------------------------------------------------
//  [*] AppContext — device-local app settings
//
//  Language, theme, notification master switch and the pinned
//  tab set — everything the user can change without an
//  account. Settings persist to AsyncStorage under
//  'app_settings' and hydrate on startup; nothing here talks
//  to the backend.
//
//  Theme is a three-way setting (light / dark / system); the
//  context also exposes the RESOLVED `scheme` ('light' or
//  'dark') that the root layout and useTheme() act on, so
//  switching the OS appearance restyles the app live while
//  the setting stays 'system'.
//
//  The persist effect is gated until hydration finishes —
//  otherwise the mount-time persist of defaults races the
//  hydration read and can clobber stored settings.
//
//  Split into:
//
//    AppAction / initialState — reducer plumbing
//    appReducer               — pure settings transitions
//    AppProvider              — hydration, persistence, setters
//    useApp                   — the consumer hook
// -----------------------------------------------------------

// The shared tab roster names the keys that stay pinned
import { HARD_PINNED_TABS } from '@/constants/tabs';

// Settings shape and i18n side-effects
import i18n, { deviceLanguage } from '@/i18n';
import { AppSettings, ThemeSetting } from '@/types';

// Android channel rename follows the app language
import { setupNotificationChannel } from '@/services/notifications';

// Persistence and scheme resolution
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';


// One action per setting plus whole-object hydration; a plain
// union keeps the reducer exhaustive under TypeScript
type AppAction =
  | { type: 'HYDRATE'; payload: AppSettings }
  | { type: 'SET_LANGUAGE'; payload: 'lt' | 'en' }
  | { type: 'SET_THEME'; payload: ThemeSetting }
  | { type: 'SET_NOTIFICATIONS'; payload: boolean }
  | { type: 'SET_PINNED_TABS'; payload: string[] }
  | { type: 'RESET' };

// Defaults for a fresh install; language is corrected to the
// device locale during hydration when nothing is stored yet
const initialState: AppSettings = {
  language: 'lt',
  theme: 'system',
  notifications: true,
  pinnedTabs: ['news', 'messages', 'schedule', 'id'],
};

interface AppContextType extends AppSettings {
  scheme: 'light' | 'dark';
  // True once the stored settings have been read — before
  // that, `language` is still the reducer's placeholder and
  // may flip right after mount, so screens that fetch per
  // language wait for this to avoid a double load
  hydrated: boolean;
  setLanguage: (language: 'lt' | 'en') => void;
  setTheme: (theme: ThemeSetting) => void;
  setNotifications: (enabled: boolean) => void;
  setPinnedTabs: (tabs: string[]) => void;
  resetSettings: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// News and messages stay pinned no matter what the caller passes
const ensureHardPinned = (tabs: string[]) =>
  Array.from(new Set([...HARD_PINNED_TABS, ...tabs]));







// -----------------------------------------------------------
// appReducer
// -----------------------------------------------------------
//
// Pure transitions; side-effects (i18n, persistence) live in
// the provider.
//
// Used by:
//   - AppProvider (below)
// -----------------------------------------------------------

function appReducer(state: AppSettings, action: AppAction): AppSettings {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: action.payload };
    case 'SET_PINNED_TABS':
      return { ...state, pinnedTabs: ensureHardPinned(action.payload) };
    case 'RESET':
      // Fresh copies — handing out the shared initialState by
      // reference would let a later mutation corrupt the defaults
      return { ...initialState, pinnedTabs: [...initialState.pinnedTabs] };
    default:
      return state;
  }
}







// -----------------------------------------------------------
// AppProvider
// -----------------------------------------------------------
//
// Hydrates settings once on mount, persists on every change
// after that, and keeps i18n's active language in sync with
// the language setting.
//
// Used by:
//   - app/_layout.tsx — wraps the whole app
// -----------------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const systemScheme = useSystemScheme();


  // Resolve the three-way setting to what actually renders
  const scheme: 'light' | 'dark' =
    state.theme === 'system' ? (systemScheme ?? 'light') : state.theme;


  // Hydrate once; on a fresh install fall back to the DEVICE
  // locale for language (i18n's deviceLanguage — Lithuanian
  // devices get lt, everything else en). A corrupt record is
  // deleted so defaults persist cleanly from then on.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('app_settings');
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppSettings>;
          dispatch({
            type: 'HYDRATE',
            payload: {
              language: parsed.language === 'en' ? 'en' : 'lt',
              theme:
                parsed.theme === 'light' || parsed.theme === 'dark'
                  ? parsed.theme
                  : 'system',
              notifications:
                typeof parsed.notifications === 'boolean'
                  ? parsed.notifications
                  : true,
              pinnedTabs: ensureHardPinned(
                Array.isArray(parsed.pinnedTabs)
                  ? parsed.pinnedTabs.filter(
                      (tab): tab is string => typeof tab === 'string',
                    )
                  : initialState.pinnedTabs,
              ),
            },
          });
        } else {
          dispatch({ type: 'SET_LANGUAGE', payload: deviceLanguage });
        }
      } catch {
        // Unreadable settings — keep defaults and drop the record
        // so the next change persists over a clean slate
        AsyncStorage.removeItem('app_settings').catch(() => {});
      } finally {
        setHydrated(true);
      }
    })();
  }, []);


  // i18n follows the language setting once hydration has settled
  // it — the gate is React state (not a ref) so this re-fires
  // when hydration completes even if the stored language equals
  // the default. The Android channel is re-created under the
  // same id afterwards so its user-visible name tracks the app
  // language.
  useEffect(() => {
    if (!hydrated) return;
    const applied: Promise<unknown> =
      i18n.language !== state.language
        ? i18n.changeLanguage(state.language)
        : Promise.resolve();
    applied.then(() => setupNotificationChannel()).catch(() => {});
  }, [hydrated, state.language]);


  // Persist after hydration only — see the file header
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem('app_settings', JSON.stringify(state)).catch(() => {});
  }, [hydrated, state]);


  // Stable setter identities (dispatch never changes) and a
  // memoized value — consumers can list any of these in effect
  // dependency arrays or hand them to memoized children
  const setLanguage = useCallback(
    (language: 'lt' | 'en') => dispatch({ type: 'SET_LANGUAGE', payload: language }),
    [],
  );
  const setTheme = useCallback(
    (theme: ThemeSetting) => dispatch({ type: 'SET_THEME', payload: theme }),
    [],
  );
  const setNotifications = useCallback(
    (enabled: boolean) => dispatch({ type: 'SET_NOTIFICATIONS', payload: enabled }),
    [],
  );
  const setPinnedTabs = useCallback(
    (tabs: string[]) => dispatch({ type: 'SET_PINNED_TABS', payload: tabs }),
    [],
  );
  const resetSettings = useCallback(() => dispatch({ type: 'RESET' }), []);


  const value = useMemo<AppContextType>(
    () => ({
      ...state,
      scheme,
      hydrated,
      setLanguage,
      setTheme,
      setNotifications,
      setPinnedTabs,
      resetSettings,
    }),
    [state, scheme, hydrated, setLanguage, setTheme, setNotifications, setPinnedTabs, resetSettings],
  );


  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}







// -----------------------------------------------------------
// useApp
// -----------------------------------------------------------
//
// Used by:
//   - app/_layout.tsx — theme vars + navigation theme
//   - app/(main)/tabs/_layout.tsx — pinned tab visibility
//   - app/(main)/tabs/settings.tsx — every setting control
//   - components/Sidebar.tsx — pin toggles
//   - hooks/useTheme.ts — resolved scheme + palette
// -----------------------------------------------------------

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
