// -----------------------------------------------------------
//  [*] Tests — the delete-account screen
//
//  Failures are told apart by the backend's machine codes
//  (the screen used to read the English prose to tell a wrong
//  password from the last-admin refusal), a lost connection
//  says so, a second tap while the confirm or the request is
//  pending changes nothing, and the form stays up through the
//  sign-out that follows success instead of flashing the
//  signed-out empty state.
// -----------------------------------------------------------

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import DeleteAccountScreen from '@/app/(main)/delete-account/index';
import i18n from '@/i18n';
import { ApiError } from '@/services/api/client';


jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ scheme: 'light', colors: jest.requireActual('@/constants/theme').palettes.light }),
}));

// The destructive confirm, answered per test
const mockConfirm = jest.fn();
jest.mock('@/components/ui', () => ({
  ...jest.requireActual('@/components/ui'),
  confirmAction: (...args: unknown[]) => mockConfirm(...args),
}));

// The session the screen sees — flipped by the success test
const mockAuth = { isAuthenticated: true, logout: jest.fn(async () => {}) };
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));

// The erasure call, scripted per test
const mockDelete = jest.fn();
jest.mock('@/services/api', () => ({
  ...jest.requireActual('@/services/api'),
  deleteAccountApi: (...args: unknown[]) => mockDelete(...args),
}));

// The post-erasure redirect, observed
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));







// -----------------------------------------------------------
// fail
// -----------------------------------------------------------
//
// An ApiError the erasure route can answer
//
// Used by:
//   - the failure-line tests below
// -----------------------------------------------------------

const fail = (status: number, code: 'http' | 'network', serverCode?: string, message = 'x') =>
  new ApiError(message, status, code, undefined, serverCode);







// -----------------------------------------------------------
// attempt
// -----------------------------------------------------------
//
// Type a password and press the destructive button
//
// Used by:
//   - the failure-line and success tests below
// -----------------------------------------------------------

const attempt = async () => {
  await render(<DeleteAccountScreen />);
  await fireEvent.changeText(screen.getByLabelText(i18n.t('deleteAccount.passwordLabel')), 'slaptas1');
  await fireEvent.press(screen.getByLabelText(i18n.t('deleteAccount.submit')));
};


describe('DeleteAccountScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockAuth.isAuthenticated = true;
    mockConfirm.mockResolvedValue(true);
    await i18n.changeLanguage('en');
  });


  it.each([
    ['last_admin', fail(400, 'http', 'last_admin'), 'deleteAccount.lastAdmin'],
    ['invalid_credentials', fail(400, 'http', 'invalid_credentials'), 'deleteAccount.wrongPassword'],
    ['a pre-code last-admin 400', fail(400, 'http', undefined, 'Cannot delete the last active admin'), 'deleteAccount.lastAdmin'],
    ['the attempt budget', fail(429, 'http', 'rate_limited'), 'deleteAccount.tooMany'],
    ['a lost connection', fail(0, 'network'), 'errors.network'],
  ])('%s shows its own line', async (_label, error, key) => {
    mockDelete.mockRejectedValueOnce(error);
    await attempt();
    expect(await screen.findByText(i18n.t(key))).toBeTruthy();
    expect(mockAuth.logout).not.toHaveBeenCalled();
  });

  it('a second tap while the confirm is open stacks no second confirm', async () => {
    let answer: (value: boolean) => void = () => {};
    mockConfirm.mockImplementationOnce(() => new Promise<boolean>((resolve) => (answer = resolve)));
    await render(<DeleteAccountScreen />);
    const password = screen.getByLabelText(i18n.t('deleteAccount.passwordLabel'));
    await fireEvent.changeText(password, 'slaptas1');
    // Done twice inside one frame — only the ref can stop it
    await act(async () => {
      password.props.onSubmitEditing();
      password.props.onSubmitEditing();
    });
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    await act(async () => answer(false));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('keeps the form up through the sign-out that follows success', async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    mockAuth.logout.mockImplementationOnce(async () => {
      mockAuth.isAuthenticated = false;
    });
    await attempt();
    await screen.rerender(<DeleteAccountScreen />);
    // Still the form — not the signed-out empty state
    expect(screen.getByLabelText(i18n.t('deleteAccount.passwordLabel'))).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith('/(main)/tabs/settings');
  });
});
