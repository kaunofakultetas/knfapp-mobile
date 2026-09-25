// -----------------------------------------------------------
//  [*] Tests — app/register account-field rules and 400 routing
//
//  The register form mirrors the backend's account-field
//  rules so a refusal lands on the field before a round trip:
//  the username shape (3–32 of [A-Za-z0-9._-]), the 254-char
//  e-mail cap, and the input caps that stop the extra
//  characters at the keyboard. And when the backend does
//  refuse with a 400, its machine code decides the sentence —
//  invalid_username reads as the username rule, an unknown
//  code as the generic 400 copy — never as "Invalid invitation
//  code", least of all when no code was typed.
//
//  Everything app-side is stubbed; the i18n singleton is
//  rebuilt from the real catalogs so apiErrorKey's exists()
//  answers for what is shipped.
// -----------------------------------------------------------

jest.mock('@/services/features', () => {
  const { TABS } = require('@/constants/tabs');
  return {
    isFeatureEnabled: () => true,
    FEATURES: { accounts: true, news: true, chat: true, social: true, schedule: true, assistant: true, studentId: true, map: true },
    ENABLED_TABS: TABS,
    ENABLED_TAB_KEYS: new Set(TABS.map((tab: { key: string }) => tab.key)),
    TAB_FEATURES: {},
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/i18n', () => {
  const { createInstance } = require('i18next');
  const lt = require('@/i18n/lt.json');
  const en = require('@/i18n/en.json');
  const instance = createInstance();
  void instance.init({
    lng: 'lt',
    fallbackLng: 'lt',
    resources: { lt: { translation: lt }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return { __esModule: true, default: instance, deviceLanguage: 'lt' };
});

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('@/components/QrScanner', () => ({
  __esModule: true,
  default: () => null,
  extractCode: (value: string) => value,
}));
jest.mock('@/constants/roles', () => ({ roleLabel: () => 'role' }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: { brand: '#7B003F', ink: '#111111', inkSoft: '#555555', danger: '#B00020', success: '#0A0' },
  }),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), canGoBack: () => false }),
}));

// The kit's Input keeps its label as the a11y label and shows
// the error line as text; Button is a labelled pressable
jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Pressable, Text, TextInput, View } = require('react-native');
  const Input = React.forwardRef(
    ({ label, error, ...rest }: { label?: string; error?: string }, ref: unknown) => (
      <View>
        <TextInput ref={ref} accessibilityLabel={label} {...rest} />
        {error ? <Text>{error}</Text> : null}
      </View>
    ),
  );
  const Button = ({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} disabled={disabled}>
      <Text>{title}</Text>
    </Pressable>
  );
  const Plain = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  return { Input, Button, Screen: Plain, EmptyState: () => null };
});

const mockRegister = jest.fn(async (_params: unknown) => {});
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ register: (params: unknown) => mockRegister(params), loading: false }),
}));

const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

const mockValidateCode = jest.fn(async (_code: string) => ({ valid: true }));
jest.mock('@/services/api', () => ({
  ApiError: jest.requireActual('@/services/api/client').ApiError,
  validateInvitationCode: (code: string) => mockValidateCode(code),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import RegisterScreen from '@/app/register';
import { ApiError } from '@/services/api/client';


const VALID = {
  username: 'ona.k',
  displayName: 'Ona K',
  email: 'ona@knf.lt',
  password: 'slaptas1',
};

// Fill the five account fields (the invitation code stays
// blank — guest registration) and press the submit button.
// RNTL 14 events are asynchronous — every one is awaited
async function submit(overrides: Partial<typeof VALID> = {}) {
  const values = { ...VALID, ...overrides };
  const screen = await render(<RegisterScreen />);
  await fireEvent.changeText(screen.getByLabelText('register.usernameLabel'), values.username);
  await fireEvent.changeText(screen.getByLabelText('register.displayNameLabel'), values.displayName);
  await fireEvent.changeText(screen.getByLabelText('register.emailLabel'), values.email);
  await fireEvent.changeText(screen.getByLabelText('register.passwordLabel'), values.password);
  await fireEvent.changeText(screen.getByLabelText('register.confirmPasswordLabel'), values.password);
  await act(async () => {
    await fireEvent.press(screen.getByLabelText('register.submit'));
  });
  return screen;
}


describe('RegisterScreen account-field rules', () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses a username outside the backend's shape on the field, before any request", async () => {
    const screen = await submit({ username: 'ona$k' });
    await waitFor(() => expect(screen.getByText('register.errors.usernameInvalid')).toBeTruthy());
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('refuses a username longer than 32 characters the same way', async () => {
    const screen = await submit({ username: 'a'.repeat(33) });
    await waitFor(() => expect(screen.getByText('register.errors.usernameInvalid')).toBeTruthy());
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('refuses an e-mail over 254 characters on the field, before any request', async () => {
    const screen = await submit({ email: `${'a'.repeat(250)}@x.lt` });
    await waitFor(() => expect(screen.getByText('register.errors.emailMax')).toBeTruthy());
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('caps the username and e-mail inputs at the backend limits', async () => {
    const screen = await render(<RegisterScreen />);
    expect(screen.getByLabelText('register.usernameLabel').props.maxLength).toBe(32);
    expect(screen.getByLabelText('register.emailLabel').props.maxLength).toBe(254);
  });

  it('sends a valid form as it is', async () => {
    await submit();
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(mockRegister).toHaveBeenCalledWith({
      username: 'ona.k',
      password: 'slaptas1',
      display_name: 'Ona K',
      email: 'ona@knf.lt',
    });
  });
});


describe('RegisterScreen 400 routing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a 400 invalid_username reads as the username rule — never as an invitation-code problem', async () => {
    mockRegister.mockRejectedValueOnce(new ApiError('Username must be…', 400, 'http', undefined, 'invalid_username'));
    await submit();
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    expect(mockShowToast).toHaveBeenCalledWith('error', 'register.errorTitle', 'errors.codes.invalid_username');
  });

  it('a 400 with a machine code the catalog does not know falls to the generic 400 copy', async () => {
    mockRegister.mockRejectedValueOnce(new ApiError('Something new', 400, 'http', undefined, 'some_future_rule'));
    await submit();
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    expect(mockShowToast).toHaveBeenCalledWith('error', 'register.errorTitle', 'errors.http.400');
  });

  it('a code-less 400 with no invitation code typed is the generic 400 copy too', async () => {
    mockRegister.mockRejectedValueOnce(new ApiError('Missing fields', 400, 'http'));
    await submit();
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    expect(mockShowToast).toHaveBeenCalledWith('error', 'register.errorTitle', 'errors.http.400');
  });
});
