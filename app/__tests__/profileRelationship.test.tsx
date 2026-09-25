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
//    - a 429 cooldown refusal reverts the face and surfaces
//      the engine's cooldown notice — never a lasting
//      "Requested"
//    - an avatar upload refused for a full storage quota (413
//      quota_exceeded) toasts the quota sentence — the screen
//      keys on the machine code, never on the 413
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

// This suite pins its module's BEHAVIOR, so the shipping
// flags are pinned all-on — the real features.json (whatever
// the current release preset says) must never decide whether
// these tests see their subject
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
const mockUploadImage = jest.fn(async (..._args: unknown[]) => ({ url: '' }));
// The resolver's shape only — the real catalog resolution is
// pinned by errorCatalog.test.ts
jest.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {},
  apiErrorKey: (err: { serverCode?: string }) => (err?.serverCode ? `errors.codes.${err.serverCode}` : 'errors.generic'),
  fetchUserProfile: () => mockFetchProfile(),
  fetchUserPosts: async () => ({ posts: [], hasMore: false }),
  blockUser: (id: string) => mockBlockUser(id),
  unblockUser: (id: string) => mockUnblockUser(id),
  reportTarget: jest.fn(async () => {}),
  deletePost: jest.fn(async () => {}),
  updateProfile: jest.fn(async () => ({})),
  uploadImageApi: (...args: unknown[]) => mockUploadImage(...args),
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import ProfileScreen from '@/app/(main)/profile/index';
import { ApiError } from '@/services/api';

import { SocialEngineProvider, fakeSocialTransport, type FakeSocialTransport, type SocialNotice } from '@knf/socialengine';
import { SocialUiKitProvider } from '@knf/socialuikit';


const face = (action: string) => `socialuikit-connect-${action}`;

let transport: FakeSocialTransport;
const mockRequireAuth = jest.fn();
// The engine's notices, as the host's SocialEngineHost would toast them
let notices: SocialNotice[] = [];

// RNTL 14 renders asynchronously — every caller awaits
const renderScreen = () =>
  render(
    <SocialEngineProvider
      transport={transport}
      currentUser={mockMe ? { id: mockMe.id, displayName: mockMe.displayName } : null}
      onRequireAuth={mockRequireAuth}
      notify={(n) => notices.push(n)}
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
    notices = [];
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


  it('a declined-request cooldown (429) reverts the face and names the cooldown, never a lasting "Requested"', async () => {
    // The backend's answer for a week after the other side
    // declined: 429 friend_request_cooldown. A definitive
    // refusal — the connect face comes back and the engine's
    // cooldown notice carries the sentence; nothing is queued
    // to replay on the next mount
    transport.fail('setRelationship', Object.assign(new Error('cooldown'), { status: 429, serverCode: 'friend_request_cooldown' }));
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId(face('connect'))).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId(face('connect')));
    });

    await waitFor(() => expect(notices).toEqual([{ level: 'error', code: 'cooldown' }]));
    await waitFor(() => expect(screen.getByTestId(face('connect'))).toBeTruthy());
    expect(screen.queryByTestId(face('cancel'))).toBeNull();
    expect(transport.calls).toEqual([{ method: 'setRelationship', args: ['u2', 'connect'] }]);
    expect(mockRequireAuth).not.toHaveBeenCalled();
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


  it('an avatar upload refused for a full storage quota (413 quota_exceeded) toasts the quota sentence, never "too large"', async () => {
    mockUserId = undefined;
    withProfile({ id: 'u1' });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg', fileSize: 10 }],
    });
    // The backend's answer for a full quota: a 413 that carries
    // its own machine code — the status alone used to read as
    // "the file is too large" here. The mocked ApiError class
    // stores no fields, hence the assign on top of the real
    // constructor shape
    mockUploadImage.mockRejectedValueOnce(
      Object.assign(new ApiError('Storage quota exceeded', 413, 'http', undefined, 'quota_exceeded'), {
        status: 413,
        code: 'http',
        serverCode: 'quota_exceeded',
      }),
    );
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByLabelText('id.changePhoto')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText('id.changePhoto'));
    });

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('error', 'errors.codes.quota_exceeded'));
    expect(mockShowToast).not.toHaveBeenCalledWith('error', 'upload.tooLarge');
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
