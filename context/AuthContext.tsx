import { ApiError, fetchMe, loginApi, logoutApi, registerApi } from '@/services/api';
import { connectSocket, disconnectSocket } from '@/services/socket';
import { AuthState, User } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useReducer } from 'react';

// Auth Actions
type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'SET_USER'; payload: User };

// Auth Context Type
interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (params: {
    invitation_code?: string;
    username: string;
    password: string;
    display_name: string;
    email: string;
  }) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  error: string | null;
}

// Initial State
const initialState: AuthState & { error: string | null } = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: false,
  error: null,
};

// Auth Reducer
const authReducer = (state: typeof initialState, action: AuthAction): typeof initialState => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true, error: null };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        loading: false,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        error: null,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        loading: false,
        isAuthenticated: false,
        user: null,
        token: null,
        error: action.payload,
      };
    case 'LOGOUT':
      return { ...initialState };
    case 'SET_USER':
      return { ...state, user: action.payload };
    default:
      return state;
  }
};

// Create Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Hydrate auth state from storage, then verify token with /me
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('auth');
        if (!raw) return;

        const parsed = JSON.parse(raw) as { user: User; token: string };
        // Optimistically restore so the user isn't blocked
        dispatch({ type: 'LOGIN_SUCCESS', payload: parsed });

        // Verify the session is still valid
        try {
          const freshUser = await fetchMe();
          dispatch({ type: 'SET_USER', payload: freshUser });
          // Connect socket for real-time features
          connectSocket();
        } catch {
          // Session expired/invalid — log out
          await AsyncStorage.removeItem('auth');
          disconnectSocket();
          dispatch({ type: 'LOGOUT' });
        }
      } catch {
        // ignore hydration errors
      }
    })();
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const { user, token } = await loginApi(username, password);
      const payload = { user, token };
      await AsyncStorage.setItem('auth', JSON.stringify(payload));
      dispatch({ type: 'LOGIN_SUCCESS', payload });
      connectSocket();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Prisijungimo klaida';
      dispatch({ type: 'LOGIN_FAILURE', payload: message });
      throw err;
    }
  };

  const register = async (params: {
    invitation_code?: string;
    username: string;
    password: string;
    display_name: string;
    email: string;
  }): Promise<void> => {
    dispatch({ type: 'LOGIN_START' });

    try {
      const { user, token } = await registerApi(params);
      const payload = { user, token };
      await AsyncStorage.setItem('auth', JSON.stringify(payload));
      dispatch({ type: 'LOGIN_SUCCESS', payload });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Registracijos klaida';
      dispatch({ type: 'LOGIN_FAILURE', payload: message });
      throw err;
    }
  };

  const logout = async () => {
    disconnectSocket();
    await logoutApi();
    await AsyncStorage.removeItem('auth');
    dispatch({ type: 'LOGOUT' });
  };

  const setUser = (user: User) => {
    dispatch({ type: 'SET_USER', payload: user });
  };

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom Hook
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
