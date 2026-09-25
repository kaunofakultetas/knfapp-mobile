// -----------------------------------------------------------
//  [*] Tests — the blocked-users view of app/(main)/friends
//
//  A block used to be recoverable only by stumbling on the
//  blocked person again — the people search hides blocked
//  accounts and the block severs the friendship (KNF-142).
//  Pinned: the friends list links to the blocked list while
//  there is any block (and never when there is none), the
//  ?view=blocked list names every blocked account with its
//  unblock button and retitles the header, and an unblock
//  confirmed by the server takes the row away with a toast —
//  a refusal keeps it.
// -----------------------------------------------------------

jest.mock('@/components/FeatureGate', () => (_key: string, Screen: unknown) => Screen);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key) }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ colors: { onBrand: '#FFF', ink: '#111', inkSoft: '#555', inkFaint: '#999' } }) }));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/(main)/friends' }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));

// The route's ?view= param, per test
let mockView: string | undefined;
jest.mock('@/hooks/useRouteParam', () => ({ useRouteParam: () => mockView }));

// Every navigation and every header retitle
const mockPush = jest.fn();
// The stack header options the view sets (its title)
const mockSetOptions = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
  useFocusEffect: () => {},
}));

// Every toast the screen raises
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({
  showToast: (...args: unknown[]) => mockToast(...args),
  useNetwork: () => ({ isConnected: true }),
}));

// A one-shot useLoad: runs the loader on mount, serves its data
jest.mock('@knf/dataengine', () => {
  const React = require('react');
  return {
    useLoad: (loader: () => Promise<unknown>) => {
      const [data, setData] = React.useState(null);
      React.useEffect(() => {
        void loader().then(setData);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only stand-in
      }, []);
      return { data, loading: data === null, error: false, refresh: async () => setData(await loader()), retry: () => {} };
    },
  };
});

// The blocked accounts the server holds, and the unblock route
let mockBlocked: { id: string; username: string; displayName: string; role: string; blockedAt: string }[] = [];
// DELETE /social/blocks/<id>
const mockUnblock = jest.fn(async (_id: string) => {});
jest.mock('@/services/api', () => ({
  fetchFriends: async () => ({ friends: [] }),
  fetchFriendRequests: async () => ({ requests: [] }),
  fetchBlockedUsers: async () => ({ blocked: mockBlocked }),
  unblockUser: (id: string) => mockUnblock(id),
}));

jest.mock('@/components/ui', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    Avatar: () => null,
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    LoadingSpinner: () => <Text>loading</Text>,
    RefreshSpinner: () => null,
    ErrorState: ({ message }: { message: string }) => <Text>{message}</Text>,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    Button: ({ title, onPress, accessibilityLabel }: { title: string; onPress: () => void; accessibilityLabel?: string }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import FriendsScreen from '@/app/(main)/friends/index';


// Karolis, blocked two days ago
const KAROLIS = { id: 'u-karolis', username: 'karolis', displayName: 'Karolis Urbonas', role: 'student', blockedAt: '2026-09-23T10:00:00Z' };

// Another blocked account, for the count
const PAULIUS = { id: 'u-paulius', username: 'paulius', displayName: 'Paulius Šimkus', role: 'student', blockedAt: '2026-09-20T10:00:00Z' };


beforeEach(() => {
  mockView = undefined;
  mockBlocked = [];
  mockPush.mockClear();
  mockSetOptions.mockClear();
  mockToast.mockClear();
  mockUnblock.mockReset().mockResolvedValue(undefined);
});


describe('the friends list', () => {
  it('links to the blocked list while there is any block', async () => {
    mockBlocked = [KAROLIS, PAULIUS];
    const screen = await render(<FriendsScreen />);
    const entry = await waitFor(() => screen.getByLabelText('friends.blockedEntry:{"count":2}'));
    await fireEvent.press(entry);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(main)/friends', params: { view: 'blocked' } });
  });

  it('shows no link when nobody is blocked', async () => {
    const screen = await render(<FriendsScreen />);
    await waitFor(() => expect(screen.getByText('friends.empty')).toBeTruthy());
    expect(screen.queryByLabelText(/friends\.blockedEntry/)).toBeNull();
  });
});


describe('the blocked-users view', () => {
  it('names every blocked account with its unblock button, under the explanation', async () => {
    mockView = 'blocked';
    mockBlocked = [KAROLIS, PAULIUS];
    const screen = await render(<FriendsScreen />);
    await waitFor(() => expect(screen.getByText('Karolis Urbonas')).toBeTruthy());
    expect(screen.getByText('Paulius Šimkus')).toBeTruthy();
    expect(screen.getByText('friends.blockedHint')).toBeTruthy();
    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'friends.blockedTitle' });
    expect(screen.getByLabelText('friends.unblockLabel:{"name":"Karolis Urbonas"}')).toBeTruthy();
  });

  it('an unblock the server confirms takes the row away; a refusal keeps it', async () => {
    mockView = 'blocked';
    mockBlocked = [KAROLIS, PAULIUS];
    const screen = await render(<FriendsScreen />);
    await waitFor(() => expect(screen.getByText('Karolis Urbonas')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText('friends.unblockLabel:{"name":"Karolis Urbonas"}'));
    });
    expect(mockUnblock).toHaveBeenCalledWith('u-karolis');
    await waitFor(() => expect(screen.queryByText('Karolis Urbonas')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('success', 'profile.unblocked');

    mockUnblock.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('friends.unblockLabel:{"name":"Paulius Šimkus"}'));
    });
    expect(screen.getByText('Paulius Šimkus')).toBeTruthy();
    expect(mockToast).toHaveBeenLastCalledWith('error', 'profile.actionError');
  });

  it('an empty list says so', async () => {
    mockView = 'blocked';
    const screen = await render(<FriendsScreen />);
    await waitFor(() => expect(screen.getByText('friends.blockedEmpty')).toBeTruthy());
  });
});
