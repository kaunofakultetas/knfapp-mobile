// -----------------------------------------------------------
//  [*] Tests — app/(main)/admin-users: the row actions fit
//
//  A user row's three actions (change role, (de)activate,
//  erase) need ~325pt in either language — more than a 375pt
//  phone's card has inside its margins, let alone a 320pt one.
//  The row must be allowed to wrap, or the last button runs
//  out of the card. The signed-in admin's own row offers none
//  of the three at all.
// -----------------------------------------------------------

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@knf/dataengine', () => ({ useNetworkRestore: () => {} }));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 56 }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: { brand: '#7B003F', onBrand: '#fff', ink: '#111', inkSoft: '#555', inkFaint: '#999', danger: '#c00', success: '#080' },
  }),
}));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));

jest.mock('@/components/ui', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  const box = ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children);
  return {
    Screen: box,
    Card: box,
    EmptyState: ({ title }: { title: string }) => React.createElement(Text, null, title),
    ErrorState: ({ message }: { message: string }) => React.createElement(Text, null, message),
    LoadingSpinner: () => React.createElement(Text, null, 'LOADING'),
    RefreshSpinner: () => null,
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(Pressable, { onPress }, React.createElement(Text, null, title)),
    confirmAction: jest.fn(async () => false),
  };
});

jest.mock('@/services/api', () => {
  class ApiError extends Error {
    status?: number;
    code?: string;
  }
  return {
    ApiError,
    fetchAdminUsers: jest.fn(async () => ({
      users: [
        { id: 'me', username: 'admin', displayName: 'Admin', email: 'a@knf.vu.lt', role: 'admin', createdAt: '', active: true },
        {
          id: 'u2',
          username: 'konstancija',
          displayName: 'Konstancija Aleksandravičiūtė-Vaitkevičienė',
          email: 'konstancija.aleksandraviciute@knf.stud.vu.lt',
          role: 'student',
          createdAt: '',
          active: true,
        },
      ],
    })),
    updateAdminUser: jest.fn(),
    deleteAdminUser: jest.fn(),
  };
});

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', role: 'admin' }, hydrated: true }),
}));

import { render, waitFor } from '@testing-library/react-native';

import AdminUsersScreen from '@/app/(main)/admin-users/index';


describe('AdminUsersScreen row actions', () => {
  it("wrap instead of running out of a narrow card — and the admin's own row offers none", async () => {
    const view = await render(<AdminUsersScreen />);
    await waitFor(() => expect(view.getByLabelText('admin.changeRoleFor')).toBeTruthy());

    // Exactly one row carries actions — the other user's
    const changeRole = view.getAllByLabelText('admin.changeRoleFor');
    expect(changeRole).toHaveLength(1);

    const row = changeRole[0].parent as { props: { className?: string } } | null;
    expect(row?.props.className).toContain('flex-row');
    expect(row?.props.className).toContain('flex-wrap');
  });
});
