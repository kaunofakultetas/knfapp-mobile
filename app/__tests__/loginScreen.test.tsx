// -----------------------------------------------------------
//  [*] Tests — the login screen
//
//  A sign-in is single-flight: two presses inside one frame
//  (or Done plus the button) used to pass the `loading` guard
//  twice and mint two sessions. And the form's top bar is the
//  app's own StackHeader — the same chevron and label as every
//  pushed screen — whose back returns to the welcome pitch.
// -----------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import LoginScreen from '@/app/login';


jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../components/logoknf.svg', () => () => null);
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ scheme: 'light', colors: jest.requireActual('@/constants/theme').palettes.light }),
}));

// The auth action, observed (and held pending) per test
const mockLogin = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: (...args: unknown[]) => mockLogin(...args), loading: false }),
}));

// The post-login redirect, observed
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => false }),
}));







// -----------------------------------------------------------
// showForm
// -----------------------------------------------------------
//
// A returning user lands straight on the credential form
//
// Used by:
//   - every test below
// -----------------------------------------------------------

const showForm = async () => {
  await AsyncStorage.setItem('onboarded', '1');
  await render(<LoginScreen />);
  return screen.findByLabelText(i18n.t('login.usernameLabel'));
};


describe('LoginScreen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });


  it('a double submit signs in ONCE', async () => {
    let finish: () => void = () => {};
    mockLogin.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));

    const username = await showForm();
    await fireEvent.changeText(username, 'ona.k');
    await fireEvent.changeText(screen.getByLabelText(i18n.t('login.passwordLabel')), 'slaptas1');

    // Two submits inside ONE frame (the keyboard's Done twice,
    // or Done plus the button) — before any re-render could
    // flip `loading`, so only the ref latch can stop the second
    const password = screen.getByLabelText(i18n.t('login.passwordLabel'));
    await act(async () => {
      password.props.onSubmitEditing();
      password.props.onSubmitEditing();
    });
    await act(async () => finish());

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith('ona.k', 'slaptas1');
  });

  it('caps the identifier at the e-mail limit and the password far above bcrypt\u2019s', async () => {
    const username = await showForm();
    expect(username.props.maxLength).toBe(254);
    expect(screen.getByLabelText(i18n.t('login.passwordLabel')).props.maxLength).toBe(256);
  });

  it('the top bar is the shared StackHeader — its back returns to the welcome pitch', async () => {
    await showForm();
    await fireEvent.press(screen.getByLabelText(i18n.t('header.back')));
    expect(await screen.findByText(i18n.t('login.welcomeTitle'))).toBeTruthy();
  });
});
