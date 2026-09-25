// -----------------------------------------------------------
//  [*] Tests — app/(main)/admin: the stat tiles follow the role
//
//  GET /admin/stats is admin-only (a curator is 403'd on
//  purpose), and the role can move under a mounted screen —
//  AuthContext re-reads /me on every foreground. The tiles
//  must leave with the role (nothing could ever refresh them
//  for a curator) and arrive with it (a promoted curator gets
//  the fetch the mount-time effect never re-ran).
// -----------------------------------------------------------

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@knf/dataengine', () => ({ useNetworkRestore: () => {} }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-qrcode-svg', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/format', () => ({ formatDateTime: () => 'DATE' }));
jest.mock('@/constants/theme', () => ({
  palettes: { light: { surface: '#fff', brand: '#7B003F' }, dark: { surface: '#000', brand: '#7B003F' } },
}));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: { brand: '#7B003F', onBrand: '#fff', ink: '#111', inkSoft: '#555', inkFaint: '#999', danger: '#c00' },
  }),
}));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));

// The kit reduced to what the assertions read: the numbers on
// the tiles and the manage-users label
jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  const box = ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children);
  return {
    Screen: box,
    Card: box,
    SectionTitle: ({ children }: { children?: React.ReactNode }) => React.createElement(Text, null, children),
    EmptyState: ({ title }: { title: string }) => React.createElement(Text, null, title),
    ErrorState: ({ message }: { message: string }) => React.createElement(Text, null, message),
    LoadingSpinner: () => React.createElement(Text, null, 'LOADING'),
    RefreshSpinner: () => null,
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(Pressable, { onPress }, React.createElement(Text, null, title)),
    confirmAction: jest.fn(async () => false),
  };
});

const mockFetchAdminStats = jest.fn(async () => ({
  users: 1234,
  posts: 99,
  scrapedArticles: 7,
  comments: 5,
  activeInvitations: 3,
}));
jest.mock('@/services/api', () => {
  class ApiError extends Error {
    status?: number;
    code?: string;
  }
  return {
    ApiError,
    fetchAdminInvitations: jest.fn(async () => ({ invitations: [] })),
    fetchAdminStats: () => mockFetchAdminStats(),
    createInvitation: jest.fn(),
    revokeInvitation: jest.fn(),
  };
});

// The session the screen reads — swapped mid-test the way a
// foreground /me re-read swaps it
const mockSession: { user: { id: string; role: string }; hydrated: boolean } = {
  user: { id: 'u1', role: 'admin' },
  hydrated: true,
};
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockSession }));

import { render, waitFor } from '@testing-library/react-native';

import AdminScreen from '@/app/(main)/admin/index';


const TILE_VALUES = ['1234', '99', '7', '3'];

const setRole = (role: string) => {
  mockSession.user = { id: 'u1', role };
};


describe('AdminScreen stat tiles vs the live role', () => {
  beforeEach(() => {
    mockFetchAdminStats.mockClear();
  });

  it('withdraws the admin-only tiles the moment the session becomes a curator', async () => {
    setRole('admin');
    const screen = await render(<AdminScreen />);
    await waitFor(() => expect(screen.queryByText('1234')).toBeTruthy());
    for (const value of TILE_VALUES) expect(screen.queryByText(value)).toBeTruthy();
    expect(screen.queryByText('admin.manageUsers')).toBeTruthy();

    // Another admin demoted them; the foreground re-read lands
    // in the very same mounted screen
    setRole('curator');
    await screen.rerender(<AdminScreen />);

    await waitFor(() => expect(screen.queryByText('1234')).toBeNull());
    for (const value of TILE_VALUES) expect(screen.queryByText(value)).toBeNull();
    expect(screen.queryByText('admin.manageUsers')).toBeNull();
    // The codes still show — curators manage them
    expect(screen.queryByText('admin.activeCodes')).toBeTruthy();
  });

  it('fetches the tiles for a curator promoted in place — and never for a curator', async () => {
    setRole('curator');
    const screen = await render(<AdminScreen />);
    await waitFor(() => expect(screen.queryByText('admin.activeCodes')).toBeTruthy());
    expect(mockFetchAdminStats).not.toHaveBeenCalled();
    expect(screen.queryByText('1234')).toBeNull();

    setRole('admin');
    await screen.rerender(<AdminScreen />);

    await waitFor(() => expect(screen.queryByText('1234')).toBeTruthy());
    expect(mockFetchAdminStats).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('admin.manageUsers')).toBeTruthy();
  });
});
