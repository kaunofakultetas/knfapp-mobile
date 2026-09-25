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
//  Then the fixes: a focused route whose module ships OFF
//  selects nothing and fades the capsule (KNF-170); ANY focus
//  change re-expands the chip; the folded badge keeps an
//  unread dot; and labels share one weight and one measured
//  size that fits the capsule at 320pt with every tab pinned.
// -----------------------------------------------------------

// This suite pins its module's BEHAVIOR, so the shipping
// flags are pinned all-on — the real features.json (whatever
// the current release preset says) must never decide whether
// these tests see their subject. One describe overrides the
// enabled tab set through mockEnabledTabKeys (a getter, read
// at render time) to model a module shipped OFF
let mockEnabledTabKeys: Set<string> | null = null;
jest.mock('@/services/features', () => {
  const { TABS } = require('@/constants/tabs');
  const all = new Set(TABS.map((tab: { key: string }) => tab.key));
  return {
    isFeatureEnabled: () => true,
    FEATURES: { accounts: true, news: true, chat: true, social: true, schedule: true, assistant: true, studentId: true, map: true },
    ENABLED_TABS: TABS,
    get ENABLED_TAB_KEYS() {
      return mockEnabledTabKeys ?? all;
    },
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
import { Dimensions } from 'react-native';

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


// Flattens a host node's style prop into one record
const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));


describe('a focused route whose module ships OFF (KNF-170)', () => {
  beforeEach(() => {
    // The shipped preset: studentId and map are off
    mockEnabledTabKeys = new Set(['news', 'messages', 'schedule', 'assistant', 'settings']);
    mockPinnedTabs = ['news', 'messages', 'schedule'];
    setTabBarCollapsed(false);
  });

  afterEach(() => {
    mockEnabledTabKeys = null;
  });

  it('selects no tab and fades the capsule — nothing white-on-white under slot 0', async () => {
    const { getByLabelText, getByTestId, queryByText } = await render(<TabBar {...makeProps('map')} />);

    // The off module stays out of the row (the shipping gate wins)
    expect(queryByText('title-map')).toBeNull();
    for (const name of ['news', 'messages', 'schedule']) {
      expect(getByLabelText(`title-${name}`).props.accessibilityState.selected).toBe(false);
    }
    expect(flatStyle(getByTestId('tabbar-capsule', { includeHiddenElements: true }).props.style).opacity).toBe(0);
  });

  it('the control: a shipped focused tab keeps its capsule', async () => {
    const { getByLabelText, getByTestId } = await render(<TabBar {...makeProps('news')} />);
    expect(getByLabelText('title-news').props.accessibilityState.selected).toBe(true);
    expect(flatStyle(getByTestId('tabbar-capsule', { includeHiddenElements: true }).props.style).opacity).toBe(1);
  });
});


describe('the fold follows the focus, whoever moved it', () => {
  beforeEach(() => {
    mockPinnedTabs = ['news', 'messages', 'schedule', 'id'];
    mockUnread = 0;
    releaseTabBarHold();
    setTabBarCollapsed(false);
  });

  it('a focus change made OUTSIDE the bar (drawer, notification tap, deep link) expands the chip', async () => {
    const { rerender } = await render(<TabBar {...makeProps('news')} />);
    await act(async () => setTabBarCollapsed(true));
    expect(isTabBarCollapsed()).toBe(true);

    // The navigator's state moves on without any bar press
    await rerender(<TabBar {...makeProps('schedule')} />);
    expect(isTabBarCollapsed()).toBe(false);
  });

  it('a re-render on the SAME focus leaves a scroll-folded chip folded', async () => {
    const { rerender } = await render(<TabBar {...makeProps('news')} />);
    await act(async () => setTabBarCollapsed(true));
    await rerender(<TabBar {...makeProps('news')} />);
    expect(isTabBarCollapsed()).toBe(true);
  });

  it('the round button is hidden from readers while the row shows, and reachable once folded', async () => {
    const { queryByTestId, getByTestId } = await render(<TabBar {...makeProps('news')} />);
    expect(queryByTestId('tabbar-collapsed-button')).toBeNull();

    await act(async () => setTabBarCollapsed(true));
    expect(getByTestId('tabbar-collapsed-button')).toBeTruthy();
  });

  it('folded, the badge keeps an unread dot and its label carries the count', async () => {
    mockUnread = 3;
    const { getByTestId, queryByTestId, rerender } = await render(<TabBar {...makeProps('news')} />);
    await act(async () => setTabBarCollapsed(true));

    expect(getByTestId('tabbar-collapsed-unread')).toBeTruthy();
    expect(getByTestId('tabbar-collapsed-button').props.accessibilityLabel).toBe('tabs.expand, tabs.messagesUnread');

    mockUnread = 0;
    await rerender(<TabBar {...makeProps('news')} />);
    expect(queryByTestId('tabbar-collapsed-unread')).toBeNull();
    expect(getByTestId('tabbar-collapsed-button').props.accessibilityLabel).toBe('tabs.expand');
  });
});


describe('labels never truncate', () => {
  const original = Dimensions.get('window');

  // Natural widths at 12pt, measured off the bundled Raleway
  // SemiBold — "title-schedule" stands in for Lithuanian's
  // "Tvarkaraštis", the widest label the app ships
  const NATURAL: Record<string, number> = {
    'title-news': 56.6,
    'title-messages': 42.4,
    'title-schedule': 68.9,
    'title-assistant': 60.9,
    'title-settings': 65.3,
  };

  const setWindow = (width: number, fontScale: number) => {
    const window = { width, height: 640, scale: 2, fontScale };
    Dimensions.set({ window, screen: window });
  };

  // The measurer reports what the OS text scale renders
  const measureAll = async (view: Awaited<ReturnType<typeof render>>, fontScale: number) => {
    for (const [label, width] of Object.entries(NATURAL)) {
      const probe = view.queryByTestId(`tabbar-label-measure-${label}`, { includeHiddenElements: true });
      if (!probe) continue;
      await fireEvent(probe, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: width * Math.min(fontScale, 1.2), height: 14 } },
      });
    }
  };

  beforeEach(() => {
    // Every tab this build ships, pinned
    mockPinnedTabs = ['news', 'messages', 'schedule', 'assistant', 'settings'];
    setTabBarCollapsed(false);
  });

  afterEach(() => {
    Dimensions.set({ window: original, screen: original });
  });

  it('at 320pt with five tabs the whole row shares one size that fits the widest label inside its capsule', async () => {
    setWindow(320, 1);
    const view = await render(<TabBar {...makeProps('schedule')} />);
    await measureAll(view, 1);

    const sizes = Object.keys(NATURAL).map((label) => flatStyle(view.getByText(label).props.style).fontSize as number);
    // One size for the row
    expect(new Set(sizes).size).toBe(1);
    const size = sizes[0];
    // The widest label, as rendered, fits the capsule it sits in
    // (the capsule's own width, so the geometry is pinned too)
    const capsule = flatStyle(view.getByTestId('tabbar-capsule', { includeHiddenElements: true }).props.style).width as number;
    expect(size * (NATURAL['title-schedule'] / 12)).toBeLessThanOrEqual(capsule - 2);
    // ...never below the 9pt floor
    expect(size).toBeGreaterThanOrEqual(9);
  });

  it('with large system text the floor holds in RENDERED points and the label still fits', async () => {
    setWindow(320, 1.4);
    const view = await render(<TabBar {...makeProps('schedule')} />);
    await measureAll(view, 1.4);

    const size = flatStyle(view.getByText('title-schedule').props.style).fontSize as number;
    const capsule = flatStyle(view.getByTestId('tabbar-capsule', { includeHiddenElements: true }).props.style).width as number;
    // Labels cap the OS scale at 1.2 — what renders is size·1.2
    expect(size * 1.2).toBeGreaterThanOrEqual(9);
    expect(size * 1.2 * (NATURAL['title-schedule'] / 12)).toBeLessThanOrEqual(capsule - 2);
  });

  it('selected or not, a label sets in the same face — selection never widens the text', async () => {
    setWindow(390, 1);
    const view = await render(<TabBar {...makeProps('schedule')} />);
    const selected = view.getByText('title-schedule');
    const resting = view.getByText('title-news');
    expect(selected.props.className).toBe(resting.props.className);
    expect(selected.props.className).toContain('font-raleway-semibold');
  });

  it('a roomy row keeps the full 12pt size', async () => {
    setWindow(430, 1);
    mockPinnedTabs = ['news', 'messages'];
    const view = await render(<TabBar {...makeProps('news')} />);
    await measureAll(view, 1);
    expect(flatStyle(view.getByText('title-news').props.style).fontSize).toBe(12);
    expect(flatStyle(view.getByText('title-messages').props.style).fontSize).toBe(12);
  });
});
