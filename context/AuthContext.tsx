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
  logout: () => void;
  setUser: (user: User) => void;
}

// Initial State
const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: false,
};

// Auth Reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        loading: false,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        loading: false,
        isAuthenticated: false,
        user: null,
        token: null,
      };
    case 'LOGOUT':
      return initialState;
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
  
  // Hydrate auth state from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('auth');
        if (raw) {
          const parsed = JSON.parse(raw) as { user: User; token: string };
          dispatch({ type: 'LOGIN_SUCCESS', payload: parsed });
        }
      } catch {
        // ignore hydration errors
      }
    })();
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    dispatch({ type: 'LOGIN_START' });
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock successful login
      const mockUser: User = {
        id: '1',
        username,
        email: `${username}@vu.lt`,
        displayName: username,
        role: 'student',
      };
      
      const mockToken = 'mock-jwt-token';
      const payload = { user: mockUser, token: mockToken };
      await AsyncStorage.setItem('auth', JSON.stringify(payload));
      dispatch({ type: 'LOGIN_SUCCESS', payload });
    } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE', payload: 'Prisijungimo klaida' });
      throw error;
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('auth');
    dispatch({ type: 'LOGOUT' });
  };

  const setUser = (user: User) => {
    dispatch({ type: 'SET_USER', payload: user });
  };

  const value: AuthContextType = {
    ...state,
    login,
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