// -----------------------------------------------------------
//  [*] Tests — app/(main)/profile relationship wiring
//
//  The profile screen no longer walks the friendship machine
//  itself: the payload becomes the engine's BASE standing, the
//  kit's ConnectButton draws the face, and a tap is forwarded
//  to the engine. What is pinned here:
//
//    - base derivation: friendshipStatus / blockedByMe / own
//      profile → the face the kit draws
//    - a connect tap reaches the transport and the confirmed
//      standing settles the face
//    - block / unblock ride the plain API and flip the base
//      (and drop the shadow) so the face follows
//    - a refetched profile wins over a standing the engine
//      confirmed earlier this session
//    - a guest sees the button and is routed to login, never
//      to the transport
//
//  The screen is rendered against a real SocialEngineProvider
//  over the engine's fake transport and a real
//  SocialUiKitProvider; everything app-side is stubbed.
// -----------------------------------------------------------

import type { ReactNode } from 'react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// The focus callback is captured so a test can replay a
// "return to the screen" — the screen skips the first focus
// (it rides the mount load) and refetches on every later one
let mockFocus: (() => void) | null = null;
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (cb: () => void) => {
      mockFocus = cb;
      React.useEffect(() => cb(), [cb]);
    },
  };
});

let mockUserId: string | undefined = 'u2';
jest.mock('@/hooks/useRouteParam', () => ({ useRouteParam: () => mockUserId }));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/(main)/profile' }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: { brand: '#7B003F', ink: '#111111', inkSoft: '#555555', danger: '#B00020' },
  }),
}));
jest.mock('@/constants/roles', () => ({ roleLabel: () => 'role' }));
jest.mock('@/services/format', () => ({ formatDate: (value: string) => value }));

let mockMe: { id: string; displayName: string } | null = { id: 'u1', displayName: 'Me' };
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockMe, isAuthenticated: mockMe !== null, setUser: jest.fn() }),
}));

const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
  useNetwork: () => ({ isConnected: true }),
}));

// The posts feed is not under test — an empty, settled list
jest.mock('@knf/dataengine', () => ({
  useFeed: () => ({
    items: [],
    hasMore: false,
    loading: false,
    loadingMore: false,
    error: null,
    refresh: jest.fn(async () => {}),
    loadMore: jest.fn(),
    setItems: jest.fn(),
  }),
  useNetworkRestore: () => {},
}));

// Confirm dialogs answer yes; the chrome pieces are plain views
const mockConfirm = jest.fn(async () => true);
jest.mock('@/components/ui', () => {
  const { View, Text } = require('react-native');
  const Plain = ({ children }: { children?: ReactNode }) => <View>{children}</View>;
  return {
    RefreshSpinner: () => null,
    Avatar: () => null,
    Card: Plain,
    Screen: Plain,
    LoadingSpinner: () => null,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    ErrorState: () => null,
    confirmAction: () => mockConfirm(),
  };
});

type Profile = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  postCount: number;
  friendCount: number;
  friendshipStatus: 'none' | 'friends' | 'request_sent' | 'request_received';
  blockedByMe: boolean;
};
const baseProfile: Profile = {
  id: 'u2',
  username: 'ona',
  displayName: 'Ona',
  role: 'student',
  createdAt: '2025-01-01',
  postCount: 0,
  friendCount: 3,
  friendshipStatus: 'none',
  blockedByMe: false,
};
let mockProfile: Profile = baseProfile;
const mockFetchProfile = jest.fn(async () => mockProfile);
const mockBlockUser = jest.fn(async (_id: string) => {});
const mockUnblockUser = jest.fn(async (_id: string) => {});
jest.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {},
  fetchUserProfile: () => mockFetchProfile(),
  fetchUserPosts: async () => ({ posts: [], hasMore: false }),
  blockUser: (id: string) => mockBlockUser(id),
  unblockUser: (id: string) => mockUnblockUser(id),
  reportTarget: jest.fn(async () => {}),
  deletePost: jest.fn(async () => {}),
  updateProfile: jest.fn(async () => ({})),
  uploadImageApi: jest.fn(async () => ({ url: '' })),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileScreen from '@/app/(main)/profile/index';

import { SocialEngineProvider, fakeSocialTransport, type FakeSocialTransport } from '@knf/socialengine';
import { SocialUiKitProvider } from '@knf/socialuikit';


const face = (action: string) => `socialuikit-connect-${action}`;

let transport: FakeSocialTransport;
const mockRequireAuth = jest.fn();

// RNTL 14 renders asynchronously — every caller awaits
const renderScreen = () =>
  render(
    <SocialEngineProvider
      transport={transport}
      currentUser={mockMe ? { id: mockMe.id, displayName: mockMe.displayName } : null}
      onRequireAuth={mockRequireAuth}
    >
      <SocialUiKitProvider locale="en">
        <ProfileScreen />
      </SocialUiKitProvider>
    </SocialEngineProvider>,
  );

const withProfile = (patch: Partial<Profile>) => {
  mockProfile = { ...baseProfile, ...patch };
};


describe('ProfileScreen relationship wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'u2';
    mockMe = { id: 'u1', displayName: 'Me' };
    mockProfile = baseProfile;
    mockFocus = null;
    transport = fakeSocialTransport();
  });


  it.each([
    ['none', 'connect'],
    ['request_sent', 'cancel'],
    ['friends', 'disconnect'],
  ] as const)('draws the %s payload as the %s face', async (status, action) => {
    withProfile({ friendshipStatus: status });
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face(action))).toBeTruthy());
  });


  it('draws a received request as the accept + decline pair', async () => {
    withProfile({ friendshipStatus: 'request_received' });
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face('accept'))).toBeTruthy());
    expect(screen.getByTestId(face('decline'))).toBeTruthy();
  });


  it('lets blockedByMe win over the friendship status', async () => {
    withProfile({ friendshipStatus: 'friends', blockedByMe: true });
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face('unblock'))).toBeTruthy());
    expect(screen.queryByTestId(face('disconnect'))).toBeNull();
    // The message shortcut hides behind a block too
    expect(screen.queryByLabelText('messages.newMessage')).toBeNull();
  });


  it('draws no relationship control on the own profile', async () => {
    mockUserId = undefined;
    withProfile({ id: 'u1' });
    const screen = await renderScreen();
    await waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('id.changePhoto')).toBeTruthy());
    expect(screen.queryByTestId(face('connect'))).toBeNull();
  });


  it('forwards a connect tap to the engine and settles on the confirmed standing', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face('connect'))).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId(face('connect')));
    });

    await waitFor(() => expect(screen.getByTestId(face('cancel'))).toBeTruthy());
    expect(transport.calls).toEqual([{ method: 'setRelationship', args: ['u2', 'connect'] }]);
    // The screen no longer toasts for the engine's own outcomes
    expect(mockShowToast).not.toHaveBeenCalled();
  });


  it('confirms before a disconnect and drops it when the viewer declines', async () => {
    withProfile({ friendshipStatus: 'friends' });
    transport.setRelationshipState('u2', 'connected');
    mockConfirm.mockResolvedValueOnce(false);
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face('disconnect'))).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId(face('disconnect')));
    });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(transport.calls).toEqual([]);
    expect(screen.getByTestId(face('disconnect'))).toBeTruthy();
  });


  it('blocks through the plain API and flips the face to unblock, then back', async () => {
    withProfile({ friendshipStatus: 'friends' });
    transport.setRelationshipState('u2', 'connected');
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face('disconnect'))).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText('profile.block'));
    });

    await waitFor(() => expect(screen.getByTestId(face('unblock'))).toBeTruthy());
    expect(mockBlockUser).toHaveBeenCalledWith('u2');
    expect(mockShowToast).toHaveBeenCalledWith('success', 'profile.blocked');
    // The block never went through the engine
    expect(transport.calls).toEqual([]);

    await act(async () => {
      fireEvent.press(screen.getByTestId(face('unblock')));
    });

    // The block severed the friendship: the base is 'none' now
    await waitFor(() => expect(screen.getByTestId(face('connect'))).toBeTruthy());
    expect(mockUnblockUser).toHaveBeenCalledWith('u2');
    expect(transport.calls).toEqual([]);
  });


  it('lets a refetched profile win over a standing confirmed earlier', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face('connect'))).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId(face('connect')));
    });
    await waitFor(() => expect(screen.getByTestId(face('cancel'))).toBeTruthy());

    // The other side accepted while the viewer was away; the
    // focus return refetches and the fresh payload must show
    withProfile({ friendshipStatus: 'friends' });
    await act(async () => {
      mockFocus?.();
    });

    await waitFor(() => expect(screen.getByTestId(face('disconnect'))).toBeTruthy());
    expect(screen.queryByTestId(face('cancel'))).toBeNull();
  });


  it('shows a guest the connect button and routes the tap to login', async () => {
    mockMe = null;
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face('connect'))).toBeTruthy());
    // Signed-in-only chrome stays hidden
    expect(screen.queryByLabelText('messages.newMessage')).toBeNull();
    expect(screen.queryByLabelText('profile.block')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId(face('connect')));
    });

    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
    expect(transport.calls).toEqual([]);
  });
});
