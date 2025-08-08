import i18n from '@/i18n';
import { AppSettings } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useReducer } from 'react';

// App Actions
type AppAction =
  | { type: 'SET_LANGUAGE'; payload: 'lt' | 'en' }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'TOGGLE_NOTIFICATIONS' }
  | { type: 'RESET_SETTINGS' }
  | { type: 'SET_PINNED_TABS'; payload: string[] };

// App Context Type
interface AppContextType extends AppSettings {
  setLanguage: (language: 'lt' | 'en') => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleNotifications: () => void;
  resetSettings: () => void;
  setPinnedTabs: (tabs: string[]) => void;
}

// Initial State
const initialState: AppSettings = {
  language: 'lt',
  theme: 'light',
  notifications: true,
  pinnedTabs: ['news', 'messages', 'schedule'],
};

// App Reducer
const appReducer = (state: AppSettings, action: AppAction): AppSettings => {
  switch (action.type) {
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'TOGGLE_NOTIFICATIONS':
      return { ...state, notifications: !state.notifications };
    case 'RESET_SETTINGS':
      return initialState;
    case 'SET_PINNED_TABS':
      return { ...state, pinnedTabs: action.payload };
    default:
      return state;
  }
};

// Create Context
const AppContext = createContext<AppContextType | undefined>(undefined);

// App Provider
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Hydrate persisted settings
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('app_settings');
        if (raw) {
          const parsed = JSON.parse(raw) as AppSettings;
          if (parsed.language) i18n.changeLanguage(parsed.language);
          dispatch({ type: 'SET_LANGUAGE', payload: parsed.language || 'lt' });
          dispatch({ type: 'SET_THEME', payload: parsed.theme || 'light' });
          if (typeof parsed.notifications === 'boolean') {
            if (parsed.notifications !== state.notifications) {
              dispatch({ type: 'TOGGLE_NOTIFICATIONS' });
            }
          }
          if (Array.isArray((parsed as any).pinnedTabs)) {
            const loaded = (parsed as any).pinnedTabs as string[];
            const ensured = Array.from(new Set(['news', 'messages', ...loaded]));
            dispatch({ type: 'SET_PINNED_TABS', payload: ensured });
          }
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist settings
  useEffect(() => {
    AsyncStorage.setItem('app_settings', JSON.stringify(state)).catch(() => {});
  }, [state]);

  const setLanguage = (language: 'lt' | 'en') => {
    i18n.changeLanguage(language);
    dispatch({ type: 'SET_LANGUAGE', payload: language });
  };

  const setTheme = (theme: 'light' | 'dark') => {
    dispatch({ type: 'SET_THEME', payload: theme });
  };

  const toggleNotifications = () => {
    dispatch({ type: 'TOGGLE_NOTIFICATIONS' });
  };

  const resetSettings = () => {
    dispatch({ type: 'RESET_SETTINGS' });
  };

  const setPinnedTabs = (tabs: string[]) => {
    const ensured = Array.from(new Set(['news', 'messages', ...tabs]));
    dispatch({ type: 'SET_PINNED_TABS', payload: ensured });
  };

  const value: AppContextType = {
    ...state,
    setLanguage,
    setTheme,
    toggleNotifications,
    resetSettings,
    setPinnedTabs,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// Custom Hook
export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};