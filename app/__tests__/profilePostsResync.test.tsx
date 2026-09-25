// -----------------------------------------------------------
//  [*] Tests — the profile's post list after the article
//
//  The profile pushes the article screen and stays mounted;
//  a post deleted or edited there must not live on in the
//  list as a ghost that contradicts the post count above it
//  (KNF-108). The screen remembers the post it opened and
//  re-reads that one post on the way back: a 404 drops the
//  row, fresh values patch it, any other failure leaves it —
//  and the rest of the paginated list is never re-fetched.
//  The REAL data engine runs underneath (useFeed under a
//  DataEngineProvider); the focus callback is captured and
//  replayed as the "return to the screen". And a post card
//  prints an untitled post's text once — its derived title
//  (the body's own head) never sits over that body.
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

import type { ReactNode } from 'react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

let mockFocus: (() => void) | null = null;
// The router push every navigation lands in
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

let mockUserId: string | undefined = 'u1';
jest.mock('@/hooks/useRouteParam', () => ({ useRouteParam: () => mockUserId }));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/(main)/profile' }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ scheme: 'light', colors: { brand: '#7B003F', ink: '#111111', inkSoft: '#555555', danger: '#B00020' } }),
}));
jest.mock('@/constants/roles', () => ({ roleLabel: () => 'role' }));
jest.mock('@/services/format', () => ({ formatDate: (value: string) => value }));

let mockMe: { id: string; displayName: string } | null = { id: 'u1', displayName: 'Me' };
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockMe, isAuthenticated: mockMe !== null, setUser: jest.fn() }),
}));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn(), useNetwork: () => ({ isConnected: true }) }));

jest.mock('@/components/ui', () => {
  const { Pressable, Text, View } = require('react-native');
  const Plain = ({ children }: { children?: ReactNode }) => <View>{children}</View>;
  return {
    RefreshSpinner: () => null,
    Avatar: () => null,
    Card: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => <Pressable onPress={onPress}>{children}</Pressable>,
    Screen: Plain,
    LoadingSpinner: () => null,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    ErrorState: () => null,
    confirmAction: async () => true,
  };
});

type Post = { id: string; title: string; content: string; date: string; likes: number; comments: number; shares: number; source: 'user' };
// What the posts route serves this test
let mockServerPosts: Post[] = [];
// The profile's post pages — counted: the list must never be
// re-fetched whole on a return
const mockFetchUserPosts = jest.fn(async () => ({ posts: mockServerPosts, hasMore: false }));
// The one-post re-read the return visit makes
const mockFetchNewsPost = jest.fn();







// -----------------------------------------------------------
// post
// -----------------------------------------------------------
//
// One wall post row, overridable.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const post = (id: string, over: Partial<Post> = {}): Post => ({
  id, title: `TITLE-${id}`, content: `body ${id}`, date: '2026-09-01T10:00:00Z', likes: 0, comments: 0, shares: 0, source: 'user', ...over,
});

jest.mock('@/services/api', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
      this.code = 'http';
    }
  }
  return {
    ApiError,
    apiErrorKey: () => 'errors.generic',
    fetchUserProfile: async () => ({
      id: 'u1', username: 'me', displayName: 'Me', role: 'student', createdAt: '2025-01-01',
      postCount: mockServerPosts.length, friendCount: 0, friendshipStatus: 'none', blockedByMe: false,
    }),
    fetchUserPosts: () => mockFetchUserPosts(),
    fetchNewsPost: (id: string) => mockFetchNewsPost(id),
    blockUser: jest.fn(async () => {}),
    unblockUser: jest.fn(async () => {}),
    reportTarget: jest.fn(async () => {}),
    deletePost: jest.fn(async () => {}),
    updateProfile: jest.fn(async () => ({})),
    uploadImageApi: jest.fn(async () => ({ url: '' })),
  };
});

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ProfileScreen from '@/app/(main)/profile/index';
import { ApiError } from '@/services/api';

import { DataEngineProvider } from '@knf/dataengine';
import { SocialEngineProvider, fakeSocialTransport } from '@knf/socialengine';
import { SocialUiKitProvider } from '@knf/socialuikit';







// -----------------------------------------------------------
// renderScreen
// -----------------------------------------------------------
//
// The screen over the REAL data engine and social providers.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const renderScreen = () =>
  render(
    <DataEngineProvider>
      <SocialEngineProvider transport={fakeSocialTransport()} currentUser={mockMe}>
        <SocialUiKitProvider locale="en">
          <ProfileScreen />
        </SocialUiKitProvider>
      </SocialEngineProvider>
    </DataEngineProvider>,
  );







// -----------------------------------------------------------
// flush
// -----------------------------------------------------------
//
// Drains the microtask chains the loads settle through.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });







// -----------------------------------------------------------
// openAndReturn
// -----------------------------------------------------------
//
// Opens a row, then replays the focus callback — the return
// to the screen.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const openAndReturn = async (screen: Awaited<ReturnType<typeof renderScreen>>, id: string) => {
  await fireEvent.press(screen.getByText(`TITLE-${id}`));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(main)/news-post', params: { postId: id } });
  await act(async () => {
    mockFocus?.();
  });
  await flush();
};


beforeEach(() => {
  mockFocus = null;
  mockPush.mockReset();
  mockUserId = 'u1';
  mockMe = { id: 'u1', displayName: 'Me' };
  mockServerPosts = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => post(id));
  mockFetchUserPosts.mockClear();
  mockFetchNewsPost.mockReset();
});


describe('the profile after the article screen', () => {
  it('a post deleted on the article screen leaves the list on the way back — no ghost row', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByText('TITLE-p3')).toBeTruthy());

    // Deleted from the article's header while it was open
    mockServerPosts = mockServerPosts.filter((p) => p.id !== 'p3');
    mockFetchNewsPost.mockRejectedValue(new (ApiError as unknown as new (m: string, s: number) => Error)('gone', 404));
    await openAndReturn(screen, 'p3');

    await waitFor(() => expect(screen.queryByText('TITLE-p3')).toBeNull());
    expect(mockFetchNewsPost).toHaveBeenCalledWith('p3');
    // The one post was re-read — never the whole list again
    expect(mockFetchUserPosts).toHaveBeenCalledTimes(1);
    expect(screen.getByText('TITLE-p1')).toBeTruthy();
  });

  it('an edit made there reaches its row', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByText('TITLE-p2')).toBeTruthy());

    mockFetchNewsPost.mockResolvedValue({ ...post('p2', { title: 'EDITED-p2', likes: 4 }), liked: true });
    await openAndReturn(screen, 'p2');

    await waitFor(() => expect(screen.getByText('EDITED-p2')).toBeTruthy());
    expect(screen.queryByText('TITLE-p2')).toBeNull();
  });

  it('a failed re-read keeps the row as it was — a stale row beats a vanished one', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByText('TITLE-p4')).toBeTruthy());

    mockFetchNewsPost.mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }));
    await openAndReturn(screen, 'p4');

    expect(screen.getByText('TITLE-p4')).toBeTruthy();
  });

  it('a logged-out visitor on "my profile" gets the login-required state, never "user not found"', async () => {
    mockMe = null;
    mockUserId = undefined;
    const screen = await renderScreen();
    await flush();
    expect(screen.getByText('profile.loginRequired')).toBeTruthy();
    expect(screen.queryByText('profile.notFound')).toBeNull();
  });
});


describe('the post cards', () => {
  it("an untitled post's text prints once; a titled post keeps its title over the teaser", async () => {
    const head = 'Pirmoji savaitė jau už nugaros! Kauno…';
    const body = 'Pirmoji savaitė jau už nugaros! Kauno senamiestis vakare – geriausia vieta';
    mockServerPosts = [post('p1', { title: head, content: body }), post('p2')];
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByText(body)).toBeTruthy());
    expect(screen.queryByText(head)).toBeNull();
    expect(screen.getByText('TITLE-p2')).toBeTruthy();
    expect(screen.getByText('body p2')).toBeTruthy();
  });
});
