// -----------------------------------------------------------
//  [*] Tests — the news tab's refresh contract
//
//  Both feeds behind this tab (/news and /social/feed) are
//  RANKED by engagement, not sorted by date, so the data
//  engine's merge strategy — which folds a fresh page 1 in as
//  "newer" rows — promotes an old post that climbed the
//  ranking to the top and jams the new-posts pill on. Every
//  refresh this screen fires must therefore REPLACE the list:
//  the useFeed options carry no merge mode, and neither the
//  focus-return refresh nor the pill ever call refresh('merge')
//  — on either feed mode. An empty feed says how to go on
//  (pull to refresh, another source) and the list under it
//  stays pullable.
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'lt' } }),
}));
jest.mock('@/services/features', () => ({ isFeatureEnabled: () => true }));
jest.mock('@/components/FeatureGate', () => (_key: string, Screen: unknown) => Screen);
jest.mock('@/components/CachedBanner', () => () => null);
jest.mock('@/components/news/NewsCard', () => () => null);
jest.mock('@/components/navigation/tabBarCollapse', () => ({
  useTabBarScroll: () => ({ onScroll: () => {}, onScrollBeginDrag: () => {}, onScrollEndDrag: () => {}, scrollEventThrottle: 16 }),
}));
jest.mock('@/components/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach the primitives
  const { Text, View } = require('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    Header: ({ title }: { title: string }) => <Text>{title}</Text>,
    EmptyState: ({ title, hint }: { title: string; hint?: string }) => <Text>{`empty:${title}${hint ? `|${hint}` : ''}`}</Text>,
    ErrorState: ({ message }: { message: string }) => <Text>{`error:${message}`}</Text>,
    LoadingSpinner: () => <Text>loading</Text>,
    RefreshSpinner: () => null,
  };
});
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: { brand: '#7B003F', onBrand: '#FFF', ink: '#111', inkSoft: '#666', surface: '#FFF', surfaceSoft: '#EEE', line: '#DDD', danger: '#C00' },
  }),
}));
jest.mock('@/hooks/useCollapsibleHeader', () => () => ({
  scrollHandler: undefined,
  barStyle: {},
  onBarLayout: () => {},
  reveal: () => {},
  barHeight: 0,
  contentPaddingTop: 0,
}));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/(main)/tabs/news' }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 'u1' } }) }));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn(), useNetwork: () => ({ isConnected: true }) }));
jest.mock('@/services/cacheKeys', () => ({ cacheKeyNews: (id: string) => `news:${id}`, NEWS_CACHE_MAX_AGE: 60_000 }));
jest.mock('@/services/api', () => ({
  ApiError: class ApiError extends Error {},
  fetchNewsFeed: jest.fn(async () => ({ posts: [], hasMore: false })),
  fetchNewsPost: jest.fn(async () => ({})),
  fetchSocialFeed: jest.fn(async () => ({ posts: [], hasMore: false })),
  sharePostApi: jest.fn(async () => ({})),
}));
jest.mock('expo-linking', () => ({ createURL: () => 'knfapp://' }));
jest.mock('expo-router/js-tabs', () => ({}));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => true }));

// The focus callback is captured so a test can replay a
// "return to the screen" — the screen skips the first focus
// (it rides the mount load) and refreshes on every later one
let mockFocus: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocus = effect;
  },
  useNavigation: () => ({ addListener: () => () => {}, isFocused: () => true }),
  useRouter: () => ({ push: jest.fn() }),
}));

// The feed engine, faked whole: the screen's useFeed options
// and every refresh call are observed here; the freshness
// probe always reports waiting posts so the pill renders
const mockRefresh = jest.fn(async () => {});
// useFeed itself — its options are read back, its answer set
// per test
const mockUseFeed = jest.fn();
jest.mock('@knf/dataengine', () => ({
  useFeed: (...args: unknown[]) => mockUseFeed(...(args as [])),
  useFeedFreshness: () => ({ newCount: 2, checkNow: jest.fn(), clear: jest.fn() }),
}));
jest.mock('@knf/socialengine', () => ({
  useLikeToggle: () => ({ liked: false, likeCount: 0, pending: false, toggle: jest.fn() }),
}));
// The kit list: the pill's door, the empty body, and the props
// the pull gesture needs (captured for the empty-list test)
let mockListProps: Record<string, unknown> = {};
jest.mock('@knf/socialuikit', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above
  const { Pressable, Text, View } = require('react-native');
  return {
    FeedList: (props: { onPressNew?: () => void; newCount?: number; items: unknown[]; ListEmptyComponent?: unknown }) => {
      mockListProps = props;
      return (
        <View>
          {props.items.length === 0 ? (props.ListEmptyComponent as never) : null}
          {props.newCount ? (
            <Pressable accessibilityRole="button" testID="new-posts-pill" onPress={props.onPressNew}>
              <Text>{`new:${props.newCount}`}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
  };
});

import { act, fireEvent, render } from '@testing-library/react-native';

import NewsScreen from '@/app/(main)/tabs/news';







// -----------------------------------------------------------
// post
// -----------------------------------------------------------
//
// One scraped feed row with the given id (also its title).
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const post = (id: string) => ({ id, title: id, content: '', createdAt: '2026-09-20T10:00:00Z', likes: 0, comments: 0, shares: 0, source: 'knf.vu.lt' });

beforeEach(() => {
  mockFocus = null;
  mockRefresh.mockClear();
  mockUseFeed.mockReset().mockReturnValue({
    items: [post('a'), post('b')],
    loading: false,
    refreshing: false,
    error: false,
    cachedAt: null,
    loadingMore: false,
    gapAfterId: null,
    refresh: mockRefresh,
    loadMore: jest.fn(),
    setItems: jest.fn(),
  });
});







// -----------------------------------------------------------
// focusOptions
// -----------------------------------------------------------
//
// The options the screen handed useFeed on its first render.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const focusOptions = () => mockUseFeed.mock.calls[0][1] as Record<string, unknown>;


describe('the news tab refreshes by REPLACING the ranked list', () => {
  it('hands useFeed no merge mode for the network-restore refresh', async () => {
    await render(<NewsScreen />);
    expect(focusOptions().silentRefreshMode).toBeUndefined();
  });

  it('a focus return refreshes with refresh(), never refresh("merge")', async () => {
    await render(<NewsScreen />);
    expect(mockFocus).not.toBeNull();
    // The first focus rides the mount load — no refresh
    await act(async () => {
      mockFocus!();
    });
    expect(mockRefresh).not.toHaveBeenCalled();
    // Coming back: the ranked head is re-fetched whole
    await act(async () => {
      mockFocus!();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith();
  });

  it('the new-posts pill reloads with refresh(), never refresh("merge")', async () => {
    const view = await render(<NewsScreen />);
    await fireEvent.press(view.getByTestId('new-posts-pill'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith();
  });

  it('the community feed replaces too — it is ranked as well', async () => {
    const view = await render(<NewsScreen />);
    await fireEvent.press(view.getByText('news.feedCommunity'));
    mockRefresh.mockClear();
    await fireEvent.press(view.getByTestId('new-posts-pill'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledWith();
    expect(mockRefresh).not.toHaveBeenCalledWith('merge');
  });
});



describe('the empty news feed', () => {
  it('names the ways on and stays pullable', async () => {
    mockUseFeed.mockReturnValue({
      items: [],
      loading: false,
      refreshing: false,
      error: false,
      cachedAt: null,
      loadingMore: false,
      gapAfterId: null,
      refresh: mockRefresh,
      loadMore: jest.fn(),
      setItems: jest.fn(),
    });
    const view = await render(<NewsScreen />);
    expect(view.getByText('empty:news.empty|news.emptyHint')).toBeTruthy();

    // The pull gesture is wired on the empty list, and the empty
    // body fills the viewport (flexGrow) so there is something to pull
    expect(typeof mockListProps.onRefresh).toBe('function');
    expect((mockListProps.contentContainerStyle as { flexGrow?: number }).flexGrow).toBe(1);
    await act(async () => {
      (mockListProps.onRefresh as () => void)();
    });
    expect(mockRefresh).toHaveBeenCalledWith();
  });
});
