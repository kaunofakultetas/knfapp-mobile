// -----------------------------------------------------------
//  [*] Tests — the crash screen never sits under the splash
//
//  The root layout keeps the native splash up until the font
//  gate's effect hides it — an effect that never runs when
//  something under the gate throws at render time, so the
//  crash screen rendered under an opaque splash. Both halves
//  of the fix are pinned at the host level: the root
//  boundary's onError drops the splash (with the fallback
//  itself mocked out, so only onError can be the caller), and
//  the real ErrorFallback drops it on mount (which also covers
//  a re-crash after Try Again, where onError stays silent).
// -----------------------------------------------------------

import { render } from '@testing-library/react-native';

import * as SplashScreen from 'expo-splash-screen';

import { logError } from '@/services/log';

// Relative on purpose: under jest the '@/' mapper resolves
// '@/app/…' entries to app.json, not to the route files
import RootLayout from '../app/_layout';

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));
jest.mock('@/services/log', () => ({ logError: jest.fn(), getErrorLog: () => [] }));

// react-error-boundary ships ESM only and sits outside the
// jest transform allowlist — this stand-in keeps the three
// props the layout uses (FallbackComponent, onError, onReset)
// with the library's semantics: componentDidCatch reports,
// the fallback renders with the error and a reset door
jest.mock('react-error-boundary', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach React
  const React = require('react') as typeof import('react');
  // No type alias in here — the hoist guard reads one as an
  // out-of-scope variable — so the props stay inline
  class ErrorBoundary extends React.Component<
    {
      FallbackComponent: React.ComponentType<{ error: unknown; resetErrorBoundary: () => void }>;
      onError?: (error: Error, info: { componentStack?: string | null }) => void;
      onReset?: () => void;
      children?: React.ReactNode;
    },
    { error: Error | null }
  > {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) {
      return { error };
    }
    componentDidCatch(error: Error, info: { componentStack?: string | null }) {
      this.props.onError?.(error, info);
    }
    render() {
      if (this.state.error) {
        const Fallback = this.props.FallbackComponent;
        return React.createElement(Fallback, {
          error: this.state.error,
          resetErrorBoundary: () => {
            this.props.onReset?.();
            this.setState({ error: null });
          },
        });
      }
      return this.props.children;
    }
  }
  return { ErrorBoundary };
});

// The layout's side-effect imports and its shell, mocked flat
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../global.css', () => ({}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children?: unknown }) => children as never,
}));
jest.mock('react-native-toast-message', () => () => null);
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-router', () => {
  const Stack = ({ children }: { children?: unknown }) => children as never;
  Stack.Screen = () => null;
  return { router: { replace: jest.fn() }, Stack };
});
// The theme constants spread DefaultTheme.colors at load, so
// the navigation module stays real bar the provider itself
jest.mock('expo-router/react-navigation', () => ({
  ...jest.requireActual<typeof import('expo-router/react-navigation')>('expo-router/react-navigation'),
  ThemeProvider: ({ children }: { children?: unknown }) => children as never,
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@knf/dataengine', () => ({
  DataEngineProvider: ({ children }: { children?: unknown }) => children as never,
}));
jest.mock('@/context/AppContext', () => ({
  AppProvider: ({ children }: { children?: unknown }) => children as never,
  useApp: () => ({ scheme: 'light' }),
}));
jest.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children?: unknown }) => children as never,
}));
jest.mock('@/context/NetworkContext', () => ({
  NetworkProvider: ({ children }: { children?: unknown }) => children as never,
}));
jest.mock('@/components/ui', () => ({ ConfirmHost: () => null, toastConfig: {} }));
jest.mock('@/components/OfflineBanner', () => () => null);

// The crash: the push host throws while rendering, inside the
// navigation shell — exactly where the font gate's hide has
// not run yet
jest.mock('@/components/notify/NotifyEngineHost', () => () => {
  throw new Error('boom at render');
});

// The boundary case renders a stand-in fallback, so the only
// thing that can drop the splash there is onError; the mount
// case reaches the REAL component through requireActual
jest.mock('@/components/ErrorFallback', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach the primitives
  const { Text } = require('react-native');
  const Marker = () => <Text>crash-screen</Text>;
  return { __esModule: true, default: Marker, ErrorFallback: Marker };
});


const hideAsync = SplashScreen.hideAsync as jest.Mock;

let consoleError: jest.SpyInstance;
beforeEach(() => {
  hideAsync.mockClear();
  (logError as jest.Mock).mockClear();
  // React reports the caught render error on the console
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});


describe('a render-time crash under the font gate', () => {
  it('reaches the root boundary, which drops the splash before logging', async () => {
    const view = await render(<RootLayout />);
    expect(view.getByText('crash-screen')).toBeTruthy();
    expect(hideAsync).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('crash', expect.objectContaining({ message: 'boom at render' }), expect.anything());
  });
});


describe('the crash screen itself', () => {
  it('drops the splash on mount — a re-crash after Try Again gets no onError', async () => {
    const { default: RealErrorFallback } = jest.requireActual<typeof import('@/components/ErrorFallback')>('@/components/ErrorFallback');
    const view = await render(<RealErrorFallback error={new Error('again')} resetErrorBoundary={() => {}} />);
    expect(view.getByText('error.title')).toBeTruthy();
    expect(hideAsync).toHaveBeenCalledTimes(1);
    // The stand-in above is not what rendered here
    expect(view.queryByText('crash-screen')).toBeNull();
  });
});
