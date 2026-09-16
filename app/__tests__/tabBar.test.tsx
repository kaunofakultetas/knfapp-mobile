// -----------------------------------------------------------
//  [*] Tests — components/navigation/TabBar
//
//  The bar's deterministic rules: unpinned routes stay out, a
//  focused-but-unpinned route stays IN (the reader must never
//  stand on a screen with no selected tab), the unread badge
//  rides the messages tab only — and the floating chip's fold:
//  scrolling down collapses it to the round active-tab button,
//  scrolling up (or tapping the button, or switching tabs)
//  expands it, with the two faces swapping accessibility and
//  pointer events so a reader never lands on the hidden one.
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

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let mockPinnedTabs: string[] = ['news', 'messages', 'schedule', 'id'];
jest.mock('@/context/AppContext', () => ({ useApp: () => ({ pinnedTabs: mockPinnedTabs }) }));

let mockUnread = 0;
jest.mock('@/hooks/useUnreadCount', () => ({ useUnreadCount: () => ({ count: mockUnread }) }));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      brand: '#7B003F', brandSoft: '#F3E0EA', onBrand: '#FFFFFF',
      ink: '#111111', inkSoft: '#555555', inkFaint: '#999999',
      surface: '#FFFFFF', surfaceSoft: '#F5F5F5', line: '#DDDDDD',
    },
  }),
}));

import { act, fireEvent, render, renderHook } from '@testing-library/react-native';

import TabBar from '@/components/navigation/TabBar';
import {
  holdTabBarExpanded,
  isTabBarCollapsed,
  releaseTabBarHold,
  setTabBarCollapsed,
  useTabBarScroll,
} from '@/components/navigation/tabBarCollapse';
import { TABS } from '@/constants/tabs';

import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';


// One route per roster entry; titles are distinct so queries
// can name a tab unambiguously
const routes = TABS.map((tab) => ({ key: `${tab.key}-key`, name: tab.key }));

const makeProps = (focused: string): BottomTabBarProps => {
  const state = {
    index: routes.findIndex((route) => route.name === focused),
    routes,
  };
  const descriptors = Object.fromEntries(
    routes.map((route) => [route.key, { options: { title: `title-${route.name}` } }]),
  );
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return { state, descriptors, navigation, insets } as unknown as BottomTabBarProps;
};


describe('TabBar', () => {
  beforeEach(() => {
    mockPinnedTabs = ['news', 'messages', 'schedule', 'id'];
    mockUnread = 0;
    releaseTabBarHold();
    setTabBarCollapsed(false);
  });

  it('renders pinned tabs and filters unpinned ones out', async () => {
    const { queryByText } = await render(<TabBar {...makeProps('news')} />);

    expect(queryByText('title-news')).toBeTruthy();
    expect(queryByText('title-messages')).toBeTruthy();
    expect(queryByText('title-schedule')).toBeTruthy();
    expect(queryByText('title-id')).toBeTruthy();
    expect(queryByText('title-map')).toBeNull();
    expect(queryByText('title-settings')).toBeNull();
  });

  it('keeps a focused-but-unpinned route in the bar', async () => {
    mockPinnedTabs = ['news', 'messages'];
    const { queryByText } = await render(<TabBar {...makeProps('map')} />);

    expect(queryByText('title-map')).toBeTruthy();
    expect(queryByText('title-schedule')).toBeNull();
    expect(queryByText('title-settings')).toBeNull();
  });

  it('marks exactly the focused tab as selected', async () => {
    const { getByLabelText } = await render(<TabBar {...makeProps('schedule')} />);

    expect(getByLabelText('title-schedule').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('title-news').props.accessibilityState.selected).toBe(false);
  });

  it('shows the unread badge on the messages tab only', async () => {
    mockUnread = 3;
    const { queryAllByText, getByLabelText } = await render(<TabBar {...makeProps('news')} />);

    // The badge is a11y-hidden (its count rides the tab label),
    // so the text query must include hidden elements
    expect(queryAllByText('3', { includeHiddenElements: true })).toHaveLength(1);
    expect(getByLabelText('title-messages, tabs.messagesUnread')).toBeTruthy();
  });

  it('caps the badge at 99+', async () => {
    mockUnread = 250;
    const { queryByText } = await render(<TabBar {...makeProps('news')} />);

    expect(queryByText('99+', { includeHiddenElements: true })).toBeTruthy();
  });

  it('navigates on tab press unless a listener prevents it', async () => {
    const props = makeProps('news');
    const { getByText, rerender } = await render(<TabBar {...props} />);

    await fireEvent.press(getByText('title-schedule'));
    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'schedule-key' }),
    );
    expect(props.navigation.navigate).toHaveBeenCalledWith('schedule', undefined);

    // A prevented tabPress must not navigate
    const guarded = makeProps('news');
    (guarded.navigation.emit as jest.Mock).mockReturnValue({ defaultPrevented: true });
    await rerender(<TabBar {...guarded} />);
    await fireEvent.press(getByText('title-schedule'));
    expect(guarded.navigation.navigate).not.toHaveBeenCalled();
  });
});


// The scroll events a screen would feed — only contentOffset.y
// matters to the grammar
const scrollTo = (y: number) =>
  ({ nativeEvent: { contentOffset: { y } } }) as NativeSyntheticEvent<NativeScrollEvent>;


describe('the floating chip fold', () => {
  beforeEach(() => {
    releaseTabBarHold();
    setTabBarCollapsed(false);
  });

  it('collapsing hides the row from readers; the round button brings it back and tabs work again', async () => {
    const props = makeProps('news');
    const { getByText, getByTestId, queryByText } = await render(<TabBar {...props} />);
    expect(getByText('title-news')).toBeTruthy();

    await act(async () => setTabBarCollapsed(true));
    expect(isTabBarCollapsed()).toBe(true);
    // The row face is hidden from readers while collapsed
    expect(queryByText('title-news')).toBeNull();

    // The tapped round button expands the chip again ...
    await fireEvent.press(getByTestId('tabbar-collapsed-button'));
    expect(isTabBarCollapsed()).toBe(false);

    // ... and a tab press then navigates, leaving the bar out
    await fireEvent.press(getByText('title-schedule'));
    expect(props.navigation.navigate).toHaveBeenCalledWith('schedule', undefined);
    expect(isTabBarCollapsed()).toBe(false);
  });

  it('scroll grammar: down collapses, up expands, the top always expands, jitter never flaps', async () => {
    const scroll = await renderHook(() => useTabBarScroll());
    const feed = (y: number) => scroll.result.current.onScroll(scrollTo(y));

    // Deep in the list, a clear downward run folds the chip
    feed(200);
    feed(230);
    expect(isTabBarCollapsed()).toBe(true);

    // A small wobble up does NOT expand (hysteresis)
    feed(224);
    expect(isTabBarCollapsed()).toBe(true);

    // A clear upward run expands
    feed(180);
    expect(isTabBarCollapsed()).toBe(false);

    // Down again, then landing near the top always expands
    feed(260);
    feed(300);
    expect(isTabBarCollapsed()).toBe(true);
    feed(10);
    expect(isTabBarCollapsed()).toBe(false);

    // Overscroll bounce is ignored outright
    feed(300);
    feed(340);
    expect(isTabBarCollapsed()).toBe(true);
    feed(-20);
    expect(isTabBarCollapsed()).toBe(true);
  });

  it('a released fling commits its direction — inertia expands without waiting for move events', async () => {
    const scroll = await renderHook(() => useTabBarScroll());
    const feed = (y: number) => scroll.result.current.onScroll(scrollTo(y));
    const release = (y: number) => scroll.result.current.onScrollEndDrag(scrollTo(y));

    // Deep down and collapsed; a small upward drag (below the
    // move threshold) released into a fling must expand NOW —
    // momentum move events may never arrive
    feed(300);
    feed(340);
    expect(isTabBarCollapsed()).toBe(true);
    feed(332);
    expect(isTabBarCollapsed()).toBe(true);
    release(332);
    expect(isTabBarCollapsed()).toBe(false);

    // And the mirror: a short downward drag released collapses
    feed(340);
    release(340);
    expect(isTabBarCollapsed()).toBe(true);

    // Releasing near the top always expands
    feed(20);
    release(20);
    expect(isTabBarCollapsed()).toBe(false);
  });

  it('the button-press hold overrides a running fling until the NEXT gesture begins', async () => {
    const scroll = await renderHook(() => useTabBarScroll());
    const feed = (y: number) => scroll.result.current.onScroll(scrollTo(y));
    const begin = (y: number) => scroll.result.current.onScrollBeginDrag(scrollTo(y));
    const release = (y: number) => scroll.result.current.onScrollEndDrag(scrollTo(y));

    // A downward fling collapses; mid-momentum the person taps
    // the round button
    begin(100);
    feed(200);
    feed(300);
    release(300);
    expect(isTabBarCollapsed()).toBe(true);
    holdTabBarExpanded();
    expect(isTabBarCollapsed()).toBe(false);

    // The SAME fling's momentum keeps arriving downward — the
    // tap's verdict stands
    feed(360);
    feed(420);
    feed(480);
    expect(isTabBarCollapsed()).toBe(false);
    release(480);
    expect(isTabBarCollapsed()).toBe(false);

    // A fresh finger-down ends the override: the new gesture's
    // own downward travel collapses again
    begin(480);
    feed(520);
    feed(560);
    expect(isTabBarCollapsed()).toBe(true);
  });
});
