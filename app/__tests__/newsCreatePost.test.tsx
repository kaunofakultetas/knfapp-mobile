// -----------------------------------------------------------
//  [*] Tests — app/(main)/create-post
//
//  The composer's publish contract: a same-frame double tap
//  on "Publish" publishes ONCE (the button's loading state
//  commits a render too late — a ref latch is the guard), a
//  member's "friends only" choice reaches the post as
//  is_public false while everyone-posts stay public, and a
//  poll length becomes an explicit-UTC end date that many
//  days out.
// -----------------------------------------------------------

jest.mock('@/components/FeatureGate', () => (_key: string, Screen: unknown) => Screen);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { count?: number }) => (options?.count != null ? `${key}:${options.count}` : key) }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 0 }));
jest.mock('expo-router', () => ({
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {}, dispatch: () => {} }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));
jest.mock('@/hooks/useRouteParam', () => ({ useRouteParam: () => undefined }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { brand: '#7B003F', brandText: '#7B003F', inkSoft: '#555', inkFaint: '#999', onBrand: '#FFF', warning: '#B80' } }),
}));
jest.mock('@knf/dataengine', () => ({ useLoad: () => ({ data: null, loading: false, error: false }) }));
jest.mock('@/components/LoginRequiredOverlay', () => ({ children }: { children: unknown }) => children);
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));

let mockRole = 'student';
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', username: 'me', displayName: 'Aš', role: mockRole, avatarUrl: null } }),
}));

// The publish steps — createPost resolves on the test's word
const mockCreatePost = jest.fn();
// Step 3 — the poll attached to the fresh post
const mockCreatePoll = jest.fn(async (..._args: unknown[]) => ({}));
jest.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {},
  apiErrorKey: () => 'errors.generic',
  createPost: (params: unknown) => mockCreatePost(params),
  createPollApi: (...args: unknown[]) => mockCreatePoll(...args),
  fetchNewsPost: jest.fn(),
  updatePost: jest.fn(),
  uploadImageApi: jest.fn(),
}));

jest.mock('@/components/ui', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    Avatar: () => null,
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    confirmAction: async () => true,
    Input: ({ label, placeholder, value, onChangeText }: { label?: string; placeholder?: string; value: string; onChangeText: (text: string) => void }) => (
      <TextInput accessibilityLabel={label ?? placeholder} value={value} onChangeText={onChangeText} />
    ),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});

import { act, fireEvent, render } from '@testing-library/react-native';

import CreatePostScreen from '@/app/(main)/create-post/index';







// -----------------------------------------------------------
// mount
// -----------------------------------------------------------
//
// The composer screen, rendered as a signed-in member (or the
// role the test set).
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const mount = () => render(<CreatePostScreen />);

beforeEach(() => {
  mockRole = 'student';
  mockCreatePost.mockReset().mockResolvedValue({ id: 'p-new' });
  mockCreatePoll.mockClear();
});


describe('publishing', () => {
  it('a same-frame double tap publishes ONCE', async () => {
    let release: (value: { id: string }) => void = () => {};
    mockCreatePost.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const screen = await mount();
    await fireEvent.changeText(screen.getByLabelText('createPost.contentLabel'), 'Sveiki visi');

    const publish = screen.getByLabelText('createPost.submit');
    await act(async () => {
      fireEvent.press(publish);
      fireEvent.press(publish);
    });
    await act(async () => release({ id: 'p-new' }));
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
  });

  it("a member's friends-only choice reaches the post; the default stays public", async () => {
    const screen = await mount();
    await fireEvent.changeText(screen.getByLabelText('createPost.contentLabel'), 'Tik saviems');
    await fireEvent.press(screen.getByLabelText('createPost.visibilityFriends'));
    await fireEvent.press(screen.getByLabelText('createPost.submit'));
    expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ content: 'Tik saviems', is_public: false }));

    const again = await mount();
    await fireEvent.changeText(again.getAllByLabelText('createPost.contentLabel').at(-1)!, 'Visiems');
    await fireEvent.press(again.getAllByLabelText('createPost.submit').at(-1)!);
    expect(mockCreatePost).toHaveBeenLastCalledWith(expect.objectContaining({ is_public: true }));
  });

  it('staff never see the visibility choice — their posts stay public', async () => {
    mockRole = 'teacher';
    const screen = await mount();
    expect(screen.queryByLabelText('createPost.visibilityFriends')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('createPost.contentLabel'), 'Skelbimas');
    await fireEvent.press(screen.getByLabelText('createPost.submit'));
    expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ is_public: true }));
  });

  it('a poll length becomes an explicit-UTC end date that many days out', async () => {
    const screen = await mount();
    await fireEvent.changeText(screen.getByLabelText('createPost.contentLabel'), 'Kada renkamės?');
    await fireEvent.press(screen.getByLabelText('createPost.addPoll'));
    await fireEvent.changeText(screen.getByLabelText('createPost.pollQuestion'), 'Kada?');
    const options = screen.getAllByLabelText('createPost.pollOptionPlaceholder');
    await fireEvent.changeText(options[0], 'Rytoj');
    await fireEvent.changeText(options[1], 'Poryt');
    await fireEvent.press(screen.getByLabelText('createPost.pollDays:3'));
    const before = Date.now();
    await fireEvent.press(screen.getByLabelText('createPost.submit'));

    expect(mockCreatePoll).toHaveBeenCalledTimes(1);
    const [postId, title, pollOptions, endDate] = mockCreatePoll.mock.calls[0] as [string, string, string[], string];
    expect([postId, title, pollOptions]).toEqual(['p-new', 'Kada?', ['Rytoj', 'Poryt']]);
    expect(endDate.endsWith('Z')).toBe(true);
    const days = (Date.parse(endDate) - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThan(3.01);
  });
});
