// -----------------------------------------------------------
//  [*] Tests — find people (app/(main)/friends ?view=search)
//
//  The friends screen had no way to anyone who was not already
//  a friend. Pinned: the friends list offers "Find people"
//  under the requests banner; the search view sends nothing
//  under two characters, searches the trimmed text after the
//  typing pause and opens a hit's profile; a late answer to an
//  older query never replaces the newer one's; a failure keeps
//  the hits under a retry row that re-runs the query; and an
//  answered query with no hits says nobody was found.
// -----------------------------------------------------------

jest.mock('@/components/FeatureGate', () => (_key: string, Screen: unknown) => Screen);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key) }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { brand: '#7B003F', brandText: '#7B003F', onBrand: '#FFF', ink: '#111', inkSoft: '#555', inkFaint: '#999' } }),
}));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/(main)/friends' }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn(), useNetwork: () => ({ isConnected: true }) }));

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

// A one-shot useLoad for the friends list: runs the loader on
// mount, serves its data
jest.mock('@knf/dataengine', () => {
  const React = require('react');
  return {
    useLoad: (loader: () => Promise<unknown>) => {
      const [data, setData] = React.useState(null);
      React.useEffect(() => {
        void loader().then(setData);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only stand-in
      }, []);
      return { data, loading: data === null, error: false, refresh: async () => {}, retry: () => {} };
    },
  };
});

// GET /chat/users/search — answered per test
const mockSearch = jest.fn();
jest.mock('@/services/api', () => ({
  fetchFriends: async () => ({ friends: [] }),
  fetchFriendRequests: async () => ({ requests: [{ id: 'r1' }] }),
  fetchBlockedUsers: async () => ({ blocked: [] }),
  unblockUser: jest.fn(),
  searchUsersApi: (q: string) => mockSearch(q),
}));

jest.mock('@/components/ui', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    Avatar: () => null,
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    LoadingSpinner: () => <Text>loading</Text>,
    RefreshSpinner: () => null,
    ErrorState: ({ message }: { message: string }) => <Text>{message}</Text>,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    Input: ({ accessibilityLabel, value, onChangeText }: { accessibilityLabel?: string; value: string; onChangeText: (text: string) => void }) => (
      <TextInput accessibilityLabel={accessibilityLabel} value={value} onChangeText={onChangeText} />
    ),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import FriendsScreen from '@/app/(main)/friends/index';


// Two people the directory can answer with
const KAROLIS = { id: 'u-karolis', username: 'karolis.urbonas', displayName: 'Karolis Urbonas', role: 'student' };

// The second person, for the out-of-order and retry cases
const PAULIUS = { id: 'u-paulius', username: 'paulius', displayName: 'Paulius Šimkus', role: 'teacher' };

// Longer than the view's typing pause
const PAST_PAUSE_MS = 400;







// -----------------------------------------------------------
// pause
// -----------------------------------------------------------
//
// Lets real time pass inside act — past the typing pause, so
// a search that was going to go out has gone.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const pause = (ms: number) => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, ms));
});







// -----------------------------------------------------------
// openSearch
// -----------------------------------------------------------
//
// The ?view=search screen, mounted, with its search field.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function openSearch() {
  mockView = 'search';
  const screen = await render(<FriendsScreen />);
  const field = screen.getByLabelText('friends.findPeople');
  const type = (text: string) => act(async () => {
    fireEvent.changeText(field, text);
  });
  return { screen, type };
}


beforeEach(() => {
  mockView = undefined;
  mockPush.mockClear();
  mockSetOptions.mockClear();
  mockSearch.mockReset().mockResolvedValue({ users: [] });
});


describe('the friends list', () => {
  it('offers "Find people" under the requests banner', async () => {
    const screen = await render(<FriendsScreen />);
    const entry = await waitFor(() => screen.getByLabelText('friends.findPeople'));
    expect(screen.getByLabelText('friends.pendingRequests:{"count":1}')).toBeTruthy();
    await fireEvent.press(entry);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(main)/friends', params: { view: 'search' } });
  });
});


describe('the people search', () => {
  it('retitles the header and sends nothing under two characters', async () => {
    const { screen, type } = await openSearch();
    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'friends.findPeople' });
    await type('k');
    await pause(PAST_PAUSE_MS);
    expect(mockSearch).not.toHaveBeenCalled();
    expect(screen.getByText('friends.searchIdle')).toBeTruthy();
  });

  it('searches the trimmed text after the pause, and a hit opens the profile', async () => {
    mockSearch.mockResolvedValue({ users: [KAROLIS] });
    const { screen, type } = await openSearch();
    await type('  ka ');
    const hit = await waitFor(() => screen.getByLabelText('Karolis Urbonas'));
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('ka');
    expect(screen.getByText('@karolis.urbonas')).toBeTruthy();

    await fireEvent.press(hit);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(main)/profile', params: { userId: 'u-karolis' } });
  });

  it("a late answer to an older query never replaces the newer one's", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    mockSearch
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce({ users: [PAULIUS] });
    const { screen, type } = await openSearch();

    await type('ka');
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    await type('pau');
    await waitFor(() => expect(screen.getByLabelText('Paulius Šimkus')).toBeTruthy());

    await act(async () => answerFirst({ users: [KAROLIS] }));
    expect(screen.queryByLabelText('Karolis Urbonas')).toBeNull();
    expect(screen.getByLabelText('Paulius Šimkus')).toBeTruthy();
  });

  it('a failure keeps the hits under a retry row, and the retry re-runs the query', async () => {
    mockSearch
      .mockResolvedValueOnce({ users: [KAROLIS] })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ users: [PAULIUS] });
    const { screen, type } = await openSearch();

    await type('ka');
    await waitFor(() => expect(screen.getByLabelText('Karolis Urbonas')).toBeTruthy());
    await type('kar');
    const retryRow = await waitFor(() => screen.getByLabelText('common.searchError. common.tryAgain'));
    expect(screen.getByLabelText('Karolis Urbonas')).toBeTruthy();

    await fireEvent.press(retryRow);
    await waitFor(() => expect(screen.getByLabelText('Paulius Šimkus')).toBeTruthy());
    expect(mockSearch).toHaveBeenLastCalledWith('kar');
    expect(screen.queryByLabelText('common.searchError. common.tryAgain')).toBeNull();
  });

  it('an answered query with no hits says nobody was found', async () => {
    const { screen, type } = await openSearch();
    await type('zz');
    await waitFor(() => expect(screen.getByText('friends.searchEmpty')).toBeTruthy());
  });
});
