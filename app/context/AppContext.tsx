// -----------------------------------------------------------
//  [*] AppContext — device-local app settings
//
//  Language, theme and the pinned tab set — everything the
//  user can change without an account. Settings persist to
//  AsyncStorage under 'app_settings' and hydrate on startup;
//  nothing here talks to the backend. The push master switch
//  is NOT a setting here: it is the notification engine's own
//  key, and the engine host re-applies the Android channel
//  names when the language changes — this context only keeps
//  i18n in step with the language setting.
//
//  Theme is a three-way setting (light / dark / system); the
//  context also exposes the RESOLVED `scheme` ('light' or
//  'dark') that the root layout and useTheme() act on, so
//  switching the OS appearance restyles the app live while
//  the setting stays 'system'.
//
//  Persistence writes only what the user CHANGED: the persist
//  effect is gated until hydration finishes (otherwise the
//  mount-time persist of defaults races the hydration read and
//  can clobber stored settings) and skips the hydrated record
//  itself. That second gate is load-bearing for the one-time
//  legacy bridge: blobs from older app versions carry a
//  `notifications` boolean that services/notifyEngine.ts reads
//  on startup — re-persisting the sanitized record on every
//  launch would drop that key before the bridge ever saw it.
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
  | { type: 'SET_PINNED_TABS'; payload: string[] }
  | { type: 'RESET' };

// Defaults for a fresh install; language is corrected to the
// device locale during hydration when nothing is stored yet
const initialState: AppSettings = {
  language: 'lt',
  theme: 'system',
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
// Hydrates settings once on mount, persists every change made
// after that, and keeps i18n's active language in sync with
// the language setting.
//
// Used by:
//   - app/_layout.tsx — wraps the whole app
// -----------------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  // The record hydration produced (by identity) — the persist
  // effect writes only once `state` has moved past it
  const [hydratedState, setHydratedState] = useState<AppSettings>(initialState);
  const systemScheme = useSystemScheme();


  // Resolve the three-way setting to what actually renders
  const scheme: 'light' | 'dark' =
    state.theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : state.theme;


  // Hydrate once; on a fresh install fall back to the DEVICE
  // locale for language (i18n's deviceLanguage — Lithuanian
  // devices get lt, everything else en). Unknown keys in the
  // record (the old `notifications` flag) are simply not
  // copied. A corrupt record is deleted so defaults persist
  // cleanly from then on.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('app_settings');
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppSettings>;
          const payload: AppSettings = {
            language: parsed.language === 'en' ? 'en' : 'lt',
            theme:
              parsed.theme === 'light' || parsed.theme === 'dark'
                ? parsed.theme
                : 'system',
            pinnedTabs: ensureHardPinned(
              Array.isArray(parsed.pinnedTabs)
                ? parsed.pinnedTabs.filter(
                    (tab): tab is string => typeof tab === 'string',
                  )
                : initialState.pinnedTabs,
            ),
          };
          setHydratedState(payload);
          dispatch({ type: 'HYDRATE', payload });
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
  // the default
  useEffect(() => {
    if (!hydrated) return;
    if (i18n.language !== state.language) {
      i18n.changeLanguage(state.language).catch(() => {});
    }
  }, [hydrated, state.language]);


  // Persist after hydration only, and only what moved past the
  // hydrated record — see the file header for why the record
  // itself is never rewritten on launch
  useEffect(() => {
    if (!hydrated || state === hydratedState) return;
    AsyncStorage.setItem('app_settings', JSON.stringify(state)).catch(() => {});
  }, [hydrated, state, hydratedState]);


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
      setPinnedTabs,
      resetSettings,
    }),
    [state, scheme, hydrated, setLanguage, setTheme, setPinnedTabs, resetSettings],
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
//   - app/(main)/tabs/settings.tsx — theme, language, reset
//   - app/(main)/info/index.tsx — language (and the hydrated
//     gate) for the per-language faculty info fetch
//   - components/Sidebar.tsx — theme/language pills, pin toggles
//   - components/navigation/TabBar.tsx — pinned tabs decide
//     which items render
//   - hooks/useTheme.ts — resolved scheme + palette
// -----------------------------------------------------------

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
